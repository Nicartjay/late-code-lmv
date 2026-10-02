// loop / shot C — L10 何が正解か分からなくなって: a decision tree that forks on every sung mora
// until it is a wall of question marks. The question builds as one big row, then steps aside;
// the last word decodes out of scrambled glyphs, each character locking exactly when sung.
import * as THREE from 'three';
import { font } from '../engine/fonts';
import { FSPass, Layer2D, W } from '../engine/gl';
import { enter, gstate, scrambleChar, type Glyph } from '../engine/kinetic';
import { LEAD, type Char, type Line } from '../engine/lyrics';
import { drawCursor } from '../engine/motifs';
import { css } from '../engine/palette';
import type { PostParams } from '../engine/post';
import type { Ctx, Frame } from '../engine/scene';
import { drawGlyphs2D, layout2D, type Lay2D } from '../engine/type2d';
import { clamp, ease, fbm1, hash, keys, lerp, mulberry32, smoothstep, spring } from '../engine/util';

interface Node { x: number; y: number; d: number; parent: number; born: number; label: string; red: boolean; kids: number[] }

const LABELS: string[][] = [
  [],
  ['if', 'else'],
  ['true', 'false', 'null', 'undefined'],
  ['A案', 'B案', '再起動', 'ググる', 'もう一回', '寝る', 'console.log', 'try {'],
  ['catch', 'NaN', '0', '""', '[]', '{}', '-1', '?.', '??', 'void', 'any', 'never', 'revert', 'TODO'],
];
const FORK_X = 330; // trunk length (root -> first fork)
const DX = 300; // depth spacing
const GAP = 32; // leaf spacing

const BG = /* glsl */ `
uniform vec2 org; uniform float scl; uniform float hot;
void main() {
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  vec2 q = (px - org) / scl;
  vec2 f = fract(q / 60.0) - 0.5;
  float d = length(f * 60.0 * scl);
  float dotm = smoothstep(2.2, 0.8, d);
  vec3 c = C_INK + vec3(0.002, 0.003, 0.008);
  c += vec3(0.022, 0.03, 0.065) * dotm * (0.55 + 0.45 * hot);
  float r = length((px - org - vec2(600.0 * scl, 0.0)) / uRes.y);
  c += C_BLUE * 0.02 * exp(-r * 1.6) * (1.0 + 1.5 * hot);
  gl_FragColor = vec4(c, 1.0);
}`;

export class Branch {
  layer = new Layer2D();
  bg = new FSPass(BG, { org: { value: new THREE.Vector2() }, scl: { value: 1 }, hot: { value: 0 } });
  nodes: Node[] = [];
  leaves: number[] = [];
  line!: Line;
  row1!: Lay2D; row2!: Lay2D;
  row1Chars: Char[] = [];
  forkTimes: number[] = [];
  stormTimes: number[] = [];
  private tw: number[] = [];

  constructor(private ctx: Ctx, private t0: number, private t1: number) {}

  async init() {
    const L = this.ctx.lyrics.get('何が正解か分からなくなって');
    this.line = L;
    const w = L.words;
    this.tw = w.map((x) => x.start - LEAD);
    this.row1Chars = [...w[0]!.chars, ...w[1]!.chars];
    this.row1 = layout2D(this.row1Chars, { font: 'sans9', size: 100, anchor: 'topleft' });
    this.row2 = layout2D(w[2]!.chars, { font: 'sans9', size: 100, anchor: 'topleft', tracking: 0.02 });
    // fork events: 正 解 か 分 か ら な (depth 1..7); the remaining morae are question storms
    const cs = L.chars;
    this.forkTimes = cs.slice(2, 9).map((c) => c.start - LEAD);
    this.stormTimes = cs.slice(9).map((c) => c.start - LEAD);
    // topology
    const rnd = mulberry32(2026);
    const P2 = [0, 1, 1, 0.75, 0.58, 0.46, 0.44, 0.4];
    this.nodes.push({ x: 0, y: 0, d: 0, parent: -1, born: w[0]!.start - LEAD, label: '', red: false, kids: [] });
    let front = [0];
    for (let d = 1; d <= 7; d++) {
      const next: number[] = [];
      front.forEach((pi, k) => {
        const n = d === 1 ? 2 : rnd() < P2[d]! ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const labs = LABELS[d] ?? [];
          const node: Node = {
            x: d === 0 ? 0 : FORK_X + d * DX, y: 0, d, parent: pi,
            born: this.forkTimes[d - 1]! + 0.008 * (k * 2 + i) * (d > 3 ? 0.5 : 1),
            label: d <= 2 ? labs[(k * 2 + i) % labs.length]! : labs.length ? labs[Math.floor(rnd() * labs.length)]! : '', red: false, kids: [],
          };
          this.nodes[pi]!.kids.push(this.nodes.length);
          next.push(this.nodes.length);
          this.nodes.push(node);
        }
      });
      front = next;
    }
    // dendrogram layout: leaves evenly spaced, parents at the mean of their children
    this.leaves = front;
    front.forEach((li, i) => { this.nodes[li]!.y = (i - (front.length - 1) / 2) * GAP; });
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i]!;
      if (n.kids.length) n.y = n.kids.reduce((a, k) => a + this.nodes[k]!.y, 0) / n.kids.length;
    }
    this.nodes[0]!.y = 0;
    // one red path (the bug is down one of these branches)
    let r = this.leaves[Math.floor(this.leaves.length * 0.68)]!;
    while (r > 0) { this.nodes[r]!.red = true; r = this.nodes[r]!.parent; }
  }

  /** tree origin (screen px, the root) + scale */
  private cam(t: number) {
    const [, w1, w2] = this.tw as [number, number, number];
    const oE = ease.outExpo;
    const ox = keys(t, [[this.t0, 150], [w1, 150], [w1 + 0.3, 130, oE], [w2, 120], [w2 + 0.4, 150, oE], [this.t1, 150]]);
    const oy = keys(t, [[this.t0, 760], [w1, 760], [w1 + 0.3, 745, oE], [w2, 745], [w2 + 0.4, 515, oE], [this.t1, 515]]);
    let s = keys(t, [[this.t0, 1.08], [w1, 1.06], [w1 + 0.3, 0.98, oE], [w2, 0.96], [w2 + 0.4, 0.6, oE], [this.t1, 0.57]]);
    for (const ft of this.forkTimes.slice(4)) s *= 1 - 0.012 * ease.outExpo(clamp((t - ft) / 0.2));
    for (const st of this.stormTimes) s *= 1 - 0.01 * ease.outExpo(clamp((t - st) / 0.2));
    return { ox, oy, s };
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    const { renderer, comp } = this.ctx;
    const t = f.t; // every event time below is (sung start - LEAD)
    const [w0, w1, w2] = this.tw as [number, number, number];
    const cam = this.cam(t);
    const bigKick = this.forkTimes[3]!; // 分
    const hot = t > bigKick ? Math.exp(-(t - bigKick) / 0.5) : 0;
    this.bg.u.org!.value.set(cam.ox, cam.oy);
    this.bg.u.scl!.value = cam.s;
    this.bg.u.hot!.value = hot;
    this.bg.render(renderer, out);

    const ctx = this.layer.clear();
    let shx = 0, shy = 0;
    for (const ft of [...this.forkTimes, ...this.stormTimes]) {
      const e = t - ft;
      if (e > 0 && e < 0.25) { const a = Math.exp(-e / 0.06) * (ft === bigKick ? 22 : 8); shx += (hash(ft * 100, 1) - 0.5) * a; shy += (hash(ft * 100, 2) - 0.5) * a; }
    }
    ctx.setTransform(cam.s, 0, 0, cam.s, cam.ox + shx, cam.oy + shy);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // ---------------- trunk
    const te = t - (w0 + 0.04);
    if (te > 0) {
      const g = ease.outExpo(clamp(te / 0.4));
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(FORK_X * g, 0);
      ctx.strokeStyle = css('cyan', 0.25); ctx.lineWidth = 18; ctx.stroke();
      ctx.strokeStyle = css('cyan', 0.95); ctx.lineWidth = 5; ctx.stroke();
    }
    // ---------------- edges
    for (let i = 1; i < this.nodes.length; i++) {
      const n = this.nodes[i]!;
      const e = t - n.born;
      if (e <= 0) continue;
      const p = this.nodes[n.parent]!;
      const g = ease.outExpo(clamp(e / 0.22));
      const x0 = n.parent === 0 ? FORK_X : p.x, y0 = p.y, x1 = n.x, y1 = n.y;
      const fresh = Math.exp(-e / 0.3);
      const lw = Math.max(2, 6 - n.d * 0.62);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      const N = 14;
      for (let k = 1; k <= N; k++) {
        const u = (k / N) * g;
        ctx.lineTo(lerp(x0, x1, u), lerp(y0, y1, ease.inOutCubic(clamp(u * 1.25 - 0.1))));
      }
      if (fresh > 0.15 || n.red) {
        ctx.strokeStyle = n.red ? css('red', 0.22) : css('cyan', 0.25 * fresh + 0.05);
        ctx.lineWidth = lw * 4;
        ctx.stroke();
      }
      ctx.strokeStyle = n.red ? css('red', 0.9) : fresh > 0.15 ? css('cyan', 0.55 + 0.45 * fresh) : css('mist', 0.42);
      ctx.lineWidth = lw;
      ctx.stroke();
      if (n.label && n.d <= 4 && g > 0.5) {
        const fs = [0, 44, 36, 30, 26][n.d]!;
        ctx.font = font(/[^\x00-\x7f]/.test(n.label) ? 'sans7' : 'mono8', fs);
        ctx.fillStyle = n.red ? css('red', 1) : css('mist', 0.9 * clamp((g - 0.5) / 0.5));
        ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
        ctx.fillText(n.label, lerp(x0, x1, 0.5) + 8, lerp(y0, y1, 0.62) - 8);
      }
    }
    // ---------------- nodes + question marks at the live tips
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i]!;
      if (i === 0) {
        if (t < w0) continue;
        const e = t - w0;
        ctx.fillStyle = css('cyan'); ctx.shadowColor = css('cyan'); ctx.shadowBlur = 26;
        ctx.beginPath(); ctx.arc(0, 0, 13 * (1 + 0.7 * Math.exp(-e / 0.12)), 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
        const ph = (f.beat % 1);
        ctx.strokeStyle = css('cyan', 0.6 * (1 - ph)); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, 14 + 70 * ph, 0, Math.PI * 2); ctx.stroke();
        continue;
      }
      const e = t - n.born - 0.1;
      if (e <= 0) continue;
      const r = Math.max(4, 10 - n.d);
      ctx.fillStyle = n.red ? css('red') : css('bone', 0.95);
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill();
      const kidBorn = n.kids.length ? this.nodes[n.kids[0]!]!.born : Infinity;
      if (t < kidBorn + 0.06) {
        const out = t > kidBorn ? 1 - clamp((t - kidBorn) / 0.06) : 1;
        const sz = ([0, 100, 84, 70, 60, 54, 50, 44][n.d]! + (n.d === 7 ? 30 * hash(i, 9) : 0)) * spring(e, 3, 0.4) * out;
        if (sz < 2) continue;
        let storm = 0;
        for (const st of this.stormTimes) if (t > st) storm = Math.max(storm, Math.exp(-(t - st) / 0.14) * (hash(i, Math.round(st * 50)) < 0.55 ? 1 : 0));
        ctx.font = font('dela', sz);
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillStyle = n.red ? css('red', 1) : storm > 0.25 ? css('cyan', 1) : css('mist', 0.88);
        ctx.fillText('？', n.x + r + 6 + (n.d === 7 ? 70 * hash(i, 11) : 0), n.y + 2);
      }
    }
    // ---------------- question storms: marks burst off the leaves
    this.stormTimes.forEach((st, si) => {
      const e = t - st;
      if (e < 0 || e > 0.7) return;
      for (let k = 0; k < 16; k++) {
        const li = this.leaves[Math.floor(hash(si, k, 3) * this.leaves.length)]!;
        const n = this.nodes[li]!;
        const vx = 300 + 900 * hash(si, k, 4), vy = (hash(si, k, 5) - 0.5) * 1400;
        const dd = (1 - Math.exp(-e * 3)) / 3;
        const x = n.x + 40 + vx * dd, y = n.y + vy * dd;
        const sz = (60 + 120 * hash(si, k, 6)) * (0.6 + 0.6 * ease.outBack(clamp(e / 0.15)));
        ctx.globalAlpha = (1 - e / 0.7) * 0.9;
        ctx.font = font('dela', sz);
        ctx.fillStyle = hash(si, k, 7) < 0.15 ? css('red') : hash(si, k, 7) < 0.6 ? css('cyan') : css('bone');
        ctx.save(); ctx.translate(x, y); ctx.rotate((hash(si, k, 8) - 0.5) * 0.8); ctx.fillText('？', 0, 0); ctx.restore();
      }
      ctx.globalAlpha = 1;
    });

    // ---------------- type (screen space)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const oE = ease.outExpo;
    const r1s = keys(t, [[this.t0, 270], [w1 - 0.02, 270], [w1 + 0.22, 246, oE], [w2 - 0.03, 244], [w2 + 0.3, 140, oE], [this.t1, 136]]);
    const r1x = keys(t, [[this.t0, 150], [w2 - 0.03, 150], [w2 + 0.3, 140, oE], [this.t1, 140]]);
    const r1y = keys(t, [[this.t0, 200], [w1 - 0.02, 196], [w1 + 0.22, 190, oE], [w2 - 0.03, 190], [w2 + 0.3, 150, oE], [this.t1, 150]]);
    const sc1 = r1s / 100;
    ctx.save();
    ctx.translate(r1x + shx * 0.5, r1y + shy * 0.5);
    ctx.scale(sc1, sc1);
    let lastLit = -1;
    drawGlyphs2D(ctx, this.row1, 0, 0, (g: Glyph) => {
      const s = gstate(g, this.line, t, 'word', 0.3);
      if (!s.vis) return null;
      if (!s.on) return { style: { fill: css('steel', 0.5), alpha: clamp(s.e / 0.1) } };
      lastLit = g.gi;
      const k = enter('slam', s.since, g.gi, 0.7);
      k.alpha = Math.max(k.alpha, 0.5);
      return { style: { fill: css('bone'), glow: css('cyan', 0.55), glowBlur: 20 / sc1 }, kin: k };
    });
    // the cursor follows the sung text until the question lands
    const qT = this.row1Chars[this.row1Chars.length - 1]!.start - LEAD;
    if (lastLit >= 0 && t < qT) {
      const gl = this.row1.glyphs[lastLit]!;
      drawCursor(ctx, gl.x + gl.adv / 2 + 10, 8, 44, 92, f.beatPhase, { glow: 1 });
    }
    const qe = t - qT;
    if (qe > 0) {
      const k = spring(qe, 2.6, 0.38);
      ctx.save();
      ctx.translate(this.row1.width + 72, 50);
      ctx.rotate(0.14 * (1 - clamp(qe / 0.3)) + 0.06);
      ctx.scale(1.2 * k, 1.2 * k);
      ctx.font = font('dela', 100); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 5; ctx.strokeStyle = css('cyan'); ctx.shadowColor = css('cyan'); ctx.shadowBlur = 30;
      ctx.strokeText('？', 0, 0);
      ctx.restore();
    }
    ctx.restore();

    // row 2: 分からなくなって — scrambled until each character is sung
    const sc2 = 1.7;
    const r2x = (W - this.row2.width * sc2) / 2, r2y = 820;
    const in2 = ease.outExpo(clamp((t - (w2 - 0.12)) / 0.2));
    if (in2 > 0) {
      ctx.save();
      ctx.translate(r2x + shx, r2y + shy + (1 - in2) * 70);
      ctx.scale(sc2, sc2);
      const jitter = smoothstep(w2 + 0.7, this.t1, t);
      drawGlyphs2D(ctx, this.row2, 0, 0, (g: Glyph) => {
        const lock = g.ch!.start - LEAD;
        if (t < lock) {
          const sc = scrambleChar(g.c, t, lock, g.gi, 22);
          return { style: { fill: css('cyan', 0.5), char: sc, font: 'dot', alpha: in2 } };
        }
        const k = enter('stamp', t - lock, g.gi, 0.9);
        k.alpha = Math.max(k.alpha, 0.5);
        k.dx += jitter * (hash(g.gi, f.frame >> 1) - 0.5) * 12;
        return { style: { fill: css('bone'), glow: css('cyan', 0.7), glowBlur: 26 / sc2 }, kin: k };
      });
      ctx.restore();
    }
    comp.draw(renderer, this.layer.upload(), out);
    const impact = t > bigKick && t < bigKick + 0.034 ? 1 : 0;
    const cut = Math.exp(-(t - this.t0) / 0.1);
    return {
      bloom: 0.85, bloomThreshold: 0.85, ca: 1.6 + 2.5 * hot, vignette: 0.4, invert: impact * 0.85,
      zoom: 1 + 0.05 * hot + 0.04 * cut, glitch: 0.1 * hot + 0.05 * smoothstep(w2 + 0.8, this.t1, t), rgbSplit: 3 * hot,
      shake: [fbm1(t * 25, 3) * 4 * hot, fbm1(t * 25, 4) * 4 * hot],
    };
  }
}
