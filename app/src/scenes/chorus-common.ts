// Shared bits for the chorus acts (keys / maze / boss / dash).
import * as THREE from 'three';
import type { Line } from '../engine/lyrics';
import type { PostParams } from '../engine/post';
import type { Ctx, Frame } from '../engine/scene';

export interface ActCtx {
  ctx: Ctx;
  line: Line;
  n: number; // 1 = first chorus (night), 2 = second chorus (dawn)
  t0: number;
  t1: number;
}

export abstract class Act {
  constructor(public a: ActCtx) {}
  async init(): Promise<void> {}
  abstract render(f: Frame, out: THREE.WebGLRenderTarget): PostParams | void;
  protected draw(scene: THREE.Scene, cam: THREE.Camera, out: THREE.WebGLRenderTarget) {
    const r = this.a.ctx.renderer;
    r.setRenderTarget(out);
    r.autoClear = false;
    r.clearDepth();
    r.render(scene, cam);
  }
}

/** radial soft dot texture (white centre -> transparent), for glows */
let dotTex: THREE.Texture | null = null;
export function softDot() {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  dotTex = new THREE.CanvasTexture(c);
  return dotTex;
}

/** smooth camera pose blend helper */
export function poseLerp(a: THREE.Vector3, b: THREE.Vector3, k: number, out = new THREE.Vector3()) {
  return out.copy(a).lerp(b, k);
}
