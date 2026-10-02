import * as THREE from 'three';
import type { AudioData } from './audio';
import { clearRT, Compositor, FSPass, H, makeRT, W } from './gl';
import type { Lyrics } from './lyrics';
import { mergePost, Post, type PostParams } from './post';
import type { Frame, Scene } from './scene';
import { syncAll } from './text3d';
import { clamp } from './util';

export interface EntryDef {
  id: string;
  start: number;
  end: number;
  load: () => Promise<{ default: new () => Scene }>;
  params?: Record<string, unknown>;
}

interface Entry extends EntryDef { scene?: Scene; }

const MIX = /* glsl */ `
uniform sampler2D a; uniform sampler2D b; uniform float k;
void main() { gl_FragColor = vec4(mix(texture(a, vUv).rgb, texture(b, vUv).rgb, k), 1.0); }`;

export class Engine {
  renderer: THREE.WebGLRenderer;
  comp = new Compositor();
  post = new Post();
  entries: Entry[];
  errors: string[] = [];
  fps = 60;
  /** global post overrides (e.g. a debug fade) */
  postOverride: PostParams = {};
  private sceneRT = makeRT(W, H, { samples: 4 });
  private underRT = makeRT(W, H, { samples: 4 });
  private mixRT = makeRT(W, H, { depth: false });
  private accRT = makeRT(W, H, { depth: false, float: true });
  private mix = new FSPass(MIX, { a: { value: null }, b: { value: null }, k: { value: 0 } });

  constructor(public canvas: HTMLCanvasElement, public lyrics: Lyrics, public audio: AudioData, defs: EntryDef[]) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(W, H, false);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // the final pass encodes sRGB itself
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.autoClear = false;
    this.entries = defs.map((d) => ({ ...d }));
  }

  async init(only?: string[]) {
    const list = only?.length ? this.entries.filter((e) => only.includes(e.id)) : this.entries;
    for (const e of list) {
      try {
        const mod = await e.load();
        const s = new mod.default();
        s.ctx = {
          id: e.id, renderer: this.renderer, lyrics: this.lyrics, audio: this.audio, comp: this.comp,
          params: e.params ?? {}, start: e.start, end: e.end, W, H,
        };
        await s.init();
        e.scene = s;
      } catch (err) {
        this.errors.push(`${e.id}: ${(err as Error).stack ?? err}`);
        console.error(err);
      }
    }
    await syncAll();
    // warm up shaders (compile every scene's programs once)
    for (const e of list) if (e.scene) this.renderEntry(e, (e.start + e.end) / 2, 1 / this.fps, this.sceneRT);
  }

  timeline() {
    return this.entries.map((e) => ({ id: e.id, start: e.start, end: e.end }));
  }

  entryAt(t: number) {
    let cur: Entry | undefined;
    for (const e of this.entries) if (t >= e.start && t < e.end) cur = e;
    return cur;
  }

  private frame(t: number, dt: number, e: Entry): Frame {
    const A = this.audio;
    const beat = A.beat(t), bar = A.bar(t);
    return {
      t, dt, lt: t - e.start, p: clamp((t - e.start) / (e.end - e.start)), frame: Math.round(t * this.fps),
      beat, bar, beatPhase: beat - Math.floor(beat), barPhase: bar - Math.floor(bar),
      a: {
        rms: A.env('rms', t), low: A.env('low', t), mid: A.env('mid', t), high: A.env('high', t), vocal: A.env('vocal', t),
        drums: A.env('drums', t), bass: A.env('bass', t), other: A.env('other', t),
        kick: A.hit('kick', t, 0.12), snare: A.hit('snare', t, 0.14), hat: A.hit('hat', t, 0.06),
      },
      tin: 1,
    };
  }

  private renderEntry(e: Entry, t: number, dt: number, target: THREE.WebGLRenderTarget, under?: THREE.Texture, tin = 1): PostParams {
    clearRT(this.renderer, target);
    if (!e.scene) return {};
    const f = this.frame(t, dt, e);
    f.under = under;
    f.tin = tin;
    try {
      return e.scene.render(f, target) ?? {};
    } catch (err) {
      const msg = `${e.id}@${t.toFixed(2)}: ${(err as Error).stack ?? err}`;
      if (this.errors.length < 50 && !this.errors.includes(msg)) this.errors.push(msg);
      console.error(err);
      return {};
    }
  }

  /** render the edit at time t into a texture; returns post params */
  private renderAt(t: number, dt: number): { tex: THREE.Texture; post: PostParams } {
    const act = this.entries.filter((e) => t >= e.start && t < e.end && e.scene);
    if (!act.length) {
      clearRT(this.renderer, this.sceneRT);
      return { tex: this.sceneRT.texture, post: {} };
    }
    const cur = act[act.length - 1]!;
    const prev = act.length > 1 ? act[act.length - 2]! : undefined;
    if (prev) {
      const tin = clamp((t - cur.start) / Math.max(1e-3, prev.end - cur.start));
      this.renderEntry(prev, t, dt, this.underRT);
      if (cur.scene!.handlesTransition) {
        const pp = this.renderEntry(cur, t, dt, this.sceneRT, this.underRT.texture, tin);
        return { tex: this.sceneRT.texture, post: pp };
      }
      const pp = this.renderEntry(cur, t, dt, this.sceneRT, undefined, tin);
      this.mix.u.a!.value = this.underRT.texture;
      this.mix.u.b!.value = this.sceneRT.texture;
      this.mix.u.k!.value = tin;
      this.mix.render(this.renderer, this.mixRT);
      return { tex: this.mixRT.texture, post: pp };
    }
    return { tex: this.sceneRT.texture, post: this.renderEntry(cur, t, dt, this.sceneRT) };
  }

  /**
   * Render frame at song time t to the canvas. samples > 1 averages sub-frames spread over
   * `shutter` x frame duration (motion blur). Post params come from the centre sample.
   */
  render(t: number, samples = 1, shutter = 0.5) {
    const dt = 1 / this.fps;
    let pp: PostParams = {};
    let tex: THREE.Texture;
    if (samples <= 1) {
      const r = this.renderAt(t, dt);
      tex = r.tex;
      pp = r.post;
    } else {
      clearRT(this.renderer, this.accRT, [0, 0, 0], 0);
      const mid = Math.floor(samples / 2);
      for (let k = 0; k < samples; k++) {
        const tk = t + ((k + 0.5) / samples - 0.5) * shutter * dt;
        const r = this.renderAt(tk, dt);
        if (k === mid) pp = r.post;
        this.comp.draw(this.renderer, r.tex, this.accRT, { mode: 'add', tint: 1 / samples });
      }
      tex = this.accRT.texture;
    }
    this.post.render(this.renderer, tex, mergePost(pp, this.postOverride), Math.round(t * this.fps), null);
    return pp;
  }

  readPixels(buf: Uint8Array) {
    const gl = this.renderer.getContext();
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  }
}
