// Small helpers shared by my scenes (open / mug / city).
import * as THREE from 'three';
import type { AudioData } from '../engine/audio';
import { font, type FontKey } from '../engine/fonts';
import { FSPass, H, makeRT, W } from '../engine/gl';
import { LEAD, type Line } from '../engine/lyrics';

/** cut time for a line: the 8th-grid point before its first mora, unless that would cut the previous line short */
export function cutBefore(A: AudioData, l: Line, prev?: Line) {
  const c = A.beatFloor(l.start - LEAD, 0.5);
  if (prev && c < prev.end - LEAD - 0.05) return l.start - LEAD - 1 / 60;
  return c;
}

export interface G2 {
  fill?: string | CanvasGradient | null;
  stroke?: string | null;
  strokeW?: number;
  alpha?: number;
  sc?: number;
  sx?: number;
  sy?: number;
  rot?: number;
  glow?: string | null;
  glowBlur?: number;
  glowY?: number; // shadow offset (drop shadow)
  /** gradient factory in glyph-local coords (centre 0,0; size px) */
  grad?: (c: CanvasRenderingContext2D, px: number) => CanvasGradient;
}

/** draw one character centred at (x, y) */
export function glyph2D(c: CanvasRenderingContext2D, ch: string, fk: FontKey, px: number, x: number, y: number, s: G2) {
  const a = s.alpha ?? 1;
  if (a <= 0.002) return;
  c.save();
  c.translate(x, y);
  if (s.rot) c.rotate(s.rot);
  const sc = s.sc ?? 1;
  c.scale(sc * (s.sx ?? 1), sc * (s.sy ?? 1));
  c.globalAlpha = a;
  c.font = font(fk, px);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  if (s.glow) { c.shadowColor = s.glow; c.shadowBlur = s.glowBlur ?? 24; c.shadowOffsetY = s.glowY ?? 0; }
  const fill = s.grad ? s.grad(c, px) : s.fill;
  if (fill) { c.fillStyle = fill; c.fillText(ch, 0, px * 0.04); }
  if (s.stroke) {
    c.shadowBlur = 0;
    c.strokeStyle = s.stroke;
    c.lineWidth = s.strokeW ?? 2;
    c.lineJoin = 'round';
    c.strokeText(ch, 0, px * 0.04);
  }
  c.restore();
}

/**
 * Crepuscular rays (god rays): emission image (half res) -> radial blur toward a light centre.
 * Usage: rays.emit(renderer, frag-uniform setup) by rendering into rays.em, then rays.blur(...), then composite rays.out.texture.
 */
export class Rays {
  em = makeRT(W / 2, H / 2, { depth: false });
  out = makeRT(W / 2, H / 2, { depth: false });
  blurPass = new FSPass(/* glsl */ `
    uniform sampler2D em; uniform vec2 lc; uniform float decay, density, weight, exposure;
    void main(){
      vec2 uv = vUv;
      vec2 d = (uv - lc) * density / 56.0;
      vec3 acc = vec3(0.0); float il = 1.0;
      float j = hash12(gl_FragCoord.xy) ;
      uv -= d * j;
      for (int i = 0; i < 56; i++) { uv -= d; acc += texture2D(em, uv).rgb * il; il *= decay; }
      vec3 r = acc * weight * exposure;
      r = r * r / (r + 0.12) * 1.25;
      gl_FragColor = vec4(r, 1.0);
    }`, {
    em: { value: null }, lc: { value: new THREE.Vector2(0.5, 0.5) }, decay: { value: 0.965 }, density: { value: 0.9 },
    weight: { value: 0.035 }, exposure: { value: 1 },
  });
  blur(renderer: THREE.WebGLRenderer, lc: [number, number], o: { decay?: number; density?: number; weight?: number; exposure?: number } = {}) {
    const u = this.blurPass.u;
    u.em!.value = this.em.texture;
    (u.lc!.value as THREE.Vector2).set(lc[0], lc[1]);
    u.decay!.value = o.decay ?? 0.965;
    u.density!.value = o.density ?? 0.9;
    u.weight!.value = o.weight ?? 0.035;
    u.exposure!.value = o.exposure ?? 1;
    this.blurPass.render(renderer, this.out);
  }
}
