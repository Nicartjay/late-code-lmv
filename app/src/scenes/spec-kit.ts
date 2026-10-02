// Shared helpers for the verse-2 scenes (spec / tabs / stack).
// Everything here is a pure function of time (or built once in init()).
import * as THREE from 'three';
import type { Char, Line, Word } from '../engine/lyrics';
import { LEAD } from '../engine/lyrics';
import { clamp, ease, hash, noise1 } from '../engine/util';

/** the visual onset of a lyric item (char / word / line): highlights fire at this song time */
export const on = (x: { start: number }) => x.start - LEAD;

/** word of a line by (partial) text */
export function word(l: Line, w: string): Word {
  const x = l.words.find((y) => y.w === w) ?? l.words.find((y) => y.w.includes(w));
  if (!x) throw new Error(`word ${w} not in ${l.text}`);
  return x;
}

/** chars of a line whose text matches, in order (e.g. chars(line, '言葉の')) */
export function charsOf(l: Line, s: string, from = 0): Char[] {
  const txt = l.chars.map((c) => c.c).join('');
  const i = txt.indexOf(s, from);
  if (i < 0) throw new Error(`"${s}" not in ${l.text}`);
  return l.chars.slice(i, i + [...s].length);
}

/** a deterministic decaying 2D shake (px) after impact times. amp px, decay s */
export function shake(t: number, events: number[], amp = 24, decay = 0.12, seed = 1): [number, number] {
  let x = 0, y = 0;
  for (let i = 0; i < events.length; i++) {
    const e = t - events[i]!;
    if (e < 0 || e > decay * 6) continue;
    const k = amp * Math.exp(-e / decay);
    x += k * noise1(e * 38 + i * 13.1, seed * 7 + i);
    y += k * noise1(e * 41 + i * 7.7, seed * 11 + i);
  }
  return [x, y];
}

/** 1 for `frames` frames at (and after) each event (impact frames), else 0 — keyed on frame index */
export function impactFrame(frame: number, events: number[], frames = 2, fps = 60): number {
  for (const ev of events) {
    const f0 = Math.round(ev * fps);
    if (frame >= f0 && frame < f0 + frames) return 1;
  }
  return 0;
}

/** decaying pulse after the most recent event in a list */
export function lastPulse(t: number, events: number[], decay = 0.15): number {
  let v = 0;
  for (const ev of events) {
    const e = t - ev;
    if (e >= 0) v = Math.max(v, Math.exp(-e / decay));
  }
  return v;
}

/** eased 0..1 transition through [a, a + d] */
export const tr = (t: number, a: number, d: number, e: (x: number) => number = ease.outExpo) => e(clamp((t - a) / d));

/** cubic bezier-ish camera blend between two vectors */
export function lerpV(out: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, k: number) {
  return out.copy(a).lerp(b, k);
}

/** A static Canvas2D texture (drawn once in init) with mipmaps — for paper, labels, UI atlases. */
export function staticTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d')!;
  draw(ctx);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** seeded value in [a, b) */
export const rnd = (a: number, b: number, i: number, j = 0, k = 0) => a + (b - a) * hash(i, j, k);

/** fractional exponential count in [0, n]: grows like 2^(rate * x) */
export function expCount(x: number, n: number, rate = 8) {
  if (x <= 0) return 0;
  return Math.min(n, Math.pow(2, x * rate) - 1);
}

/** rough "hand-drawn" ink mask post-process on a canvas region (alpha erosion with seeded speckles) */
export function inkRough(ctx: CanvasRenderingContext2D, w: number, h: number, seed = 1, amt = 1) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  // value noise on two lattices (blotches + grain) + per-pixel speckle
  const mk = (g: number, s: number) => {
    const gw = Math.ceil(w / g) + 2, gh = Math.ceil(h / g) + 2;
    const lat = new Float32Array(gw * gh);
    for (let i = 0; i < lat.length; i++) lat[i] = hash(i, s, 91);
    return (x: number, y: number) => {
      const fx = x / g, fy = y / g;
      const xi = Math.floor(fx), yi = Math.floor(fy), xf = fx - xi, yf = fy - yi;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const a = lat[yi * gw + xi]!, b = lat[yi * gw + xi + 1]!, c = lat[(yi + 1) * gw + xi]!, e = lat[(yi + 1) * gw + xi + 1]!;
      return a + (b - a) * u + (c - a) * v + (a - b - c + e) * u * v;
    };
  };
  const n1 = mk(26, seed), n2 = mk(7, seed + 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4 + 3;
      const a = d[o]!;
      if (a === 0) continue;
      const n = n1(x, y) * 0.65 + n2(x, y) * 0.35;
      const sp = hash(x, y, seed);
      let m = 1;
      if (n < 0.3 * amt) m *= 0.3 + 0.7 * (n / (0.3 * amt)); // pale blotches
      if (sp < 0.03 * amt) m *= 0.2; // speckles
      d[o] = Math.round(a * clamp(m * (0.84 + 0.16 * n)));
    }
  }
  ctx.putImageData(img, 0, 0);
}
