// qiita (52.53 → 57.75): L16 Qiitaの海はもう泳ぎ疲れた / L17 英語のドキュメントは呪文みたい
//   S1  surface  — we breach into an ocean of article cards; Qiitaの / 海は / もう surface through the
//                  cards on the sung mora and ride the swell (the bass swell lifts もう)
//   S2  sinking  — cut below the surface: 泳ぎ疲れた sinks, character by character, tired
//   S3  the deep — a magic circle of English API docs draws itself ring by ring as 英語のドキュメントは
//                  is sung; 呪文みたい rises out of it like an incantation (light pillar, sparks)
import * as THREE from 'three';
import { Burst } from '../engine/fx';
import { FSPass, H, Layer2D, W } from '../engine/gl';
import { enter, gstate } from '../engine/kinetic';
import { LEAD, type Line } from '../engine/lyrics';
import { storyClock } from '../engine/motifs';
import { col, css } from '../engine/palette';
import type { PostParams } from '../engine/post';
import { Scene, type Frame } from '../engine/scene';
import { Glyphs3D, tint } from '../engine/text3d';
import { text2D } from '../engine/type2d';
import { clamp, ease, fbm1, keys, lerp, pulse, smoothstep } from '../engine/util';
import { drawScene } from './loop-util';
import { MagicCircle, NB } from './qiita-circle';
import { CardSea, waveH } from './qiita-sea';

const BG = /* glsl */ `
uniform mat4 projInv; uniform mat4 camWorld; uniform float uUnder; uniform float t; uniform float deepK;
void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec4 v4 = projInv * vec4(ndc, 1.0, 1.0);
  vec3 rd = normalize((camWorld * vec4(v4.xyz / v4.w, 0.0)).xyz);
  float h = rd.y;
  float az = atan(rd.x, -rd.z);
  // above: night sky, horizon haze, a cold glow far away, stars
  vec3 sky = mix(vec3(0.007, 0.014, 0.04), vec3(0.0012, 0.0018, 0.006), smoothstep(0.0, 0.45, h));
  sky += vec3(0.02, 0.055, 0.15) * exp(-abs(h) * 16.0);
  vec3 md = normalize(vec3(0.3, 0.05, -1.0));
  float g = max(dot(rd, md), 0.0);
  sky += vec3(0.55, 0.82, 1.0) * smoothstep(0.99985, 0.99992, g) * 1.4 + vec3(0.08, 0.22, 0.5) * pow(g, 60.0) * 0.2 + vec3(0.2, 0.4, 0.8) * pow(g, 900.0) * 0.4;
  vec2 sp = vec2(az, h) * 160.0;
  vec2 id = floor(sp);
  float st = step(0.988, hash12(id)) * smoothstep(0.04, 0.2, h);
  sky += vec3(0.6, 0.75, 1.0) * st * smoothstep(0.35, 0.0, length(fract(sp) - 0.5)) * (0.4 + 0.6 * hash12(id + 7.0));
  // below: the surface glows above, the deep below, slow god rays
  vec3 deep = mix(vec3(0.012, 0.06, 0.14), vec3(0.0008, 0.003, 0.01), smoothstep(0.35, -0.7, h));
  deep += vec3(0.3, 0.65, 1.0) * pow(max(h, 0.0), 2.5) * 0.55;
  float ray = smoothstep(0.35, 1.0, snoise(vec2(az * 7.0 + h * 1.5, t * 0.25))) * smoothstep(-0.3, 0.7, h);
  deep += vec3(0.15, 0.45, 0.95) * ray * 0.14;
  deep *= 1.0 - deepK;
  gl_FragColor = vec4(mix(sky, deep, uUnder), 1.0);
}`;

const ABYSS = /* glsl */ `
uniform vec2 cpos; uniform float glow; uniform float t; uniform float pillar;
void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  vec3 c = mix(vec3(0.0006, 0.002, 0.007), vec3(0.004, 0.016, 0.045), smoothstep(-0.5, 0.6, p.y));
  float az = p.x * 3.0;
  float ray = smoothstep(0.45, 1.0, snoise(vec2(az * 2.5 + p.y * 0.8, t * 0.2))) * smoothstep(-0.2, 0.6, p.y);
  c += vec3(0.08, 0.25, 0.6) * ray * 0.08;
  vec2 q = (vUv - cpos) * vec2(uRes.x / uRes.y, 1.0);
  c += vec3(0.1, 0.55, 1.0) * exp(-length(q * vec2(0.8, 1.6)) * 2.2) * 0.12 * glow;
  // the pillar of light
  c += vec3(0.3, 0.8, 1.4) * exp(-abs(q.x) * 9.0) * smoothstep(-0.25, 0.6, q.y + 0.15) * pillar * 0.35;
  // marine snow drifting up
  for (int L = 0; L < 3; L++) {
    float fl = float(L);
    vec2 g = (vUv * vec2(uRes.x / uRes.y, 1.0)) * (22.0 + fl * 16.0) + vec2(sin(t * 0.3 + fl) * 0.5, -t * (0.25 + 0.15 * fl));
    vec2 id = floor(g); vec2 f = fract(g) - 0.5;
    float h = hash12(id + fl * 31.0);
    if (h > 0.93) {
      vec2 o = (hash22(id) - 0.5) * 0.6;
      c += vec3(0.4, 0.7, 1.0) * smoothstep(0.08, 0.0, length(f - o)) * (0.12 + 0.2 * hash12(id + 2.0)) * (1.0 + glow);
    }
  }
  gl_FragColor = vec4(c, 1.0);
}`;

const DRAIN = /* glsl */ `
uniform float yw; uniform float t;
void main() {
  float wl = yw + 0.015 * sin(vUv.x * 11.0 + t * 7.0) + 0.008 * sin(vUv.x * 29.0 - t * 11.0);
  float below = step(vUv.y, wl);
  float ml = exp(-pow((vUv.y - wl) * 140.0, 2.0));
  vec3 c = vec3(0.01, 0.06, 0.16) * below;
  float a = below * 0.62;
  // drops sliding down the lens above the line
  vec2 g = vec2(vUv.x * 26.0, vUv.y * 9.0 + t * 3.0);
  vec2 id = floor(g); vec2 f = fract(g) - 0.5;
  float h = hash12(id);
  float drop = step(0.82, h) * smoothstep(0.22, 0.12, length((f - (hash22(id) - 0.5) * 0.4) * vec2(1.0, 2.6))) * (1.0 - below) * smoothstep(wl + 0.25, wl, vUv.y);
  c += vec3(0.5, 0.8, 1.0) * (ml * 1.4 + drop * 0.5);
  a = max(a, max(ml * 0.9, drop * 0.5));
  gl_FragColor = vec4(c, a);
}`;

const PILLAR_V = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const PILLAR_F = /* glsl */ `
uniform float k; uniform float t; varying vec2 vUv;
void main() {
  float a = pow(1.0 - vUv.y, 2.2) * k;
  float s = 0.75 + 0.25 * sin(vUv.x * 62.83 + t * 6.0) * sin(vUv.y * 20.0 - t * 9.0);
  gl_FragColor = vec4(vec3(0.25, 0.8, 1.5) * a * s, 1.0);
}`;

export default class Qiita extends Scene {
  hud = new Layer2D();
  // S1/S2
  sea = new THREE.Scene();
  seaCam = new THREE.PerspectiveCamera(50, W / H, 0.05, 220);
  bg!: FSPass;
  cards!: CardSea;
  L16!: Line;
  L17!: Line;
  rowA!: Glyphs3D;
  rowB!: Glyphs3D;
  splash: Burst[] = [];
  bubbles!: THREE.Points;
  bubblePos!: Float32Array;
  // S3
  deep = new THREE.Scene();
  deepCam = new THREE.PerspectiveCamera(46, W / H, 0.1, 200);
  drain = new FSPass(DRAIN, { yw: { value: 1 }, t: { value: 0 } }, { transparent: true, blending: THREE.NormalBlending });
  abyss = new FSPass(ABYSS, { cpos: { value: new THREE.Vector2(0.5, 0.35) }, glow: { value: 0 }, t: { value: 0 }, pillar: { value: 0 } });
  circle = new MagicCircle(6);
  pillar!: THREE.Mesh;
  pillarMat!: THREE.ShaderMaterial;
  sparks!: Burst;
  rowC!: Glyphs3D;
  rowD!: Glyphs3D;
  cuts: number[] = [];

  async init() {
    const ly = this.ctx.lyrics;
    this.L16 = ly.get('Qiitaの海はもう泳ぎ疲れた');
    this.L17 = ly.get('英語のドキュメントは呪文みたい');
    const w16 = this.L16.words, w17 = this.L17.words;
    this.cuts = [this.ctx.start, w16[3]!.start - LEAD, this.L17.start - LEAD, this.ctx.end];
    // ---- sea
    this.bg = new FSPass(BG, {
      projInv: { value: this.seaCam.projectionMatrixInverse }, camWorld: { value: this.seaCam.matrixWorld },
      uUnder: { value: 0 }, t: { value: 0 }, deepK: { value: 0 },
    });
    this.cards = new CardSea({ cols: 46, rows: 68, sx: 2.3, sz: 1.28, z0: 8 });
    this.sea.add(this.cards.mesh);
    this.rowA = new Glyphs3D([...w16[0]!.chars, ...w16[1]!.chars, ...w16[2]!.chars], {
      font: 'sans9', size: 1.15, color: col('bone'), depthTest: true, outlineWidth: '4%', outlineColor: col('ink'), outlineBlur: '16%',
    });
    this.rowA.group.position.set(0, 0, -7.5);
    this.sea.add(this.rowA.group);
    for (const it of this.rowA.items) {
      const b = new Burst(40, { seed: 11 + it.gi, speed: [1.5, 5], size: [0.035, 0.1], life: [0.35, 0.8], drag: 2.2, gravity: [0, -9, 0], dir: [0, 1, 0], cone: 0.9, spread3d: true, color: col('ice', 2.2), color2: col('cyan', 1.4) });
      this.splash.push(b);
      this.sea.add(b.points);
    }
    this.rowB = new Glyphs3D(w16[3]!.chars, { font: 'sans9', size: 1.3, color: col('bone'), outlineWidth: '4%', outlineColor: col('ink'), outlineBlur: '16%', tracking: 0.04 });
    this.rowB.group.position.set(0, 0, -6.5);
    this.sea.add(this.rowB.group);
    // bubbles (positions computed per frame from the glyph paths)
    const NBUB = this.rowB.items.length * 26;
    this.bubblePos = new Float32Array(NBUB * 3);
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(this.bubblePos, 3));
    this.bubbles = new THREE.Points(bg, new THREE.ShaderMaterial({
      vertexShader: `uniform float sz; varying float vS; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vS = 0.6 + 0.4 * fract(sin(dot(position.xy, vec2(12.9898, 78.233))) * 43758.5453); gl_PointSize = sz * vS * 300.0 / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vS; void main() { vec2 q = gl_PointCoord - 0.5; float d = length(q); float ring = smoothstep(0.5, 0.42, d) * (0.35 + 0.65 * smoothstep(0.3, 0.45, d)); float hl = smoothstep(0.16, 0.0, length(q - vec2(-0.14, -0.14))); gl_FragColor = vec4(vec3(0.55, 0.85, 1.2) * (ring + hl * 0.8) * 0.9, 1.0); }`,
      uniforms: { sz: { value: 0.16 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.bubbles.frustumCulled = false;
    this.sea.add(this.bubbles);
    // ---- deep
    this.deep.add(this.circle.mesh);
    this.pillarMat = new THREE.ShaderMaterial({ vertexShader: PILLAR_V, fragmentShader: PILLAR_F, uniforms: { k: { value: 0 }, t: { value: 0 } }, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.25, 12, 48, 1, true), this.pillarMat);
    this.pillar.position.y = 6;
    this.pillar.renderOrder = 3;
    this.deep.add(this.pillar);
    this.sparks = new Burst(220, { seed: 5, speed: [1.5, 7], size: [0.04, 0.12], life: [0.7, 1.6], drag: 1.6, gravity: [0, 2.0, 0], dir: [0, 1, 0], cone: 0.7, spread3d: true, color: col('ice', 3), color2: col('cyan', 2) });
    this.deep.add(this.sparks.points);
    this.rowC = new Glyphs3D([...w17[0]!.chars, ...w17[1]!.chars], { font: 'sans9', size: 1.0, color: col('bone'), outlineWidth: '5%', outlineColor: col('ink'), outlineBlur: '20%', tracking: 0.02 });
    this.deep.add(this.rowC.group);
    this.rowD = new Glyphs3D(w17[2]!.chars, { font: 'sans9', size: 1.75, color: col('bone'), outlineWidth: '5%', outlineColor: col('ink'), outlineBlur: '14%', tracking: 0.06 });
    this.deep.add(this.rowD.group);
  }

  // ------------------------------------------------------------------ S1 + S2: the sea
  private renderSea(f: Frame, out: THREE.WebGLRenderTarget, under: boolean): PostParams {
    const { renderer } = this.ctx;
    const t = f.t;
    const [t0, c1, c2] = this.cuts as [number, number, number, number];
    const w = this.L16.words.map((x) => x.start - LEAD);
    const oE = ease.outExpo;
    const amp = 0.5 + 0.32 * pulse(t, this.L16.words[2]!.start - 0.05, 0.12, 0.7);
    const cam = this.seaCam;
    if (!under) {
      // breach at the cut, frame Qiitaの low over the waves, crane up on 海は, push on もう, dip at the end
      const cx = keys(t, [[t0, -2.4], [w[1]! - 0.02, -2.0], [w[1]! + 0.32, 0.5, oE], [w[2]! - 0.02, 0.55], [w[2]! + 0.3, 0.9, oE], [c1, 1.0]]);
      const cy = keys(t, [[t0, 0.95], [t0 + 0.3, 1.15, oE], [w[1]! - 0.02, 1.25], [w[1]! + 0.32, 2.25, oE], [w[2]! - 0.02, 2.3], [w[2]! + 0.3, 1.9, oE], [c1 - 0.14, 1.85], [c1, 1.1, ease.inCubic]]);
      const cz = keys(t, [[t0, -1.2], [w[1]! - 0.02, -1.9], [w[1]! + 0.32, -0.1, oE], [w[2]! - 0.02, -0.35], [w[2]! + 0.3, -1.5, oE], [c1, -2.2]]);
      const lx = keys(t, [[t0, -2.4], [w[1]! - 0.02, -2.2], [w[1]! + 0.32, 0.3, oE], [c1, 0.5]]);
      const ly = keys(t, [[t0, 1.3], [t0 + 0.3, 1.15, oE], [w[1]! - 0.02, 1.15], [w[1]! + 0.32, 0.75, oE], [c1 - 0.14, 0.8], [c1, -1.5, ease.inCubic]]);
      const roll = keys(t, [[t0, 0.05], [w[1]! - 0.02, 0.03], [w[1]! + 0.32, -0.05, ease.outBack], [w[2]! - 0.02, -0.05], [w[2]! + 0.3, 0.04, ease.outBack], [c1, 0.0]]);
      const sh = 0.02 + 0.04 * f.a.kick;
      cam.position.set(cx + fbm1(t * 1.6, 2) * sh, cy + fbm1(t * 1.8, 3) * sh, cz);
      cam.up.set(Math.sin(roll), Math.cos(roll), 0);
      cam.lookAt(lx, ly, -7.5);
    } else {
      // below the surface, looking up a little; we sink with the tired glyphs
      const e = t - c1;
      const cy = -2.0 - 0.85 * e - 0.25 * e * e;
      cam.position.set(fbm1(t * 0.9, 5) * 0.08, cy, -0.6 + fbm1(t * 0.7, 6) * 0.08);
      cam.up.set(0.03, 1, 0);
      cam.lookAt(0, cy + 1.1 - 0.35 * e, -6.5);
    }
    cam.updateMatrixWorld();
    const camUnder = cam.position.y < waveH(cam.position.x, cam.position.z, t, amp) ? 1 : 0;
    this.bg.u.uUnder!.value = camUnder;
    this.bg.u.t!.value = t;
    this.bg.u.deepK!.value = under ? clamp((t - c1) / 1.4) * 0.6 : 0;
    this.bg.render(renderer, out);
    const fog = camUnder ? new THREE.Color(0.006, 0.028, 0.07) : new THREE.Color(0.012, 0.03, 0.085);
    this.cards.update(t, cam, { amp, gain: camUnder ? 0.9 : 1.0, fog, fogK: camUnder ? 0.14 : 0.04, under: camUnder });

    // row A: each character surfaces through the cards on its mora and rides the swell
    this.rowA.group.visible = !under;
    this.rowA.items.forEach((it, i) => {
      const gx = it.x, gz = -7.5;
      const s = gstate(it, this.L16, t, 'char', 0);
      const surf = waveH(gx, gz, t, amp);
      const e = s.since;
      const up = s.on ? ease.outBack(clamp(e / 0.32)) : 0;
      const y = surf - 1.1 + 1.95 * up + 0.08 * Math.sin(t * 2.2 + i);
      it.mesh.position.set(gx, y, 0);
      const sx = (waveH(gx + 0.3, gz, t, amp) - waveH(gx - 0.3, gz, t, amp)) / 0.6;
      it.mesh.rotation.set(0, 0, -sx * 0.5);
      it.mesh.visible = s.on;
      const k = enter('pop', e, it.gi, 0.6);
      it.mesh.scale.setScalar(s.on ? 0.6 + 0.4 * k.sc : 1);
      tint(it.mesh, col('bone', 1.25).multiplyScalar(1 + (k.bright - 1) * 0.8), 1);
      this.splash[i]!.update(e, [gx, surf + 0.25, gz], 1);
      this.splash[i]!.points.visible = !under && e > 0 && e < 0.9;
    });

    // row B: 泳ぎ疲れた sinks, tired
    this.rowB.group.visible = under;
    let nb = 0;
    this.rowB.items.forEach((it, i) => {
      const s = gstate(it, this.L16, t, 'line', 0);
      const e = Math.max(0, s.since);
      const y0 = -1.15 + 0.06 * Math.sin(t * 1.7 + i * 1.3);
      const sink = s.on ? 0.55 * e + 0.85 * e * e : 0;
      const sway = s.on ? 0.14 * Math.sin(e * 3.2 + i) * clamp(e * 2) : 0;
      it.mesh.position.set(it.x + sway, y0 - sink, 0.1 * Math.sin(i));
      it.mesh.rotation.set(0, 0, (i % 2 ? -1 : 1) * 0.32 * ease.outCubic(clamp(e / 1.1)) * (s.on ? 1 : 0));
      if (s.on) {
        const k = enter('stamp', e, it.gi, 0.5);
        it.mesh.scale.setScalar(k.sc);
        tint(it.mesh, col('bone', 1.2).multiplyScalar(k.bright).lerp(col('ice', 0.9), clamp(e / 1.2) * 0.4), Math.max(k.alpha, 0.5));
      } else {
        it.mesh.scale.setScalar(1);
        tint(it.mesh, col('mist', 0.8), 0.42);
      }
      // bubbles trail upward from each sinking glyph
      for (let b = 0; b < 26; b++) {
        const birth = b * 0.045;
        const age = e - birth;
        const p = this.bubblePos;
        if (!s.on || age < 0) { p[nb * 3] = 0; p[nb * 3 + 1] = -999; p[nb * 3 + 2] = 0; nb++; continue; }
        const sinkAtBirth = 0.55 * birth + 0.85 * birth * birth;
        const ox = (Math.sin(b * 12.9898 + i * 7.1) * 0.5) * 0.9, oz = Math.cos(b * 4.1 + i) * 0.3;
        p[nb * 3] = it.x + ox + 0.08 * Math.sin(age * 6 + b);
        p[nb * 3 + 1] = y0 - sinkAtBirth + 0.3 + age * (0.9 + 0.4 * ((b * 7) % 3));
        p[nb * 3 + 2] = -6.5 + oz;
        nb++;
      }
    });
    this.bubbles.visible = under;
    (this.bubbles.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    drawScene(renderer, this.sea, cam, out);
    // surfacing: the water drains off the lens (continuity with inter1's sink)
    if (!under && t < t0 + 0.2) {
      this.drain.u.yw!.value = 1.04 - 1.25 * ease.inOutSine(clamp((t - t0) / 0.17));
      this.drain.u.t!.value = t;
      this.drain.render(renderer, out);
    }
    const cut = Math.exp(-(t - (under ? c1 : t0)) / 0.1);
    void c2;
    return {
      bloom: 0.8, bloomThreshold: 0.85, ca: 1.6, vignette: 0.45, zoom: 1 + 0.035 * cut,
      shake: [fbm1(t * 30, 1) * 3 * f.a.kick, fbm1(t * 30, 2) * 3 * f.a.kick], saturation: under ? 0.95 : 1,
    };
  }

  // ------------------------------------------------------------------ S3: the magic circle
  private renderDeep(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    const { renderer } = this.ctx;
    const t = f.t, T = t + LEAD;
    const [, , c2, end] = this.cuts as [number, number, number, number];
    const w = this.L17.words;
    const wJ = w[2]!.start - LEAD; // 呪
    const oE = ease.outExpo;
    // camera: look down into the circle, orbit; crane up when the spell is cast
    const az = keys(t, [[c2, -0.55], [c2 + 0.4, -0.38, oE], [w[1]!.start - LEAD, -0.3], [w[1]!.start - LEAD + 0.35, 0.05, oE], [wJ, 0.12], [wJ + 0.5, 0.32, oE], [end, 0.4]]);
    const rad = keys(t, [[c2, 8.2], [c2 + 0.4, 9.6, oE], [wJ, 10.2], [wJ + 0.5, 11.8, oE], [end, 12.3]]);
    const hgt = keys(t, [[c2, 9.5], [c2 + 0.4, 7.4, oE], [wJ, 7.0], [wJ + 0.5, 4.6, oE], [end, 4.4]]);
    const lookY = keys(t, [[c2, 0], [wJ, 0.6], [wJ + 0.5, 2.2, oE], [end, 2.4]]);
    const cam = this.deepCam;
    cam.position.set(Math.sin(az) * rad, hgt, Math.cos(az) * rad);
    cam.up.set(0, 1, 0);
    cam.lookAt(0, lookY, 0);
    cam.updateMatrixWorld();
    // circle: one ring per sung mora (英 語 の ド キ メ ン ト は 呪), spell speeds it up
    const cs = this.L17.chars;
    const order = [6, 5, 4, 3, 2, 2, 1, 1, 1, 1, 0];
    const rv = new Array(NB).fill(0);
    for (let i = 0; i < Math.min(cs.length, order.length); i++) {
      const c = cs[i]!;
      const b = order[i]!;
      const p = clamp((T - c.start) / Math.max(0.12, c.end - c.start));
      rv[b] = Math.max(rv[b], b === 1 ? clamp((T - cs[6]!.start) / Math.max(0.2, cs[9]!.end - cs[6]!.start)) : p);
    }
    const spell = smoothstep(wJ - 0.02, wJ + 0.25, t);
    const kick = f.a.kick;
    for (let b = 0; b < NB; b++) {
      this.circle.rev[b] = b === 0 ? spell : rv[b];
      const dir = b % 2 ? 1 : -1;
      this.circle.rot[b] = dir * (0.12 + 0.05 * b) * (t - c2) * (1 + 2.5 * spell) + dir * 0.6 * ease.outExpo(clamp((t - wJ) / 0.6)) * (b + 1) * 0.3;
      this.circle.gain[b] = (1.2 + 0.8 * kick + 1.8 * spell * (b === 0 ? 2 : 1)) * (0.75 + 0.25 * Math.sin(t * 7 + b));
    }
    this.circle.mat.uniforms.redSeg!.value = smoothstep(c2 + 0.6, c2 + 1.2, t);
    this.circle.mesh.position.y = 0;
    // pillar + sparks on 呪
    const pe = t - wJ;
    this.pillarMat.uniforms.k!.value = pe > 0 ? (1 - Math.exp(-pe / 0.05)) * (0.28 + 0.5 * Math.exp(-pe / 0.25)) : 0;
    this.pillarMat.uniforms.t!.value = t;
    this.pillar.scale.set(0.4 + 0.6 * ease.outExpo(clamp(pe / 0.3)), 1, 0.4 + 0.6 * ease.outExpo(clamp(pe / 0.3)));
    this.pillar.visible = pe > 0;
    this.sparks.update(pe, [0, 0.2, 0]);
    // background, lit by the circle
    const v = new THREE.Vector3(0, 0, 0).project(cam);
    this.abyss.u.cpos!.value.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
    this.abyss.u.glow!.value = 0.5 + 1.5 * spell + rv.reduce((a, b) => a + b, 0) / NB;
    this.abyss.u.t!.value = t;
    this.abyss.u.pillar!.value = this.pillarMat.uniforms.k!.value;
    this.abyss.render(renderer, out);

    // rows face the camera
    const q = cam.quaternion;
    this.rowC.group.quaternion.copy(q);
    this.rowC.group.position.set(0, keys(t, [[c2, 3.6], [wJ, 3.9], [wJ + 0.5, 5.3, oE], [end, 5.4]]), 0);
    this.rowC.items.forEach((it) => {
      const s = gstate(it, this.L17, t, 'line', 0.3);
      it.mesh.visible = s.vis;
      if (!s.on) { tint(it.mesh, col('steel'), 0.45 * clamp(s.e / 0.15)); it.mesh.scale.setScalar(1); return; }
      const k = enter('slam', s.since, it.gi, 0.6);
      it.mesh.scale.setScalar(k.sc);
      tint(it.mesh, col('bone', 1.3).multiplyScalar(k.bright), Math.max(k.alpha, 0.45));
    });
    this.rowD.group.quaternion.copy(q);
    this.rowD.group.position.set(0, keys(t, [[c2, 0.9], [wJ, 1.0], [wJ + 0.5, 2.6, oE], [end, 2.8]]), 0);
    this.rowD.items.forEach((it) => {
      const s = gstate(it, this.L17, t, 'word', 0.35);
      it.mesh.visible = s.vis;
      const e = s.since;
      if (!s.on) {
        it.mesh.position.set(it.x, -it.y - 0.6, 0);
        it.mesh.scale.setScalar(0.9);
        tint(it.mesh, col('steel'), 0.35 * clamp(s.e / 0.15));
        it.mesh.outlineOpacity = 0;
        return;
      }
      const rise = ease.outBack(clamp(e / 0.4));
      it.mesh.position.set(it.x, -it.y - 0.6 + 0.6 * rise + 0.05 * Math.sin(t * 3 + it.gi), 0);
      const k = enter('pop', e, it.gi, 0.8);
      it.mesh.scale.setScalar(0.9 + 0.1 * k.sc);
      const flick = 0.9 + 0.1 * Math.sin(t * 23 + it.gi * 2.1);
      tint(it.mesh, col('bone', 1.45 * flick).lerp(col('ice', 1.6), 0.4).multiplyScalar(1 + (k.bright - 1) * 1.2), 1);
      it.mesh.outlineOpacity = 0.85;
    });
    drawScene(renderer, this.deep, cam, out);
    const cut = Math.exp(-(t - c2) / 0.1);
    const hit = pe > 0 ? Math.exp(-pe / 0.08) : 0;
    return {
      bloom: 1.0 + 0.6 * spell, bloomThreshold: 0.8, bloomRadius: 0.9, ca: 1.5 + 2 * hit, vignette: 0.5,
      zoom: 1 + 0.035 * cut + 0.05 * hit, flash: 0.25 * hit, flashColor: [0.5, 0.85, 1],
      shake: [fbm1(t * 30, 3) * (2 + 10 * hit), fbm1(t * 30, 4) * (2 + 10 * hit)],
    };
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    const t = f.t;
    const [, c1, c2] = this.cuts as [number, number, number, number];
    const pp = t < c2 ? this.renderSea(f, out, t >= c1) : this.renderDeep(f, out);
    // HUD: the clock runs fast in here (time dissolves in the sea of articles)
    const ctx = this.hud.clear();
    text2D(ctx, storyClock(t), 104, 92, 'dot', 30, css('mist', 0.85), { tracking: 0.08 });
    const n = Math.floor(lerp(12480, 98000, clamp((t - this.ctx.start) / (this.ctx.end - this.ctx.start))));
    const label = t < c2 ? `検索結果  ${n.toLocaleString('en-US')} 件` : 'API Reference > fetch()  [EN]';
    text2D(ctx, label, W - 104, 92, 'dot', 24, css('steel', 0.95), { align: 'right' });
    this.ctx.comp.draw(this.ctx.renderer, this.hud.upload(), out);
    return pp;
  }
}
