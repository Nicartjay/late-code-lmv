// loop / shot A — L8 さっきからずっと同じ場所: an infinite corridor of code that loops
// seamlessly (the walls repeat every P units, so the 現在地 sign comes by again).
// The camera snaps forward word by word; each word hangs in the corridor like a sign.
import * as THREE from 'three';
import { FSPass, H, W } from '../engine/gl';
import { LEAD, type Line } from '../engine/lyrics';
import { BUG_ERROR, BUG_LINE, CODE, CODE_POOL } from '../engine/motifs';
import { col } from '../engine/palette';
import type { Ctx, Frame } from '../engine/scene';
import { Glyphs3D, text3d, tint } from '../engine/text3d';
import { clamp, ease, fbm1, keys, lerp, mulberry32, smoothstep } from '../engine/util';
import type { PostParams } from '../engine/post';
import { canvasTexture, codeWidth, drawCode, drawScene, kar } from './loop-util';
import { font } from '../engine/fonts';
import type { Text } from 'troika-three-text';

const A = 3.4; // half width
const B = 2.1; // half height
const P = 16; // wall texture period (world units along the corridor)
const D = 4; // rib spacing

function wallTexture() {
  return canvasTexture(4096, 1024, (c) => {
    c.fillStyle = '#04060d';
    c.fillRect(0, 0, 4096, 1024);
    const rnd = mulberry32(31);
    const pool = [...CODE.filter((l) => l.trim().length > 2), ...CODE_POOL];
    let x = 36, k = 0;
    while (x < 4096 - 400) {
      const w = Math.min(4096 - 36 - x, 560 + Math.floor(rnd() * 380));
      const y0 = 70 + Math.floor(rnd() * 90), y1 = 1024 - 70 - Math.floor(rnd() * 90);
      const bug = k === 2;
      const h = y1 - y0;
      // panel
      c.fillStyle = bug ? '#0f0b16' : '#0a0e1b';
      c.beginPath(); c.roundRect(x, y0, w, h, 10); c.fill();
      c.strokeStyle = bug ? 'rgba(255,43,78,0.55)' : 'rgba(85,96,126,0.45)'; c.lineWidth = 2; c.stroke();
      c.fillStyle = '#121831';
      c.beginPath(); c.roundRect(x, y0, w, 38, [10, 10, 0, 0]); c.fill();
      c.font = font('code4', 19); c.fillStyle = '#9aa6c2'; c.textBaseline = 'middle';
      const names = ['night.ts', 'debug.ts', 'loop.ts', 'search.ts', 'coffee.ts', 'retry.ts', 'index.ts'];
      c.fillText(bug ? 'night.ts' : names[k % names.length]!, x + 20, y0 + 19);
      ['#ff2b4e', '#ffb648', '#55607e'].forEach((cc, i) => { c.fillStyle = cc; c.beginPath(); c.arc(x + w - 24 - i * 22, y0 + 19, 6, 0, Math.PI * 2); c.fill(); });
      const px = 23, lh = 33;
      const n = Math.floor((h - 52) / lh);
      let ln = 1 + Math.floor(rnd() * 40);
      for (let i = 0; i < n; i++) {
        const y = y0 + 38 + 18 + i * lh;
        let line: string;
        if (bug) line = CODE[i % CODE.length]!;
        else line = rnd() < 0.12 ? '' : (rnd() < 0.5 ? '  ' : rnd() < 0.5 ? '    ' : '') + pool[Math.floor(rnd() * pool.length)]!;
        const isBug = bug && i % CODE.length === BUG_LINE;
        if (isBug) { c.fillStyle = 'rgba(255,43,78,0.16)'; c.fillRect(x + 2, y - lh / 2, w - 4, lh); }
        else if (rnd() < 0.05) { c.fillStyle = 'rgba(47,107,255,0.14)'; c.fillRect(x + 2, y - lh / 2, w - 4, lh); }
        c.font = font('mono4', 18); c.fillStyle = isBug ? '#ff2b4e' : '#3a4360'; c.textAlign = 'right';
        c.fillText(String(ln++), x + 46, y); c.textAlign = 'left';
        c.save(); c.beginPath(); c.rect(x + 56, y - lh, w - 70, lh * 2); c.clip();
        drawCode(c, line, x + 60, y, px, { alpha: 0.92 });
        c.restore();
        if (isBug) {
          const sx = x + 60 + codeWidth(line.slice(0, line.indexOf(';')), px), sw = px * 0.6;
          c.strokeStyle = '#ff2b4e'; c.lineWidth = 2.5; c.beginPath();
          for (let q = -6; q <= sw + 6; q += 2) c.lineTo(sx + q, y + 14 + Math.sin(q * 0.6) * 2.5);
          c.stroke();
          c.fillStyle = 'rgba(30,8,16,0.95)'; c.strokeStyle = '#ff2b4e';
          const tw = codeWidth(BUG_ERROR, 17) + 28;
          c.beginPath(); c.roundRect(sx - 10, y + 22, tw, 32, 6); c.fill(); c.stroke();
          drawCode(c, BUG_ERROR, sx + 4, y + 38, 17, { color: '#ff8a9c' });
        }
      }
      x += w + 46 + Math.floor(rnd() * 70);
      k++;
    }
  }, { repeat: true, aniso: 16 });
}

const FRAG = /* glsl */ `
uniform mat4 projInv; uniform mat4 camWorld; uniform vec3 camPos;
uniform sampler2D wall; uniform float t; uniform float ribGlow; uniform float pulseS; uniform float pulseA;
uniform float wallGain; uniform float tube;
const float A = ${A.toFixed(2)}; const float B = ${B.toFixed(2)}; const float P = ${P.toFixed(1)}; const float D = ${D.toFixed(1)};
void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec4 v4 = projInv * vec4(ndc, 1.0, 1.0);
  vec3 rd = normalize((camWorld * vec4(v4.xyz / v4.w, 0.0)).xyz);
  vec3 ro = camPos;
  float tx = ((rd.x > 0.0 ? A : -A) - ro.x) / rd.x;
  float ty = ((rd.y > 0.0 ? B : -B) - ro.y) / rd.y;
  float th = min(tx, ty);
  vec3 p = ro + rd * th;
  float s = -p.z;
  float fw = fwidth(s);
  vec3 c;
  float edge;
  if (tx < ty) {
    bool right = rd.x > 0.0;
    float u = (right ? -s : s) / P + (right ? 0.5 : 0.0);
    float v = (p.y + B) / (2.0 * B);
    c = texture(wall, vec2(u, v)).rgb * wallGain;
    // panel glow (screens light the corridor a little)
    c += vec3(0.002, 0.004, 0.012);
    edge = B - abs(p.y);
  } else if (rd.y > 0.0) {
    // ceiling: two rows of light tubes
    float dx = abs(abs(p.x) - 1.25);
    float seg = smoothstep(0.02, 0.0, abs(fract(s / 2.0) - 0.5) - 0.38);
    float tb = smoothstep(0.07, 0.03, dx) * seg;
    c = vec3(0.0025, 0.003, 0.007) + vec3(0.78, 0.9, 1.0) * tb * tube + C_BLUE * exp(-dx * 5.0) * 0.012 * tube;
    edge = A - abs(p.x);
  } else {
    // floor: dark glossy, reflected tubes + lane lines
    float dx = abs(abs(p.x) - 1.25);
    float seg = smoothstep(0.3, 0.0, abs(fract(s / 2.0) - 0.5) - 0.3);
    c = vec3(0.0012, 0.0015, 0.0035) + vec3(0.5, 0.62, 1.0) * exp(-dx * 7.0) * seg * 0.05 * tube;
    float lane = smoothstep(0.012 + fw * 0.5, 0.0, abs(abs(p.x) - 2.4));
    c += vec3(0.02, 0.025, 0.04) * lane;
    edge = A - abs(p.x);
  }
  // ribs (door frames) every D
  float dr = abs(s - D * floor(s / D + 0.5));
  float rib = smoothstep(0.035 + fw * 1.2, 0.0, dr);
  c += C_CYAN * rib * ribGlow * (0.6 + 0.4 * step(0.0, rd.y));
  // corner lines
  c += C_BLUE * smoothstep(0.03 + fw * 0.6, 0.0, edge) * 0.55;
  // kick pulse racing down the corridor
  float dp = s - pulseS;
  c += C_CYAN * exp(-dp * dp * 10.0) * pulseA * 0.8;
  // fog to a cold far end
  float fog = exp(-max(th - 2.5, 0.0) * 0.085);
  c = c * fog + C_BLUE * 0.006 * (1.0 - fog);
  // vanishing point glow
  vec3 fwd = normalize((camWorld * vec4(0.0, 0.0, -1.0, 0.0)).xyz);
  float vp = max(dot(rd, vec3(0.0, 0.0, -1.0)), 0.0);
  c += C_BLUE * pow(vp, 160.0) * 0.08 + C_CYAN * pow(vp, 900.0) * 0.12;
  gl_FragColor = vec4(c, 1.0);
}`;

interface Board { g: Glyphs3D; line?: Line; s: number; x: number; y: number; ghost: boolean; wi: number }

export class Corridor {
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(62, W / H, 0.05, 400);
  bg!: FSPass;
  boards: Board[] = [];
  signs: { grp: THREE.Group; pin: Text }[] = [];
  line!: Line;
  keysS: [number, number, ((x: number) => number)?][] = [];
  keysX: [number, number, ((x: number) => number)?][] = [];
  keysY: [number, number, ((x: number) => number)?][] = [];
  keysR: [number, number, ((x: number) => number)?][] = [];

  constructor(private ctx: Ctx, private t0: number, private t1: number) {}

  async init() {
    const tex = wallTexture();
    this.bg = new FSPass(FRAG, {
      projInv: { value: this.cam.projectionMatrixInverse }, camWorld: { value: this.cam.matrixWorld }, camPos: { value: this.cam.position },
      wall: { value: tex }, t: { value: 0 }, ribGlow: { value: 1 }, pulseS: { value: -100 }, pulseA: { value: 0 }, wallGain: { value: 1 }, tube: { value: 1 },
    });
    const L = this.ctx.lyrics.get('さっきからずっと同じ場所');
    this.line = L;
    // boards: [s, x, y, size]
    const lay: [number, number, number, number][] = [[12, 0, 0.25, 1.15], [19, -0.85, -0.3, 1.5], [26, 0.85, 0.35, 1.75], [33, 0, -0.05, 2.05]];
    L.words.forEach((w, wi) => {
      const [s, x, y, size] = lay[wi]!;
      const g = new Glyphs3D(w.chars, { font: 'sans9', size, color: col('bone'), outlineWidth: '5%', outlineColor: col('ink'), outlineBlur: '18%', outlineOpacity: 0.9, tracking: 0.02 });
      g.group.position.set(x, y, -s);
      this.scene.add(g.group);
      this.boards.push({ g, line: L, s, x, y, ghost: false, wi });
    });
    // the same place again: one period after the first word, the first word hangs there again
    {
      const [s, x, y, size] = lay[0]!;
      const g = new Glyphs3D(L.words[0]!.w, { font: 'sans9', size, color: col('steel'), tracking: 0.02 });
      g.group.position.set(x, y, -(s + 2 * P));
      this.scene.add(g.group);
      this.boards.push({ g, s: s + 2 * P, x, y, ghost: true, wi: 0 });
    }
    // 現在地 signs, once per period (identical: we pass the same one again)
    for (let k = 0; k < 4; k++) {
      const grp = new THREE.Group();
      const back = new THREE.Mesh(new THREE.PlaneGeometry(2.05, 0.66), new THREE.MeshBasicMaterial({ color: col('ink2'), transparent: true, opacity: 0.95, depthTest: false, depthWrite: false }));
      back.renderOrder = 5;
      const rim = new THREE.Mesh(new THREE.PlaneGeometry(2.13, 0.74), new THREE.MeshBasicMaterial({ color: col('cyan', 1.6), transparent: true, opacity: 1, depthTest: false, depthWrite: false }));
      rim.renderOrder = 4;
      grp.add(rim, back);
      for (const sx of [-0.8, 0.8]) {
        const wire = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.6), new THREE.MeshBasicMaterial({ color: col('steel'), depthTest: false, transparent: true }));
        wire.position.set(sx, 0.63, 0); wire.renderOrder = 3; grp.add(wire);
      }
      const a = text3d('現在地', { font: 'sans9', size: 0.25, color: col('bone', 1.2), anchorX: 'left', renderOrder: 12 });
      a.position.set(-0.68, 0.07, 0.001);
      const b = text3d('night.ts : 3行目', { font: 'code7', size: 0.13, color: col('cyan', 1.4), anchorX: 'left', renderOrder: 12 });
      b.position.set(-0.68, -0.18, 0.001);
      const arrow = text3d('→', { font: 'sans9', size: 0.36, color: col('bone', 1.2), renderOrder: 12 });
      arrow.position.set(0.74, 0, 0.001);
      const pin = text3d('●', { font: 'sans9', size: 0.2, color: col('red', 2), renderOrder: 12 });
      pin.position.set(-0.86, 0.07, 0.001);
      grp.add(a, b, arrow, pin);
      grp.position.set(1.55, B - 0.62, -(9 + k * P));
      this.scene.add(grp);
      this.signs.push({ grp, pin });
    }
    // camera keys (word onsets, from the lyric)
    const tw = L.words.map((w) => w.start - LEAD);
    const bs = this.boards.map((b) => b.s);
    const oE = ease.outExpo, iO = ease.inOutSine;
    this.keysS = [
      [this.t0, bs[0]! - 7.4], [tw[0]!, bs[0]! - 6.4, ease.outCubic], [tw[0]! + 0.18, bs[0]! - 5.5, oE],
      [tw[1]! - 0.05, bs[0]! - 3.9, iO], [tw[1]! + 0.2, bs[1]! - 5.8, oE],
      [tw[2]! - 0.05, bs[1]! - 4.3, iO], [tw[2]! + 0.2, bs[2]! - 5.7, oE],
      [tw[3]! - 0.05, bs[2]! - 4.4, iO], [tw[3]! + 0.22, bs[3]! - 6.6, oE],
      [this.t1, bs[3]! - 4.9, ease.outQuad],
    ];
    const lat = (i: number) => this.boards[i]!;
    const xy = (f: (b: Board) => number, amt: number): [number, number, ((x: number) => number)?][] => [
      [this.t0, f(lat(0)) * amt], [tw[1]! - 0.05, f(lat(0)) * amt], [tw[1]! + 0.25, f(lat(1)) * amt, oE],
      [tw[2]! - 0.05, f(lat(1)) * amt], [tw[2]! + 0.25, f(lat(2)) * amt, oE],
      [tw[3]! - 0.05, f(lat(2)) * amt], [tw[3]! + 0.25, f(lat(3)) * amt, oE],
    ];
    this.keysX = xy((b) => b.x, 0.45);
    this.keysY = xy((b) => b.y, 0.4);
    this.keysR = [
      [this.t0, 0.05], [tw[1]! - 0.05, 0.035], [tw[1]! + 0.3, -0.075, ease.outBack], [tw[2]! - 0.05, -0.06],
      [tw[2]! + 0.3, 0.07, ease.outBack], [tw[3]! - 0.05, 0.055], [tw[3]! + 0.3, -0.012, ease.outBack], [this.t1, 0.0],
    ];
  }

  private camAt(t: number) {
    return { s: keys(t, this.keysS), x: keys(t, this.keysX), y: keys(t, this.keysY), r: keys(t, this.keysR) };
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    const { renderer, audio } = this.ctx;
    const t = f.t;
    const c = this.camAt(t);
    const h = 1 / 120;
    const vel = (this.camAt(t + h).s - this.camAt(t - h).s) / (2 * h);
    const shake = 0.03;
    this.cam.position.set(c.x + fbm1(t * 1.7, 3) * shake, c.y + fbm1(t * 1.9, 7) * shake, -c.s);
    this.cam.rotation.set(fbm1(t * 1.1, 11) * 0.012, fbm1(t * 1.3, 13) * 0.012, c.r);
    this.cam.fov = 60 + clamp(vel / 26) * 16;
    this.cam.updateProjectionMatrix();
    this.cam.updateMatrixWorld();
    // kick pulse
    const kt = audio.lastOnset('kick', t, 0.35);
    const ke = t - kt;
    const kick = f.a.kick;
    const u = this.bg.u;
    u.t!.value = t;
    u.pulseS!.value = ke < 2 ? this.camAt(kt).s + 3.5 + ke * 34 : -100;
    u.pulseA!.value = ke < 2 ? Math.exp(-ke * 2.2) : 0;
    u.ribGlow!.value = 0.9 + 1.6 * kick + clamp(vel / 30) * 0.8;
    u.tube!.value = 1.6 + 0.8 * kick;
    this.bg.render(renderer, out);

    // boards
    for (const b of this.boards) {
      const d = b.s - c.s;
      const near = smoothstep(0.7, 2.4, d);
      for (const it of b.g.items) {
        if (b.ghost) {
          it.mesh.visible = d > 0.5;
          tint(it.mesh, col('steel', 0.9), 0.28 * near);
          continue;
        }
        const { s, k } = kar(it, b.line, t, { appear: 'line', antic: 0.6, kind: 'slam', amt: 0.8, lit: col('bone', 1.3), dimA: 0.42 });
        if (d < 0.35) { it.mesh.visible = false; continue; }
        it.mesh.scale.setScalar(s.on ? k.sc : 1);
        it.mesh.rotation.z = it.rot + (s.on ? k.rot : 0);
        it.mesh.fillOpacity *= near;
        it.mesh.outlineOpacity = (s.on ? 0.85 : 0.22) * near * (s.vis ? 1 : 0);
      }
    }
    // signs: pin blinks on the beat
    for (const sg of this.signs) {
      tint(sg.pin, col('red', f.beatPhase < 0.5 ? 2.4 : 0.5), 1);
      sg.grp.visible = -sg.grp.position.z - c.s > 0.2;
    }
    drawScene(renderer, this.scene, this.cam, out);
    return { bloom: 0.85, bloomThreshold: 0.85, ca: 1.6 + clamp(vel / 26) * 2.5, vignette: 0.42 };
  }
}

