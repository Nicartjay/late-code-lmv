// Shared helpers for the loop / inter1 / qiita scenes (owned by the same author).
import * as THREE from 'three';
import { font, type FontKey } from '../engine/fonts';
import { enter, gstate, KIN0, type AppearMode, type Enter, type GState, type Kin } from '../engine/kinetic';
import type { Line } from '../engine/lyrics';
import { SYN, tokenize } from '../engine/motifs';
import { col } from '../engine/palette';
import { tint, type G3Item } from '../engine/text3d';
import { clamp } from '../engine/util';

/** render a three.js scene into `out` without clearing colour (same as Scene.draw) */
export function drawScene(renderer: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.Camera, out: THREE.WebGLRenderTarget | null, clearDepth = true) {
  renderer.setRenderTarget(out);
  renderer.autoClear = false;
  if (clearDepth) renderer.clearDepth();
  renderer.render(scene, cam);
}

// ---------------------------------------------------------------- code without green
/** syntax colours for the night palette (no green: strings are periwinkle) */
export const NG = {
  text: '#c9d3ea', kw: '#7aa2ff', str: '#a9c2ff', num: '#ffb648', com: '#55607e', fn: '#62e6ff', punc: '#8a94b0', err: '#ff2b4e',
};
const remap = (c: string) => (c === SYN.str ? NG.str : c);

/** one syntax-highlighted code line (mono cell = px*0.6, Japanese = px). Returns end x. */
export function drawCode(ctx: CanvasRenderingContext2D, line: string, x: number, y: number, px: number,
  o: { alpha?: number; mono?: FontKey; maxChars?: number; color?: string } = {}) {
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.globalAlpha = o.alpha ?? 1;
  let cx = x, n = 0;
  const monoFont = font(o.mono ?? 'mono4', px), jpFont = font('code4', px);
  let cur = '';
  for (const tk of tokenize(line)) {
    for (const ch of tk.s) {
      if (o.maxChars !== undefined && n >= o.maxChars) { ctx.restore(); return cx; }
      const jp = /[^\x00-\x7f]/.test(ch);
      const f = jp ? jpFont : monoFont;
      if (f !== cur) { ctx.font = f; cur = f; }
      ctx.fillStyle = o.color ?? remap(tk.c);
      if (ch !== ' ') ctx.fillText(ch, cx, y);
      cx += jp ? px : px * 0.6;
      n++;
    }
  }
  ctx.restore();
  return cx;
}

/** width of a code line drawn with drawCode */
export function codeWidth(line: string, px: number) {
  let w = 0;
  for (const ch of line) w += /[^\x00-\x7f]/.test(ch) ? px : px * 0.6;
  return w;
}

// ---------------------------------------------------------------- karaoke for troika glyphs
export interface KarOpts {
  appear?: AppearMode; antic?: number; kind?: Enter; amt?: number;
  dim?: THREE.Color; dimA?: number; lit?: THREE.Color; litBoost?: number;
}
const C_TMP = new THREE.Color();
/**
 * timing + entrance for one lyric glyph. Sets visibility + colour/opacity (dim before it is
 * sung, bright when sung, with the entrance flash). Returns the state and the entrance kin
 * so the caller can apply transforms.
 */
export function kar(it: G3Item, line: Line | undefined, t: number, o: KarOpts = {}): { s: GState; k: Kin } {
  const s = gstate(it, line, t, o.appear ?? 'line', o.antic ?? 0.45);
  const k = s.on ? enter(o.kind ?? 'slam', s.since, it.gi, o.amt ?? 1) : KIN0();
  it.mesh.visible = s.vis;
  if (s.vis) {
    if (s.on) {
      C_TMP.copy(o.lit ?? col('bone', 1.25)).multiplyScalar(1 + (k.bright - 1) * (o.litBoost ?? 1));
      tint(it.mesh, C_TMP, Math.max(k.alpha, o.dimA ?? 0.4)); // never blink out at the onset
    } else {
      const fadeIn = clamp(s.e / 0.12);
      tint(it.mesh, o.dim ?? col('steel', 0.9), (o.dimA ?? 0.4) * fadeIn);
    }
  }
  return { s, k };
}

// ---------------------------------------------------------------- circular text on a canvas
/**
 * draw `text` along a circle (centre cx, cy, radius r, glyph baseline outward-up), repeated
 * to fill the circle. Characters are spaced by their advance. a0 = start angle (rad, canvas
 * coords, 0 = +x, clockwise positive because y is down).
 */
export function circleText(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, r: number, px: number, fk: FontKey,
  o: { fill?: string; a0?: number; tracking?: number; repeat?: boolean; inward?: boolean; alpha?: number; gap?: number } = {}) {
  ctx.save();
  ctx.font = font(fk, px);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = o.fill ?? '#fff';
  ctx.globalAlpha = o.alpha ?? 1;
  const tr = (o.tracking ?? 0.05) * px;
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width + tr);
  const total = widths.reduce((a, b) => a + b, 0) + (o.gap ?? px * 1.2);
  const circ = Math.PI * 2 * r;
  const reps = o.repeat === false ? 1 : Math.max(1, Math.floor(circ / total));
  // stretch spacing so the repeats close the circle seamlessly
  const stretch = o.repeat === false ? 1 : circ / (total * reps);
  let a = o.a0 ?? -Math.PI / 2;
  for (let rep = 0; rep < reps; rep++) {
    for (let i = 0; i < chars.length; i++) {
      const w = widths[i]! * stretch;
      a += w / 2 / r;
      ctx.save();
      ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.rotate(a + (o.inward ? -Math.PI / 2 : Math.PI / 2));
      if (chars[i] !== ' ') ctx.fillText(chars[i]!, 0, 0);
      ctx.restore();
      a += w / 2 / r;
    }
    a += ((o.gap ?? px * 1.2) * stretch) / r;
  }
  ctx.restore();
}

/** a canvas-backed static texture (drawn once) */
export function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, o: { srgb?: boolean; mips?: boolean; repeat?: boolean; aniso?: number } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!;
  draw(c);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = o.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  tex.generateMipmaps = o.mips ?? true;
  tex.minFilter = o.mips === false ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  if (o.repeat) { tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping; }
  tex.anisotropy = o.aniso ?? 8;
  tex.needsUpdate = true;
  return tex;
}

/** additive unlit material that ignores depth (alpha must be 1 for AdditiveBlending) */
export function addMat(map: THREE.Texture | null, color: THREE.Color, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    map, color, transparent: true, opacity, depthWrite: false, depthTest: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  });
}

/** smooth 0..1 step at time t0 over d seconds with an ease */
export function stepAt(t: number, t0: number, d: number, e: (x: number) => number) {
  return t <= t0 ? 0 : e(clamp((t - t0) / d));
}
