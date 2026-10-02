// Audio analysis data (data/audio.json): constant tempo grid, envelopes, onsets.
export type EnvName = 'rms' | 'low' | 'mid' | 'high' | 'vocal' | 'drums' | 'bass' | 'other';
export type OnsetKind = 'kick' | 'snare' | 'hat' | 'vocal';

interface Doc {
  duration: number; bpm: number; beat_period: number; beats: number[]; downbeats: number[]; fps: number;
  onsets: Record<OnsetKind, [number, number][]>;
  [k: string]: unknown;
}

export class AudioData {
  duration: number;
  bpm: number;
  period: number;
  beats: number[];
  downbeats: number[];
  fps: number;
  envs: Record<EnvName, Float32Array>;
  onsets: Record<OnsetKind, [number, number][]>;
  /** 16 log-spaced spectrum bands (40 Hz – 12 kHz) of the mix, 0..1, at bandsFps */
  bands: Float32Array[];
  bandsFps: number;
  private b0: number;
  private d0: number;

  constructor(doc: Doc) {
    this.duration = doc.duration;
    this.bpm = doc.bpm;
    this.period = doc.beat_period;
    this.beats = doc.beats;
    this.downbeats = doc.downbeats;
    this.fps = doc.fps;
    this.onsets = doc.onsets;
    this.b0 = doc.beats[0]!;
    this.d0 = doc.downbeats[0]!;
    const names: EnvName[] = ['rms', 'low', 'mid', 'high', 'vocal', 'drums', 'bass', 'other'];
    const bd = (doc.bands as number[][] | undefined) ?? [];
    this.bandsFps = (doc.bands_fps as number | undefined) ?? 50;
    this.bands = bd.map((r) => Float32Array.from(r));
    this.envs = Object.fromEntries(names.map((n) => [n, Float32Array.from(doc[n] as number[])])) as Record<EnvName, Float32Array>;
  }

  /** envelope value 0..1 (linear interpolation, 100 fps) */
  env(name: EnvName, t: number) {
    const e = this.envs[name];
    const x = t * this.fps;
    const i = Math.floor(x);
    if (i < 0) return e[0]!;
    if (i >= e.length - 1) return e[e.length - 1]!;
    const f = x - i;
    return e[i]! * (1 - f) + e[i + 1]! * f;
  }

  /** spectrum band i (0 = 40 Hz … 15 = 12 kHz), 0..1, linearly interpolated */
  band(i: number, t: number) {
    const n = this.bands.length;
    if (!n) return 0;
    const x = t * this.bandsFps, k = Math.max(0, Math.min(n - 2, Math.floor(x))), f = Math.max(0, Math.min(1, x - k));
    return this.bands[k]![i]! * (1 - f) + this.bands[k + 1]![i]! * f;
  }

  /** continuous beat index (0 at the first beat; the grid extends before it) */
  beat(t: number) {
    return (t - this.b0) / this.period;
  }
  /** continuous bar index (0 at the first downbeat) */
  bar(t: number) {
    return (t - this.d0) / (4 * this.period);
  }
  beatTime(i: number) {
    return this.b0 + i * this.period;
  }
  barTime(k: number) {
    return this.d0 + k * 4 * this.period;
  }
  /** the beat time at or before t (step = 1 beat, or 0.5 for 8ths) */
  beatFloor(t: number, step = 1) {
    return this.b0 + Math.floor((t - this.b0) / (this.period * step) + 1e-6) * this.period * step;
  }
  /** decaying pulse on the beat grid: 1 at each beat, exp decay */
  beatPulse(t: number, decay = 0.12, step = 1) {
    return Math.exp(-(t - this.beatFloor(t, step)) / decay);
  }
  barPulse(t: number, decay = 0.25) {
    const k = Math.floor(this.bar(t) + 1e-6);
    return Math.exp(-(t - this.barTime(k)) / decay);
  }

  /** onsets of a kind in [t0, t1) */
  events(kind: OnsetKind, t0: number, t1: number) {
    return this.onsets[kind].filter(([t]) => t >= t0 && t < t1);
  }
  /** decaying pulse driven by detected onsets: max_i s_i * exp(-(t - t_i)/decay) */
  hit(kind: OnsetKind, t: number, decay = 0.15) {
    const ev = this.onsets[kind];
    // binary search last onset <= t
    let lo = 0, hi = ev.length - 1, j = -1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (ev[m]![0] <= t) { j = m; lo = m + 1; } else hi = m - 1;
    }
    let v = 0;
    for (let k = j; k >= 0 && k > j - 6; k--) {
      const [et, s] = ev[k]!;
      const d = t - et;
      if (d > decay * 6) break;
      v = Math.max(v, s * Math.exp(-d / decay));
    }
    return v;
  }
  /** time of the last onset of a kind at or before t (or -Infinity) */
  lastOnset(kind: OnsetKind, t: number, minStrength = 0) {
    const ev = this.onsets[kind];
    for (let k = ev.length - 1; k >= 0; k--) if (ev[k]![0] <= t && ev[k]![1] >= minStrength) return ev[k]![0];
    return -Infinity;
  }
}
