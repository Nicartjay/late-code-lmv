// success (bar 48 drop → bar 52): ビルド成功。/ 画面に流れる、眩しいくらいの緑色。/ やっと終わった。/ Git push… / もうリファクタリングなんて知らない。
// The green bloom moment of the video. Green is owned by this scene.
import * as THREE from 'three';
import { Burst, SpeedLines } from '../engine/fx';
import { FSPass, H, Layer2D, W, makeRT, screenCamera } from '../engine/gl';
import { enter, gstate } from '../engine/kinetic';
import type { Line } from '../engine/lyrics';
import { storyClock } from '../engine/motifs';
import { col, css, lin } from '../engine/palette';
import type { PostParams } from '../engine/post';
import { Scene, type Frame } from '../engine/scene';
import { Glyphs3D, tint } from '../engine/text3d';
import { text2D } from '../engine/type2d';
import { clamp, ease, hash, lerp } from '../engine/util';
import { CheckRain } from './success-checks';
import { Block3D, CHECK_GLSL, LEADV, drawCheck, imp, pxCamera, scrambleText, shake } from './success-kit';
import { LogAtlas, LogFloor } from './success-logs';
import { ROOM, World } from './outro-world';
import { drawCrumple, drawGitGraph, makeMessyEditor } from './success-end';

const IMPACT_FRAG = /* glsl */ `
${CHECK_GLSL}
uniform float t; uniform float rays; uniform float glow; uniform float checkP; uniform float checkA; uniform float checkS;
uniform vec2 checkC; uniform float rings[4]; uniform float rot; uniform float halftone; uniform float impact; uniform float wedge;
void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float r = length(p);
  vec3 col = C_INK;
  // sunburst wedges (flat, graphic)
  float a = atan(p.y, p.x) + rot;
  float n = 16.0;
  float wf = fract((a / TAU + 0.5) * n);
  col += C_GREEN * 0.018 * wedge * step(0.5, wf) * smoothstep(0.05, 0.4, r);
  // centre glow (tight)
  col += C_GREEN * glow * (exp(-r * r * 16.0) * 0.32 + exp(-r * 3.5) * 0.05);
  // glowing rays (impacts only)
  float m = 28.0;
  float cell = floor((a / TAU + 0.5) * m);
  float fa = fract((a / TAU + 0.5) * m) - 0.5;
  float h1 = hash12(vec2(cell, 3.0));
  float ray = smoothstep(0.05 + 0.12 * h1, 0.0, abs(fa)) * step(0.4, h1) * smoothstep(0.06, 0.25, r) * exp(-r * 1.2);
  col += C_GREEN * ray * rays * 0.35;
  // shock rings
  for (int i = 0; i < 4; i++) {
    float e = rings[i];
    if (e >= 0.0 && e < 2.0) {
      float R = e * 1.35 + 0.03;
      float w = 0.003 + e * 0.012;
      float d = (r - R) / w;
      col += mix(C_GREEN, C_BONE, 0.3) * exp(-d * d) * exp(-e * 2.6) * 1.2;
    }
  }
  // halftone dots toward the corners (manga screen)
  vec2 g = fract(gl_FragCoord.xy / 12.0) - 0.5;
  float hr = clamp((r - 0.55) * 0.9, 0.0, 0.42) * halftone;
  col += C_GREEN * 0.035 * smoothstep(hr, hr - 0.1, length(g)) * step(0.01, hr);
  // the big check
  vec2 cp = (p - checkC) / checkS;
  float d = sdCheckPath(cp, checkP) * checkS;
  float w = 0.04 * checkS;
  float core = smoothstep(w + 0.0015, w - 0.0015, d);
  float dd = max(d - w, 0.0);
  col += C_GREEN * (core * 1.6 + exp(-dd * 40.0) * 0.5 + exp(-dd * 8.0) * 0.08) * checkA;
  if (impact > 0.5) {
    col = C_GREEN * 0.82;
    col = mix(col, C_INK, core);
    col = mix(col, C_INK * 0.5 + C_GREEN * 0.2, step(0.5, wf) * 0.25);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const GREEN_FIELD = /* glsl */ `
uniform float t; uniform float k; uniform float pulse;
void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float r = length(p);
  vec3 col = C_GREEN * (0.74 + 0.08 * pulse) * (1.0 - 0.22 * smoothstep(0.25, 1.0, r));
  // halftone toward the corners
  vec2 g = fract(gl_FragCoord.xy / 14.0) - 0.5;
  float hr = clamp((r - 0.55) * 0.8, 0.0, 0.45);
  col = mix(col, C_GREEN * 0.42, smoothstep(hr, hr - 0.08, length(g)) * step(0.01, hr));
  // moving diagonal bands
  float band = smoothstep(0.46, 0.5, abs(fract((gl_FragCoord.x + gl_FragCoord.y) / 260.0 - t * 1.1) - 0.5));
  col *= 1.0 - 0.06 * band;
  gl_FragColor = vec4(col * k, 1.0);
}`;

interface Row { line: Line; g: Glyphs3D; }

const GRID_FRAG = /* glsl */ `
uniform float t; uniform float scroll; uniform float amt; uniform vec2 hot;
void main() {
  vec2 px = gl_FragCoord.xy;
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  vec3 c = C_INK + C_GREEN * 0.012;
  vec2 g = abs(fract(vec2(px.x - 28.0, px.y + scroll) / 104.0) - 0.5);
  float line = smoothstep(0.492, 0.5, max(g.x, g.y));
  vec2 g2 = abs(fract(vec2(px.x - 28.0, px.y + scroll) / 26.0) - 0.5);
  float fine = smoothstep(0.47, 0.5, max(g2.x, g2.y));
  float hd = exp(-length((vUv - hot) * vec2(uRes.x / uRes.y, 1.0)) * 2.5);
  c += vec3(0.02, 0.03, 0.06) * line * 0.9 + vec3(0.01, 0.015, 0.03) * fine * 0.4;
  c += C_GREEN * (0.05 + 0.25 * amt) * hd * (0.4 + line);
  gl_FragColor = vec4(c, 1.0);
}`;

const greenRamp = (k: number, n: number, hi = 0.55, lo = 0.035) => col('green', lo + (hi - lo) * Math.pow(1 - (k - 1) / n, 1.6));

export default class Success extends Scene {
  // --- timing anchors (from the lyrics)
  L38!: Line; L39!: Line; L40!: Line; L41!: Line; L42!: Line;
  T0 = 0; s2 = 0; s3 = 0; s4 = 0; s5 = 0; s6 = 0; s7 = 0; bar49 = 0; bar50 = 0; bar51 = 0;

  // --- GPU
  bgImpact = new FSPass(IMPACT_FRAG, {
    t: { value: 0 }, rays: { value: 0 }, glow: { value: 0 }, checkP: { value: 0 }, checkA: { value: 0 }, checkS: { value: 1 },
    checkC: { value: new THREE.Vector2(0, 0.0) }, rings: { value: [-1, -1, -1, -1] }, rot: { value: 0 }, halftone: { value: 1 }, impact: { value: 0 }, wedge: { value: 1 },
  });
  bgGreen = new FSPass(GREEN_FIELD, { t: { value: 0 }, k: { value: 1 }, pulse: { value: 0 } });
  speed = new SpeedLines();
  logs!: LogFloor;
  rainAdd = new CheckRain(150, 11, { blend: 'add', size: [22, 90], speed: [240, 760] });
  rainInk = new CheckRain(70, 5, { blend: 'normal', size: [40, 150], speed: [200, 600] });

  scene3 = new THREE.Scene(); // perspective px scene (big type)
  cam = pxCamera(30);
  sceneS = new THREE.Scene(); // screen-space (particles, rain)
  camS = screenCamera();
  hud = new Layer2D();
  hud2 = new Layer2D();
  world = new World();
  screenRT = makeRT(W, H, { samples: 4 });

  bursts: { b: Burst; t: number; at: [number, number] }[] = [];

  // --- type
  build!: Block3D; // ビルド成功。
  gamen!: Glyphs3D; nagare!: Glyphs3D; mabushi!: Glyphs3D; midori!: Block3D;
  rest: Row[] = [];
  git!: Glyphs3D; push!: Glyphs3D; ref1!: Glyphs3D; ref2!: Glyphs3D;
  messy = makeMessyEditor();
  bgGrid = new FSPass(GRID_FRAG, { t: { value: 0 }, scroll: { value: 0 }, amt: { value: 0 }, hot: { value: new THREE.Vector2(0.62, 0.7) } });

  async init() {
    const { lyrics } = this.ctx;
    const A = this.ctx.audio;
    this.L38 = lyrics.get('ビルド成功。');
    this.L39 = lyrics.get('画面に流れる、眩しいくらいの緑色。');
    this.L40 = lyrics.get('やっと終わった。');
    this.L41 = lyrics.get('Git push…');
    this.L42 = lyrics.get('もうリファクタリングなんて知らない。');
    this.T0 = this.ctx.start;
    const w39 = this.L39.words;
    this.s2 = w39[0]!.start - LEADV;
    this.s3 = w39[2]!.start - LEADV;
    this.s4 = w39[3]!.start - LEADV;
    this.s5 = this.L40.start - LEADV;
    this.s6 = this.L41.start - LEADV;
    this.s7 = this.L42.start - LEADV;
    const b0 = Math.round(A.bar(this.T0));
    this.bar49 = A.barTime(b0 + 1);
    this.bar50 = A.barTime(b0 + 2);
    this.bar51 = A.barTime(b0 + 3);

    this.logs = new LogFloor(new LogAtlas(this.ctx.renderer));

    // ビルド成功。 — Dela slab with a long oblique green extrusion
    this.build = new Block3D(this.L38, { font: 'dela', size: 250, color: col('bone') }, 16, 1.5, (k) => greenRamp(k, 16, 0.32), [2.1, -2.1]);
    this.build.group.position.set(0, -60, 0);
    this.scene3.add(this.build.group);

    const ws = this.L39.words;
    this.gamen = new Glyphs3D(ws[0]!.chars, { font: 'sans9', size: 210, color: col('bone') });
    this.nagare = new Glyphs3D(ws[1]!.chars, { font: 'sans9', size: 210, color: col('bone') });
    this.mabushi = new Glyphs3D(ws[2]!.chars, { font: 'sans9', size: 200, color: col('ink'), outlineWidth: '2.5%', outlineBlur: '9%', outlineColor: col('green', 3), outlineOpacity: 1 });
    this.midori = new Block3D(ws[3]!.chars, { font: 'dela', size: 500, color: col('ink') }, 10, 1.5, (k) => col('green', 0.42 - k * 0.03), [2.4, -2.4]);
    for (const g of [this.gamen, this.nagare, this.mabushi]) this.scene3.add(g.group);
    this.scene3.add(this.midori.group);

    {
      const g = new Glyphs3D(this.L40, { font: 'mincho', size: 128, color: col('bone') });
      this.scene3.add(g.group);
      this.rest.push({ line: this.L40, g });
    }
    const w41 = this.L41.words, w42 = this.L42.words;
    this.git = new Glyphs3D(w41[0]!.chars, { font: 'mono8', size: 250, color: col('bone') });
    this.push = new Glyphs3D(w41[1]!.chars, { font: 'mono8', size: 250, color: col('bone') });
    this.ref1 = new Glyphs3D([...w42[0]!.chars, ...w42[1]!.chars], { font: 'sans9', size: 132, color: col('bone') });
    this.ref2 = new Glyphs3D([...w42[2]!.chars, ...w42[3]!.chars], { font: 'sans9', size: 132, color: col('bone') });
    for (const g of [this.git, this.push, this.ref1, this.ref2]) this.scene3.add(g.group);

    // particles
    const mk = (n: number, seed: number, sp: [number, number], tt: number, at: [number, number], size: [number, number] = [2.5, 8]) => {
      const b = new Burst(n, { seed, speed: sp, size, life: [0.5, 1.6], drag: 2.6, gravity: [0, -200, 0], color: col('green', 4), color2: col('bone', 3) });
      this.sceneS.add(b.points);
      this.bursts.push({ b, t: tt, at });
    };
    const ch = this.L38.chars;
    mk(600, 3, [500, 2800], this.T0, [0, 0], [2.5, 9]);
    mk(220, 5, [300, 1600], ch[3]!.start, [this.build.items[3]!.x, -60]);
    mk(320, 8, [400, 2000], ch[4]!.start, [this.build.items[4]!.x, -60]);
    this.sceneS.add(this.rainAdd.mesh, this.rainInk.mesh);
  }

  // ------------------------------------------------------------------ render
  render(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    const t = f.t;
    for (const ch of this.scene3.children) ch.visible = false;
    this.rainAdd.mesh.visible = false;
    this.rainInk.mesh.visible = false;
    for (const b of this.bursts) b.b.points.visible = false;
    if (t < this.s2) return this.shot1(f, out);
    if (t < this.s4) return this.shot23(f, out);
    if (t < this.s5) return this.shot4(f, out);
    if (t < this.s6) return this.shot5(f, out);
    if (t < this.s7) return this.shot6(f, out);
    return this.shot7(f, out);
  }

  /** draw the 3D type scene + screen scene + hud */
  private layers(out: THREE.WebGLRenderTarget, hud: boolean) {
    this.draw(this.scene3, this.cam, out);
    this.draw(this.sceneS, this.camS, out);
    if (hud) this.ctx.comp.draw(this.ctx.renderer, this.hud.upload(), out);
  }

  // ---------------------------------------------------------------- S1: BUILD SUCCESSFUL
  private shot1(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    const t = f.t, T0 = this.T0, e0 = t - T0;
    const { renderer } = this.ctx;
    const ch = this.L38.chars;
    const tv = t + LEADV;
    const impactFrame = e0 >= 0 && f.frame - Math.round(T0 * 60) < 3;
    const u = this.bgImpact.u;
    const typeOn = ease.outExpo(clamp((tv - ch[0]!.start) / 0.3));
    const hit = (i: number, d = 0.25) => imp(tv, ch[i]!.start, d);
    u.t!.value = t;
    u.rays!.value = 1.2 * imp(t, T0, 0.25) + 0.25 * f.a.kick + 0.7 * hit(3, 0.2) + 0.9 * hit(4, 0.25) + 0.08;
    u.glow!.value = 0.35 + 1.4 * imp(t, T0, 0.2) + 0.4 * hit(3, 0.2) + 0.55 * hit(4, 0.25) + 0.2 * f.a.kick;
    u.checkP!.value = ease.outExpo(clamp(e0 / 0.16));
    u.checkA!.value = lerp(1.0, 0.09, typeOn) * (1 + 0.5 * imp(t, T0, 0.12));
    u.checkS!.value = (1.25 - 0.25 * ease.outBack(clamp(e0 / 0.3))) * (1 + 0.25 * typeOn + 0.02 * e0);
    u.rot!.value = t * 0.08 + 0.25 * ease.outExpo(clamp(e0 / 0.8));
    const rings = u.rings!.value as number[];
    rings[0] = e0; rings[1] = tv - ch[0]!.start; rings[2] = tv - ch[3]!.start; rings[3] = tv - ch[4]!.start;
    for (let i = 1; i < 4; i++) if (rings[i]! < 0) rings[i] = -1;
    u.impact!.value = impactFrame ? 1 : 0;
    u.halftone!.value = 1;
    u.wedge!.value = impactFrame ? 1 : 0.6;
    this.bgImpact.render(renderer, out);

    // speed lines on the drop and the two kanji
    const sl = imp(t, T0, 0.2) + 0.5 * hit(3, 0.12) + 0.7 * hit(4, 0.15);
    if (sl > 0.02 && !impactFrame) this.speed.render(renderer, out, { frame: f.frame, intensity: sl * 0.45, color: lin('green', 1.4), inner: 0.34, density: 170 });

    // type: ビルド成功。 slams per mora
    const B = this.build;
    B.group.visible = !impactFrame;
    B.group.rotation.set(0.04 * Math.sin(t * 1.3), -0.05 + 0.03 * Math.sin(t * 0.7), -0.02);
    B.group.scale.setScalar(1 + 0.025 * Math.max(0, tv - ch[0]!.start));
    B.items.forEach((it, i) => {
      const s = gstate(it, this.L38, t, 'char', 0);
      const amt = i >= 3 ? 1.3 : 1;
      const k = enter('slam', s.since, it.gi, amt);
      const sc = s.on ? k.sc : 1;
      const depth = s.on ? ease.outExpo(clamp(s.since / 0.18)) : 0;
      B.set(i, it.x, -it.y, 0, it.rot + k.rot, sc, s.vis, depth);
      tint(it.mesh, col('bone', 1.0 + (k.bright - 1) * 0.8), k.alpha);
      const flash = Math.exp(-Math.max(0, s.since) / 0.09);
      B.tintLayers(i, (kk) => greenRamp(kk, 16, 0.32 + 2.0 * flash, 0.03), k.alpha);
    });

    // particles
    for (const { b, t: bt, at } of this.bursts) b.update(tv - bt, [at[0], at[1], 0]);
    this.bursts[0]!.b.update(e0, [0, 0, 0]);
    if (impactFrame) for (const b of this.bursts) b.b.points.visible = false;

    // HUD
    const c = this.hud.clear();
    if (!impactFrame) {
      c.globalAlpha = clamp(e0 / 0.06);
      const lab = scrambleText('BUILD SUCCESSFUL', t, T0 + 0.02, 0.3, 3, f.frame);
      text2D(c, lab, 120, 126, 'mono8', 34, css('green'), { tracking: 0.34 });
      text2D(c, 'night.ts  —  0 errors · 0 warnings', 120, 166, 'mono4', 22, css('mist', 0.75));
      text2D(c, storyClock(t), W - 120, 132, 'dot', 54, css('bone'), { align: 'right' });
      drawCheck(c, 138, H - 112, 30, css('green'), 5, ease.outExpo(clamp((e0 - 0.08) / 0.3)), 10);
      text2D(c, 'Compiled successfully.', 172, H - 102, 'mono4', 26, css('bone', 0.9));
      text2D(c, 'Done in 13260.42s.', W - 120, H - 102, 'mono4', 26, css('green', 0.95), { align: 'right' });
      const lw = ease.outExpo(clamp(e0 / 0.45)) * (W - 240);
      c.fillStyle = css('green', 0.35); c.fillRect(W / 2 - lw / 2, H - 150, lw, 2);
      c.globalAlpha = 1;
    }
    this.layers(out, true);

    const kSl = hit(0, 0.1) + hit(1, 0.1) * 0.7 + hit(2, 0.1) * 0.7 + hit(3, 0.13) * 1.3 + hit(4, 0.16) * 1.6;
    return {
      bloom: 0.8, bloomThreshold: 0.9, ca: 1.6 + 5 * imp(t, T0, 0.12),
      zoom: 1 + 0.06 * imp(t, T0 + 0.05, 0.22) + 0.018 * kSl, zoomBlur: impactFrame ? 0 : 0.35 * imp(t, T0 + 0.05, 0.08) + 0.2 * hit(4, 0.08),
      shake: shake(f.frame, 16 * imp(t, T0, 0.16) + 8 * kSl),
      vignette: 0.5,
    };
  }

  // ---------------------------------------------------------------- S2/S3: 画面に流れる、眩しいくらいの
  private shot23(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    const t = f.t, tv = t + LEADV;
    const { renderer } = this.ctx;
    const ws = this.L39.words;
    const s3 = t >= this.s3;
    const lg = this.logs.pass.u;
    const tanF = Math.tan((50 * Math.PI) / 360);
    const flood = clamp((t - this.bar49 + 0.02) / 0.75);
    const fe = ease.outCubic(flood);
    const rowW = LogFloor.rowFor(46, 1, tanF);
    const printed = (t - this.s2) / 0.105;
    const stepS = (Math.floor(printed) + ease.outExpo(clamp((printed % 1) / 0.5))) * rowW;
    let scroll = stepS + (t > this.bar49 ? (t - this.bar49) * 0.55 + (t - this.bar49) ** 2 * 0.35 : 0);
    let pitch = lerp(Math.PI / 2, 0.5, fe), camH = 1, roll = 0, bright = lerp(0.5, 1.0, fe), glow = 0.25 * fe, fogK = 0.06, dk = 0.7 * fe, glare = 0;
    let shadeAmt = 0.72 * (1 - 0.4 * fe);
    let fog = col('green', 0.04 * fe), glowC = col('green', 0.6);
    const p3 = s3 ? clamp((t - this.s3) / (this.s4 - this.s3)) : 0;
    if (s3) {
      const e3 = t - this.s3;
      const ce = ease.outCubic(clamp(e3 / 0.5));
      pitch = lerp(0.5, 0.16, ce);
      camH = lerp(1, 0.35, ce);
      roll = -0.05 * Math.sin(e3 * 1.7);
      scroll += e3 * 1.1;
      bright = 1.0 + 0.8 * p3;
      const wo = Math.pow(clamp((t - (this.s4 - 0.16)) / 0.16), 2);
      glow = 0.4 + 2.0 * p3 * p3 + 6 * wo;
      glare = 0.2 + 2.2 * p3 * p3 * p3 + 9 * wo;
      shadeAmt = 0;
      fog = col('green', 0.05 + 0.6 * p3 * p3);
      glowC = col('green', 1.0).lerp(col('bone', 1.0), 0.25 + 0.4 * p3);
      fogK = 0.3; dk = 0.25;
    }
    lg.pitch!.value = pitch; lg.camH!.value = camH; lg.scroll!.value = scroll; lg.roll!.value = roll; lg.tanF!.value = tanF;
    lg.rowW!.value = rowW; lg.colW!.value = rowW * (2048 / 48); lg.bright!.value = bright; lg.glow!.value = glow; lg.glare!.value = glare;
    (lg.fogCol!.value as THREE.Vector3).set(fog.r, fog.g, fog.b); lg.fogK!.value = fogK; lg.dk!.value = dk; lg.t!.value = t; lg.flashRows!.value = fe;
    (lg.glowCol!.value as THREE.Vector3).set(glowC.r, glowC.g, glowC.b);
    lg.xoff!.value = 0;
    (lg.shadeBox!.value as THREE.Vector4).set(0.05, 0.38, 0.64, 0.84);
    lg.shade!.value = shadeAmt;
    this.logs.pass.render(renderer, out);

    const c = this.hud.clear();
    if (!s3) {
      // 画面に (typed, with the cursor) / 流れる、(rides the stream up into place)
      const G1 = this.gamen, G2 = this.nagare;
      G1.group.visible = true; G2.group.visible = true;
      const x1 = -W / 2 + 130 + G1.width / 2, y1 = 240 + 30 * fe;
      G1.group.position.set(x1, y1, 0);
      let lastX = -G1.width / 2;
      G1.items.forEach((it) => {
        const s = gstate(it, this.L39, t, 'char', 0);
        it.mesh.visible = s.vis;
        const k = enter('type', s.since, it.gi);
        tint(it.mesh, col('bone', k.bright), 1);
        if (s.vis) lastX = it.x + it.adv / 2;
      });
      const x2 = -W / 2 + 330 + G2.width / 2, y2 = 10 + 30 * fe;
      G2.group.position.set(x2, y2, 0);
      let lastX2 = -G2.width / 2;
      G2.items.forEach((it) => {
        const s = gstate(it, this.L39, t, 'char', 0.1);
        it.mesh.visible = s.vis;
        const p = clamp(s.e / 0.36);
        const dy = -380 * (1 - ease.outExpo(p));
        it.mesh.position.set(it.x, -it.y + dy, 0);
        it.mesh.scale.set(1, 1 + 0.6 * (1 - ease.outExpo(p)), 1);
        tint(it.mesh, s.on ? col('bone', 1 + 1.8 * Math.exp(-s.since / 0.12)) : col('green', 0.8), s.on ? 1 : 0.6 * clamp(s.e / 0.08));
        if (s.on) lastX2 = it.x + it.adv / 2;
      });
      // the cursor types 画面に, then jumps to 流れる
      const typing2 = tv >= ws[1]!.start;
      if (f.beatPhase < 0.55 || (!typing2 && tv >= ws[0]!.start - 0.2)) {
        const cx = typing2 ? W / 2 + x2 + lastX2 + 16 : W / 2 + x1 + lastX + 16;
        const cy = H / 2 - (typing2 ? y2 : y1);
        c.fillStyle = css('cyan'); c.shadowColor = css('cyan'); c.shadowBlur = 26;
        c.fillRect(cx, cy - 100, 60, 200);
        c.shadowBlur = 0;
      }
      text2D(c, '~/night $ npm run build', 130, 118, 'mono4', 26, css('mist', 0.85));
      text2D(c, storyClock(t), W - 120, 128, 'dot', 44, css('bone', 0.9), { align: 'right' });
    } else {
      // 眩しいくらいの — backlit silhouettes against the dazzling light
      const G = this.mabushi;
      G.group.visible = true;
      const e3 = t - this.s3;
      G.group.position.set(0, -170 + 30 * ease.outCubic(clamp(e3 / 1.2)), 0);
      G.group.scale.setScalar(1 + 0.04 * e3);
      G.items.forEach((it) => {
        const s = gstate(it, this.L39, t, 'char', 0.3);
        it.mesh.visible = s.vis;
        const k = s.on ? enter('pop', s.since, it.gi) : enter('none', 0);
        it.mesh.scale.setScalar(s.on ? k.sc : 0.94);
        const rim = s.on ? 1 + 2.5 * Math.exp(-s.since / 0.14) : 0.25;
        tint(it.mesh, s.on ? col('ink') : col('green', 0.12), s.on ? 1 : 0.45);
        (it.mesh.outlineColor as THREE.Color).copy(col('green', 2.2 * rim + 1.5 * p3));
        it.mesh.outlineOpacity = s.on ? 1 : 0.35;
      });
      this.rainAdd.mesh.visible = true;
      this.rainAdd.set(t, { c1: col('green', 1.6 + 2 * p3), c2: col('bone', 2.0), alpha: 0.22 + 0.2 * p3, sizeK: 0.55 });
      text2D(c, storyClock(t), W - 120, 128, 'dot', 44, css('bone', 0.9), { align: 'right' });
    }
    this.layers(out, true);
    const k49 = imp(t, this.bar49, 0.2);
    return {
      bloom: 0.8 + 0.4 * p3, bloomThreshold: 0.9, exposure: 1 + 0.25 * p3 * p3,
      scanlines: s3 ? 0 : 0.1 * (1 - fe), ca: 1.5 + 3 * k49,
      zoom: 1 + 0.04 * k49, zoomBlur: 0.3 * imp(t, this.bar49, 0.12) + (s3 ? 0.25 * imp(t, this.s3, 0.12) : 0), shake: shake(f.frame, 10 * k49 + 4 * f.a.kick),
      vignette: 0.45 - 0.2 * p3,
    };
  }

  // ---------------------------------------------------------------- S4: 緑色。
  private shot4(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    this.greenPicture(f, out);
    const t = f.t, tv = t + LEADV;
    const w = this.L39.words[3]!;
    const kk = imp(tv, w.chars[0]!.start, 0.1) + imp(tv, w.chars[1]!.start, 0.1);
    return {
      bloom: 0.5, bloomThreshold: 0.95, ca: 1.2 + 3 * imp(t, this.s4, 0.08), vignette: 0.3, grain: 0.05,
      zoom: 1 + 0.05 * imp(t, this.s4, 0.12) + 0.03 * kk, shake: shake(f.frame, 12 * kk + 6 * imp(t, this.bar50, 0.12)),
    };
  }

  /** the full-frame green picture with 緑色。 (also used as the monitor's screen in S5) */
  private greenPicture(f: Frame, out: THREE.WebGLRenderTarget) {
    const t = f.t;
    const { renderer } = this.ctx;
    this.bgGreen.u.t!.value = t;
    this.bgGreen.u.k!.value = 1;
    this.bgGreen.u.pulse!.value = imp(t, this.bar50, 0.2);
    this.bgGreen.render(renderer, out);
    this.rainInk.mesh.visible = true;
    this.rainInk.set(t, { c1: col('ink', 1), c2: col('ink', 1), alpha: 0.16, sizeK: 1 });
    const M = this.midori;
    M.group.visible = true;
    M.group.rotation.set(0.05, 0.08 - 0.04 * (t - this.s4), 0);
    M.group.position.set(0, -20, 0);
    M.group.scale.setScalar(1 + 0.035 * (t - this.s4));
    M.items.forEach((it, i) => {
      const s = gstate(it, this.L39, t, 'line', 1);
      const k = enter('stamp', s.since, it.gi, 1.2);
      const on = s.on;
      M.set(i, it.x, -it.y, 0, it.rot, on ? k.sc : 1, true, on ? 1 : 0);
      tint(it.mesh, col('ink'), on ? k.alpha : 0.1);
      M.tintLayers(i, (kk) => col('green', 0.42 - kk * 0.03), on ? k.alpha : 0);
    });
    const c = this.hud.clear();
    text2D(c, '#3DFF8F', 120, H - 112, 'mono8', 34, css('ink', 0.85), { tracking: 0.12 });
    text2D(c, 'rgb(61, 255, 143)', 120, H - 74, 'mono4', 24, css('ink', 0.7));
    text2D(c, storyClock(t), W - 120, 128, 'dot', 44, css('ink', 0.85), { align: 'right' });
    this.layers(out, true);
    M.group.visible = false;
    this.rainInk.mesh.visible = false;
  }

  // ---------------------------------------------------------------- S5: やっと終わった。 (exhale: pull back from the screen into the night room)
  private shot5(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    const t = f.t;
    const { renderer, comp } = this.ctx;
    this.greenPicture(f, this.screenRT);
    const Wd = this.world;
    Wd.screenMat.map = this.screenRT.texture;
    const p = clamp((t - this.s5) / (this.s6 - this.s5 + 0.5));
    const e = ease.inOutSine(p);
    const fov = 40;
    const d0 = ROOM.scr.hh / Math.tan((fov * Math.PI) / 360);
    const sc = ROOM.scr.c;
    const P0 = new THREE.Vector3(sc.x, sc.y, sc.z + d0), T0v = sc.clone();
    const P1 = new THREE.Vector3(-34, 58, 150), T1v = new THREE.Vector3(-2, 42, -40);
    Wd.cam.fov = fov;
    Wd.cam.position.lerpVectors(P0, P1, e);
    Wd.cam.position.y += Math.sin(p * Math.PI) * 6;
    const tg = new THREE.Vector3().lerpVectors(T0v, T1v, e);
    Wd.cam.up.set(0, 1, 0);
    Wd.cam.lookAt(tg);
    Wd.cam.rotateZ(-0.03 * e);
    Wd.cam.updateProjectionMatrix();
    const glowK = lerp(1, 0.8, e);
    Wd.set({
      dawn: 0, sunDir: new THREE.Vector3(0.25, 0.02, -1).normalize(), sunK: 0, scrCol: col('green', 2.2 * glowK), scrK: 1,
      skyCol: col('#1a2350', 0.25), sunCol: new THREE.Color(0, 0, 0), amb: new THREE.Color(0.0025, 0.003, 0.006), rays: 0, rayCol: new THREE.Color(),
      cloudY: 1800, cloudAmt: 0, cirrus: 0.25, city: true, room: true, whiteout: 0, t,
    });
    Wd.render(renderer, out, comp);
    // type
    const G = this.rest[0]!;
    G.g.group.visible = true;
    G.g.group.position.set(-W / 2 + 140 + G.g.width / 2, 300, 0);
    G.g.items.forEach((it) => {
      const s = gstate(it, G.line, t, 'char', 0.3);
      it.mesh.visible = s.vis;
      const k = enter('rise', s.since, it.gi);
      it.mesh.position.set(it.x, -it.y - k.dy * 0.8, 0);
      tint(it.mesh, s.on ? col('bone', 1.0) : col('steel', 1), s.on ? k.alpha : 0.35);
    });
    this.hud2.clear();
    this.draw(this.scene3, this.cam, out);
    return { bloom: 0.75, bloomThreshold: 0.9, vignette: 0.5, ca: 1.2 };
  }

  // ---------------------------------------------------------------- S6: Git push… (the commit line shoots up like a rocket)
  private shot6(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    const t = f.t, tv = t + LEADV;
    const { renderer } = this.ctx;
    const wGit = this.L41.words[0]!, wPush = this.L41.words[1]!;
    const L = clamp((tv - wPush.start) / 0.42);
    const exitT = wPush.start + 0.36;
    const camDown = 560 * ease.inCubic(L);
    this.bgGrid.u.t!.value = t;
    this.bgGrid.u.scroll!.value = camDown;
    this.bgGrid.u.amt!.value = ease.inCubic(L);
    this.bgGrid.render(renderer, out);
    // radial speed lines toward the exit point of the rocket
    const sl = ease.inCubic(L) * (1 - clamp((tv - exitT) / 0.25)) + 0.6 * imp(tv, exitT, 0.12);
    if (sl > 0.02) this.speed.render(renderer, out, { frame: f.frame, intensity: sl * 0.28, center: [1090 / W, 1.0], color: lin('green', 1.1), inner: 0.32, density: 120 });
    const c = this.hud.clear();
    const appear = ease.outCubic(clamp((t - this.s6) / 0.16));
    drawGitGraph(c, { x: 1090, y: 210, appear, launch: L, frame: f.frame, t });
    // the diff of the fix
    c.globalAlpha = clamp((t - this.s6 - 0.12) / 0.15) * (1 - clamp(L * 2));
    text2D(c, '-   hour: 2;', 1090, 1000 - 70, 'mono4', 24, css('steel', 0.9));
    c.fillStyle = css('steel', 0.9); c.fillRect(1090, 1000 - 78, 175, 2);
    text2D(c, '+   hour: 2,', 1090, 1000 - 36, 'mono4', 24, css('green'));
    c.globalAlpha = 1;
    // terminal output
    const term: [number, string, string][] = [
      [wGit.start - 0.05, '$ git push origin main', 'mist'],
      [wPush.start, 'Enumerating objects: 5, done.', 'steel'],
      [wPush.start + 0.1, 'Writing objects: 100% (3/3), 312 bytes, done.', 'steel'],
      [wPush.start + 0.22, 'To ssh://remote/night.git', 'steel'],
      [wPush.start + 0.32, '   9b1e004..a3f9c12  main -> main', 'green'],
    ];
    term.forEach(([t0, str, k], i) => {
      if (tv < t0) return;
      const n = i === 0 ? Math.floor(clamp((tv - t0) / 0.2) * str.length) : str.length;
      text2D(c, str.slice(0, n), 140, H - 250 + i * 34, 'mono4', 24, css(k, 0.9));
    });
    text2D(c, storyClock(t), W - 120, 128, 'dot', 44, css('bone', 0.9), { align: 'right' });
    // lyric: Git (slam) / push… (whips up with the rocket)
    for (const [G, w] of [[this.git, wGit], [this.push, wPush]] as const) {
      G.group.visible = true;
      G.items.forEach((it) => {
        const s = gstate(it, this.L41, t, 'char', w === wGit ? 0 : 0.0);
        it.mesh.visible = s.vis;
        if (w === wGit) {
          const k = enter('slam', s.since, it.gi, 0.55);
          it.mesh.scale.setScalar(k.sc);
          it.mesh.rotation.z = k.rot;
          tint(it.mesh, col('bone', k.bright), k.alpha);
        } else {
          const p = clamp(s.since / 0.24);
          const dy = -420 * (1 - ease.outExpo(p));
          it.mesh.position.set(it.x, -it.y + dy, 0);
          it.mesh.scale.set(1, 1 + 0.55 * (1 - ease.outExpo(p)), 1);
          tint(it.mesh, col(s.since < 0.12 ? 'green' : 'bone', 1 + 2 * Math.exp(-s.since / 0.1)), clamp(s.since / 0.03));
        }
      });
    }
    this.git.group.position.set(-W / 2 + 150 + this.git.width / 2, 150, 0);
    this.push.group.position.set(-W / 2 + 150 + this.push.width / 2, -110, 0);
    this.layers(out, true);
    const kP = imp(tv, wPush.start, 0.12), kE = imp(tv, exitT, 0.1);
    return {
      bloom: 0.9, bloomThreshold: 0.88, ca: 1.5 + 4 * kP,
      zoom: 1 + 0.03 * imp(tv, wGit.start, 0.12) + 0.04 * kP, zoomBlur: 0.2 * kP + 0.18 * kE,
      shake: shake(f.frame, 8 * imp(tv, wGit.start, 0.1) + 12 * kP + 6 * ease.inCubic(L) * (1 - clamp((tv - exitT) / 0.2))),
      vignette: 0.45,
    };
  }

  // ---------------------------------------------------------------- S7: もうリファクタリングなんて知らない。 (crumple + toss)
  private shot7(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    const t = f.t, tv = t + LEADV;
    const { renderer } = this.ctx;
    const ws = this.L42.words;
    const u = this.bgImpact.u;
    u.t!.value = t; u.rays!.value = 0.12 * f.a.kick; u.glow!.value = 0.22 + 0.15 * f.a.kick; u.checkA!.value = 0; u.impact!.value = 0;
    u.rot!.value = t * 0.05; u.wedge!.value = 0.35; u.halftone!.value = 0.8;
    (u.rings!.value as number[]).fill(-1);
    (u.rings!.value as number[])[0] = tv - ws[0]!.start;
    this.bgImpact.render(renderer, out);
    const c = this.hud.clear();
    // the messy editor drops in, gets crumpled on なんて, tossed on 知らない
    const e7 = t - this.s7;
    const drop = ease.outBack(clamp(e7 / 0.34));
    const crump = clamp((tv - ws[2]!.start) / 0.36);
    const toss = clamp((tv - ws[3]!.start) / 0.62);
    const ew = 1000, eh = 600;
    let cx = W / 2 + 10, cy = H / 2 - 10 + (1 - drop) * -900;
    let rot = -0.05 * drop + 0.012 * Math.sin(t * 9) * (1 - crump);
    // jitter on each リファクタリング mora (it's a mess)
    const wR = ws[1]!;
    let jit = 0;
    for (const ch of wR.chars) jit += imp(tv, ch.start, 0.08);
    cx += (hashS(f.frame, 1) * 10) * jit * (1 - crump);
    cy += (hashS(f.frame, 2) * 8) * jit * (1 - crump);
    if (toss > 0) {
      const tau = toss;
      cx += 1500 * tau; cy += -1500 * tau + 950 * tau * tau;
      rot += 14 * tau;
      // motion arc
      c.save();
      c.strokeStyle = css('mist', 0.5 * (1 - tau)); c.lineWidth = 3; c.setLineDash([10, 14]);
      c.beginPath();
      for (let k = 0; k <= 12; k++) {
        const tk = Math.max(0, tau - 0.25 + (0.25 * k) / 12);
        const x = W / 2 + 10 + 1500 * tk, y = H / 2 - 10 - 1500 * tk + 950 * tk * tk;
        if (k) c.lineTo(x, y); else c.moveTo(x, y);
      }
      c.stroke(); c.restore();
    }
    if (toss < 1) drawCrumple(c, this.messy, cx, cy, ew * (1 - 0.25 * toss), eh * (1 - 0.25 * toss), crump, rot, 3);
    text2D(c, storyClock(t), W - 120, 128, 'dot', 44, css('bone', 0.9), { align: 'right' });
    // lyric rows: casual, slightly crooked stickers
    const settle = ease.inOutCubic(clamp((tv - (ws[3]!.start + 0.32)) / 0.4));
    const rows: [Glyphs3D, number, number][] = [[this.ref1, 370, 150], [this.ref2, -340, -130]];
    for (const [G, y0, y1] of rows) {
      G.group.visible = true;
      G.group.position.set(0, lerp(y0, y1, settle), 0);
      const big = G === this.ref2 ? 1 + 0.22 * settle : 1;
      G.group.scale.setScalar(big);
      G.group.rotation.z = G === this.ref2 ? -0.05 * settle : 0.02 * settle;
      G.items.forEach((it) => {
        const s = gstate(it, this.L42, t, 'char', 0.35);
        it.mesh.visible = s.vis;
        const k = s.on ? enter('pop', s.since, it.gi) : enter('none', 0);
        const crook = (hash(it.gi, 17) - 0.5) * 0.16 * (G === this.ref2 && it.ch && it.ch.wi === 3 ? 2.2 : 1);
        it.mesh.rotation.z = crook * (s.on ? 1 : 0.4);
        it.mesh.position.set(it.x, -it.y + (hash(it.gi, 19) - 0.5) * 14, 0);
        it.mesh.scale.setScalar(s.on ? k.sc : 0.9);
        tint(it.mesh, s.on ? col('bone', 1 + 1.2 * Math.exp(-s.since / 0.1)) : col('steel'), s.on ? 1 : 0.32);
      });
    }
    this.layers(out, true);
    const kk = imp(tv, ws[0]!.start, 0.12) + 0.6 * imp(tv, ws[2]!.start, 0.1) + 0.8 * imp(tv, ws[3]!.start, 0.1);
    return {
      bloom: 0.75, bloomThreshold: 0.9, ca: 1.3, vignette: 0.45,
      zoom: 1 + 0.025 * kk, shake: shake(f.frame, 10 * kk), zoomBlur: 0.15 * imp(tv, ws[3]!.start, 0.12),
    };
  }
}

const hashS = (a: number, b: number) => hash(a, b, 99) * 2 - 1;
