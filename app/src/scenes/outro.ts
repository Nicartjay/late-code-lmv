// outro (bar 52 → end): 明日の自分、よろしく頼むよ。 + the instrumental climax.
// A sticky note for tomorrow's self on the monitor, sunrise through the window; then we fly out
// of the window, down a canyon of towers, up through the clouds into the sunrise sky where the
// cursor types the title 「2時のデバッグ」. The cursor blinks one last time; fade to black.
import * as THREE from 'three';
import type { Text } from 'troika-three-text';
import { FSPass, H, Layer2D, W } from '../engine/gl';
import { enter, gstate } from '../engine/kinetic';
import type { Line } from '../engine/lyrics';
import { CODE_FIXED, drawEditor, storyClock } from '../engine/motifs';
import { col, css, lin } from '../engine/palette';
import type { PostParams } from '../engine/post';
import { Scene, type Frame } from '../engine/scene';
import { Shockwave, SpeedLines } from '../engine/fx';
import { Glyphs3D, text3d, tint, type T3 } from '../engine/text3d';
import { text2D } from '../engine/type2d';
import { clamp, ease, hash, lerp, mulberry32 } from '../engine/util';
import { Block3D, LEADV, imp, pxCamera, shake } from './success-kit';
import { NOTE, StickyNote } from './outro-note';
import { World, type WorldState } from './outro-world';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** monotone cubic (Fritsch–Carlson) interpolation of y(x) */
function monotone(xs: number[], ys: number[]) {
  const n = xs.length, d: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1]! - ys[i]!) / (xs[i + 1]! - xs[i]!));
  m.push(d[0]!);
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1]! * d[i]! <= 0 ? 0 : (d[i - 1]! + d[i]!) / 2);
  m.push(d[n - 2]!);
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i]! / d[i]!, b = m[i + 1]! / d[i]!, s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]!; m[i + 1] = k * b * d[i]!; }
  }
  return (x: number) => {
    if (x <= xs[0]!) return ys[0]!;
    if (x >= xs[n - 1]!) return ys[n - 1]!;
    let i = 0;
    while (x > xs[i + 1]!) i++;
    const h = xs[i + 1]! - xs[i]!, t = (x - xs[i]!) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i]! + (t3 - 2 * t2 + t) * h * m[i]! + (-2 * t3 + 3 * t2) * ys[i + 1]! + (t3 - t2) * h * m[i + 1]!;
  };
}

const DIM_FRAG = /* glsl */ `uniform float a; void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, a); }`;

const DUST_VERT = /* glsl */ `
attribute vec4 aP; uniform vec3 cam; uniform float t; uniform float box; uniform float size; uniform float alpha;
varying float vA; varying float vM;
void main() {
  vec3 p = aP.xyz * box;
  p.x += sin(t * 0.7 + aP.w * 40.0) * 6.0; p.y += t * 6.0 * (0.4 + aP.w);
  vec3 rel = mod(p - cam + box * 0.5, box) - box * 0.5;
  vec3 wp = cam + rel;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  gl_PointSize = size * (1.0 + 2.0 * aP.w) * 220.0 / max(d, 1.0);
  float tw = 0.6 + 0.4 * sin(t * 6.0 + aP.w * 90.0);
  vA = alpha * tw * smoothstep(box * 0.5, box * 0.25, length(rel)) * smoothstep(8.0, 30.0, d); vM = aP.w;
}`;
const DUST_FRAG = /* glsl */ `
uniform vec3 c1; uniform vec3 c2; varying float vA; varying float vM;
void main() { vec2 q = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(q)); gl_FragColor = vec4(mix(c1, c2, vM) * a * vA, 1.0); }`;

interface Word { mesh: Text; t: number; side: number; up: number; c: THREE.Color }

export default class Outro extends Scene {
  world = new World();
  note!: StickyNote;
  scr = new Layer2D();
  sceneS = new THREE.Scene();
  camS = pxCamera(30);
  extra = new THREE.Scene(); // flight + title objects (rendered with the world camera)
  L42!: Line; L43!: Line;
  bars: number[] = [];
  beats: number[] = [];
  tail1!: Glyphs3D; tail2!: Glyphs3D;
  sunDir = V(0.12, 0.045, -1).normalize();
  // flight
  path!: THREE.CatmullRomCurve3;
  pathU!: (t: number) => number;
  pathT: number[] = [];
  words: Word[] = [];
  cursor!: THREE.Mesh;
  cursorMat = new THREE.MeshBasicMaterial({ color: col('cyan', 2.0), toneMapped: false, transparent: true });
  trail!: THREE.Points;
  trailPos!: THREE.BufferAttribute;
  dust!: THREE.Points;
  dustMat!: THREE.ShaderMaterial;
  speed = new SpeedLines();
  shock = new Shockwave();
  dim = new FSPass(DIM_FRAG, { a: { value: 0 } }, { transparent: true, blending: THREE.NormalBlending });
  // title
  title!: Block3D;
  titleGroup = new THREE.Group();
  sub!: Text;
  clocks = new Map<string, Text>();
  titleCols: THREE.Color[] = [];
  tFly = 0; tTitle = 0; tFinal = 0;
  curCol = col('cyan', 2.0);
  finK = 0;
  layerCol(kk: number) { return col('#140804', (1 - kk * 0.06) * (1 + 2 * this.finK)); }
  dustA = 0;
  subVis = false;
  curScene = new THREE.Scene();

  async init() {
    const { lyrics, audio: A } = this.ctx;
    this.L42 = lyrics.get('もうリファクタリングなんて知らない。');
    this.L43 = lyrics.get('明日の自分、よろしく頼むよ。');
    const b0 = Math.round(A.bar(this.ctx.start));
    for (let k = 0; k <= 9; k++) this.bars.push(A.barTime(b0 + k));
    for (let k = 0; k <= 40; k++) this.beats.push(A.beatTime(Math.round(A.beat(this.ctx.start)) + k));
    this.note = new StickyNote(this.world, this.L43);
    this.world.screenMat.map = this.scr.tex;
    // L42 tail (continues across the cut from success)
    const w42 = this.L42.words;
    const tailO: T3 = { font: 'sans9', size: 132, color: col('bone'), outlineWidth: '6%', outlineColor: col('ink'), outlineBlur: '12%', outlineOpacity: 0.7 };
    this.tail1 = new Glyphs3D([...w42[0]!.chars, ...w42[1]!.chars], tailO);
    this.tail2 = new Glyphs3D([...w42[2]!.chars, ...w42[3]!.chars], tailO);
    this.sceneS.add(this.tail1.group, this.tail2.group);

    // ---- the flight path (song-time keyed)
    const B = this.bars;
    this.tFly = B[2]! + (B[3]! - B[2]!) / 4; // one beat after bar 54 (the band is back)
    this.tTitle = B[4]!; // bar 56: bass enters
    // the last big hit of the song (loudest moment of the final bar)
    let best = -1;
    for (let x = B[7]! + 0.8; x < B[8]!; x += 0.01) { const v = A.env('rms', x) + A.env('drums', x); if (v > best) { best = v; this.tFinal = x; } }
    const keys: [number, THREE.Vector3][] = [
      [this.tFly, V(0, 0, 0)], // replaced by the note pose below
      [this.tFly + 0.3, V(26, 36, 16)],
      [this.tFly + 0.6, V(12, 60, -22)],
      [this.tFly + 0.8, V(5, 66, -92)],
      [this.tFly + 1.1, V(0, 14, -390)],
      [this.tFly + 1.5, V(-34, -190, -820)],
      [this.tFly + 1.95, V(22, -255, -1360)],
      [this.tFly + 2.5, V(0, -110, -1920)],
      [this.tFly + 3.25, V(0, 440, -2520)],
      [this.tTitle - 0.6, V(0, 1160, -3060)],
      [this.tTitle, V(0, 1640, -3480)],
      [this.tTitle + 0.8, V(0, 1720, -3560)],
    ];
    keys[0]![1] = NOTE.c.clone().add(V(-3.5, 1.4, 24));
    this.path = new THREE.CatmullRomCurve3(keys.map((k) => k[1]), false, 'centripetal');
    this.pathT = keys.map((k) => k[0]);
    this.pathU = monotone(this.pathT, keys.map((_, i) => i / (keys.length - 1)));

    // ---- the night's words, passing by in the canyon (a reprise)
    const W8 = (B[3]! - B[2]!) / 8;
    const list: [string, T3['font'], string, number][] = [
      ['迷宮入り', 'dela', 'bone', 1], ['BGM', 'dela', 'gold', -1], ['呪文', 'mincho', 'bone', 1], ['「仕様です」', 'dela', 'amber', -1],
      ['限界', 'sans9', 'bone', 1], ['スタックオーバーフロー', 'sans9', 'gold', -1], ['セミコロン', 'mincho', 'bone', 1], ['カンマ', 'mincho', 'gold', -1],
      ['ビルド成功', 'dela', 'bone', 1], ['明日', 'mincho', 'gold', -1],
    ];
    list.forEach(([s, fnt, c, side], i) => {
      const m = text3d(s, { font: fnt, size: s.length > 6 ? 46 : 64, color: col(c, 1.4), anchorX: 'center', anchorY: 'middle', depthTest: true, renderOrder: 30, outlineWidth: '3%', outlineColor: col('ink'), outlineOpacity: 0.6 });
      this.extra.add(m);
      this.words.push({ mesh: m, t: this.tFly + 1.0 + i * 2 * W8, side, up: (hash(i, 4) - 0.3) * 50, c: col(c, 1.4) });
    });

    // ---- the cursor comet + trail
    this.cursor = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.cursorMat);
    this.extra.add(this.cursor);
    const NT = 48;
    const tg = new THREE.BufferGeometry();
    this.trailPos = new THREE.BufferAttribute(new Float32Array(NT * 3), 3);
    tg.setAttribute('position', this.trailPos);
    const ta = new Float32Array(NT);
    for (let i = 0; i < NT; i++) ta[i] = 1 - i / NT;
    tg.setAttribute('aK', new THREE.BufferAttribute(ta, 1));
    this.trail = new THREE.Points(tg, new THREE.ShaderMaterial({
      uniforms: { c: { value: col('cyan', 1.6) }, size: { value: 16 }, alpha: { value: 1 } },
      vertexShader: /* glsl */ `attribute float aK; uniform float size; varying float vK; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = size * (0.3 + aK) * 300.0 / max(1.0, -mv.z); vK = aK; }`,
      fragmentShader: /* glsl */ `uniform vec3 c; uniform float alpha; varying float vK; void main() { float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)); gl_FragColor = vec4(c * a * vK * vK * alpha, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.trail.frustumCulled = false;
    this.extra.add(this.trail);

    // ---- dust motes in the sunlight
    const ND = 700, r = mulberry32(9);
    const dg = new THREE.BufferGeometry();
    const dp = new Float32Array(ND * 4);
    for (let i = 0; i < ND; i++) dp.set([r(), r(), r(), r()], i * 4);
    dg.setAttribute('aP', new THREE.BufferAttribute(dp, 4));
    dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ND * 3), 3));
    this.dustMat = new THREE.ShaderMaterial({
      uniforms: { cam: { value: V(0, 0, 0) }, t: { value: 0 }, box: { value: 600 }, size: { value: 3 }, alpha: { value: 0 }, c1: { value: col('gold', 2.5) }, c2: { value: col('bone', 2.5) } },
      vertexShader: DUST_VERT, fragmentShader: DUST_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.dust = new THREE.Points(dg, this.dustMat);
    this.dust.frustumCulled = false;
    this.extra.add(this.dust);

    // ---- the title 「2時のデバッグ」 (Shippori Mincho, extruded) + subtitle + clock
    const em = 1;
    this.title = new Block3D('2時のデバッグ', { font: 'mincho', size: em, color: col('#24110a'), outlineWidth: '2.2%', outlineBlur: '4%', outlineColor: col('gold', 2.4), outlineOpacity: 1 }, 10, 0.012, (k) => col('#140804', 1 - k * 0.06));
    this.titleGroup.add(this.title.group);
    this.sub = text3d('2 AM DEBUGGING', { font: 'mono8', size: 0.11, color: col('#2a1206'), anchorX: 'center', anchorY: 'middle', tracking: 0.7 });
    this.sub.position.set(0, -0.8, 0);
    this.titleGroup.add(this.sub);
    for (const s of ['05:58', '05:59', '06:00', '06:01', '06:02']) {
      const m = text3d(s, { font: 'dot', size: 0.3, color: col('#2a1206'), anchorX: 'center', anchorY: 'middle', outlineWidth: '5%', outlineColor: col('gold', 1.6), outlineOpacity: 0.8, outlineBlur: '10%' });
      m.position.set(0, -1.24, 0);
      this.titleGroup.add(m);
      this.clocks.set(s, m);
    }
    this.extra.add(this.titleGroup);
    this.title.items.forEach(() => this.titleCols.push(new THREE.Color()));
    this.world.occluders.push({
      obj: this.titleGroup,
      set: (black) => {
        this.title.items.forEach((it, i) => {
          tint(it.mesh, black ? col('#000000') : this.titleCols[i]!, it.mesh.fillOpacity);
          this.title.tintLayers(i, (kk) => (black ? col('#000000') : this.layerCol(kk)), 1);
        });
        for (const w of this.words) tint(w.mesh, black ? col('#000000') : w.c, w.mesh.fillOpacity);
        this.cursorMat.color.copy(black ? col('#000000') : this.curCol);
        (this.trail.material as THREE.ShaderMaterial).uniforms.alpha!.value = black ? 0 : 1;
        this.dustMat.uniforms.alpha!.value = black ? 0 : this.dustA;
        this.sub.visible = !black && this.subVis;
        for (const m of this.clocks.values()) m.position.z = black ? 1e5 : 0;
      },
    });
  }

  // ------------------------------------------------------------------ helpers
  private drawScreen(f: Frame) {
    const c = this.scr.clear();
    c.fillStyle = css('ink2'); c.fillRect(0, 0, W, H);
    drawEditor(c, 0, 0, W, H - 70, { lines: CODE_FIXED, px: 40, highlight: 2, cursor: { line: 15, col: -1, on: f.beatPhase < 0.55 }, title: 'night.ts' });
    c.fillStyle = css('ink3'); c.fillRect(0, H - 70, W, 70);
    text2D(c, 'main → origin/main  ·  pushed  ·  0 errors', 40, H - 26, 'mono4', 30, css('mist', 0.9));
    text2D(c, storyClock(f.t), W - 40, H - 24, 'dot', 38, css('bone'), { align: 'right' });
    this.scr.upload();
  }

  private sunrise(t: number, o: Partial<WorldState> = {}): WorldState {
    const crest = ease.inOutCubic(clamp((t - this.bars[1]!) / 1.5));
    return {
      dawn: 1, sunDir: this.sunDir, sunK: 1.0 + 1.0 * crest, scrCol: col('#3a6cff', 0.35), scrK: 0.9,
      skyCol: col('#ffb07a', 1.1 + 0.6 * crest), sunCol: col('#ffc27a', 1.8 + 1.8 * crest), amb: col('#8a5a40', 0.1 + 0.06 * crest),
      rays: 0.55 + 0.6 * crest, rayCol: col('#ffcf8a', 1), cloudY: 1400, cloudAmt: 1, cirrus: 0.9, city: true, room: true,
      whiteout: 0, t, ...o,
    };
  }

  /** world camera pose on the flight path at time t */
  private flightPose(t: number, cam: THREE.PerspectiveCamera) {
    const u = this.pathU(t);
    const p = this.path.getPoint(u);
    const ahead = this.path.getPoint(Math.min(1, u + 0.012));
    const dir = ahead.clone().sub(p).normalize();
    cam.position.copy(p);
    // first: still looking at the note, then along the flight direction
    const w = ease.inOutCubic(clamp((t - this.tFly) / 0.55));
    const look = NOTE.c.clone().add(V(0.6, 0, 0)).lerp(p.clone().add(dir.multiplyScalar(200)), w);
    cam.up.set(0, 1, 0);
    cam.lookAt(look);
    // bank with the lateral weave
    const side = this.path.getPoint(Math.min(1, u + 0.03)).x - p.x;
    cam.rotateZ(clamp(-side * 0.004, -0.25, 0.25) * w - 0.02 * (1 - w));
  }

  // ------------------------------------------------------------------ render
  render(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    const t = f.t;
    if (t < this.tFly) return this.room(f, out);
    if (t < this.tTitle) return this.flight(f, out);
    return this.sky(f, out);
  }

  private hideExtra() {
    for (const w of this.words) w.mesh.visible = false;
    this.cursor.visible = false; this.trail.visible = false; this.dust.visible = false; this.titleGroup.visible = false;
  }

  // ---------------------------------------------------------------- O1-O3: the note at sunrise
  private room(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    const t = f.t, tv = t + LEADV;
    const { renderer, comp } = this.ctx;
    const Wd = this.world;
    const w43 = this.L43.words;
    const s2 = w43[2]!.start - LEADV; // よろしく
    const s3 = w43[3]!.start - LEADV - 0.04; // 頼むよ。
    const nc = NOTE.c;
    this.hideExtra();
    Wd.cam.fov = 40;
    Wd.cam.up.set(0, 1, 0);
    const b54 = this.bars[2]!;
    if (t < s2) {
      const e = ease.outCubic(clamp((t - this.ctx.start) / (s2 - this.ctx.start)));
      Wd.cam.position.copy(nc).add(V(lerp(-7.5, -5, e), lerp(3.2, 2.0, e), lerp(34, 28, e)));
      Wd.cam.lookAt(nc.clone().add(V(lerp(1.5, 0.8, e), 0.4, 0)));
      Wd.cam.rotateZ(lerp(0.03, 0.0, e));
    } else if (t < s3) {
      const e = ease.inOutSine(clamp((t - s2) / (s3 - s2)));
      Wd.cam.position.copy(nc).add(V(lerp(16, 9, e), lerp(4, 6, e), lerp(46, 40, e)));
      Wd.cam.lookAt(nc.clone().add(V(lerp(-9, -14, e), lerp(4, 6, e), -10)));
    } else {
      const e = ease.outCubic(clamp((t - s3) / 1.4));
      const kick = imp(t, b54, 0.25);
      Wd.cam.position.copy(nc).add(V(lerp(-4.5, -3.5, e), lerp(1.0, 1.4, e), lerp(27, 24, e) + 1.5 * kick));
      Wd.cam.lookAt(nc.clone().add(V(0.6, 0.0, 0)));
      Wd.cam.rotateZ(-0.02);
    }
    Wd.cam.updateProjectionMatrix();
    const st = this.sunrise(t);
    st.rays += 1.2 * imp(t, b54, 0.35);
    st.sunK += 1.5 * imp(t, b54, 0.3);
    Wd.set(st);
    this.drawScreen(f);
    this.note.update(t, w43[3]!.end + 0.2, col('navy'));
    this.note.setGlow(col('#ffd9a0', 0.62 + 0.25 * ease.inOutCubic(clamp((t - this.bars[1]!) / 1.5)) + 0.5 * imp(t, b54, 0.3)));
    Wd.render(renderer, out, comp);

    // L42 tail across the cut
    const tailEnd = this.L42.end + 0.3;
    const tailOn = t < tailEnd + 0.25;
    this.tail1.group.visible = tailOn; this.tail2.group.visible = tailOn;
    if (tailOn) {
      const fall = ease.inCubic(clamp((t - tailEnd) / 0.25));
      const rows: [Glyphs3D, number][] = [[this.tail1, 150], [this.tail2, -130]];
      for (const [G, y] of rows) {
        G.group.position.set(0, y - 800 * fall, 0);
        G.group.scale.setScalar(G === this.tail2 ? 1.22 : 1);
        G.group.rotation.z = (G === this.tail2 ? -0.05 : 0.02) - 0.35 * fall;
        G.items.forEach((it) => {
          const s = gstate(it, this.L42, t, 'char', 1);
          const k = s.on ? enter('pop', s.since, it.gi) : enter('none', 0);
          it.mesh.scale.setScalar(s.on ? k.sc : 0.9);
          tint(it.mesh, s.on ? col('bone', 1 + 1.2 * Math.exp(-s.since / 0.1)) : col('steel'), (s.on ? 1 : 0.4) * (1 - fall));
          it.mesh.outlineOpacity = 0.7 * (1 - fall);
        });
      }
      this.draw(this.sceneS, this.camS, out);
    }
    const k54 = imp(t, b54, 0.18);
    return {
      bloom: 0.85 + 0.6 * k54, bloomThreshold: 0.9, vignette: 0.42, ca: 1.0 + 3 * k54,
      shake: shake(f.frame, 7 * k54 + 3 * imp(tv, w43[3]!.start, 0.1)), zoom: 1 + 0.02 * k54,
    };
  }

  // ---------------------------------------------------------------- O4/O5: out of the window, down the canyon, up through the clouds
  private flight(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    const t = f.t;
    const { renderer, comp } = this.ctx;
    const Wd = this.world;
    this.hideExtra();
    Wd.cam.fov = lerp(40, 58, ease.inOutCubic(clamp((t - this.tFly - 0.5) / 0.6)));
    this.flightPose(t, Wd.cam);
    Wd.cam.updateProjectionMatrix();
    const camY = Wd.cam.position.y;
    const inCloud = clamp(1 - Math.abs(camY - 1400) / 260);
    const st = this.sunrise(t, { room: Wd.cam.position.z > -260, city: camY < 1300 });
    st.rays = 0.9 + 0.4 * f.a.kick; st.sunK = 1.3;
    Wd.set(st);
    // the note stays readable on the way out
    this.note.update(t, this.L43.words[3]!.end + 0.2, col('navy'));
    this.note.setGlow(col('#ffd9a0', 0.9));
    if (Wd.cam.position.z > -120) this.drawScreen(f);
    // words of the night
    const u = (tt: number) => this.path.getPoint(this.pathU(tt));
    for (const w of this.words) {
      const vis = t > w.t - 0.75 && t < w.t + 0.08;
      w.mesh.visible = vis;
      if (!vis) continue;
      const p = u(w.t);
      const q = u(w.t + 0.05);
      const dir = q.clone().sub(p).normalize();
      const sideV = new THREE.Vector3().crossVectors(dir, V(0, 1, 0)).normalize();
      w.mesh.position.copy(p).addScaledVector(sideV, 150 * w.side).add(V(0, w.up, 0));
      w.mesh.lookAt(Wd.cam.position);
      const a = clamp((t - (w.t - 0.75)) / 0.12);
      w.mesh.fillOpacity = a;
      tint(w.mesh, w.c, a);
    }
    // the cursor comet leads the climb
    const cOn = t > this.bars[3]! - 0.1;
    this.cursor.visible = cOn; this.trail.visible = cOn;
    if (cOn) {
      const lead = 0.42;
      const cp = u(Math.min(this.tTitle + 0.5, t + lead)).add(V(0, 14, 0));
      this.cursor.position.copy(cp);
      this.cursor.scale.set(9, 18, 3);
      this.cursor.lookAt(Wd.cam.position);
      this.cursorMat.opacity = clamp((t - (this.bars[3]! - 0.1)) / 0.15);
      const arr = this.trailPos.array as Float32Array;
      for (let i = 0; i < arr.length / 3; i++) {
        const tp = u(Math.min(this.tTitle + 0.5, t + lead - i * 0.012)).add(V(0, 14, 0));
        arr[i * 3] = tp.x; arr[i * 3 + 1] = tp.y; arr[i * 3 + 2] = tp.z;
      }
      this.trailPos.needsUpdate = true;
    }
    this.dust.visible = true;
    this.dustMat.uniforms.cam!.value.copy(Wd.cam.position);
    this.dustMat.uniforms.t!.value = t;
    this.dustMat.uniforms.alpha!.value = this.dustA = 0.9;
    Wd.render(renderer, out, comp, this.extra);
    // speed lines in the dive / climb
    const spd = clamp((t - this.tFly - 0.7) / 0.4) * (1 - inCloud);
    if (spd > 0.02) this.speed.render(renderer, out, { frame: f.frame, intensity: spd * (0.18 + 0.25 * f.a.snare), color: lin('gold', 1.2), inner: 0.36, density: 140 });
    const kick = f.a.kick;
    const white = clamp((t - (this.tTitle - 0.55)) / 0.4) * (1 - clamp((t - this.tTitle + 0.05) / 0.05));
    return {
      bloom: 0.9, bloomThreshold: 0.88, vignette: 0.45, ca: 1.2 + 2 * kick,
      zoomBlur: 0.12 * kick + 0.25 * imp(t, this.tFly + 0.8, 0.2) + 0.2 * inCloud,
      shake: shake(f.frame, 4 * kick + 6 * imp(t, this.tFly + 0.8, 0.15)),
      flash: Math.max(white * 0.92, inCloud * 0.75), flashColor: [1, 0.93, 0.82],
    };
  }

  // ---------------------------------------------------------------- O6-O8: above the clouds — the title
  private sky(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    const t = f.t;
    const { renderer, comp } = this.ctx;
    const Wd = this.world;
    const B = this.bars;
    const e = t - this.tTitle;
    this.hideExtra();
    // camera rig: glide above the sea of clouds; reframe on every bar
    const glide = V(0, 1640 + 90 * ease.outCubic(clamp(e / 2.2)) + 10 * e, -3480 - 30 * e);
    const orbit = lerp(0, 0.16, ease.inOutCubic(clamp((t - B[5]!) / 2.6))) - lerp(0, 0.24, ease.inOutCubic(clamp((t - B[6]!) / 2.6))) + lerp(0, 0.08, ease.inOutCubic(clamp((t - B[7]!) / 2.6)));
    const D = 1500 - 260 * ease.inOutCubic(clamp((t - B[6]!) / 2.6)) + 420 * ease.inOutCubic(clamp((t - B[7]!) / 3.0));
    const titleDir = this.sunDir.clone().add(V(0, 0.012, 0)).normalize();
    const target = glide.clone().addScaledVector(titleDir, 1500);
    const camPos = target.clone().addScaledVector(titleDir.clone().applyAxisAngle(V(0, 1, 0), orbit), -D);
    camPos.y += 30 * Math.sin(e * 0.5);
    Wd.cam.fov = lerp(58, 40, ease.outCubic(clamp(e / 0.9)));
    Wd.cam.position.copy(camPos);
    Wd.cam.up.set(0, 1, 0);
    Wd.cam.lookAt(target.clone().add(V(0, -40, 0)));
    Wd.cam.rotateZ(0.04 * Math.sin(e * 0.4) - 0.6 * orbit * 0.2);
    Wd.cam.updateProjectionMatrix();
    const st = this.sunrise(t, { room: false, city: false });
    const fin = imp(t, this.tFinal - 0.04, 0.6); // the last big hit
    st.sunK = 0.5 + 1.6 * fin;
    st.glowK = 0.35 + 0.5 * fin;
    st.rays = 2.4 + 0.9 * f.a.kick + 1.8 * fin;
    st.beams = 0.85;
    st.rayDecay = 0.975; st.rayWeight = 0.045; st.occWide = 1; st.rayFloor = 0.25; st.rayGamma = 1.25;
    st.deckOff = [0, -e * 260];
    Wd.set(st);

    // title: typed by the cursor on 16ths
    const T = this.titleGroup;
    T.visible = true;
    const em = 200;
    T.position.copy(target);
    T.scale.setScalar(em);
    T.lookAt(target.clone().sub(titleDir));
    const step16 = (B[5]! - B[4]!) / 16;
    const n = this.title.items.length;
    let lastX = this.title.items[0]!.x - this.title.items[0]!.adv;
    this.title.items.forEach((it, i) => {
      const ti = this.tTitle + 0.05 + i * step16;
      const on = t >= ti;
      const s = t - ti;
      const k = enter('slam', s, i, 0.7);
      this.title.set(i, it.x, -it.y, 0, it.rot + k.rot * 0.5, on ? k.sc : 1, on, on ? ease.outCubic(clamp(s / 0.2)) : 0);
      // each glyph lands glowing, then cools into a silhouette against the sun
      const hot = Math.exp(-Math.max(0, s) / 0.18);
      this.titleCols[i]!.copy(col('#24110a')).lerp(col('gold', 3.2), hot).lerp(col('gold', 2.2), 0.6 * fin);
      tint(it.mesh, this.titleCols[i]!, on ? k.alpha : 0);
      (it.mesh.outlineColor as THREE.Color).copy(col('gold', 1.6 + 1.6 * hot + 0.6 * f.a.kick + 1.5 * fin));
      it.mesh.outlineOpacity = on ? k.alpha : 0;
      this.finK = fin;
      this.title.tintLayers(i, (kk) => this.layerCol(kk), on ? 1 : 0);
      if (on) lastX = it.x + it.adv / 2;
    });
    const typed = t >= this.tTitle + 0.05 + (n - 1) * step16;
    // subtitle + clock
    const subA = clamp((t - (this.tTitle + 1.4)) / 0.6);
    this.sub.visible = this.subVis = subA > 0;
    tint(this.sub, col('#2a1206'), subA * 0.9);
    const ck = storyClock(t);
    for (const [s, m] of this.clocks) {
      m.visible = s === ck && subA > 0;
      tint(m, col('#2a1206').lerp(col('gold', 3), imp(t, B[6]!, 0.4)), subA);
    }
    // the cursor: flies in, types, then blinks on the beat
    const cur = this.cursor;
    const beatOn = f.beatPhase < 0.55;
    const lastBlink = this.ctx.audio.barTime(Math.round(this.ctx.audio.bar(B[8]!))) + 0.36;
    const cursorOn = t < this.tTitle + 0.05 ? true : !typed ? true : beatOn && t < lastBlink;
    cur.visible = cursorOn;
    this.cursorMat.opacity = 1;
    const cLocal = V(lastX + 0.12 + 0.22, -0.04, 0.02);
    const cWorld = T.localToWorld(cLocal.clone());
    if (t < this.tTitle + 0.05) {
      // arriving from the cloud
      const a = ease.outExpo(clamp((t - this.tTitle) / 0.05));
      cur.position.copy(cWorld).lerp(Wd.cam.position.clone().add(V(0, -100, -300)), 1 - a);
    } else cur.position.copy(cWorld);
    cur.quaternion.copy(T.quaternion);
    cur.scale.set(0.36 * em, 0.88 * em, 0.06 * em);
    this.trail.visible = t < this.tTitle + 0.3;
    // dust
    this.dust.visible = true;
    this.dustMat.uniforms.cam!.value.copy(Wd.cam.position);
    this.dustMat.uniforms.t!.value = t;
    this.dustMat.uniforms.box!.value = 900;
    this.dustMat.uniforms.size!.value = 4;
    this.dustMat.uniforms.alpha!.value = this.dustA = 0.8 * (1 - clamp((t - (B[8]! - 1.0)) / 0.8));
    Wd.render(renderer, out, comp, this.extra);

    // the final hit: a ring of light around the sun
    const sunNdc = this.sunDir.clone().applyMatrix4(Wd.cam.matrixWorldInverse.clone().setPosition(0, 0, 0)).applyMatrix4(Wd.cam.projectionMatrix);
    void sunNdc;
    // fade: the world goes dark, the cursor stays (one last blink), then black
    const fadeW = ease.inOutSine(clamp((t - (B[8]! - 0.85)) / 0.9));
    if (fadeW > 0.001) {
      this.dim.u.a!.value = fadeW;
      this.dim.render(renderer, out);
      if (cursorOn && fadeW > 0.5) {
        // redraw the cursor alone over the dark
        this.curScene.add(cur);
        this.draw(this.curScene, Wd.cam, out, false);
        this.extra.add(cur);
      }
    }
    const kick = f.a.kick;
    const typeHit = imp(t, this.tTitle + 0.05, 0.3);
    return {
      bloom: 0.6 + 0.25 * kick + 0.8 * fin, bloomThreshold: 0.92, vignette: 0.42, ca: 1.0 + 2 * kick + 3 * fin,
      flash: 0.85 * (1 - clamp((t - this.tTitle) / 0.35)) + 0.3 * imp(t, this.tFinal - 0.04, 0.12), flashColor: [1, 0.93, 0.82],
      zoom: 1 + 0.03 * typeHit + 0.02 * kick, shake: shake(f.frame, 3 * kick + 10 * fin),
      fade: clamp((t - (this.ctx.end - 0.6)) / 0.3),
    };
  }
}
