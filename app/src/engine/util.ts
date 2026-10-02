// Math, easing, deterministic randomness. Everything a scene draws must be a pure
// function of song time t (+ seeded randomness) — never Math.random()/Date.now().

export const TAU = Math.PI * 2;
export const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, x: number) => (b === a ? 0 : (x - a) / (b - a));
export const remap = (x: number, a: number, b: number, c: number, d: number) => lerp(c, d, clamp(invLerp(a, b, x)));
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp(invLerp(a, b, x));
  return t * t * (3 - 2 * t);
};
export const fract = (x: number) => x - Math.floor(x);
export const mix3 = (a: number[], b: number[], t: number) => [lerp(a[0]!, b[0]!, t), lerp(a[1]!, b[1]!, t), lerp(a[2]!, b[2]!, t)];

export type Ease = (t: number) => number;
export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inQuart: (t: number) => t * t * t * t,
  outQuart: (t: number) => 1 - Math.pow(1 - t, 4),
  inOutQuart: (t: number) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
  outQuint: (t: number) => 1 - Math.pow(1 - t, 5),
  inExpo: (t: number) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutExpo: (t: number) =>
    t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  inBack: (t: number) => 2.70158 * t * t * t - 1.70158 * t * t,
  outBack: (t: number) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
  outBackStrong: (t: number) => 1 + 4.2 * Math.pow(t - 1, 3) + 3.2 * Math.pow(t - 1, 2),
  outElastic: (t: number) =>
    t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outSine: (t: number) => Math.sin((t * Math.PI) / 2),
};

/** eased progress of x through [a, b] */
export const prog = (x: number, a: number, b: number, e: Ease = ease.linear) => e(clamp(invLerp(a, b, x)));

/** piecewise keyframes: [[t, value, easeIntoThisKey?], ...] sorted by t */
export function keys(t: number, k: [number, number, Ease?][]): number {
  if (t <= k[0]![0]) return k[0]![1];
  for (let i = 1; i < k.length; i++) {
    const [t1, v1, e] = k[i]!;
    if (t <= t1) {
      const [t0, v0] = k[i - 1]!;
      return lerp(v0, v1, (e ?? ease.inOutCubic)(clamp(invLerp(t0, t1, t))));
    }
  }
  return k[k.length - 1]![1];
}

/** damped spring response to a step at t=0: 0 -> 1 with overshoot */
export function spring(t: number, freq = 4, damp = 0.35) {
  if (t <= 0) return 0;
  const w = TAU * freq;
  return 1 - Math.exp(-damp * w * t) * Math.cos(w * Math.sqrt(1 - damp * damp) * t);
}

/** 0 before t0, rises over `attack`, decays exponentially with `decay` (s) */
export function pulse(t: number, t0: number, attack = 0.01, decay = 0.2) {
  const d = t - t0;
  if (d < 0) return 0;
  if (d < attack) return d / attack;
  return Math.exp(-(d - attack) / decay);
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** stateless hash -> [0, 1) */
export function hash(a: number, b = 0, c = 0) {
  let h = Math.imul((a * 73856093) ^ (b * 19349663) ^ (c * 83492791), 0x9e3779b1) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export const hashSigned = (a: number, b = 0, c = 0) => hash(a, b, c) * 2 - 1;

/** smooth 1D value noise in [-1, 1] */
export function noise1(x: number, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hashSigned(i, seed), hashSigned(i + 1, seed), u);
}
export function fbm1(x: number, seed = 0, oct = 3) {
  let v = 0, a = 0.5, f = 1;
  for (let o = 0; o < oct; o++) {
    v += a * noise1(x * f, seed + o * 17);
    f *= 2.03;
    a *= 0.5;
  }
  return v;
}

/** frame index for per-frame flicker that must stay constant across a motion-blur shutter */
export const FPS = 60;
export const frameIdx = (t: number) => Math.round(t * FPS);

/** deterministic shuffle of [0..n) */
export function shuffled(n: number, seed: number) {
  const r = mulberry32(seed), a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** pick deterministic element */
export const pick = <T>(arr: T[], a: number, b = 0) => arr[Math.floor(hash(a, b) * arr.length) % arr.length]!;
