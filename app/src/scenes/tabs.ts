// tabs (62.98 → 68.20) — L20 開いたタブは数え切れない / L21 メモリも私の根気も、もう限界
// A dark browser window. 開いた: a new window pops open. タブは: macro on the tab strip,
// tabs double on every mora. 数え切れない: tabs explode exponentially into slivers, a counter
// races to NaN and the camera pulls back through a 3D cascade of windows.
// L21 cuts to a dashboard: a MEMORY tachometer climbing into the red, then a 根気 fuel gauge
// draining to E (patience: 0.02). もう: alarm. 限界: the screen glass cracks, twice.
import * as THREE from 'three';
import { font, measure } from '../engine/fonts';
import { FSPass, Layer2D, H, W } from '../engine/gl';
import { enter, gstate, type Glyph } from '../engine/kinetic';
import type { Char, Line } from '../engine/lyrics';
import { storyClock } from '../engine/motifs';
import { col, css, cssMix } from '../engine/palette';
import type { PostParams } from '../engine/post';
import { Scene, type Frame } from '../engine/scene';
import { drawGlyphs2D, layout2D, rrect, text2D, type Lay2D } from '../engine/type2d';
import { clamp, ease, hash, lerp, mulberry32, noise1 } from '../engine/util';
import { charsOf, impactFrame, lastPulse, on, shake } from './spec-kit';

const BW = 1600, BH = 1000; // browser texture px
const WIN_W = 16, WIN_H = 10; // window plane (world units)
const GRID_MAX = 7; // 2^7 windows per region at the end
const GRID_REGIONS = 5; // the hero region is the centre of a 5x5 wall

const TITLES = [
  '【解決】保存で画面が真っ白になる件', 'TypeError: Cannot read properties of undefined', 'javascript 画面 白い なぜ', '新しいタブ',
  '【初心者】セミコロンとカンマの違い', 'npm ERR! code ERESOLVE の対処法', 'undefined is not a function とは', '2時 眠い 集中する方法',
  'コーヒー 何杯まで 大丈夫', '仕様 バグ 違い', 'Uncaught SyntaxError: Unexpected token', '無限ループ 止め方', 'メモリリーク 原因 調べ方',
  'Array.prototype.map() リファレンス', 'async await 使い方 わからない', '画面が真っ白 React', '再現手順 書き方', 'ビルド 通らない 原因',
];
const FAV = ['#2f6bff', '#62e6ff', '#ffb648', '#ff2b4e', '#9aa6c2', '#8b5cff', '#c4ecff'];

const BG = /* glsl */ `
uniform float t; uniform float mode; uniform float alarm; uniform float kick;
void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  vec3 c;
  if (mode < 0.5) {
    float g = exp(-dot(p - vec2(0.0, 0.1), p - vec2(0.0, 0.1)) * 1.6);
    c = C_INK + C_BLUE * (0.035 + 0.05 * g) * (0.85 + 0.15 * vnoise(p * 3.0 + t * 0.2));
  } else {
    // dashboard: dark panel with a fine grid, red alarm wash
    vec2 q = vUv * uRes / 48.0;
    vec2 gq = abs(fract(q) - 0.5);
    float grid = smoothstep(0.48, 0.5, max(gq.x, gq.y));
    float g = exp(-dot(p, p) * 1.2);
    c = C_INK * 1.5 + vec3(0.012, 0.016, 0.03) * g + vec3(0.01, 0.014, 0.03) * grid;
    c += C_RED * alarm * (0.05 + 0.10 * smoothstep(0.2, 0.9, length(p)));
  }
  gl_FragColor = vec4(c, 1.0);
}`;

interface CrackSeg { x0: number; y0: number; x1: number; y1: number; d: number; w: number }

export default class Tabs extends Scene {
  bg = new FSPass(BG, { t: { value: 0 }, mode: { value: 0 }, alarm: { value: 0 }, kick: { value: 0 } });
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(35, W / H, 0.1, 600);
  browser = new Layer2D(BW, BH);
  hud = new Layer2D();
  hero!: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  back!: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  grid!: THREE.InstancedMesh;
  gridGroup = new THREE.Group();
  L20!: Line;
  L21!: Line;
  lay: Record<string, { lay: Lay2D; line: Line }> = {};
  cracks: CrackSeg[][] = [];
  crackAt: { x: number; y: number }[] = [];
  // times
  tOpen = 0; tTab = 0; tKazu = 0; tMem = 0; tWata = 0; tKon = 0; tMou = 0; tGen = 0; tKai = 0; tLastI = 0;
  tabSteps: [number, number][] = [];
  beatPhase = 0;
  plateImg!: HTMLCanvasElement;

  async init() {
    const { lyrics } = this.ctx;
    this.L20 = lyrics.get('開いたタブは数え切れない');
    this.L21 = lyrics.get('メモリも私の根気も、もう限界');
    const L20 = this.L20, L21 = this.L21;
    this.tOpen = on(L20.words[0]!);
    this.tTab = on(charsOf(L20, 'タブは')[0]!);
    this.tKazu = on(charsOf(L20, '数')[0]!);
    this.tLastI = on(L20.chars[L20.chars.length - 1]!);
    this.tMem = on(L21.chars[0]!);
    this.tWata = on(charsOf(L21, '私')[0]!);
    this.tKon = on(charsOf(L21, '根')[0]!);
    this.tMou = on(charsOf(L21, 'もう')[0]!);
    this.tGen = on(charsOf(L21, '限')[0]!);
    this.tKai = on(charsOf(L21, '界')[0]!);

    // tab count steps: 3 → +1 on 開 → doubling on タ/ブ/は → 16ths from 数
    const A = this.ctx.audio;
    this.tabSteps.push([-1e9, 3], [this.tOpen, 4]);
    charsOf(L20, 'タブは').forEach((c, i) => this.tabSteps.push([on(c), 8 * 2 ** i]));
    for (let k = 0, n = 64; ; k++, n *= 2) {
      const s = this.tKazu + k * (A.period / 4);
      if (s > this.ctx.end) break;
      this.tabSteps.push([s, n]);
    }

    // lyric layouts (Canvas2D)
    const mk = (key: string, chars: Char[], line: Line, f: 'sans9' | 'dela', size: number, tracking = 0) =>
      (this.lay[key] = { lay: layout2D(chars, { font: f, size, tracking }), line });
    mk('hiraita', charsOf(L20, '開いた'), L20, 'sans9', 230, 0.02);
    mk('tabwa', charsOf(L20, 'タブは'), L20, 'sans9', 210, 0.02);
    mk('kazoe', charsOf(L20, '数え切れない'), L20, 'dela', 200, 0.0);
    mk('memo', charsOf(L21, 'メモリ'), L21, 'sans9', 150, 0.02);
    mk('mo1', charsOf(L21, 'メモリも').slice(3), L21, 'sans9', 110);
    mk('wata', charsOf(L21, '私の'), L21, 'sans9', 110);
    mk('konki', charsOf(L21, '根気'), L21, 'sans9', 150, 0.02);
    mk('mo2', charsOf(L21, '根気も、').slice(2), L21, 'sans9', 110);
    mk('mou', charsOf(L21, 'もう'), L21, 'dela', 170);
    mk('genkai', charsOf(L21, '限界'), L21, 'dela', 330, 0.02);

    // windows: the hero, an older window behind it, and an instanced wall that splits recursively
    const geo = new THREE.PlaneGeometry(WIN_W, WIN_H);
    const mat = () => new THREE.MeshBasicMaterial({ map: this.browser.tex, transparent: true, premultipliedAlpha: true, toneMapped: false, side: THREE.DoubleSide });
    this.hero = new THREE.Mesh(geo, mat());
    this.back = new THREE.Mesh(geo, mat());
    this.back.position.set(-3.2, 1.6, -4);
    this.scene.add(this.hero, this.back);
    const gm = mat();
    this.grid = new THREE.InstancedMesh(geo, gm, GRID_REGIONS * GRID_REGIONS * 2 ** GRID_MAX);
    this.grid.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.grid.setColorAt(0, new THREE.Color(1, 1, 1));
    this.grid.frustumCulled = false;
    this.gridGroup.add(this.grid);
    this.scene.add(this.gridGroup);

    // soft plate sprite (blurred rounded rect, drawn once)
    this.plateImg = document.createElement('canvas');
    this.plateImg.width = 640; this.plateImg.height = 320;
    {
      const c = this.plateImg.getContext('2d')!;
      c.filter = 'blur(28px)';
      c.fillStyle = '#05060b';
      c.beginPath(); c.roundRect(70, 70, 500, 180, 90); c.fill();
    }
    // cracks (precomputed, seeded)
    this.crackAt = [{ x: 150, y: 70 }, { x: -380, y: -150 }];
    this.cracks = this.crackAt.map((c, i) => this.buildCrack(c.x, c.y, 11 + i * 5, i === 0 ? 15 : 11, i === 0 ? 1 : 0.8));
  }

  buildCrack(cx: number, cy: number, seed: number, rays: number, reach: number): CrackSeg[] {
    const r = mulberry32(seed);
    const segs: CrackSeg[] = [];
    const ends: { a: number; pts: [number, number, number][] }[] = [];
    for (let i = 0; i < rays; i++) {
      let a = (i / rays) * Math.PI * 2 + (r() - 0.5) * 0.35;
      let x = cx, y = cy, d = 0;
      const L = (380 + r() * 950) * reach;
      const pts: [number, number, number][] = [[x, y, 0]];
      while (d < L) {
        const step = 28 + r() * 70;
        a += (r() - 0.5) * 0.5;
        const nx = x + Math.cos(a) * step, ny = y + Math.sin(a) * step;
        segs.push({ x0: x, y0: y, x1: nx, y1: ny, d, w: 2.6 * (1 - d / L) + 0.8 });
        // branches
        if (r() < 0.18) {
          let ba = a + (r() < 0.5 ? 1 : -1) * (0.4 + r() * 0.5), bx = nx, by = ny, bd = d;
          for (let k = 0; k < 3; k++) {
            const s2 = 20 + r() * 45;
            const ex = bx + Math.cos(ba) * s2, ey = by + Math.sin(ba) * s2;
            segs.push({ x0: bx, y0: by, x1: ex, y1: ey, d: bd, w: 1.0 });
            bx = ex; by = ey; bd += s2; ba += (r() - 0.5) * 0.6;
          }
        }
        x = nx; y = ny; d += step;
        pts.push([x, y, d]);
      }
      ends.push({ a, pts });
    }
    // concentric rings joining neighbouring rays
    for (const R of [70, 150, 260, 420].map((v) => v * reach)) {
      for (let i = 0; i < ends.length; i++) {
        const A0 = ends[i]!.pts, A1 = ends[(i + 1) % ends.length]!.pts;
        const p0 = A0.find((p) => p[2] >= R), p1 = A1.find((p) => p[2] >= R * (0.9 + 0.2 * r()));
        if (!p0 || !p1 || r() < 0.25) continue;
        const mx = (p0[0] + p1[0]) / 2 + (r() - 0.5) * 20, my = (p0[1] + p1[1]) / 2 + (r() - 0.5) * 20;
        segs.push({ x0: p0[0], y0: p0[1], x1: mx, y1: my, d: R, w: 1.4 });
        segs.push({ x0: mx, y0: my, x1: p1[0], y1: p1[1], d: R, w: 1.4 });
      }
    }
    return segs;
  }

  /** the tab count of the current step (exact) */
  tabTarget(t: number) {
    let cur = 3;
    for (const [s, n] of this.tabSteps) { if (t >= s) cur = n; else break; }
    return cur;
  }

  /** number of open tabs (fractional while a step animates) */
  tabs(t: number) {
    let prev = 3, cur = 3, ts = -1e9;
    for (const [s, n] of this.tabSteps) {
      if (t >= s) { prev = cur; cur = n; ts = s; } else break;
    }
    const k = ease.outExpo(clamp((t - ts) / 0.12));
    return lerp(prev, cur, k);
  }

  // ---------------------------------------------------------------- browser texture
  drawBrowser(t: number, n: number, frame: number) {
    const c = this.browser.clear();
    const r = 22;
    // window body
    c.fillStyle = '#151b33';
    rrect(c, 0, 0, BW, BH, r); c.fill();
    // tab strip
    const stripH = 64, toolH = 62;
    c.save();
    rrect(c, 0, 0, BW, BH, r); c.clip();
    c.fillStyle = '#0b0f1f';
    c.fillRect(0, 0, BW, stripH);
    const x0 = 18, x1 = BW - 110;
    const tw = Math.min(250, (x1 - x0) / Math.max(1, n));
    const N = Math.ceil(n);
    const active = N - 1;
    for (let i = 0; i < N; i++) {
      const x = x0 + i * tw;
      const isA = i === active;
      if (tw > 34) {
        c.fillStyle = isA ? '#26304f' : '#161c33';
        c.beginPath();
        c.roundRect(x + 2, 10, tw - 4, stripH - 10 + (isA ? 2 : 0), [12, 12, 0, 0]);
        c.fill();
        // favicon
        c.fillStyle = FAV[i % FAV.length]!;
        c.beginPath(); c.roundRect(x + 16, 28, 18, 18, 4); c.fill();
        if (tw > 120) {
          c.save();
          c.beginPath(); c.rect(x + 42, 12, tw - 42 - 34, stripH - 12); c.clip();
          c.font = font('sans4', 21);
          c.fillStyle = isA ? css('bone') : css('mist', 0.8);
          c.textBaseline = 'middle';
          c.fillText(TITLES[(i * 7 + 3) % TITLES.length]!, x + 44, 38);
          c.restore();
          // close ×
          c.strokeStyle = css('steel'); c.lineWidth = 2;
          c.beginPath(); c.moveTo(x + tw - 26, 32); c.lineTo(x + tw - 16, 42); c.moveTo(x + tw - 16, 32); c.lineTo(x + tw - 26, 42); c.stroke();
        }
      } else if (tw > 5) {
        c.fillStyle = isA ? '#26304f' : '#161c33';
        c.fillRect(x + 1, 12, tw - 2, stripH - 12);
        if (tw > 14) { c.fillStyle = FAV[i % FAV.length]!; c.fillRect(x + tw / 2 - 5, 30, 10, 10); }
      } else {
        // slivers
        c.fillStyle = i % 2 ? '#2a3354' : FAV[i % FAV.length]!;
        c.globalAlpha = 0.85;
        c.fillRect(x, 12 + (i % 3) * 2, Math.max(0.6, tw * 0.7), stripH - 14);
        c.globalAlpha = 1;
      }
    }
    // + button and overflow ▼
    const px = Math.min(x1 + 8, x0 + N * tw + 10);
    c.strokeStyle = css('mist'); c.lineWidth = 3;
    c.beginPath(); c.moveTo(px + 14, 37); c.lineTo(px + 34, 37); c.moveTo(px + 24, 27); c.lineTo(px + 24, 47); c.stroke();
    c.fillStyle = css('mist');
    c.beginPath(); c.moveTo(BW - 52, 32); c.lineTo(BW - 36, 32); c.lineTo(BW - 44, 42); c.fill();
    // toolbar
    c.fillStyle = '#26304f';
    c.fillRect(0, stripH, BW, toolH);
    c.strokeStyle = css('mist', 0.8); c.lineWidth = 3; c.lineCap = 'round';
    const ty = stripH + toolH / 2;
    c.beginPath(); c.moveTo(42, ty); c.lineTo(28, ty); c.moveTo(34, ty - 7); c.lineTo(28, ty); c.lineTo(34, ty + 7); c.stroke();
    c.beginPath(); c.moveTo(72, ty); c.lineTo(86, ty); c.moveTo(80, ty - 7); c.lineTo(86, ty); c.lineTo(80, ty + 7); c.stroke();
    c.beginPath(); c.arc(122, ty, 9, -0.3, Math.PI * 1.5); c.stroke();
    c.fillStyle = '#0d1224';
    rrect(c, 160, stripH + 11, BW - 260, toolH - 22, (toolH - 22) / 2); c.fill();
    c.font = font('mono4', 22); c.fillStyle = css('mist'); c.textBaseline = 'middle';
    c.fillText('localhost:5173/search?q=', 196, ty);
    c.font = font('sans4', 22); c.fillStyle = css('bone');
    const qx = 196 + measure('mono4', 'localhost:5173/search?q=', 22);
    c.fillText('保存 画面 真っ白 なぜ 2時', qx, ty);
    const cxp = qx + measure('sans4', '保存 画面 真っ白 なぜ 2時', 22) + 6;
    if (this.beatPhase < 0.55) { c.fillStyle = css('cyan'); c.shadowColor = css('cyan'); c.shadowBlur = 14; c.fillRect(cxp, ty - 13, 12, 26); c.shadowBlur = 0; }
    // memory badge (amber → red as tabs explode)
    const memK = clamp(Math.log2(Math.max(1, n)) / 11);
    c.fillStyle = cssMix('amber', 'red', memK, 0.95);
    rrect(c, BW - 92, stripH + 15, 72, toolH - 30, 8); c.fill();
    c.font = font('mono8', 17); c.fillStyle = css('ink');
    c.textAlign = 'center';
    c.fillText(`${Math.round(40 + memK * 59)}%`, BW - 56, ty + 1);
    c.textAlign = 'left';
    // page: search results (dim — the lyric is set over it)
    const py = stripH + toolH;
    c.fillStyle = '#121830';
    c.fillRect(0, py, BW, BH - py);
    c.globalAlpha = 0.6;
    c.font = font('sans7', 30); c.fillStyle = css('mist');
    c.fillText('「保存 画面 真っ白 なぜ 2時」の検索結果', 120, py + 70);
    c.font = font('sans4', 20); c.fillStyle = css('steel');
    c.fillText(`約 ${(Math.floor(n) * 1043 + 12).toLocaleString('en-US')} 件  (0.42 秒)`, 120, py + 112);
    for (let i = 0; i < 6; i++) {
      const yy = py + 170 + i * 128;
      c.font = font('sans7', 27); c.fillStyle = css('blue');
      c.fillText(TITLES[(i * 5 + 1) % TITLES.length]!, 120, yy);
      c.fillStyle = css('steel', 0.55);
      const wv = 760 + 380 * hash(i, 2);
      rrect(c, 120, yy + 26, wv, 13, 6); c.fill();
      rrect(c, 120, yy + 50, wv * (0.55 + 0.4 * hash(i, 3)), 13, 6); c.fill();
    }
    c.globalAlpha = 1;
    // spinner on the active tab while loading
    void frame;
    c.restore();
    c.strokeStyle = css('steel', 0.5); c.lineWidth = 2;
    rrect(c, 1, 1, BW - 2, BH - 2, r); c.stroke();
  }

  // ---------------------------------------------------------------- render
  render(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const dash = t >= this.tMem - 0.04;
    this.bg.u.t!.value = t;
    this.bg.u.mode!.value = dash ? 1 : 0;
    const alarm = t >= this.tMou ? 0.5 + 0.5 * Math.cos(((t - this.tMou) / (this.ctx.audio.period / 2)) * Math.PI * 2) : 0;
    this.bg.u.alarm!.value = t >= this.tGen ? 0.6 + 0.4 * alarm : alarm * 0.6;
    this.bg.u.kick!.value = f.a.kick;
    this.bg.render(renderer, out);

    this.beatPhase = f.beatPhase;
    if (!dash) {
      const n = this.tabs(t);
      this.drawBrowser(t, n, f.frame);
      this.browser.upload();
      this.layoutWindows(t, f);
      this.camera(f);
      this.draw(this.scene, this.cam, out);
    }

    const ctx = this.hud.clear();
    if (!dash) this.drawL20(ctx, f);
    else this.drawDash(ctx, f);
    comp.draw(renderer, this.hud.upload(), out);
    return this.post(f);
  }

  /** recursive split level (fractional: integer part = level, fraction = split progress) */
  level(t: number) {
    if (t < this.tKazu) return 0;
    const step = this.ctx.audio.period / 4;
    const k = Math.floor((t - this.tKazu) / step + 1e-6);
    const e = t - (this.tKazu + k * step);
    return Math.min(GRID_MAX, k + 1) - (k + 1 > GRID_MAX ? 0 : 1 - ease.outExpo(clamp(e / 0.1)));
  }

  layoutWindows(t: number, f: Frame) {
    const eO = t - this.tOpen;
    // the hero: on 開 it pops open from the + button (outBack); an older window sits behind
    const kO = eO < 0 ? 1 : ease.outBackStrong(clamp(eO / 0.3));
    const s0 = eO < 0 ? 1 : lerp(0.08, 1, kO);
    const pk = eO < 0 ? 1 : ease.outExpo(clamp(eO / 0.26));
    this.hero.scale.set(s0, s0, 1);
    this.hero.position.set(lerp(6.8, 0, pk), lerp(4.6, 0, pk), 0);
    this.hero.material.color.setScalar(1.25 + 1.2 * Math.exp(-Math.max(0, eO) / 0.08) * (eO >= 0 ? 1 : 0));
    this.back.visible = eO >= 0 && t < this.tKazu;
    this.back.material.color.setScalar(0.45);
    const grid = t >= this.tKazu;
    this.hero.visible = !grid;
    this.grid.visible = grid;
    if (!grid) return;
    // recursive split: every window doubles on each 16th (cols, rows alternate)
    const lv = this.level(t);
    const L = Math.ceil(lv - 1e-6), k = 1 - (L - lv);
    const dims = (l: number) => [2 ** Math.ceil(l / 2), 2 ** Math.floor(l / 2)] as const;
    const [c1, r1] = dims(L), [c0, r0] = dims(Math.max(0, L - 1));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
    const colr = new THREE.Color();
    const half = (GRID_REGIONS - 1) / 2;
    let n = 0;
    const gap = 0.9;
    for (let ry = 0; ry < GRID_REGIONS; ry++) for (let rx = 0; rx < GRID_REGIONS; rx++) {
      const ox = (rx - half) * WIN_W * 1.04, oy = (ry - half) * WIN_H * 1.04;
      const isHero = rx === half && ry === half;
      for (let i = 0; i < c1 * r1; i++) {
        const cx = i % c1, cy = Math.floor(i / c1);
        const pcx = c1 > c0 ? Math.floor(cx / 2) : cx, pcy = r1 > r0 ? Math.floor(cy / 2) : cy;
        const w1 = WIN_W / c1, h1 = WIN_H / r1, w0 = WIN_W / c0, h0 = WIN_H / r0;
        const x1 = -WIN_W / 2 + w1 * (cx + 0.5), y1 = WIN_H / 2 - h1 * (cy + 0.5);
        const x0 = -WIN_W / 2 + w0 * (pcx + 0.5), y0 = WIN_H / 2 - h0 * (pcy + 0.5);
        const kk = L === 0 ? 1 : k;
        const w = lerp(w0, w1, kk), h = lerp(h0, h1, kk);
        const g = L === 0 ? 1 : gap + (1 - gap) * Math.exp(-L * 0.4);
        ps.set(ox + lerp(x0, x1, kk), oy + lerp(y0, y1, kk), 0);
        sc.set((w / WIN_W) * g, (h / WIN_H) * g, 1);
        m.compose(ps, q, sc);
        this.grid.setMatrixAt(n, m);
        const flick = 0.7 + 0.3 * hash(n, L, 3) + (isHero ? 0.25 : 0);
        const bright = (isHero ? 1.25 : 0.95) * flick * (1 + 0.8 * f.a.kick * (hash(n, 9) < 0.18 ? 1 : 0));
        const err = hash(n, 21) < 0.06 + 0.05 * L;
        if (err && L >= 2) colr.setRGB(bright * 1.6, bright * 0.22, bright * 0.3);
        else colr.setScalar(bright);
        this.grid.setColorAt(n, colr);
        n++;
      }
    }
    this.grid.count = n;
    this.grid.instanceMatrix.needsUpdate = true;
    if (this.grid.instanceColor) this.grid.instanceColor.needsUpdate = true;
    // the wall tilts away as it multiplies
    const e = t - this.tKazu;
    const tk = ease.outCubic(clamp(e / 1.1));
    this.gridGroup.rotation.set(-0.12 * tk, 0.32 * tk, 0.05 * tk);
  }

  camera(f: Frame) {
    const t = f.t;
    const pos = new THREE.Vector3(), tgt = new THREE.Vector3();
    let roll = 0, fov = 35;
    if (t < this.tTab) {
      // 開いた: close 3/4 on the window, slow push; the new window lands in our face
      const k = clamp((t - this.ctx.start) / (this.tTab - this.ctx.start));
      pos.set(lerp(-5.4, -4.4, k), lerp(-0.2, 0.2, k), lerp(15.6, 13.8, ease.outCubic(k)));
      tgt.set(0.6, 1.0, 0);
      roll = 0.035;
    } else if (t < this.tKazu) {
      // タブは: macro on the tab strip, tracking right as the tabs double
      const w = ease.outExpo(clamp((t - this.tTab) / 0.2));
      const k = clamp((t - this.tTab) / (this.tKazu - this.tTab));
      pos.set(lerp(-4.4, -4.6 + 3.2 * k, w), lerp(-0.8, 2.2, w), lerp(13.6, 5.8 - 0.5 * k, w));
      tgt.set(lerp(0.6, -2.8 + 3.2 * k, w), lerp(-0.1, 3.3, w), 0);
      roll = lerp(0.035, -0.07, w);
    } else {
      // 数え切れない: whip back to the whole window, then keep pulling out over the wall
      const e = t - this.tKazu;
      const w = ease.outExpo(clamp(e / 0.22));
      const k = ease.inOutCubic(clamp(e / 1.15));
      pos.set(lerp(-1.4, 2.0, w) + 6 * k, lerp(2.0, 0.2, w) - 2.0 * k, lerp(5.6, 21, w) + 30 * k);
      tgt.set(lerp(-1.4, 0, w) + 1.5 * k, lerp(3.3, 0, w) + 0.5 * k, 0);
      roll = lerp(-0.07, 0.02, w) + 0.06 * k;
      fov = lerp(35, 42, k);
      pos.z -= 1.2 * lastPulse(t, charsOf(this.L20, '数え切れない').map(on), 0.08);
    }
    pos.x += noise1(t * 1.3, 2) * 0.1;
    pos.y += noise1(t * 1.1, 3) * 0.1;
    this.cam.position.copy(pos);
    this.cam.up.set(Math.sin(roll), Math.cos(roll), 0);
    this.cam.lookAt(tgt);
    this.cam.fov = fov;
    this.cam.updateProjectionMatrix();
  }

  /** screen px (canvas, y down) of a point on the hero window (window-local units) */
  project(x: number, y: number): [number, number, number] {
    const v = new THREE.Vector3(x, y, 0).applyMatrix4(this.hero.matrixWorld).project(this.cam);
    const v2 = new THREE.Vector3(x + 1, y, 0).applyMatrix4(this.hero.matrixWorld).project(this.cam);
    const sx = (v.x * 0.5 + 0.5) * W, sy = (0.5 - v.y * 0.5) * H;
    const unit = Math.hypot((v2.x - v.x) * 0.5 * W, (v2.y - v.y) * 0.5 * H);
    return [sx, sy, unit];
  }

  /** karaoke style for a lyric glyph: unsung dim, sung bright + entrance */
  kar(g: Glyph, line: Line, t: number, kind: 'slam' | 'pop' | 'drop' | 'stamp' | 'whip', bright: string, glow?: string, antic = 0.35) {
    const s = gstate(g, line, t, 'word', antic);
    if (!s.vis) return null;
    if (!s.on) return { style: { fill: css('steel', 0.4) } };
    const k = enter(kind, s.since, g.gi);
    return { style: { fill: css(bright), glow: glow ?? null, glowBlur: 30 * k.bright }, kin: k };
  }

  drawL20(ctx: CanvasRenderingContext2D, f: Frame) {
    const t = f.t;
    this.hero.updateMatrixWorld();
    const L = this.L20;
    // 開いた on the hero window's page area
    if (t < this.tTab - 0.02) {
      const [x, y] = this.project(-0.4, -1.2);
      const { lay } = this.lay.hiraita!;
      this.plate(ctx, x, y, lay.width + 120, lay.height + 70, clamp((t - this.tOpen + 0.3) / 0.15));
      drawGlyphs2D(ctx, lay, x, y, (g) => this.kar(g, L, t, 'slam', 'bone', css('cyan', 0.7)));
    }
    // タブは under the tab strip (macro)
    if (t >= this.tTab - 0.05 && t < this.tKazu - 0.02) {
      const { lay } = this.lay.tabwa!;
      const k = ease.outExpo(clamp((t - this.tTab + 0.05) / 0.2));
      const x = W / 2 + 40 + (1 - k) * 260, y = H / 2 + 110;
      this.plate(ctx, x, y, lay.width + 110, lay.height + 60, k);
      drawGlyphs2D(ctx, lay, x, y, (g) => this.kar(g, L, t, 'drop', 'bone', css('cyan', 0.7), 0.05));
    }
    // 数え切れない: huge, centre; each mora slams, the counter races underneath
    if (t >= this.tKazu - 0.02) {
      const { lay } = this.lay.kazoe!;
      const x = W / 2, y = H / 2 - 30;
      const sh = shake(t, charsOf(L, '数え切れない').map(on), 10, 0.06, 5);
      this.plate(ctx, x, y, lay.width + 140, lay.height + 80, ease.outExpo(clamp((t - this.tKazu + 0.05) / 0.15)), 0.82);
      drawGlyphs2D(ctx, lay, x + sh[0], y + sh[1], (g) => this.kar(g, L, t, 'slam', 'bone', css('red', 0.6), 0.05));
      // counter
      const n = this.tabTarget(t);
      const nan = t >= this.tLastI;
      const s = nan ? 'NaN' : String(n);
      const cy = y + lay.height / 2 + 120;
      this.plate(ctx, x, cy, 980, 120, ease.outExpo(clamp((t - this.tKazu) / 0.2)), 0.8);
      text2D(ctx, 'tabs.length =', x - 30, cy, 'mono8', 56, css('mist'), { align: 'right', baseline: 'middle' });
      text2D(ctx, s, x, cy, 'mono8', 96, nan ? css('red') : css('amber'), { align: 'left', baseline: 'middle', glow: nan ? css('red', 0.8) : css('amber', 0.6), glowBlur: 24 });
    }
    this.clock(ctx, t);
  }

  plate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, k: number, a = 0.72) {
    if (k <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, a * k * 1.25);
    // sprite: 500x180 core inside a 640x320 canvas -> scale so the core matches w x h
    const ww = w * k, sx = ww / 500, sy = h / 180;
    ctx.drawImage(this.plateImg, x - 320 * sx, y - 160 * sy, 640 * sx, 320 * sy);
    ctx.restore();
  }

  clock(ctx: CanvasRenderingContext2D, t: number) {
    text2D(ctx, storyClock(t), W - 110, H - 72, 'dot', 34, css('steel'), { align: 'right' });
  }

  // ---------------------------------------------------------------- dashboard (L21)
  drawDash(ctx: CanvasRenderingContext2D, f: Frame) {
    const t = f.t;
    const L = this.L21;
    const A = this.ctx.audio;
    // 2D camera: close on MEMORY → whip to 根気 → pull back to both
    const LX = -450, RX = 450, DY = -95, R = 300;
    let cx: number, cy: number, z: number;
    const wW = ease.outExpo(clamp((t - this.tWata) / 0.22));
    const wB = ease.outExpo(clamp((t - this.tMou) / 0.3));
    const push = (t - this.tMem) * 0.04;
    cx = lerp(LX, RX, wW); cy = DY + 150; z = 1.22 + push;
    cx = lerp(cx, 0, wB); cy = lerp(cy, 30, wB); z = lerp(z, 0.98, wB);
    z *= 1 + 0.025 * f.a.kick;
    const sh = shake(t, [this.tGen, this.tKai], 30, 0.12, 9);
    ctx.save();
    ctx.translate(W / 2 + sh[0], H / 2 + sh[1]);
    ctx.scale(z, z);
    ctx.translate(-cx, -cy);
    // dial values
    const mem = this.memV(t), pat = this.patV(t);
    const red = t >= this.tMou;
    const dim = t >= this.tGen ? 0.45 : 1;
    ctx.globalAlpha = dim;
    this.dial(ctx, LX, DY, R, mem, 'mem', t, red);
    this.dial(ctx, RX, DY, R, pat, 'pat', t, red);
    ctx.globalAlpha = 1;
    // labels (lyric)
    const lab = (key: string, x: number, y: number, kind: 'slam' | 'pop' | 'drop', bright = 'bone') => {
      const { lay, line } = this.lay[key]!;
      drawGlyphs2D(ctx, lay, x, y, (g) => this.kar(g, line, t, kind, bright, css(bright === 'bone' ? 'cyan' : bright, 0.6), 0.3));
    };
    const ly = DY + R + 105;
    const memW = this.lay.memo!.lay.width, mo1W = this.lay.mo1!.lay.width;
    lab('memo', LX - mo1W / 2 - 8, ly, 'slam');
    lab('mo1', LX + memW / 2 + 12, ly + 18, 'pop');
    const wW2 = this.lay.wata!.lay.width, kW = this.lay.konki!.lay.width, m2W = this.lay.mo2!.lay.width;
    const x0 = RX - (wW2 + kW + m2W + 24) / 2;
    lab('wata', x0 + wW2 / 2, ly + 18, 'pop');
    lab('konki', x0 + wW2 + 12 + kW / 2, ly, 'slam');
    lab('mo2', x0 + wW2 + kW + 24 + m2W / 2, ly + 18, 'pop');
    ctx.restore();

    // alarm bands (screen space)
    if (t >= this.tMou) this.alarmBands(ctx, t, t >= this.tGen);
    // cracks
    for (let i = 0; i < this.cracks.length; i++) {
      const e = t - (i === 0 ? this.tGen : this.tKai);
      if (e >= 0) this.drawCrack(ctx, this.cracks[i]!, this.crackAt[i]!, e, i);
    }
    // もう限界: centre, over everything
    if (t >= this.tMou - 0.05) {
      const mou = this.lay.mou!, gen = this.lay.genkai!;
      const gx = W / 2 + 70, gy = H / 2 + 40;
      const mx = gx - gen.lay.width / 2 + mou.lay.width / 2 - 40, my = gy - gen.lay.height / 2 - mou.lay.height / 2 + 6;
      const k = ease.outExpo(clamp((t - this.tMou) / 0.2));
      this.plate(ctx, mx, my, mou.lay.width + 120, mou.lay.height + 50, k, 0.85);
      drawGlyphs2D(ctx, mou.lay, mx + sh[0] * 0.5, my + sh[1] * 0.5, (g) => this.kar(g, L, t, 'drop', 'amber', css('amber', 0.7), 0.05));
      if (t >= this.tGen - 0.05) {
        this.drawGenkai(ctx, gen.lay, gx + sh[0], gy + sh[1], t);
      }
    }
    this.clock(ctx, t);
    void A;
  }

  memV(t: number) {
    // climbs in jolts on each mora of メモリも, then pins
    const cs = charsOf(this.L21, 'メモリも').map(on);
    let v = 0.62;
    cs.forEach((c, i) => { v += 0.085 * ease.outExpo(clamp((t - c) / 0.12)) * (i === 3 ? 0.6 : 1); });
    v += 0.02 * ease.outExpo(clamp((t - this.tMou) / 0.1));
    return Math.min(1.02, v) + (t > this.tMou ? 0.012 * Math.sin(t * 70) : 0.006 * Math.sin(t * 45));
  }

  patV(t: number) {
    // patience drains: drops on 私 / 根 / 気 / も, bottoms out at 0.02
    const ev = [this.tWata, ...charsOf(this.L21, '根気も').map(on)];
    let v = 0.42;
    const d = [0.1, 0.13, 0.1, 0.07];
    ev.forEach((c, i) => { v -= d[i]! * ease.outExpo(clamp((t - c) / 0.14)); });
    return Math.max(0.0, v) + (t > this.tKon ? 0.008 * Math.sin(t * 55) : 0);
  }

  dial(ctx: CanvasRenderingContext2D, x: number, y: number, R: number, v: number, kind: 'mem' | 'pat', t: number, alarm: boolean) {
    const a0 = (5 / 6) * Math.PI, sweep = (4 / 3) * Math.PI;
    const ang = (u: number) => a0 + clamp(u, -0.02, 1.04) * sweep;
    const blink = alarm ? 0.5 + 0.5 * Math.cos((t - this.tMou) * Math.PI * 2 / (this.ctx.audio.period / 2)) : 0;
    ctx.save();
    // face
    const grd = ctx.createRadialGradient(x, y, R * 0.1, x, y, R * 1.05);
    grd.addColorStop(0, '#10152a'); grd.addColorStop(1, '#070912');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(x, y, R * 1.06, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = alarm ? cssMix('steel', 'red', blink, 0.9) : css('steel', 0.6);
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(x, y, R * 1.06, 0, Math.PI * 2); ctx.stroke();
    // zones
    const zones: [number, number, string][] = kind === 'mem'
      ? [[0, 0.7, css('blue', 0.85)], [0.7, 0.88, css('amber')], [0.88, 1, css('red')]]
      : [[0, 0.15, css('red')], [0.15, 0.32, css('amber')], [0.32, 1, css('blue', 0.85)]];
    ctx.lineWidth = R * 0.07;
    for (const [u0, u1, c] of zones) { ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(x, y, R * 0.9, ang(u0), ang(u1)); ctx.stroke(); }
    // ticks + numbers
    const nT = kind === 'mem' ? 16 : 10;
    for (let i = 0; i <= nT * 2; i++) {
      const u = i / (nT * 2), a = ang(u), major = i % 2 === 0;
      const r0 = R * (major ? 0.74 : 0.79), r1 = R * 0.84;
      ctx.strokeStyle = css('bone', major ? 0.85 : 0.4); ctx.lineWidth = major ? 4 : 2;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); ctx.stroke();
      if (major && (kind === 'mem' ? i % 4 === 0 : i % 4 === 0)) {
        const lbl = kind === 'mem' ? String(i / 2) : i === 0 ? 'E' : i === nT * 2 ? 'F' : '';
        if (lbl) text2D(ctx, lbl, x + Math.cos(a) * R * 0.62, y + Math.sin(a) * R * 0.62, 'mono8', R * 0.085, css('mist'), { align: 'center', baseline: 'middle' });
      }
    }
    if (kind === 'pat') {
      text2D(ctx, 'E', x + Math.cos(ang(0)) * R * 0.62, y + Math.sin(ang(0)) * R * 0.62, 'mono8', R * 0.11, css('red'), { align: 'center', baseline: 'middle' });
      text2D(ctx, 'F', x + Math.cos(ang(1)) * R * 0.62, y + Math.sin(ang(1)) * R * 0.62, 'mono8', R * 0.11, css('mist'), { align: 'center', baseline: 'middle' });
    }
    // unit / title
    text2D(ctx, kind === 'mem' ? 'MEMORY  GB' : 'PATIENCE', x, y - R * 0.3, 'mono8', R * 0.075, css('steel'), { align: 'center', baseline: 'middle', tracking: 0.15 });
    // readout
    const val = kind === 'mem' ? `${(clamp(v, 0, 1) * 16).toFixed(1)}` : `${clamp(v, 0, 1).toFixed(2)}`;
    const hot = kind === 'mem' ? v > 0.88 : v < 0.15;
    text2D(ctx, val, x, y + R * 0.36, 'mono8', R * 0.26, hot ? css('red') : css('bone'), { align: 'center', baseline: 'middle', glow: hot ? css('red', 0.8) : undefined, glowBlur: 30 });
    text2D(ctx, kind === 'mem' ? '/ 16.0 GB' : 'patience: 0.02 → ?', x, y + R * 0.58, 'mono4', R * 0.07, css('mist', 0.8), { align: 'center', baseline: 'middle' });
    // needle
    const a = ang(v);
    ctx.shadowColor = hot ? css('red') : css('cyan'); ctx.shadowBlur = 26;
    ctx.strokeStyle = hot ? css('red') : css('bone'); ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * R * 0.12, y - Math.sin(a) * R * 0.12); ctx.lineTo(x + Math.cos(a) * R * 0.86, y + Math.sin(a) * R * 0.86); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = css('ink3'); ctx.strokeStyle = css('steel'); ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(x, y, R * 0.07, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  alarmBands(ctx: CanvasRenderingContext2D, t: number, crit: boolean) {
    const k = ease.outExpo(clamp((t - this.tMou) / 0.15));
    const hb = 64 * k;
    const off = ((t - this.tMou) * 260) % 80;
    for (const top of [true, false]) {
      const y0 = top ? 0 : H - hb;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, y0, W, hb); ctx.clip();
      ctx.fillStyle = crit ? css('red', 0.92) : css('amber', 0.92);
      ctx.fillRect(0, y0, W, hb);
      ctx.fillStyle = css('ink', 0.9);
      for (let x = -160 + (top ? off : -off); x < W + 160; x += 80) {
        ctx.beginPath(); ctx.moveTo(x, y0 + hb); ctx.lineTo(x + 40, y0 + hb); ctx.lineTo(x + 40 + hb, y0); ctx.lineTo(x + hb, y0); ctx.fill();
      }
      ctx.restore();
      if (hb > 30) {
        const msg = crit ? 'FATAL  —  根気が不足しています  —  OUT OF MEMORY  —  根気が不足しています  —  OUT OF MEMORY' : 'WARNING  —  メモリ不足  —  WARNING  —  メモリ不足  —  WARNING  —  メモリ不足';
        ctx.save();
        ctx.font = font('dot', 30);
        const mw = ctx.measureText(msg).width;
        ctx.fillStyle = css('ink');
        ctx.fillRect(W / 2 - mw / 2 - 30, y0 + hb / 2 - 22, mw + 60, 44);
        ctx.fillStyle = crit ? css('red') : css('amber');
        ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
        ctx.fillText(msg, W / 2, y0 + hb / 2 + 1);
        ctx.restore();
      }
    }
  }

  drawCrack(ctx: CanvasRenderingContext2D, segs: CrackSeg[], at: { x: number; y: number }, e: number, idx: number) {
    const grow = 1600 * ease.outExpo(clamp(e / 0.12));
    const cx = W / 2 + at.x, cy = H / 2 - at.y;
    ctx.save();
    ctx.translate(cx - at.x, cy + at.y);
    // impact flash spot
    const fl = Math.exp(-e / 0.08);
    if (fl > 0.02) {
      const g = ctx.createRadialGradient(at.x, -at.y, 0, at.x, -at.y, 260);
      g.addColorStop(0, css('ice', 0.9 * fl)); g.addColorStop(1, css('ice', 0));
      ctx.fillStyle = g; ctx.fillRect(at.x - 260, -at.y - 260, 520, 520);
    }
    ctx.lineCap = 'round';
    // batched by width bucket: dark under-line, wide faint glow, bright core
    const buckets = [1.2, 2.2, 3.6];
    const passes: [string, number, number][] = [['rgba(0,0,0,0.7)', 1.6, 3], [css('ice', 0.18), 3.5, 6], [css('bone', 0.95), 1.3, 0]];
    for (const [style, mul, add] of passes) {
      ctx.strokeStyle = style;
      for (let b = 0; b < buckets.length; b++) {
        const lo = b === 0 ? 0 : buckets[b - 1]!, hi = buckets[b]!;
        ctx.lineWidth = ((lo + hi) / 2) * mul + add;
        ctx.beginPath();
        const ox = style.startsWith('rgba(0') ? 1.5 : 0;
        for (const sg of segs) {
          if (sg.d > grow || sg.w <= lo || (sg.w > hi && b < buckets.length - 1)) continue;
          const k = clamp((grow - sg.d) / Math.hypot(sg.x1 - sg.x0, sg.y1 - sg.y0));
          ctx.moveTo(sg.x0 + ox, -sg.y0 + ox);
          ctx.lineTo(lerp(sg.x0, sg.x1, k) + ox, -lerp(sg.y0, sg.y1, k) + ox);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
    void idx;
  }

  drawGenkai(ctx: CanvasRenderingContext2D, lay: Lay2D, x: number, y: number, t: number) {
    // 限界: slams in red; after the second crack the glyphs split along a fault line
    const L = this.L21;
    const eK = t - this.tKai;
    const split = eK >= 0 ? 10 * ease.outExpo(clamp(eK / 0.1)) : 0;
    this.plate(ctx, x, y, lay.width + 120, lay.height + 50, ease.outExpo(clamp((t - this.tGen) / 0.12)), 0.85);
    const halves: (1 | -1)[] = split > 0 ? [1, -1] : [1];
    for (const side of halves) {
      ctx.save();
      if (split > 0) {
        // fault line through the word, slightly diagonal
        ctx.beginPath();
        const yy = y + 10;
        if (side === 1) { ctx.moveTo(x - 900, yy - 140); ctx.lineTo(x + 900, yy + 80); ctx.lineTo(x + 900, y - 900); ctx.lineTo(x - 900, y - 900); }
        else { ctx.moveTo(x - 900, yy - 140); ctx.lineTo(x + 900, yy + 80); ctx.lineTo(x + 900, y + 900); ctx.lineTo(x - 900, y + 900); }
        ctx.closePath(); ctx.clip();
        ctx.translate(side * split * 0.6, -side * split);
      }
      drawGlyphs2D(ctx, lay, x, y, (g) => {
        const s = gstate(g, L, t, 'char', 0.05);
        if (!s.vis) return null;
        if (!s.on) return { style: { fill: css('steel', 0.4) } };
        const k = enter('stamp', s.since, g.gi, 1.2);
        return { style: { fill: css('red'), stroke: css('bone', 0.9), strokeWidth: 4, glow: css('red', 0.9), glowBlur: 40 * k.bright }, kin: k };
      });
      ctx.restore();
    }
  }

  post(f: Frame): PostParams {
    const t = f.t;
    const A = this.ctx.audio;
    const slams = charsOf(this.L20, '数え切れない').map(on);
    const sh = shake(t, [this.tOpen], 14, 0.08, 1);
    const pp: PostParams = {
      bloom: 0.7, vignette: 0.4, ca: 1.4,
      shake: sh,
      zoomBlur: t >= this.tKazu ? 0.55 * Math.exp(-(t - this.tKazu) / 0.18) + 0.2 * lastPulse(t, slams, 0.06) : 0.3 * lastPulse(t, [this.tTab], 0.08),
      flash: 0.0,
    };
    if (t >= this.tMem - 0.04) {
      pp.ca = 1.6;
      pp.zoomBlur = 0.25 * lastPulse(t, [this.tWata], 0.07) + 0.3 * lastPulse(t, [this.tMou], 0.08);
      pp.rgbSplit = t >= this.tGen ? 3 + 8 * A.hit('kick', t, 0.06) : 0;
      pp.glitch = 0.35 * lastPulse(t, [this.tGen, this.tKai], 0.06);
      pp.invert = impactFrame(f.frame, [this.tGen], 1);
      pp.flash = impactFrame(f.frame, [this.tGen + 1 / 60, this.tKai], 2) * 0.35;
      pp.flashColor = [1, 0.1, 0.15];
    }
    // the cut into the dashboard: one white frame
    pp.flash = Math.max(pp.flash ?? 0, impactFrame(f.frame, [this.tMem - 0.04], 1) * 0.5);
    return pp;
  }
}
