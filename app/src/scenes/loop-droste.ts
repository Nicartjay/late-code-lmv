// loop / shot D — L11 画面越しに自分を問い詰める: sharing your own screen — the window shows
// itself, recursively (the screen-share hall of mirrors). Each word sits one level deeper;
// the camera snaps a level per word, then the zoom runs away (riser), deeper levels ask
// the questions, 問い詰める is stamped over the tunnel, zoom blur -> whiteout at the cut.
import * as THREE from 'three';
import { font } from '../engine/fonts';
import { FSPass, H, Layer2D, makeRT, screenCamera, W } from '../engine/gl';
import { enter, gstate } from '../engine/kinetic';
import { LEAD, type Line } from '../engine/lyrics';
import { BUG_LINE, CODE, storyClock } from '../engine/motifs';
import { col, css } from '../engine/palette';
import type { PostParams } from '../engine/post';
import type { Ctx, Frame } from '../engine/scene';
import { Glyphs3D, text3d, tint } from '../engine/text3d';
import { clamp, ease, fbm1, keys, smoothstep } from '../engine/util';
import { codeWidth, drawCode, drawScene } from './loop-util';
import type { Text } from 'troika-three-text';

const K = 0.5; // child window scale
const TH = -0.045; // child rotation
const C = [250, 62]; // child centre (level px, y up)
const NSLOT = 9;
const JMAX = 18;
const QUESTIONS = ['なんで動かないの？', '本当にテストした？', 'ドキュメント読んだ？', 'それ、昨日も見たよね？', 'どこが違うの？', 'エラー文、読んだ？', 'ちゃんと寝てる？', '…わかってるでしょ？'];

const RADIAL = /* glsl */ `
uniform sampler2D src; uniform vec2 c; uniform float amt; uniform float white; uniform float dark;
void main() {
  vec2 d = vUv - c;
  vec3 acc = vec3(0.0); float ws = 0.0;
  for (int i = 0; i < 20; i++) {
    float f = float(i) / 19.0;
    float s = 1.0 - amt * 0.3 * f;
    float w = 1.0 - 0.7 * f;
    acc += texture(src, c + d * s).rgb * w; ws += w;
  }
  vec3 col = acc / ws * (1.0 - dark);
  float r = length(d * vec2(uRes.x / uRes.y, 1.0));
  vec3 wcol = vec3(1.25, 1.3, 1.4) * (1.0 + 0.5 * exp(-r * 2.5));
  col = mix(col, wcol, clamp(white * (1.25 - 0.35 * r), 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}`;

export class Droste {
  scene = new THREE.Scene();
  top = new THREE.Scene();
  cam = screenCamera();
  win = new Layer2D();
  rt = makeRT(W, H, { samples: 4 });
  radial = new FSPass(RADIAL, { src: { value: null }, c: { value: new THREE.Vector2(0.5, 0.5) }, amt: { value: 0 }, white: { value: 0 }, dark: { value: 0 } });
  slots: { grp: THREE.Group; plane: THREE.Mesh; mat: THREE.MeshBasicMaterial }[] = [];
  levelText: (Glyphs3D | Text | null)[] = [];
  line!: Line;
  stamp!: Glyphs3D;
  zs: [number, number] = [0, 0];
  private tw: number[] = [];

  constructor(private ctx: Ctx, private t0: number, private t1: number) {}

  async init() {
    const L = this.ctx.lyrics.get('画面越しに自分を問い詰める');
    this.line = L;
    this.tw = L.words.map((w) => w.start - LEAD);
    // fixed point of z -> c + a z  (a = K e^{i TH}):  z* = c / (1 - a)
    const ar = K * Math.cos(TH), ai = K * Math.sin(TH);
    const dr = 1 - ar, di = -ai, den = dr * dr + di * di;
    this.zs = [(C[0]! * dr + C[1]! * di) / den, (C[1]! * dr - C[0]! * di) / den];
    for (let i = 0; i < NSLOT; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: this.win.tex, transparent: true, premultipliedAlpha: true, depthTest: false, depthWrite: false, toneMapped: false });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
      plane.renderOrder = i * 10;
      const grp = new THREE.Group();
      grp.add(plane);
      this.scene.add(grp);
      this.slots.push({ grp, plane, mat });
    }
    // per absolute level: 0 画面越しに, 1 自分を, 2.. the questions
    for (let j = 0; j <= JMAX; j++) {
      let g: Glyphs3D | Text | null = null;
      if (j < 2) {
        g = new Glyphs3D(L.words[j]!.chars, { font: 'sans9', size: 150, color: col('bone'), tracking: 0.02 });
        g.group.position.set(-330 + g.width / 2, -338, 0);
      } else {
        const q = QUESTIONS[(j - 2) % QUESTIONS.length]!;
        const tx = text3d(q, { font: 'sans9', size: 96, color: col('mist'), anchorX: 'left' });
        tx.position.set(-330, -338, 0);
        g = tx;
      }
      this.levelText.push(g);
    }
    this.stamp = new Glyphs3D(L.words[2]!.chars, { font: 'dela', size: 236, color: col('bone'), tracking: 0.04, outlineWidth: '4%', outlineColor: col('ink'), outlineBlur: '10%' });
    this.stamp.group.position.set(0, -30, 0);
    this.top.add(this.stamp.group);
  }

  private drawWindow(f: Frame, red: number) {
    const c = this.win.clear();
    const x0 = 40, y0 = 40, w = W - 80, h = H - 80;
    c.fillStyle = '#0d1325';
    c.beginPath(); c.roundRect(x0, y0, w, h, 22); c.fill();
    // glowing bezel (cyan; the bug's red takes over in the riser)
    const rim = red > 0.5 ? 'red' : 'cyan';
    c.strokeStyle = css(rim, 0.1); c.lineWidth = 14; c.stroke();
    c.strokeStyle = css(rim, 0.22); c.lineWidth = 7; c.stroke();
    c.strokeStyle = css(rim, 0.85); c.lineWidth = 3; c.stroke();
    // title bar
    c.fillStyle = '#18203f';
    c.beginPath(); c.roundRect(x0 + 2, y0 + 2, w - 4, 62, [20, 20, 0, 0]); c.fill();
    [css('red'), css('amber'), css('steel')].forEach((cc, i) => { c.fillStyle = cc; c.beginPath(); c.arc(x0 + 34 + i * 30, y0 + 33, 9, 0, Math.PI * 2); c.fill(); });
    c.font = font('sans7', 27); c.fillStyle = css('bone', 0.9); c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('画面を共有しています — night.ts', W / 2 - 60, y0 + 34);
    c.fillStyle = css('red', 0.95);
    c.beginPath(); c.roundRect(W - 340, y0 + 14, 176, 38, 19); c.fill();
    c.font = font('sans7', 22); c.fillStyle = css('bone'); c.textAlign = 'left';
    c.fillText(f.beatPhase < 0.5 ? '●  共有中' : '○  共有中', W - 320, y0 + 34);
    c.font = font('dot', 28); c.fillStyle = css('ice'); c.textAlign = 'right';
    c.fillText(storyClock(f.t), W - 70, y0 + 34);
    // tabs
    c.textAlign = 'left';
    ['night.ts', 'debug.ts', 'StackTrace.log', '自分.md'].forEach((tb, i) => {
      const tx = x0 + 24 + i * 250;
      c.fillStyle = i === 0 ? '#22305e' : '#141a33';
      c.beginPath(); c.roundRect(tx, y0 + 78, 236, 44, 8); c.fill();
      if (i === 0) { c.fillStyle = css('cyan'); c.fillRect(tx + 10, y0 + 118, 216, 3); }
      c.font = font('code4', 21); c.fillStyle = i === 0 ? css('bone') : css('mist', 0.8);
      c.fillText(tb, tx + 18, y0 + 100);
    });
    // code panel (left)
    const px = 23, lh = 37, cx = x0 + 28, cy = y0 + 168;
    CODE.forEach((ln, i) => {
      const y = cy + i * lh;
      if (y > y0 + h - 320) return;
      const bug = i === BUG_LINE;
      if (bug) { c.fillStyle = css('red', 0.2); c.fillRect(x0 + 4, y - lh / 2, 590, lh); }
      c.font = font('mono4', 19); c.fillStyle = bug ? css('red') : css('steel'); c.textAlign = 'right';
      c.fillText(String(i + 1), cx + 30, y); c.textAlign = 'left';
      c.save(); c.beginPath(); c.rect(cx + 44, y - lh, 530, lh * 2); c.clip();
      const ex = drawCode(c, ln, cx + 50, y, px);
      c.restore();
      if (bug) {
        const sx = cx + 50 + codeWidth(ln.slice(0, ln.indexOf(';')), px);
        c.strokeStyle = css('red'); c.lineWidth = 2.6; c.beginPath();
        for (let q = -4; q <= px * 0.6 + 4; q += 2) c.lineTo(sx + q, y + 15 + Math.sin(q * 0.6) * 2.4);
        c.stroke();
        if (f.beatPhase < 0.55) { c.fillStyle = css('cyan'); c.fillRect(ex + 4, y - 15, 14, 30); }
      }
    });
    // the hole: a black bezel where the shared screen shows itself
    const hx = W / 2 + C[0]! - (W * K) / 2, hy = H / 2 - C[1]! - (H * K) / 2;
    c.fillStyle = '#000';
    c.fillRect(hx - 6, hy - 6, W * K + 12, H * K + 12);
    // lyric band
    c.strokeStyle = css('steel', 0.5); c.lineWidth = 2;
    c.beginPath(); c.moveTo(x0 + 610, H - 300); c.lineTo(x0 + w - 30, H - 300); c.stroke();
    c.font = font('dot', 24); c.fillStyle = css(red > 0.5 ? 'red' : 'cyan', 0.9);
    c.fillText('> 自分に質問中…', W - 400, H - 268);
  }

  /** zoom depth: one level per word, then a runaway riser */
  private phi(t: number) {
    const [, w1, w2] = this.tw as [number, number, number];
    const oE = ease.outExpo;
    let p = keys(t, [[this.t0, -0.22], [this.t0 + 0.35, 0, oE], [w1 - 0.04, 0.1, ease.linear], [w1 + 0.3, 1, oE], [w2 - 0.04, 1.1, ease.linear], [w2 + 0.28, 2, oE]]);
    const r = clamp((t - (w2 + 0.1)) / (this.t1 - w2 - 0.1));
    p += 6.5 * Math.pow(r, 2.2);
    return p;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    const { renderer } = this.ctx;
    const t = f.t;
    const [, , w2] = this.tw as [number, number, number];
    const riser = smoothstep(w2, this.t1, t);
    this.drawWindow(f, riser);
    this.win.upload();
    const phi = this.phi(t);
    const base = Math.floor(phi) - 1;
    for (const g of this.levelText) {
      const o = g instanceof Glyphs3D ? g.group : g;
      if (o && o.parent) o.parent.remove(o);
    }
    for (let i = 0; i < NSLOT; i++) {
      const j = base + i;
      const p = j - phi;
      const sc = Math.pow(K, p), ang = TH * p;
      const ar = sc * Math.cos(ang), ai = sc * Math.sin(ang);
      const [zx, zy] = this.zs;
      const sl = this.slots[i]!;
      sl.grp.position.set(zx - (zx * ar - zy * ai), zy - (zx * ai + zy * ar), 0);
      sl.grp.rotation.z = ang;
      sl.grp.scale.setScalar(sc);
      const dim = Math.pow(0.86, Math.max(0, i - 1));
      sl.mat.color.setRGB(dim, dim * 1.0, dim * 1.08);
      sl.grp.visible = sc > 0.006;
      // level text
      const g = j >= 0 && j <= JMAX ? this.levelText[j] : null;
      if (g) {
        const o = g instanceof Glyphs3D ? g.group : g;
        sl.grp.add(o);
        if (g instanceof Glyphs3D) {
          for (const it of g.items) {
            it.mesh.renderOrder = i * 10 + 5;
            const s = gstate(it, this.line, t, 'line', 0.4);
            if (!s.on) { tint(it.mesh, col('steel'), 0.45 * dim); it.mesh.scale.setScalar(1); continue; }
            const k = enter('slam', s.since, it.gi, 0.6);
            it.mesh.scale.setScalar(k.sc);
            tint(it.mesh, col('bone', 1.3 * dim).multiplyScalar(k.bright), Math.max(k.alpha, 0.45));
          }
        } else {
          g.renderOrder = i * 10 + 5;
          tint(g, col(j % 3 === 0 ? 'red' : 'mist', j % 3 === 0 ? 1.2 * dim : dim), 0.95);
        }
      }
    }
    // tunnel -> rt -> radial blur / whiteout -> out
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, true);
    drawScene(renderer, this.scene, this.cam, this.rt);
    const white = Math.pow(smoothstep(this.t1 - 0.24, this.t1 - 0.01, t), 1.4);
    const stampOn = smoothstep(w2 - 0.05, w2 + 0.1, t);
    this.radial.u.src!.value = this.rt.texture;
    this.radial.u.c!.value.set(0.5 + this.zs[0] / W, 0.5 + this.zs[1] / H);
    this.radial.u.amt!.value = 1.3 * Math.pow(riser, 1.3);
    this.radial.u.white!.value = white;
    this.radial.u.dark!.value = 0.5 * stampOn * (1 - white);
    this.radial.render(renderer, out);

    // 問い詰める — stamped over the tunnel; turns to ink in the whiteout
    for (const it of this.stamp.items) {
      const s = gstate(it, this.line, t, 'word', 0.2);
      it.mesh.visible = s.vis;
      if (!s.vis) continue;
      const jx = fbm1(t * 20 + it.gi, 3) * 6 * riser;
      if (!s.on) {
        it.mesh.position.set(it.x, -it.y, 0);
        it.mesh.scale.setScalar(1);
        tint(it.mesh, col('steel').lerp(col('mist'), white), 0.4 * clamp(s.e / 0.1));
        it.mesh.outlineOpacity = 0.3 * (1 - white);
        continue;
      }
      const k = enter('stamp', s.since, it.gi, 1.1);
      k.alpha = Math.max(k.alpha, 0.4);
      it.mesh.position.set(it.x + jx, -it.y + fbm1(t * 18 + it.gi, 5) * 6 * riser, 0);
      it.mesh.scale.setScalar(k.sc);
      it.mesh.rotation.z = (it.gi % 2 ? 1 : -1) * 0.03;
      const lit = col('bone', 1.4).multiplyScalar(k.bright).lerp(col('red', 1.2), 0.25 * Math.exp(-s.since / 0.3));
      tint(it.mesh, lit.lerp(col('ink'), smoothstep(0.12, 0.3, white)), 1);
      it.mesh.outlineOpacity = 0.9 * (1 - smoothstep(0.12, 0.3, white));
    }
    drawScene(renderer, this.top, this.cam, out);
    const kick = f.a.kick;
    const cut = Math.exp(-(t - this.t0) / 0.1);
    return {
      bloom: 0.8 + 0.6 * riser, bloomThreshold: 0.88 + 0.6 * white, ca: 1.5 + 4 * riser, vignette: 0.45 * (1 - white),
      zoom: 1 + 0.04 * cut + 0.025 * kick * (1 + riser),
      shake: [fbm1(t * 28, 6) * (3 + 10 * riser) * (0.4 + kick), fbm1(t * 28, 8) * (3 + 10 * riser) * (0.4 + kick)],
      glitch: 0.06 * riser * kick, grain: 0.045 * (1 - white),
    };
  }
}
