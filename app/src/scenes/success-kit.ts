// Shared helpers for the success + outro scenes (owned by the success/outro author).
import * as THREE from 'three';
import { H, W } from '../engine/gl';
import type { LayoutOpts } from '../engine/kinetic';
import type { Char, Line } from '../engine/lyrics';
import { Glyphs3D, tint, type T3 } from '../engine/text3d';
import { clamp, hash } from '../engine/util';

export const LEADV = 0.04;

/** perspective camera where 1 world unit = 1 px at z = 0 (looking down -z) */
export function pxCamera(fov = 30) {
  const cam = new THREE.PerspectiveCamera(fov, W / H, 1, 40000);
  cam.position.set(0, 0, H / 2 / Math.tan((fov * Math.PI) / 360));
  return cam;
}
export const pxDist = (fov: number) => H / 2 / Math.tan((fov * Math.PI) / 360);

/**
 * An extruded glyph row: the main glyphs plus `n` stacked copies behind (z -= step),
 * so a perspective camera shows a real 3D block extrusion.
 */
export class Block3D {
  group = new THREE.Group();
  main: Glyphs3D;
  layers: Glyphs3D[] = [];
  n: number;
  step: number;
  ox = 0; // oblique extrusion offset per layer (px, y up)
  oy = 0;
  constructor(src: string | Line | Char[], o: T3 & Omit<LayoutOpts, 'font' | 'size'>, n = 8, step = 6, layerColor?: (k: number) => THREE.Color, oblique?: [number, number]) {
    this.n = n;
    this.step = step;
    if (oblique) { this.ox = oblique[0]; this.oy = oblique[1]; }
    for (let k = n; k >= 1; k--) {
      const g = new Glyphs3D(src, { ...o, color: layerColor ? layerColor(k) : o.color, outlineWidth: undefined, renderOrder: 5 + (n - k) * 0.01 });
      this.layers.unshift(g);
      this.group.add(g.group);
    }
    this.main = new Glyphs3D(src, { ...o, renderOrder: 6 });
    this.group.add(this.main.group);
  }
  get items() { return this.main.items; }
  /** set glyph i transform (block-local px, y up) + visibility; extrusion follows */
  set(i: number, x: number, y: number, z: number, rot: number, sc: number, vis: boolean, depth = 1, sx = 1, sy = 1) {
    const m = this.main.items[i]!.mesh;
    m.visible = vis;
    m.position.set(x, y, z);
    m.rotation.set(0, 0, rot);
    m.scale.set(sc * sx, sc * sy, sc);
    for (let k = 0; k < this.layers.length; k++) {
      const l = this.layers[k]!.items[i]!.mesh;
      l.visible = vis && depth > 0.01;
      const kk = (k + 1) * depth * sc;
      l.position.set(x + kk * this.ox * sx, y + kk * this.oy * sy, z - kk * this.step);
      l.rotation.set(0, 0, rot);
      l.scale.set(sc * sx, sc * sy, sc);
    }
  }
  tintLayers(i: number, f: (k: number) => THREE.Color, opacity = 1) {
    for (let k = 0; k < this.layers.length; k++) tint(this.layers[k]!.items[i]!.mesh, f(k + 1), opacity);
  }
  hideAll() {
    for (const it of this.main.items) it.mesh.visible = false;
    for (const l of this.layers) for (const it of l.items) it.mesh.visible = false;
  }
}

/** set every mesh of a Glyphs3D (in)visible */
export function showGlyphs(g: Glyphs3D, v: boolean) {
  g.group.visible = v;
}

/** vector check mark ✓ (Canvas2D), centred at x,y, `s` = height in px; p = draw progress */
export function drawCheck(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, lw = s * 0.16, p = 1, glow = 0) {
  const P = [[-0.42, 0.02], [-0.12, 0.32], [0.46, -0.36]] as const;
  const L1 = Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]), L2 = Math.hypot(P[2][0] - P[1][0], P[2][1] - P[1][1]);
  const r = clamp(p) * (L1 + L2);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (glow > 0) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
  ctx.beginPath();
  ctx.moveTo(x + P[0][0] * s, y + P[0][1] * s);
  if (r <= L1) {
    const k = r / L1;
    ctx.lineTo(x + (P[0][0] + (P[1][0] - P[0][0]) * k) * s, y + (P[0][1] + (P[1][1] - P[0][1]) * k) * s);
  } else {
    ctx.lineTo(x + P[1][0] * s, y + P[1][1] * s);
    const k = (r - L1) / L2;
    ctx.lineTo(x + (P[1][0] + (P[2][0] - P[1][0]) * k) * s, y + (P[1][1] + (P[2][1] - P[1][1]) * k) * s);
  }
  ctx.stroke();
  ctx.restore();
}

/** GLSL: distance to a (partially drawn) check mark path; p in check units (height ~1), r = reveal 0..1 */
export const CHECK_GLSL = /* glsl */ `
float sdCheckPath(vec2 p, float r) {
  vec2 A = vec2(-0.42, -0.02), B = vec2(-0.12, -0.32), C = vec2(0.46, 0.36);
  float L1 = length(B - A), L2 = length(C - B);
  float rl = clamp(r, 0.0, 1.0) * (L1 + L2);
  if (rl <= 0.0) return 1e3;
  vec2 b1 = A + (B - A) * min(1.0, rl / L1);
  float d = sdSeg(p, A, b1);
  if (rl > L1) d = min(d, sdSeg(p, B, B + (C - B) * min(1.0, (rl - L1) / L2)));
  return d;
}`;

const SCR_ASCII = '01#$%&*+<>/\\|=?!{}[];:ABCDEFGHJKLMNPQRSTUVWXYZ';
/** ascii scramble-decode of a label: chars lock left to right between t0 and t0 + dur */
export function scrambleText(s: string, t: number, t0: number, dur: number, seed = 1, frame = 0) {
  if (t >= t0 + dur) return s;
  const n = s.length;
  let o = '';
  for (let i = 0; i < n; i++) {
    const lock = t0 + (dur * i) / Math.max(1, n);
    const ch = s[i]!;
    if (t >= lock || ch === ' ') o += ch;
    else if (t < t0 - 0.05) o += ' ';
    else o += SCR_ASCII[Math.floor(hash(i, frame >> 1, seed) * SCR_ASCII.length)]!;
  }
  return o;
}

/** exponential impact envelope: 0 before t0, 1 at t0, decays */
export const imp = (t: number, t0: number, decay = 0.15) => (t < t0 ? 0 : Math.exp(-(t - t0) / decay));

/** 0..1 window helper with soft edges */
export function win(t: number, a: number, b: number, fadeIn = 0.05, fadeOut = 0.05) {
  if (t < a - fadeIn || t > b + fadeOut) return 0;
  return clamp((t - (a - fadeIn)) / Math.max(1e-4, fadeIn)) * clamp(((b + fadeOut) - t) / Math.max(1e-4, fadeOut));
}

/** deterministic jitter in px keyed by frame (for camera shake) */
export function shake(frame: number, amp: number, seed = 0): [number, number] {
  if (amp < 0.05) return [0, 0];
  return [(hash(frame, 11, seed) - 0.5) * 2 * amp, (hash(frame, 23, seed) - 0.5) * 2 * amp];
}
