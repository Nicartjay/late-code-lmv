import * as THREE from 'three';
import type { AudioData } from './audio';
import type { Compositor } from './gl';
import type { Lyrics } from './lyrics';
import type { PostParams } from './post';

export interface AudioFrame {
  rms: number; low: number; mid: number; high: number; vocal: number; drums: number; bass: number; other: number;
  kick: number; snare: number; hat: number; // decaying onset pulses 0..1
}

export interface Frame {
  t: number; // song time (s)
  dt: number; // frame duration (1/fps)
  lt: number; // local time since the entry started
  p: number; // local progress 0..1 over the entry window
  frame: number; // integer frame index (constant over a motion-blur shutter) — use for flicker/jitter
  beat: number; // continuous beat index
  bar: number; // continuous bar index
  beatPhase: number; // 0..1 within the beat
  barPhase: number; // 0..1 within the bar
  a: AudioFrame;
  under?: THREE.Texture; // previous entry's frame during an overlap (handlesTransition scenes)
  tin: number; // 0..1 through the overlap (1 when not overlapping)
}

export interface Ctx {
  id: string;
  renderer: THREE.WebGLRenderer;
  lyrics: Lyrics;
  audio: AudioData;
  comp: Compositor;
  params: Record<string, unknown>;
  start: number;
  end: number;
  W: number;
  H: number;
}

export abstract class Scene {
  ctx!: Ctx;
  /** composite f.under yourself during overlaps (otherwise the engine crossfades) */
  handlesTransition = false;
  async init(): Promise<void> {}
  /** draw the frame into `out` (already cleared to black). Return post overrides. */
  abstract render(f: Frame, out: THREE.WebGLRenderTarget): PostParams | void;

  /** render a three.js scene into out without clearing what is already there */
  protected draw(scene: THREE.Scene, cam: THREE.Camera, out: THREE.WebGLRenderTarget, clearDepth = true) {
    const r = this.ctx.renderer;
    r.setRenderTarget(out);
    r.autoClear = false;
    if (clearDepth) r.clearDepth();
    r.render(scene, cam);
  }
}
