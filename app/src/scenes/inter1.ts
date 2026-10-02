// inter1 (48.61 → 52.53, instrumental): an error-log barrage, one card per beat (the 8th
// note inverts it), red / white / ink, hard cuts + glitch. The last beat floods: the water
// rises over the cards, they sink into the deep — handing off to the sea of qiita.
import * as THREE from 'three';
import { font, type FontKey } from '../engine/fonts';
import { FSPass, Layer2D, H, W } from '../engine/gl';
import { BUG_ERROR, storyClock } from '../engine/motifs';
import { css } from '../engine/palette';
import type { PostParams } from '../engine/post';
import { Scene, type Frame } from '../engine/scene';
import { clamp, ease, fbm1, hash, smoothstep } from '../engine/util';
import { codeWidth, drawCode } from './loop-util';

type C2D = CanvasRenderingContext2D;
const RED = '#ff2b4e', BONE = '#eef2fa', INK = '#05060b', INK2 = '#0c0f1c', STEEL = '#55607e', MIST = '#9aa6c2';

function tx(c: C2D, s: string, x: number, y: number, k: FontKey, px: number, fill: string, o: { align?: CanvasTextAlign; alpha?: number; stroke?: number } = {}) {
  c.font = font(k, px);
  c.textAlign = o.align ?? 'left';
  c.textBaseline = 'alphabetic';
  c.globalAlpha = o.alpha ?? 1;
  if (o.stroke) { c.lineWidth = o.stroke; c.strokeStyle = fill; c.lineJoin = 'round'; c.strokeText(s, x, y); }
  else { c.fillStyle = fill; c.fillText(s, x, y); }
  c.globalAlpha = 1;
}
/** typewriter: the first n characters appear over [delay, delay + dur] */
function typed(c: C2D, s: string, x: number, y: number, k: FontKey, px: number, fill: string, e: number, delay: number, dur: number) {
  const n = Math.floor([...s].length * clamp((e - delay) / dur));
  if (n > 0) tx(c, [...s].slice(0, n).join(''), x, y, k, px, fill);
}
const slamK = (e: number, a = 0.28, d = 0.12) => 1 + a * (1 - ease.outExpo(clamp(e / d)));
const lerpN = (a: number, b: number, k: number) => a + (b - a) * k;

// ------------------------------------------------------------------ the cards
function card0(c: C2D, e: number, inv: boolean, t: number) {
  const fg = inv ? BONE : RED, back = inv ? RED : BONE, ink = inv ? BONE : INK;
  c.fillStyle = back; c.fillRect(0, 0, W, H);
  c.fillStyle = fg; c.fillRect(0, 0, W, 136);
  tx(c, '×  エラーが発生しました', 96, 92, 'sans9', 54, back);
  tx(c, storyClock(t), W - 96, 90, 'dot', 40, back, { align: 'right' });
  tx(c, 'Uncaught', 96, 262, 'mono8', 54, fg);
  const k = slamK(e);
  c.save(); c.translate(84, 540); c.scale(k, k); tx(c, 'TypeError', 0, 0, 'mono8', 318, fg); c.restore();
  typed(c, "Cannot read properties of undefined (reading 'fixed')", 96, 640, 'mono8', 44, ink, e, 0.04, 0.2);
  ['    at debug (night.ts:13:9)', '    at async main (night.ts:21:3)', '    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)']
    .forEach((s, i) => typed(c, s, 96, 712 + i * 48, 'mono4', 32, inv ? BONE : STEEL, e, 0.1 + i * 0.04, 0.12));
  c.fillStyle = fg; c.fillRect(0, H - 170, W, 170);
  tx(c, '型エラー', 96, H - 52, 'dela', 96, back);
  tx(c, '未定義のプロパティを読もうとしました', W - 96, H - 66, 'sans9', 44, back, { align: 'right' });
}

function dialog(c: C2D, x: number, y: number, w: number, h: number) {
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x + 10, y + 12, w, h);
  c.fillStyle = BONE; c.fillRect(x, y, w, h);
  c.fillStyle = INK2; c.fillRect(x, y, w, 50);
  tx(c, 'エラー', x + 22, y + 35, 'sans7', 26, BONE);
  tx(c, '×', x + w - 40, y + 36, 'sans9', 30, BONE);
  c.fillStyle = RED; c.beginPath(); c.arc(x + 62, y + 118, 32, 0, Math.PI * 2); c.fill();
  tx(c, '×', x + 62, y + 132, 'sans9', 44, BONE, { align: 'center' });
  tx(c, '予期しないエラーが', x + 120, y + 110, 'sans9', 34, INK);
  tx(c, '発生しました。', x + 120, y + 152, 'sans9', 34, INK);
  c.strokeStyle = INK; c.lineWidth = 3; c.strokeRect(x + w - 150, y + h - 66, 120, 46);
  tx(c, 'OK', x + w - 90, y + h - 32, 'mono8', 28, INK, { align: 'center' });
}
function card1(c: C2D, e: number, inv: boolean) {
  const back = inv ? BONE : RED, fg = inv ? RED : BONE, ink = inv ? RED : INK;
  c.fillStyle = back; c.fillRect(0, 0, W, H);
  // the dialogs cascade (one more every 16th)
  const n = 1 + Math.floor(e / 0.082);
  const k = slamK(e, 0.22);
  c.save(); c.translate(70, 330); c.scale(k, k); tx(c, 'Segmentation', 0, 0, 'mono8', 214, fg); c.restore();
  c.save(); c.translate(64, 800); c.scale(k, k); tx(c, 'fault', 0, 0, 'mono8', 430, ink); c.restore();
  typed(c, '(core dumped)', 70, 900, 'mono8', 60, fg, e, 0.06, 0.15);
  for (let i = 0; i < Math.min(n, 9); i++) dialog(c, 1150 + i * 34, 380 + i * 30, 520, 250);
  tx(c, 'Segmentation fault (core dumped)  ' + 'exit code 139', 96, H - 90, 'mono4', 30, fg, { alpha: 0.85 });
}

const NPM = [
  'code ERESOLVE', 'ERESOLVE unable to resolve dependency tree', 'While resolving: night@2.0.0', 'Found: coffee@3.1.4',
  'Could not resolve dependency:', 'peer sleep@"^8.0.0" from night@2.0.0', 'Fix the upstream dependency conflict, or retry',
  'this command with --force or --legacy-peer-deps', 'A complete log of this run can be found in:', '/home/me/.npm/_logs/0200-debug.log',
  'code ELIFECYCLE', 'errno 1', 'night@2.0.0 build: `tsc && vite build`', 'Exit status 1', 'Failed at the night@2.0.0 build script.',
];
function card2(c: C2D, e: number, inv: boolean) {
  c.fillStyle = inv ? RED : INK; c.fillRect(0, 0, W, H);
  const lh = 44, scroll = e * 520;
  c.save(); c.beginPath(); c.rect(0, 0, W, H); c.clip();
  for (let i = 0; i < 30; i++) {
    const y = 80 + i * lh - (scroll % lh) - Math.floor(scroll / lh) * 0;
    const li = i + Math.floor(scroll / lh);
    tx(c, 'npm ERR!', 96, y, 'mono8', 30, inv ? INK : RED);
    tx(c, NPM[li % NPM.length]!, 96 + 30 * 0.6 * 9, y, 'mono4', 30, inv ? BONE : MIST, { alpha: 0.9 });
  }
  c.restore();
  const k = slamK(e, 0.3);
  c.save(); c.translate(W / 2, 640); c.scale(k, k);
  if (inv || e > 0.327) tx(c, 'npm ERR!', 0, 0, 'mono8', 300, inv ? INK : RED, { align: 'center' });
  else { c.fillStyle = INK; c.globalAlpha = 0.7; c.fillRect(-760, -250, 1520, 300); c.globalAlpha = 1; tx(c, 'npm ERR!', 0, 0, 'mono8', 300, RED, { align: 'center', stroke: 7 }); }
  c.restore();
  c.fillStyle = inv ? INK : RED; c.fillRect(W - 96 - 700, H - 200, 700, 96);
  tx(c, '依存関係を解決できません', W - 96 - 350, H - 132, 'sans9', 48, BONE, { align: 'center' });
}

function card3(c: C2D, e: number, inv: boolean) {
  const back = inv ? INK : BONE, fg = inv ? BONE : INK;
  c.fillStyle = back; c.fillRect(0, 0, W, H);
  tx(c, 'RangeError:', 96, 190, 'mono8', 72, RED);
  const k = slamK(e, 0.18);
  c.save(); c.translate(90, 360); c.scale(k, k); tx(c, 'Maximum call stack', 0, 0, 'mono8', 150, fg); c.restore();
  c.save(); c.translate(90, 520); c.scale(k, k); tx(c, 'size exceeded', 0, 0, 'mono8', 150, RED); c.restore();
  // the stack: the same frame forever, receding
  const rows = Math.min(14, 2 + Math.floor(e / 0.035));
  for (let i = 0; i < rows; i++) {
    const s = 42 * Math.pow(0.9, i);
    const y = 600 + 46 * (1 - Math.pow(0.9, i)) / 0.1 + s * 0.4;
    tx(c, `    at why (night.ts:3:10)`, 96, y, 'mono4', s, inv ? MIST : STEEL, { alpha: 1 - i * 0.06 });
  }
  // 無限再帰, vertical
  c.save(); c.font = font('dela', 140); c.fillStyle = RED; c.textAlign = 'center'; c.textBaseline = 'middle';
  [...'無限再帰'].forEach((ch, i) => c.fillText(ch, W - 200, 470 + i * 150));
  c.restore();
}

function card4(c: C2D, e: number, inv: boolean) {
  c.fillStyle = inv ? RED : INK2; c.fillRect(0, 0, W, H);
  // the culprit, huge: nobody notices it yet
  const px = 250, line = 'hour: 2;';
  const w = codeWidth(line, px), x0 = (W - w) / 2 + 60, y0 = 520;
  const k = slamK(e, 0.15, 0.15);
  c.save(); c.translate(W / 2, y0); c.scale(k, k); c.translate(-W / 2, -y0);
  tx(c, '3', x0 - 200, y0 + 40, 'mono8', 120, inv ? INK : STEEL);
  c.fillStyle = inv ? 'rgba(5,6,11,0.25)' : 'rgba(255,43,78,0.13)'; c.fillRect(0, y0 - 150, W, 260);
  drawCode(c, line, x0, y0, px, { mono: 'mono8', color: inv ? BONE : undefined });
  const sx = x0 + codeWidth('hour: 2', px), sw = px * 0.6;
  c.strokeStyle = inv ? INK : RED; c.lineWidth = 10; c.lineCap = 'round'; c.beginPath();
  for (let q = -10; q <= sw + 10; q += 3) c.lineTo(sx + q, y0 + 140 + Math.sin(q * 0.16) * 12);
  c.stroke();
  c.restore();
  const bx = x0 - 20, by = y0 + 200;
  c.fillStyle = inv ? INK : '#2a0b16'; c.fillRect(bx, by, codeWidth(BUG_ERROR, 42) + 60, 120);
  c.fillStyle = RED; c.fillRect(bx, by, 10, 120);
  typed(c, BUG_ERROR, bx + 34, by + 74, 'mono8', 42, inv ? BONE : '#ff8a9c', e, 0.05, 0.22);
  tx(c, 'Found 1 error.', W - 96, 160, 'mono8', 48, inv ? INK : RED, { align: 'right' });
  tx(c, 'tsc --noEmit', 96, 160, 'mono4', 40, inv ? INK : MIST);
}

const CARDS = [card0, card1, card2, card3, card4];
const ERRS = ['Found 12 errors.', 'Found 128 errors.', 'Found 1,024 errors.', 'Found 9,999+ errors.', ''];

const WATER = /* glsl */ `
uniform sampler2D layer; uniform float level; uniform float depth; uniform float t;
void main() {
  vec2 uv = vUv;
  float wl = level + 0.014 * sin(uv.x * 14.0 + t * 9.0) + 0.006 * sin(uv.x * 37.0 - t * 13.0);
  float under = step(uv.y, wl) * step(0.001, level);
  vec2 off = under * vec2(snoise(uv * vec2(5.0, 3.5) + vec2(0.0, t * 1.6)), snoise(uv * vec2(4.0, 6.0) - vec2(t * 1.3, 0.0))) * (0.004 + 0.008 * depth);
  vec3 col = texture(layer, uv + off).rgb;
  if (under > 0.5) {
    float dz = depth * (0.6 + 0.4 * (1.0 - uv.y));
    vec3 deep = mix(vec3(0.018, 0.07, 0.17), vec3(0.002, 0.009, 0.03), clamp(dz, 0.0, 1.0));
    col = col * vec3(0.3, 0.62, 1.0) * (1.0 - 0.8 * dz);
    col = mix(col, deep, clamp(0.3 + 0.6 * dz, 0.0, 1.0));
    // god rays from the surface
    float ray = smoothstep(0.35, 1.0, snoise(vec2(uv.x * 7.0 + uv.y * 2.2, t * 0.35))) * smoothstep(0.0, 1.0, uv.y);
    col += vec3(0.2, 0.55, 1.0) * ray * 0.16 * (1.0 - 0.5 * depth);
    // caustic shimmer
    float cz = pow(abs(snoise(uv * vec2(9.0, 6.0) + vec2(t * 0.6, -t * 0.9))), 4.0);
    col += vec3(0.12, 0.35, 0.6) * cz * 0.2 * (1.0 - depth);
    // bubbles rising
    for (int L = 0; L < 3; L++) {
      float fl = float(L);
      vec2 g = vec2(uv.x * (14.0 + fl * 9.0) * uRes.x / uRes.y, uv.y * (14.0 + fl * 9.0) - t * (2.5 + fl * 1.6));
      vec2 id = floor(g); vec2 f = fract(g) - 0.5;
      float h = hash12(id + fl * 17.0);
      if (h > 0.9 - 0.04 * fl) {
        vec2 p = (hash22(id) - 0.5) * 0.4;
        float r = (0.05 + 0.1 * hash12(id + 3.0)) * (1.6 - fl * 0.4);
        float d = abs(length(f - p) - r);
        col += vec3(0.5, 0.8, 1.0) * smoothstep(0.035, 0.0, d) * (0.35 - 0.08 * fl) * smoothstep(0.0, 0.3, depth + 0.1);
      }
    }
  }
  float ml = exp(-pow((uv.y - wl) * 260.0, 2.0)) * step(0.001, level) * step(level, 1.05);
  col += vec3(0.7, 0.9, 1.0) * ml * 2.0;
  gl_FragColor = vec4(col, 1.0);
}`;

export default class Inter1 extends Scene {
  layer = new Layer2D();
  water = new FSPass(WATER, { layer: { value: null }, level: { value: 0 }, depth: { value: 0 }, t: { value: 0 } });
  beats: number[] = [];

  async init() {
    const A = this.ctx.audio;
    const k0 = Math.round(A.beat(this.ctx.start));
    for (let i = 0; i < 7; i++) this.beats.push(A.beatTime(k0 + i));
  }

  private mosaic(c: C2D, t: number, sink: number) {
    // 3x3 grid of every card (the barrage peak); `sink` 0..1 drops the tiles into the deep
    const cw = W / 3, ch = H / 3;
    c.fillStyle = INK; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 9; i++) {
      const gx = i % 3, gy = Math.floor(i / 3);
      const kind = (i * 2 + 1) % 5;
      const delay = hash(i, 4) * 0.35;
      const s = clamp((sink - delay) / (1 - delay));
      const fall = ease.inOutSine(s) * (380 + 360 * hash(i, 5)) + s * 60;
      const sc = 1 - 0.62 * ease.outCubic(s);
      const rot = (hash(i, 6) - 0.5) * 0.9 * ease.outCubic(s);
      c.save();
      c.translate(lerpN(gx * cw + cw / 2, W / 2, 0.35 * s) + (hash(i, 7) - 0.5) * 220 * s, lerpN(gy * ch + ch / 2, H / 2, 0.3 * s) + fall);
      c.rotate(rot);
      c.scale(sc, sc);
      c.translate(-cw / 2 + 6, -ch / 2 + 6);
      c.scale((cw - 12) / W, (ch - 12) / H);
      c.beginPath(); c.rect(0, 0, W, H); c.clip();
      CARDS[kind]!(c, 0.6, (i + Math.floor(t * 6)) % 4 === 0, t);
      c.restore();
    }
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    const { renderer } = this.ctx;
    const t = f.t;
    const B = this.beats;
    const period = this.ctx.audio.period;
    let bi = 0;
    for (let i = 0; i < 6; i++) if (t >= B[i]! - 1e-4) bi = i;
    const e = t - B[bi]!;
    const sub = e >= period / 2;
    const c = this.layer.clear();
    let level = 0, depth = 0;
    if (bi < 5) {
      const push = 1 + 0.045 * (e / period) + 0.02 * (sub ? Math.exp(-(e - period / 2) / 0.08) : 0);
      c.save();
      c.translate(W / 2, H / 2); c.scale(push, push); c.rotate(sub ? (bi % 2 ? 0.012 : -0.012) : 0); c.translate(-W / 2, -H / 2);
      if (bi < 4) CARDS[bi]!(c, e, sub, t);
      else if (!sub) CARDS[4]!(c, e, false, t);
      else this.mosaic(c, t, 0);
      c.restore();
    } else {
      // the flood: water rises over the mosaic, then the tiles sink
      const fl = clamp(e / 0.22);
      level = ease.outCubic(fl) * 1.08;
      const sink = clamp((e - 0.1) / 0.62);
      depth = smoothstep(0.05, 0.62, e);
      this.mosaic(c, t, sink);
    }
    if (bi < 5 && ERRS[bi]) {
      const dark = bi === 0 || bi === 3 ? !sub : bi === 2 ? !sub : sub;
      const y = bi === 0 ? 200 : bi === 1 ? 200 : 96;
      if (bi === 2) { c.fillStyle = sub ? RED : INK; c.fillRect(W - 96 - 560, y - 40, 560, 54); }
      tx(c, ERRS[bi]!, W - 96, y, 'mono8', 34, dark ? RED : bi === 1 ? (sub ? RED : BONE) : BONE, { align: 'right' });
    }
    this.water.u.layer!.value = this.layer.upload();
    this.water.u.level!.value = level;
    this.water.u.depth!.value = depth;
    this.water.u.t!.value = t;
    this.water.render(renderer, out);
    // impacts: glitch on each cut, a punch on the 8th
    const cut = Math.exp(-e / 0.05) * (bi === 0 ? 0.55 : 1);
    const half = sub ? Math.exp(-(e - period / 2) / 0.05) : 0;
    const kick = f.a.kick, snare = f.a.snare;
    const sinking = bi === 5;
    return {
      bloom: sinking ? 0.6 : 0.3, bloomThreshold: sinking ? 0.85 : 1.1, ca: sinking ? 2 : 2.5 + 3 * cut, vignette: sinking ? 0.5 : 0.25,
      glitch: sinking ? 0.15 * (1 - depth) : 0.55 * cut + 0.25 * half, rgbSplit: sinking ? 0 : 10 * cut + 5 * half,
      zoom: 1 + 0.06 * cut + 0.03 * half + (sinking ? 0.04 * depth : 0),
      shake: [fbm1(t * 40, 1) * (6 + 14 * kick) * (sinking ? 0.3 : 1), fbm1(t * 40, 2) * (6 + 14 * snare) * (sinking ? 0.3 : 1)],
      grain: 0.06, saturation: sinking ? 1 : 1.1,
    };
  }
}
