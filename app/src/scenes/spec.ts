// spec (57.75 → 62.98) — L18 「仕様です」って言葉の裏で / L19 バグが嘲笑ってる気がする
// A bug report form on the desk. A red hanko 「仕様です」 SLAMS onto it (ink bleeds in per
// sung mora, manga impact lines, shake). って言葉の is printed below; on 裏 the sheet whips
// over to its back: the stamp bleeds through mirrored, the bug's red veins spread, 裏で.
// L19 over the back: バグが glitches in, 嘲笑ってる laughs while ｗｗｗ comments flood the
// frame on the beat, 気がする trembles.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { font } from '../engine/fonts';
import { FSPass, GLSL_COMMON, H, W, screenCamera } from '../engine/gl';
import { enter, gstate } from '../engine/kinetic';
import type { Line } from '../engine/lyrics';
import { col, css } from '../engine/palette';
import type { PostParams } from '../engine/post';
import { Scene, type Frame } from '../engine/scene';
import { Glyphs3D, text3d, tint } from '../engine/text3d';
import { clamp, ease, hash, keys, lerp, noise1, spring } from '../engine/util';
import type { Text } from 'troika-three-text';
import { charsOf, impactFrame, inkRough, lastPulse, on, shake, staticTexture, tr } from './spec-kit';

// ---------------------------------------------------------------- paper geometry (paper units)
const PW = 16, PH = 10, PX = 128; // texture px per unit
const SC = new THREE.Vector2(-0.9, 1.15); // stamp centre
const SH = new THREE.Vector2(4.75, 1.5); // stamp half size
const SR = 0.1; // stamp rotation (CCW, rad)
const RING = { c: new THREE.Vector2(4.05, -0.5), r: new THREE.Vector2(1.95, 0.4) }; // red ellipse around 「仕様」 status

const VERT = /* glsl */ `
varying vec2 vUv; varying vec2 vP;
void main() { vUv = uv; vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const STAMP_FN = /* glsl */ `
uniform sampler2D stampTex; uniform vec2 sC; uniform vec2 sH; uniform float sR;
vec2 rotv(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
vec2 stampUV(vec2 p) { vec2 q = rotv(p - sC, -sR); return q / (2.0 * sH) + 0.5; }
float stampMask(vec2 uv) {
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
  return texture2D(stampTex, uv).a;
}`;

const FRONT_FRAG = /* glsl */ `
${GLSL_COMMON}
${STAMP_FN}
uniform sampler2D formTex;
uniform vec4 cu; uniform vec4 ink; uniform float stamped; uniform float glowK; uniform float border;
uniform vec3 body; uniform float splat; uniform vec2 ringC; uniform vec2 ringR; uniform float ringP;
uniform float light; uniform float t; uniform float lines;
varying vec2 vUv; varying vec2 vP;
void main() {
  vec2 p = vP;
  // paper + monitor light (cool, from the upper left) + fibre noise
  vec3 paper = vec3(0.78, 0.82, 0.92);
  float L = 0.34 + 0.66 * exp(-dot(p - vec2(-4.0, 3.5), p - vec2(-4.0, 3.5)) / 95.0);
  L *= 0.94 + 0.06 * vnoise(p * 9.0) + 0.03 * vnoise(p * 40.0);
  vec3 c = paper * L * light;
  // printed form (multiply)
  vec3 form = texture2D(formTex, vUv).rgb;
  c *= form;
  // stamp shadow (the body above the paper)
  vec2 sp = rotv(p - body.xy - vec2(0.35, -0.5) * body.z, -sR);
  float blur = 0.06 + 0.16 * body.z;
  float sd = sdRoundBox(sp, sH + vec2(0.2) + body.z * 0.08, 0.3);
  float sh = (1.0 - smoothstep(-blur, blur, sd)) * clamp(1.0 - body.z / 12.0, 0.0, 1.0) * 0.8;
  c *= 1.0 - sh;
  // stamp imprint: per-char ink with a noisy bleed front
  vec2 uv = stampUV(p);
  float m = stampMask(uv);
  if (m > 0.0 && stamped > 0.5) {
    vec4 d = abs(vec4(uv.x) - cu);
    float lev = border; float cx = 0.5;
    float dm = min(min(d.x, d.y), min(d.z, d.w));
    bool inText = uv.x > cu.x - 0.11 && uv.x < cu.w + 0.11 && uv.y > 0.16 && uv.y < 0.84;
    if (inText) {
      if (dm == d.x) { lev = ink.x; cx = cu.x; } else if (dm == d.y) { lev = ink.y; cx = cu.y; }
      else if (dm == d.z) { lev = ink.z; cx = cu.z; } else { lev = ink.w; cx = cu.w; }
    }
    float r = length((uv - vec2(cx, 0.5)) * vec2(sH.x / sH.y, 1.0)) / 0.75;
    float n = vnoise(uv * vec2(70.0, 22.0)) * 0.35;
    float front = smoothstep(0.0, 0.12, lev * 1.5 - r - n);
    float a = m * mix(0.13, 1.0, inText ? front : lev);
    vec3 inkT = vec3(0.92, 0.035, 0.07);
    c = mix(c, c * inkT * 1.05, a);
    c += vec3(1.0, 0.06, 0.12) * a * glowK;
  }
  // ink splatter around the stamp
  if (splat >= 0.0) {
    vec2 q = rotv(p - sC, -sR);
    float acc = 0.0;
    for (int i = 0; i < 22; i++) {
      float fi = float(i);
      float side = floor(hash11(fi * 3.1) * 4.0);
      float u = hash11(fi * 7.7) * 2.0 - 1.0;
      vec2 e = side < 1.0 ? vec2(u * sH.x, sH.y) : side < 2.0 ? vec2(u * sH.x, -sH.y) : side < 3.0 ? vec2(sH.x, u * sH.y) : vec2(-sH.x, u * sH.y);
      vec2 dir = side < 1.0 ? vec2(0, 1) : side < 2.0 ? vec2(0, -1) : side < 3.0 ? vec2(1, 0) : vec2(-1, 0);
      float dist = 0.15 + 1.1 * pow(hash11(fi * 1.3), 2.0);
      float rad = 0.035 + 0.13 * pow(hash11(fi * 5.9), 3.0);
      vec2 cpos = e + dir * dist * min(1.0, splat / 0.05);
      float g = min(1.0, splat / 0.04);
      acc = max(acc, 1.0 - smoothstep(rad * 0.7 * g, rad * g, length(q - cpos) + 0.02 * vnoise(q * 30.0)));
      // satellites
      for (int j = 0; j < 3; j++) {
        float fj = float(j) + 1.0;
        vec2 o = (vec2(hash11(fi * 3.3 + fj), hash11(fi * 4.1 + fj * 2.0)) - 0.5) * rad * 5.0 + dir * rad * fj * 1.2;
        float r2 = rad * (0.18 + 0.25 * hash11(fi + fj * 9.0)) * g;
        acc = max(acc, 1.0 - smoothstep(r2 * 0.6, r2, length(q - cpos - o)));
      }
    }
    c = mix(c, c * vec3(0.92, 0.035, 0.07), acc * 0.9);
  }
  // red ring around 「仕様」 in the status row (drawn on after the slam)
  if (ringP > 0.0) {
    vec2 rq = (p - ringC) / ringR;
    float ang = atan(rq.y, rq.x);
    float sweep = fract((ang / TAU) + 0.27);
    float wob = 1.0 + 0.04 * sin(ang * 3.0 + 1.0);
    float dd = abs(length(rq) - wob) * min(ringR.x, ringR.y);
    float rr = (1.0 - smoothstep(0.04, 0.075, dd)) * step(sweep, ringP * 1.08);
    c = mix(c, c * vec3(0.92, 0.035, 0.07), rr);
  }
  // edge darkening + tiny rim
  vec2 ed = (PWH - abs(p));
  float edge = smoothstep(0.0, 0.06, min(ed.x, ed.y));
  c *= mix(0.55, 1.0, edge);
  gl_FragColor = vec4(c, 1.0);
}`.replace('PWH', `vec2(${(PW / 2).toFixed(1)}, ${(PH / 2).toFixed(1)})`);

const BACK_FRAG = /* glsl */ `
${GLSL_COMMON}
${STAMP_FN}
uniform sampler2D formTex; uniform float infect; uniform float t; uniform float pulse; uniform float light; uniform float bleed;
varying vec2 vUv; varying vec2 vP;
void main() {
  vec2 p = vP;
  vec2 pf = vec2(-p.x, p.y);            // the same point seen from the front (mirror)
  vec2 fuv = pf / vec2(${PW.toFixed(1)}, ${PH.toFixed(1)}) + 0.5;
  float print = 1.0 - dot(texture2D(formTex, fuv).rgb, vec3(0.333));
  float m = stampMask(stampUV(pf));
  // the back is in shadow: dark, cool, with the stamp's red ink soaked through
  vec3 c = vec3(0.030, 0.032, 0.048) * (0.8 + 0.2 * vnoise(p * 8.0)) * light;
  c += vec3(0.05, 0.055, 0.08) * print * 0.5;
  float n = fbm(p * 0.32 + vec2(0.0, t * 0.08));
  // red veins of the bug spreading from the bleed-through
  float n2 = fbm(p * 0.9 + vec2(3.1, -t * 0.05));
  float reach = smoothstep(1.0 - infect * 1.3, 1.0 - infect * 1.3 + 0.3, 1.0 - length(p - vec2(0.9, 1.1)) / 9.0 + 0.35 * vnoise(p * 1.3));
  float veins = (smoothstep(0.022, 0.0, abs(n - 0.52)) + 0.6 * smoothstep(0.014, 0.0, abs(n2 - 0.5))) * reach;
  float stain = smoothstep(0.6, 0.9, n) * infect;
  c += vec3(0.55, 0.012, 0.035) * m * (0.55 + 0.6 * pulse) * bleed;
  c += vec3(0.5, 0.012, 0.035) * veins * (0.22 + 1.1 * pulse);
  c += vec3(0.05, 0.002, 0.006) * stain;
  vec2 ed = (vec2(${(PW / 2).toFixed(1)}, ${(PH / 2).toFixed(1)}) - abs(p));
  float edge = smoothstep(0.0, 0.05, min(ed.x, ed.y));
  c *= mix(0.4, 1.0, edge);
  c += vec3(0.25, 0.27, 0.35) * (1.0 - smoothstep(0.0, 0.03, min(ed.x, ed.y))) * 0.4;
  gl_FragColor = vec4(c, 1.0);
}`;

// manga impact lines (集中線) in ink, normal blending: darken the paper around the impact
const INK_LINES = /* glsl */ `
uniform vec2 center; uniform float k; uniform float frame; uniform float inner; uniform vec3 color;
void main() {
  vec2 p = (vUv - center) * vec2(uRes.x / uRes.y, 1.0);
  float r = length(p); float a = atan(p.y, p.x);
  float fr = floor(frame / 2.0);
  float n = 180.0;
  float cell = floor((a / TAU + 0.5) * n);
  float h = hash12(vec2(cell, fr));
  float w = fract((a / TAU + 0.5) * n) - 0.5;
  float thin = 0.06 + 0.4 * h * h;
  float line = smoothstep(thin, thin * 0.35, abs(w));
  float reach = inner + 0.22 * hash12(vec2(cell + 11.0, fr));
  float m = line * smoothstep(reach, reach + 0.25, r) * step(0.35, h);
  gl_FragColor = vec4(color, m * k);
}`;

const BG = /* glsl */ `
uniform float t; uniform float red; uniform float kick;
void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float g = exp(-dot(p - vec2(-0.5, 0.35), p - vec2(-0.5, 0.35)) * 2.2);
  vec3 c = C_INK + C_BLUE * g * 0.05 + vec3(0.01, 0.012, 0.02) * vnoise(p * 5.0 + t * 0.1);
  c += C_RED * red * (0.03 + 0.05 * kick) * (0.6 + 0.4 * fbm(p * 3.0 + t * 0.3));
  gl_FragColor = vec4(c, 1.0);
}`;

interface Danmaku { mesh: Text; s: number; y: number; v: number; w: number; pop: boolean; x0: number; red: boolean; sz: number }

export default class Spec extends Scene {
  bg = new FSPass(BG, { t: { value: 0 }, red: { value: 0 }, kick: { value: 0 } });
  lines = new FSPass(INK_LINES, {
    center: { value: new THREE.Vector2(0.5, 0.5) }, k: { value: 0 }, frame: { value: 0 }, inner: { value: 0.3 },
    color: { value: new THREE.Vector3(0.002, 0.002, 0.004) },
  }, { blending: THREE.NormalBlending, transparent: true });
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(35, W / H, 0.1, 400);
  paper = new THREE.Group();
  front!: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  back!: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  under: THREE.Mesh[] = [];
  stamp = new THREE.Group();
  stampPad!: THREE.Mesh;
  L18!: Line;
  L19!: Line;
  fr: { g: Glyphs3D; line: Line; kind: 'print' | 'bracket' }[] = [];
  ura!: Glyphs3D;
  ov = new THREE.Scene();
  ocam = screenCamera();
  bug!: Glyphs3D;
  bugR!: Glyphs3D;
  bugC!: Glyphs3D;
  laugh!: Glyphs3D;
  kiga!: Glyphs3D;
  plate!: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  dm: Danmaku[] = [];
  cu = new THREE.Vector4();
  // times
  tSlam = 0; tTte = 0; tKoto = 0; tUra = 0; tDe = 0; tBug = 0; tLaugh = 0; tKi = 0; tEnd = 0;
  charOn: number[] = [];

  async init() {
    const { lyrics } = this.ctx;
    this.L18 = lyrics.get('「仕様です」って言葉の裏で');
    this.L19 = lyrics.get('バグが嘲笑ってる気がする');
    const L18 = this.L18, L19 = this.L19;
    const shiyo = charsOf(L18, '仕様です');
    this.charOn = shiyo.map(on);
    this.tSlam = on(shiyo[0]!);
    this.tKoto = on(charsOf(L18, '言')[0]!);
    this.tTte = on(charsOf(L18, 'って')[0]!);
    this.tUra = on(charsOf(L18, '裏')[0]!);
    this.tDe = on(charsOf(L18, '裏で')[1]!);
    this.tBug = on(L19.chars[0]!);
    this.tLaugh = on(charsOf(L19, '嘲')[0]!);
    this.tKi = on(charsOf(L19, '気がする')[0]!);
    this.tEnd = this.ctx.end;

    // ---------------- textures
    const form = staticTexture(PW * PX, PH * PX, (c) => this.drawForm(c));
    const { tex: stampTex, cu } = this.makeStamp();
    this.cu.copy(cu);

    // ---------------- paper
    const geo = new THREE.PlaneGeometry(PW, PH, 1, 1);
    const common = {
      stampTex: { value: stampTex }, sC: { value: SC }, sH: { value: SH }, sR: { value: SR }, formTex: { value: form },
      t: { value: 0 }, light: { value: 1 },
    };
    this.front = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRONT_FRAG,
      uniforms: {
        ...common, cu: { value: this.cu }, ink: { value: new THREE.Vector4() }, stamped: { value: 0 }, glowK: { value: 0 },
        border: { value: 0 }, body: { value: new THREE.Vector3(0, 0, 20) }, splat: { value: -1 },
        ringC: { value: RING.c }, ringR: { value: RING.r }, ringP: { value: 0 }, lines: { value: 0 },
      },
    }));
    this.back = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: BACK_FRAG,
      uniforms: { ...common, infect: { value: 0 }, pulse: { value: 0 }, bleed: { value: 1 } },
    }));
    this.back.rotation.y = Math.PI;
    this.back.position.z = -0.004;
    this.paper.add(this.front, this.back);
    this.scene.add(this.paper);
    // older reports underneath
    const underMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: `${GLSL_COMMON}\nuniform sampler2D formTex; uniform float k; varying vec2 vUv; varying vec2 vP;
        void main(){ vec3 f = texture2D(formTex, vUv).rgb; float L = 0.30 + 0.4 * exp(-dot(vP - vec2(-5.,4.), vP - vec2(-5.,4.)) / 140.);
        gl_FragColor = vec4(vec3(0.78, 0.81, 0.88) * f * L * k, 1.0); }`,
      uniforms: { formTex: { value: form }, k: { value: 0.55 } },
    });
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(geo, underMat);
      m.position.set(0.6 * (i + 1) * (i % 2 ? -1 : 1), -0.35 * (i + 1), -0.05 * (i + 1));
      m.rotation.z = (i % 2 ? 1 : -1) * (0.05 + 0.04 * i);
      this.under.push(m);
      this.scene.add(m);
    }

    // ---------------- printed lyric on the front: 「 」 (framing the stamp), って言葉の (answer box)
    const ink = col('#0b0e18');
    const lb = new Glyphs3D(charsOf(L18, '「'), { font: 'sans9', size: 2.3, color: ink, depthTest: true, renderOrder: 5 });
    const rb = new Glyphs3D(charsOf(L18, '」'), { font: 'sans9', size: 2.3, color: ink, depthTest: true, renderOrder: 5 });
    const place = (g: Glyphs3D, lx: number, ly: number) => {
      const c = Math.cos(SR), s = Math.sin(SR);
      g.group.position.set(SC.x + c * lx - s * ly, SC.y + s * lx + c * ly, 0.03);
      g.group.rotation.z = SR;
    };
    place(lb, -SH.x - 0.75, 0.55);
    place(rb, SH.x + 0.75, -0.55);
    const tte = new Glyphs3D(charsOf(L18, 'って'), { font: 'sans9', size: 1.3, color: ink, depthTest: true, renderOrder: 5 });
    const koto = new Glyphs3D(charsOf(L18, '言葉の'), { font: 'sans9', size: 1.95, color: ink, depthTest: true, renderOrder: 5 });
    const rowY = -2.95, rowX0 = -2.6;
    tte.group.position.set(rowX0 + tte.width / 2, rowY - 0.28, 0.03);
    koto.group.position.set(rowX0 + tte.width + 0.25 + koto.width / 2, rowY, 0.03);
    for (const g of [lb, rb]) this.fr.push({ g, line: L18, kind: 'bracket' });
    for (const g of [tte, koto]) this.fr.push({ g, line: L18, kind: 'print' });
    for (const { g } of this.fr) this.paper.add(g.group);

    // ---------------- 裏で on the back (child of the back plane: reads correctly once flipped)
    this.ura = new Glyphs3D(charsOf(L18, '裏で'), {
      font: 'dela', size: 3.3, color: col('bone'), depthTest: true, renderOrder: 6, outlineWidth: '4%', outlineColor: col('#300008'), outlineBlur: '12%',
    });
    this.ura.group.position.set(-0.3, -2.25, 0.03);
    this.back.add(this.ura.group);

    // ---------------- the stamp body (lacquered handle, red rubber)
    const lac = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.018, 0.02, 0.03), roughness: 0.32, metalness: 0.15 });
    const rub = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.6, 0.02, 0.05), roughness: 0.7, emissive: new THREE.Color(0.15, 0.0, 0.01) });
    const pad = new THREE.Mesh(new RoundedBoxGeometry(SH.x * 2 + 0.1, SH.y * 2 + 0.1, 0.22, 3, 0.06), rub);
    pad.position.z = 0.11;
    const mount = new THREE.Mesh(new RoundedBoxGeometry(SH.x * 2 + 0.5, SH.y * 2 + 0.5, 1.0, 4, 0.18), lac);
    mount.position.z = 0.22 + 0.5;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, 1.7, 32), lac);
    neck.rotation.x = Math.PI / 2;
    neck.position.z = 1.22 + 0.85;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(1.25, 40, 24), lac);
    knob.scale.set(1, 1, 0.78);
    knob.position.z = 1.22 + 1.7 + 0.75;
    this.stampPad = pad;
    this.stamp.add(pad, mount, neck, knob);
    this.paper.add(this.stamp);
    const key = new THREE.DirectionalLight(new THREE.Color(0.75, 0.85, 1.0), 3.2);
    key.position.set(-6, 5, 9);
    const rim = new THREE.DirectionalLight(new THREE.Color(1.0, 0.2, 0.25), 2.4);
    rim.position.set(9, -3, 3);
    const hemi = new THREE.HemisphereLight(new THREE.Color(0.35, 0.42, 0.6), new THREE.Color(0.05, 0.03, 0.04), 0.7);
    this.scene.add(key, rim, hemi);

    // ---------------- overlay: L19 + danmaku
    const bugO = { font: 'dela' as const, size: 175, renderOrder: 40 };
    this.bug = new Glyphs3D(charsOf(L19, 'バグが'), { ...bugO, color: col('red', 1), outlineWidth: '5%', outlineColor: col('#0a0003') });
    this.bugR = new Glyphs3D(charsOf(L19, 'バグが'), { ...bugO, color: col('red', 2.5), blend: 'add', renderOrder: 39 });
    this.bugC = new Glyphs3D(charsOf(L19, 'バグが'), { ...bugO, color: col('cyan', 1.2), blend: 'add', renderOrder: 39 });
    this.laugh = new Glyphs3D(charsOf(L19, '嘲笑ってる'), {
      font: 'dela', size: 250, color: col('bone'), renderOrder: 42, outlineWidth: '5%', outlineColor: col('#16000a'), outlineBlur: '9%',
    });
    this.kiga = new Glyphs3D(charsOf(L19, '気がする'), {
      font: 'sans9', size: 128, color: col('mist'), renderOrder: 41, outlineWidth: '8%', outlineColor: col('#0a0004'), outlineBlur: '10%',
    });
    for (const g of [this.bugC, this.bugR, this.bug]) { g.group.position.set(-560, 300, 0); this.ov.add(g.group); }
    this.laugh.group.position.set(0, -10, 0);
    this.kiga.group.position.set(560, -300, 0);
    this.ov.add(this.laugh.group, this.kiga.group);
    this.plate = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: col('#04050a'), transparent: true, opacity: 0.88, depthTest: false, depthWrite: false }));
    this.plate.renderOrder = 30;
    this.plate.scale.set(this.kiga.width + 90, 178, 1);
    this.plate.position.set(560, -300, 0);
    this.ov.add(this.plate);
    // danmaku: ｗ comments (Reggae One), spawned on a growing 16th-note schedule
    this.buildDanmaku();
  }

  // ---------------------------------------------------------------- textures
  drawForm(c: CanvasRenderingContext2D) {
    const X = (x: number) => (x + PW / 2) * PX, Y = (y: number) => (PH / 2 - y) * PX;
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, PW * PX, PH * PX);
    const inkC = '#56627f', line = 'rgba(80,100,145,0.5)', faint = 'rgba(80,100,145,0.25)', val = '#68738f';
    c.textBaseline = 'middle';
    // title + meta
    c.fillStyle = '#2c3550';
    c.font = font('sans9', 78);
    c.fillText('不具合報告書', X(-7.3), Y(4.22));
    c.font = font('mono8', 34);
    c.fillStyle = val;
    c.fillText('No. BUG-1024', X(-1.15), Y(4.38));
    c.font = font('sans7', 28);
    c.fillStyle = inkC;
    c.fillText('起票: 私  /  プロジェクト: night.ts', X(-1.15), Y(3.98));
    // approval boxes 担当 / 課長 / 部長
    c.strokeStyle = line;
    c.lineWidth = 3;
    const bx = 3.55, bw = 1.38;
    ['担当', '課長', '部長'].forEach((s, i) => {
      const x0 = X(bx + i * bw);
      c.strokeRect(x0, Y(4.7), bw * PX, 1.25 * PX);
      c.beginPath(); c.moveTo(x0, Y(4.3)); c.lineTo(x0 + bw * PX, Y(4.3)); c.stroke();
      c.font = font('sans7', 30); c.fillStyle = inkC; c.textAlign = 'center';
      c.fillText(s, x0 + (bw * PX) / 2, Y(4.5));
      c.textAlign = 'left';
    });
    c.lineWidth = 4;
    c.strokeStyle = line;
    c.beginPath(); c.moveTo(X(-7.4), Y(3.62)); c.lineTo(X(7.4), Y(3.62)); c.stroke();
    // table
    const rows: [string, string][] = [
      ['件名', '「保存」ボタンを押すと画面が真っ白になる'],
      ['発生日時', `毎晩 ${'02:13'} ごろ　　再現性: 100%（毎回）`],
      ['重要度', '★★★ 高　　優先度: 至急'],
      ['再現手順', '1. ログインする　2.「保存」を押す　3. 何も起きない'],
      ['期待する結果', '保存される'],
      ['実際の結果', '画面が真っ白になる。たまに全部消える。'],
      ['ステータス', ''],
    ];
    const r0 = 3.42, rh = 0.62;
    rows.forEach(([k, v], i) => {
      const yt = r0 - i * rh, yc = yt - rh / 2;
      c.strokeStyle = faint; c.lineWidth = 2;
      c.beginPath(); c.moveTo(X(-7.4), Y(yt - rh)); c.lineTo(X(7.4), Y(yt - rh)); c.stroke();
      c.font = font('sans7', 32); c.fillStyle = inkC;
      c.fillText(k, X(-7.2), Y(yc));
      c.font = font('sans4', 34); c.fillStyle = val;
      if (v) c.fillText(v, X(-4.4), Y(yc));
    });
    c.strokeStyle = faint; c.lineWidth = 2;
    c.beginPath(); c.moveTo(X(-4.65), Y(r0)); c.lineTo(X(-4.65), Y(r0 - rh * rows.length)); c.stroke();
    // status options (仕様 gets circled in red by the shader)
    const sy = r0 - 6 * rh - rh / 2;
    c.font = font('sans4', 34); c.fillStyle = val;
    [['未対応', -4.4], ['調査中', -1.85], ['修正済', 0.7], ['仕様 (By design)', 2.75]].forEach(([s, x]) => {
      c.beginPath(); c.arc(X(x as number) + 14, Y(sy), 13, 0, Math.PI * 2); c.strokeStyle = inkC; c.lineWidth = 3; c.stroke();
      c.fillText(s as string, X(x as number) + 40, Y(sy));
    });
    // answer box
    c.strokeStyle = line; c.lineWidth = 3;
    c.strokeRect(X(-7.4), Y(-1.15), 14.8 * PX, 3.5 * PX);
    c.font = font('sans7', 32); c.fillStyle = inkC;
    c.fillText('回答', X(-7.2), Y(-1.5));
    c.strokeStyle = faint; c.lineWidth = 2;
    for (let i = 1; i < 5; i++) { c.beginPath(); c.moveTo(X(-7.2), Y(-1.2 - i * 0.68)); c.lineTo(X(7.2), Y(-1.2 - i * 0.68)); c.stroke(); }
    c.font = font('mono4', 24); c.fillStyle = 'rgba(70,90,135,0.6)';
    c.fillText(`printed ${'03:23'}  —  night.ts(3,10)  ',' expected`, X(-7.3), Y(-4.8));
  }

  makeStamp() {
    const w = 2048, h = Math.round((w * SH.y) / SH.x);
    const fpx = Math.round(h * 0.64);
    const chars = ['仕', '様', 'で', 'す'];
    const cu = new THREE.Vector4();
    const tex = staticTexture(w, h, (c) => {
      c.clearRect(0, 0, w, h);
      c.fillStyle = '#fff';
      c.strokeStyle = '#fff';
      // double border
      c.lineWidth = h * 0.06;
      c.beginPath(); c.roundRect(h * 0.05, h * 0.05, w - h * 0.1, h * 0.9, h * 0.08); c.stroke();
      c.lineWidth = h * 0.018;
      c.beginPath(); c.roundRect(h * 0.13, h * 0.13, w - h * 0.26, h * 0.74, h * 0.04); c.stroke();
      // text
      c.font = font('dela', fpx);
      c.textBaseline = 'middle';
      c.textAlign = 'center';
      const adv = chars.map((ch) => c.measureText(ch).width);
      const gap = fpx * 0.12;
      const tot = adv.reduce((a, b) => a + b, 0) + gap * (chars.length - 1);
      let x = (w - tot) / 2;
      const cs: number[] = [];
      chars.forEach((ch, i) => {
        const cx = x + adv[i]! / 2;
        c.fillText(ch, cx, h * 0.53);
        cs.push(cx / w);
        x += adv[i]! + gap;
      });
      cu.set(cs[0]!, cs[1]!, cs[2]!, cs[3]!);
      inkRough(c, w, h, 7, 1);
    }, false);
    // the texture's v runs bottom-up in GL; canvas y is top-down -> flipY (default) handles it
    return { tex, cu };
  }

  buildDanmaku() {
    const variants = ['ｗｗｗ', 'ｗｗｗｗｗ', 'ｗｗ', 'ｗｗｗｗｗｗｗｗ', 'ｗ', 'ｗｗｗｗ', 'ｗｗｗｗｗｗ', '草', 'ｗｗｗｗｗｗｗｗｗｗ', '仕様ｗｗｗ', '草'];
    const A = this.ctx.audio;
    const t0 = this.tLaugh;
    let id = 0;
    const lanes = 13, laneH = (H - 200) / lanes;
    for (let k = 0; ; k++) {
      const s = t0 + k * (A.period / 2);
      if (s > this.tEnd + 0.02) break;
      const n = Math.round(6 * Math.pow(1.42, k));
      for (let j = 0; j < n; j++, id++) {
        const pop = hash(id, 3) < 0.4;
        const big = hash(id, 4);
        const sz = big > 0.94 ? 220 : big > 0.72 ? 124 : big > 0.38 ? 88 : 62;
        let str = variants[Math.floor(hash(id, 5) * (sz > 150 ? 3 : variants.length))]!;
        if (str === '仕様ｗｗｗ' && sz > 90) str = 'ｗｗｗｗｗ';
        const red = hash(id, 6) < 0.3;
        const mesh = text3d(str, {
          font: 'reggae', size: sz, color: red ? col('red', 1) : col('bone', 0.95), renderOrder: 20 + (sz > 150 ? 0 : 1),
          outlineWidth: '8%', outlineColor: col('#05010a'), anchorX: 'center', anchorY: 'middle',
        });
        mesh.visible = false;
        this.ov.add(mesh);
        const w = [...str].length * sz;
        const lane = Math.floor(hash(id, 8) * lanes);
        this.dm.push({
          mesh, s: s + hash(id, 7) * 0.04, y: H / 2 - 100 - laneH * (lane + 0.5) + (hash(id, 11) - 0.5) * 18,
          v: (sz > 150 ? 900 : 1300) + 1300 * hash(id, 9), w, pop, x0: -W / 2 + 160 + hash(id, 10) * (W - 320), red, sz,
        });
      }
    }
  }

  // ---------------------------------------------------------------- render
  render(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    const { renderer } = this.ctx;
    const t = f.t;
    const A = this.ctx.audio;
    const flipK = this.flipAngle(t);
    const flipped = flipK > 0.5;
    const inL19 = t >= this.tBug;

    // ---------------- background
    this.bg.u.t!.value = t;
    this.bg.u.red!.value = clamp((t - this.tUra) / 0.3);
    this.bg.u.kick!.value = f.a.kick;
    this.bg.render(renderer, out);

    // ---------------- stamp body
    const z = this.stampZ(t);
    const lift = clamp((t - this.tSlam - 0.045) / 0.2);
    const sx = SC.x + 5 * ease.outCubic(lift), sy = SC.y + 7 * ease.outCubic(lift);
    this.stamp.position.set(sx, sy, z);
    this.stamp.rotation.z = SR + 0.25 * ease.inCubic(lift) - 0.05 * (1 - clamp((t - this.ctx.start) / (this.tSlam - this.ctx.start)));
    const squash = t >= this.tSlam && t < this.tSlam + 0.045 ? 0.92 : 1;
    this.stamp.scale.set(1, 1, squash);
    this.stamp.visible = z < 40 && t < this.tSlam + 0.32;

    // ---------------- paper uniforms
    const fu = this.front.material.uniforms;
    fu.t!.value = t;
    fu.stamped!.value = t >= this.tSlam ? 1 : 0;
    fu.body!.value.set(sx, sy, this.stamp.visible ? z : 40);
    const inkV = fu.ink!.value as THREE.Vector4;
    const lev = this.charOn.map((c) => clamp((t - c) / 0.16));
    inkV.set(lev[0]!, lev[1]!, lev[2]!, lev[3]!);
    fu.border!.value = clamp((t - this.tSlam) / 0.08);
    fu.glowK!.value = 1.6 * lastPulse(t, this.charOn, 0.07);
    fu.splat!.value = t >= this.tSlam ? t - this.tSlam : -1;
    fu.ringP!.value = clamp((t - this.tSlam - 0.22) / 0.3);
    fu.light!.value = 1;
    const bu = this.back.material.uniforms;
    bu.t!.value = t;
    bu.infect!.value = clamp((t - this.tUra + 0.05) / 0.9) * 0.35 + clamp((t - this.tBug) / 1.6) * 0.65;
    bu.pulse!.value = (inL19 ? 0.5 * A.beatPulse(t, 0.16) + 0.7 * f.a.kick : 0.3 * A.beatPulse(t, 0.18));
    bu.light!.value = 1;
    bu.bleed!.value = 1 - 0.72 * clamp((t - this.tBug) / 0.3);

    // ---------------- paper flip
    this.paper.rotation.y = flipK * Math.PI;
    this.paper.position.z = Math.sin(clamp(flipK) * Math.PI) * 3.5;
    this.paper.rotation.z = -0.06 * Math.sin(clamp(flipK) * Math.PI);
    for (const u of this.under) u.visible = !inL19;

    // ---------------- front lyric (printed): visible on its onset, ink-black
    for (const { g, line, kind } of this.fr) for (const it of g.items) {
      const s = gstate(it, line, t, 'char', 0);
      it.mesh.visible = s.vis && !flipped;
      if (!it.mesh.visible) continue;
      const k = enter(kind === 'bracket' ? 'stamp' : 'pop', s.since, it.gi, kind === 'bracket' ? 0.8 : 0.6);
      it.mesh.scale.setScalar(k.sc);
      it.mesh.position.set(it.x + k.dx * 0.01, -it.y - k.dy * 0.01, 0);
      it.mesh.rotation.z = it.rot + k.rot * 0.5;
      const flash = Math.exp(-s.since / 0.045);
      tint(it.mesh, col('#0b0e18').lerp(col('red', 0.5), flash * 0.5), 1);
    }
    // ---------------- 裏で on the back
    for (const it of this.ura.items) {
      const s = gstate(it, this.L18, t, 'char', 0);
      it.mesh.visible = s.vis && flipped && t < this.tBug + 0.3;
      if (!it.mesh.visible) continue;
      const k = enter('stamp', s.since, it.gi, 1.1);
      it.mesh.scale.setScalar(k.sc);
      const fade = clamp((t - this.tBug) / 0.25);
      tint(it.mesh, col('bone', 1 + 1.6 * Math.exp(-s.since / 0.1)).lerp(col('red', 0.6), fade), 1 - fade * 0.6);
    }

    // ---------------- camera
    this.camera(f, flipK);
    this.draw(this.scene, this.cam, out);

    // ---------------- manga impact lines around the stamp (ink on paper)
    const eS = t - this.tSlam;
    if (eS >= 0 && eS < 0.42 && !flipped) {
      const sc = new THREE.Vector3(SC.x, SC.y, 0).applyMatrix4(this.paper.matrixWorld).project(this.cam);
      (this.lines.u.center!.value as THREE.Vector2).set(sc.x * 0.5 + 0.5, sc.y * 0.5 + 0.5);
      this.lines.u.k!.value = 0.85 * (1 - ease.inQuad(clamp(eS / 0.42)));
      this.lines.u.frame!.value = f.frame;
      this.lines.u.inner!.value = 0.34 + 0.12 * eS;
      (this.lines.u.color!.value as THREE.Vector3).set(0.004, 0.004, 0.008);
      this.lines.render(renderer, out);
    }
    // red impact lines on the flip landing / on 嘲
    const eU = t - (this.tUra + 0.14);
    if (eU >= 0 && eU < 0.3) {
      this.lines.u.k!.value = 0.5 * (1 - eU / 0.3);
      (this.lines.u.center!.value as THREE.Vector2).set(0.5, 0.52);
      this.lines.u.inner!.value = 0.36;
      this.lines.u.frame!.value = f.frame;
      (this.lines.u.color!.value as THREE.Vector3).set(0.5, 0.01, 0.03);
      this.lines.render(renderer, out);
    }

    // ---------------- overlay: L19 + danmaku + clock
    this.overlay(f);
    this.draw(this.ov, this.ocam, out);

    // ---------------- post
    return this.post(f, flipK);
  }

  /** 0 (front) .. 1 (back): whips over around 裏 */
  flipAngle(t: number) {
    const a = this.tUra - 0.1;
    if (t < a) return 0;
    const p = clamp((t - a) / 0.34);
    return ease.outBack(p);
  }

  /** stamp height above the paper */
  stampZ(t: number) {
    const t0 = this.ctx.start - 0.02, ts = this.tSlam;
    if (t < ts) {
      const u = clamp((t - t0) / (ts - t0));
      return 5.2 * (1 - u * u);
    }
    if (t < ts + 0.045) return 0;
    const l = clamp((t - ts - 0.045) / 0.2);
    return 16 * ease.outQuad(l) + 0.8 * Math.sin(l * Math.PI);
  }

  camera(f: Frame, flipK: number) {
    const t = f.t;
    const tS = this.tSlam, tK = this.tTte, tU = this.tUra, tB = this.tBug, tL = this.tLaugh;
    // orbit params: target (paper space), distance, azimuth, elevation, roll
    let tx: number, ty: number, dist: number, az: number, el: number, roll: number;
    if (t < tK) {
      // oblique desk view, stamp crashing down; slow push + tilt up after the slam
      const k = clamp((t - tS) / (this.tKoto - tS));
      const kk = ease.outCubic(k);
      tx = lerp(SC.x + 0.2, SC.x + 0.4, kk); ty = lerp(SC.y + 0.4, SC.y - 0.2, kk);
      dist = lerp(15.5, 12.6, kk) - 0.6 * ease.outExpo(clamp((t - tS) / 0.2));
      az = lerp(-0.32, -0.18, kk); el = lerp(0.88, 1.08, kk); roll = lerp(0.06, 0.02, kk);
      if (t < tS) { dist = 15.5 + (tS - t) * 6; }
    } else if (t < tU - 0.1) {
      // on っ: whip to the full sheet, frontal, slight dutch; on 言 punch in toward 言葉の
      const k = ease.outExpo(clamp((t - tK) / 0.2));
      const drift = (t - tK) * 0.25;
      const pk = ease.outExpo(clamp((t - this.tKoto) / 0.18));
      tx = lerp(SC.x + 0.4, 0.3, k) + 0.9 * pk; ty = lerp(SC.y - 0.2, -0.55 - drift * 0.4, k) - 0.75 * pk;
      dist = lerp(12.6, 15.0, k) - drift * 1.6 - 1.6 * pk; az = lerp(-0.18, 0.04, k); el = lerp(1.08, Math.PI / 2 - 0.02, k); roll = lerp(0.02, -0.035, k) + 0.02 * pk;
    } else if (t < tB) {
      // the flip: pull back while it whips over, then land close on 裏で
      const k = clamp((t - tU + 0.1) / 0.45);
      const back = Math.sin(clamp(k * 1.4) * Math.PI) * 2.2;
      const land = ease.outCubic(clamp((t - tU - 0.1) / 0.5));
      tx = lerp(0.3, 0.1, land); ty = lerp(-0.55, -0.8, land);
      dist = lerp(14.2, 12.4, land) + back - (t - tU) * 0.5; az = 0.04 * (1 - land); el = Math.PI / 2 - 0.02 * (1 - land); roll = lerp(-0.035, 0.03, land);
    } else {
      // L19: whip down-left off 裏で, then push in through the laughter
      const w = ease.outExpo(clamp((t - tB) / 0.2));
      const pu = ease.outExpo(clamp((t - tL) / 0.25));
      const late = clamp((t - tL) / (this.tEnd - tL));
      tx = lerp(0.1, 0.4, w) + pu * 0.3; ty = lerp(-0.8, 1.6, w) - pu * 0.3;
      dist = lerp(12.4, 8.4, w) - pu * 1.5 - late * 0.9; az = 0; el = Math.PI / 2; roll = lerp(0.03, -0.08, w) + pu * 0.12 + late * 0.05;
    }
    // beat-locked micro zoom on kicks during the L19 laughter
    if (t >= tL) dist -= f.a.kick * 0.25;
    // orbit in paper (world) space
    const ce = Math.cos(el), se = Math.sin(el);
    const fx = Math.sin(az), fy = -Math.cos(az);
    const pos = new THREE.Vector3(tx + dist * ce * fx, ty + dist * ce * fy, dist * se);
    const target = new THREE.Vector3(tx, ty, 0);
    if (flipK > 0.5) { /* the paper is flipped: its back faces +z, so world target is fine */ }
    const fwd = target.clone().sub(pos).normalize();
    const right = new THREE.Vector3(Math.cos(az), Math.sin(az), 0);
    const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    up.applyAxisAngle(fwd, roll);
    this.cam.position.copy(pos);
    this.cam.up.copy(up);
    this.cam.lookAt(target);
    this.cam.updateMatrixWorld();
  }

  overlay(f: Frame) {
    const t = f.t;
    const L19 = this.L19;
    const A = this.ctx.audio;
    // バグが: red glitch type with RGB split
    const gl = f.frame % 7 < 2 ? 1 : 0;
    [this.bug, this.bugR, this.bugC].forEach((g, gi) => {
      for (const it of g.items) {
        const s = gstate(it, L19, t, 'char', 0);
        it.mesh.visible = s.vis;
        if (!s.vis) continue;
        const k = enter('slam', s.since, it.gi, 0.7);
        const j = hash(f.frame, it.gi, 3) - 0.5;
        const sl = Math.exp(-s.since / 0.25) + 0.25 * A.beatPulse(t, 0.1, 0.5);
        const off = gi === 0 ? 0 : (gi === 1 ? 1 : -1) * (6 + 22 * sl + 10 * gl);
        it.mesh.position.set(it.x + off + j * 18 * sl, -it.y + (gi === 0 ? 0 : j * 8 * sl), 0);
        it.mesh.scale.setScalar(k.sc);
        it.mesh.rotation.z = k.rot;
        if (gi === 0) tint(it.mesh, col('red', 0.95 + 0.6 * (k.bright - 1)), 1);
        else tint(it.mesh, gi === 1 ? col('red', 1.6) : col('cyan', 0.9), 0.55 * clamp(sl + 0.15));
      }
    });
    // 嘲笑ってる: slams per mora, then keeps "laughing" (16th-note bob)
    for (const it of this.laugh.items) {
      const s = gstate(it, L19, t, 'char', 0);
      it.mesh.visible = s.vis;
      if (!s.vis) continue;
      const k = enter('slam', s.since, it.gi, 1.0);
      const bob = s.since > 0.15 ? Math.abs(Math.sin((t - this.tLaugh) * Math.PI * 4 / A.period * 0.5 + it.gi * 0.9)) * 16 : 0;
      it.mesh.position.set(it.x, -it.y + bob, 0);
      it.mesh.scale.setScalar(k.sc * (1 + 0.05 * f.a.kick));
      it.mesh.rotation.z = k.rot + 0.04 * Math.sin((t - this.tLaugh) * 9 + it.gi);
      const isRed = it.c === '嘲' || it.c === '笑';
      tint(it.mesh, isRed ? col('red', 0.95 + 0.5 * (k.bright - 1)) : col('bone', 0.9 + 0.8 * (k.bright - 1)), 1);
    }
    // 気がする: small, trembling, on a dark plate that slides in
    const ek = t - on(this.kiga.items[0]!.ch!);
    this.plate.visible = ek >= 0;
    if (ek >= 0) {
      const k = ease.outExpo(clamp(ek / 0.18));
      this.plate.scale.set((this.kiga.width + 90) * k, 178, 1);
      this.plate.position.set(560 - (1 - k) * (this.kiga.width + 90) / 2, -300, 0);
    }
    for (const it of this.kiga.items) {
      const s = gstate(it, L19, t, 'char', 0);
      it.mesh.visible = s.vis;
      if (!s.vis) continue;
      const k = enter('drop', s.since, it.gi, 0.35);
      const jx = noise1(t * 22 + it.gi * 5, 3) * 3.5, jy = noise1(t * 25 + it.gi * 7, 4) * 3.5;
      it.mesh.position.set(it.x + jx, -it.y - k.dy + jy, 0);
      tint(it.mesh, col('mist', 0.9 + 0.6 * Math.exp(-s.since / 0.1)), k.alpha);
    }
    // danmaku
    for (const d of this.dm) {
      const e = t - d.s;
      d.mesh.visible = e >= 0;
      if (e < 0) continue;
      let x: number, sc = 1;
      if (d.pop) {
        x = d.x0 - e * 260;
        sc = spring(e, 4.2, 0.38);
      } else {
        x = W / 2 + d.w / 2 + 20 - e * d.v;
      }
      d.mesh.position.set(x, d.y, 0);
      d.mesh.scale.setScalar(sc);
      // comments that cross the lyric band dim a little so the line stays readable
      const band = Math.abs(d.y + 10) < 170 ? 0.55 : 1;
      const a = (d.sz > 150 ? 0.42 : 0.95 * band) * clamp(e / 0.03);
      tint(d.mesh, d.red ? col('red', 0.9 + 0.5 * f.a.kick) : col('bone', 0.82), a);
    }
  }

  post(f: Frame, flipK: number): PostParams {
    const t = f.t;
    const tS = this.tSlam;
    const imp = [tS];
    const landU = this.tUra + 0.14;
    const sh1 = shake(t, [tS], 34, 0.11, 1);
    const sh2 = shake(t, [landU], 22, 0.1, 2);
    const sh3 = shake(t, [this.tBug, this.tLaugh], 18, 0.09, 3);
    const kickSh = t >= this.tLaugh ? shake(t, this.ctx.audio.events('kick', this.tLaugh, t + 0.001).map(([x]) => x), 9, 0.07, 4) : [0, 0];
    const inv = impactFrame(f.frame, imp, 1);
    const flash = inv ? 0 : impactFrame(f.frame, [tS + 1 / 60], 2) * 0.35;
    const eS = t - tS;
    const pp: PostParams = {
      shake: [sh1[0] + sh2[0] + sh3[0] + kickSh[0], sh1[1] + sh2[1] + sh3[1] + kickSh[1]],
      invert: inv,
      flash: flash + 0.25 * impactFrame(f.frame, [landU], 2),
      flashColor: [1, 0.08, 0.15],
      zoomBlur: eS >= 0 && eS < 0.13 ? 0.5 * (1 - eS / 0.13) : 0,
      bloom: 0.6,
      vignette: 0.42,
      ca: 1.2 + 3 * Math.exp(-Math.max(0, eS) / 0.1),
      grain: 0.05,
    };
    if (flipK > 0.5) {
      const g = t >= this.tBug ? 0.04 + 0.5 * Math.exp(-(t - this.tBug) / 0.07) + 0.3 * Math.exp(-Math.max(0, t - this.tLaugh) / 0.06) * (t >= this.tLaugh ? 1 : 0) : 0;
      pp.glitch = g + 0.18 * this.ctx.audio.hit('kick', t, 0.04) * (t >= this.tLaugh ? 1 : 0);
      pp.rgbSplit = t >= this.tBug ? 2 + 6 * this.ctx.audio.hit('kick', t, 0.08) : 0;
      pp.ca = 2.2;
      pp.bloom = 0.75;
      pp.zoomBlur = 0.35 * Math.exp(-Math.max(0, t - this.tLaugh) / 0.12) * (t >= this.tLaugh ? 1 : 0);
    }
    return pp;
  }
}
