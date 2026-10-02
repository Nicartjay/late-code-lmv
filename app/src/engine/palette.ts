import * as THREE from 'three';

// The palette follows the story: a cold night (ink / bone / screen blue), the bug
// (red), dawn (violet -> blue), the green of a passing build, and the sunrise (amber).
export const HEX = {
  ink: '#05060b', // background: night
  ink2: '#0c0f1c', // panels, editor background
  ink3: '#161b2e',
  navy: '#121a3d',
  steel: '#55607e', // dim UI, unsung type
  mist: '#9aa6c2', // secondary type
  bone: '#eef2fa', // primary type (cool white)
  blue: '#2f6bff', // the blue light of the screen
  cyan: '#62e6ff', // the cursor, highlights
  ice: '#c4ecff',
  red: '#ff2b4e', // the bug / errors
  ember: '#ff6a3d',
  amber: '#ffb648', // warnings, coffee, sunrise
  gold: '#ffd977',
  green: '#3dff8f', // build success (owned by the success scene)
  violet: '#8b5cff', // dawn: purple
  rose: '#ff7ab8',
} as const;
export type PalKey = keyof typeof HEX;

/** linear-space THREE.Color, optionally scaled (>1 blooms) */
export function col(k: PalKey | string, intensity = 1): THREE.Color {
  const c = new THREE.Color(k in HEX ? HEX[k as PalKey] : k);
  return intensity === 1 ? c : c.multiplyScalar(intensity);
}

/** linear rgb triple */
export function lin(k: PalKey | string, intensity = 1): [number, number, number] {
  const c = col(k, intensity);
  return [c.r, c.g, c.b];
}

/** CSS rgba() for Canvas2D (sRGB) */
export function css(k: PalKey | string, a = 1): string {
  const hex = k in HEX ? HEX[k as PalKey] : k;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** mix two palette colours in sRGB and return CSS */
export function cssMix(a: PalKey | string, b: PalKey | string, t: number, alpha = 1): string {
  const ha = a in HEX ? HEX[a as PalKey] : a, hb = b in HEX ? HEX[b as PalKey] : b;
  const na = parseInt(ha.slice(1), 16), nb = parseInt(hb.slice(1), 16);
  const ch = (s: number) => Math.round(((na >> s) & 255) * (1 - t) + ((nb >> s) & 255) * t);
  return `rgba(${ch(16)},${ch(8)},${ch(0)},${alpha})`;
}
