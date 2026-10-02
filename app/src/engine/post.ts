import * as THREE from 'three';
import { FSPass, H, W, makeRT } from './gl';

/** Per-frame post-processing parameters a scene may return from render(). */
export interface PostParams {
  exposure?: number; // 1
  bloom?: number; // bloom strength, 0.55
  bloomThreshold?: number; // 0.9 (linear)
  bloomRadius?: number; // 0.85 upsample spread
  ca?: number; // chromatic aberration (px at the edges), 1.2
  grain?: number; // 0.045
  vignette?: number; // 0.35
  scanlines?: number; // CRT line darkening 0..1
  flash?: number; // add flashColor, 0..1
  flashColor?: [number, number, number];
  fade?: number; // to black 0..1
  invert?: number; // 0..1 (impact frames)
  shake?: [number, number]; // px
  zoom?: number; // 1 = none; >1 zooms in
  rot?: number; // radians
  zoomBlur?: number; // radial blur strength (0..1)
  glitch?: number; // 0..1 block displacement + RGB split
  rgbSplit?: number; // px horizontal channel split
  tint?: [number, number, number]; // multiply (linear)
  saturation?: number; // 1
  lift?: number; // raise blacks (linear)
}

export const POST_DEFAULTS: Required<Omit<PostParams, 'flashColor' | 'shake' | 'tint'>> & Pick<PostParams, 'flashColor' | 'shake' | 'tint'> = {
  exposure: 1, bloom: 0.55, bloomThreshold: 0.9, bloomRadius: 0.85, ca: 1.2, grain: 0.045, vignette: 0.35,
  scanlines: 0, flash: 0, flashColor: [1, 1, 1], fade: 0, invert: 0, shake: [0, 0], zoom: 1, rot: 0, zoomBlur: 0,
  glitch: 0, rgbSplit: 0, tint: [1, 1, 1], saturation: 1, lift: 0,
};

const DOWN = /* glsl */ `
uniform sampler2D src; uniform vec2 texel; uniform float threshold; uniform float knee; uniform float prefilter;
vec3 pf(vec3 c) {
  if (prefilter < 0.5) return c;
  float br = max(c.r, max(c.g, c.b));
  float rq = clamp(br - threshold + knee, 0.0, 2.0 * knee); rq = (rq * rq) / (4.0 * knee + 1e-5);
  float w = max(rq, br - threshold) / max(br, 1e-5);
  return c * w;
}
vec3 s(vec2 uv) { return pf(min(texture(src, uv).rgb, vec3(64.0))); }
void main() {
  vec2 uv = vUv, t = texel;
  vec3 a = s(uv + t * vec2(-2, 2)), b = s(uv + t * vec2(0, 2)), c = s(uv + t * vec2(2, 2));
  vec3 d = s(uv + t * vec2(-2, 0)), e = s(uv), f = s(uv + t * vec2(2, 0));
  vec3 g = s(uv + t * vec2(-2, -2)), h = s(uv + t * vec2(0, -2)), i = s(uv + t * vec2(2, -2));
  vec3 j = s(uv + t * vec2(-1, 1)), k = s(uv + t * vec2(1, 1)), l = s(uv + t * vec2(-1, -1)), m = s(uv + t * vec2(1, -1));
  vec3 o = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  gl_FragColor = vec4(o, 1.0);
}`;

const UP = /* glsl */ `
uniform sampler2D src; uniform vec2 texel; uniform float radius; uniform float weight;
void main() {
  vec2 uv = vUv, t = texel * radius;
  vec3 o = texture(src, uv).rgb * 4.0;
  o += (texture(src, uv + t * vec2(-1, 0)).rgb + texture(src, uv + t * vec2(1, 0)).rgb + texture(src, uv + t * vec2(0, -1)).rgb + texture(src, uv + t * vec2(0, 1)).rgb) * 2.0;
  o += texture(src, uv + t * vec2(-1, -1)).rgb + texture(src, uv + t * vec2(1, -1)).rgb + texture(src, uv + t * vec2(-1, 1)).rgb + texture(src, uv + t * vec2(1, 1)).rgb;
  gl_FragColor = vec4(o / 16.0 * weight, 1.0);
}`;

const FINAL = /* glsl */ `
uniform sampler2D scene; uniform sampler2D bloomTex;
uniform float exposure, bloomStrength, ca, grain, vignette, scan, flash, fade, invert, zoom, rot, zoomBlur, glitch, rgbSplit, saturation, lift, frame;
uniform vec3 flashColor, tint; uniform vec2 shake;
vec3 neutral(vec3 color) {
  // Khronos PBR Neutral tone mapping (hue preserving, soft shoulder)
  const float startCompression = 0.8 - 0.04; const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b)); float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset; float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  const float d = 1. - startCompression; float newPeak = 1. - d * d / (peak + d - startCompression);
  color *= newPeak / peak; float g = 1. - 1. / (desaturation * (peak - newPeak) + 1.);
  return mix(color, vec3(newPeak), g);
}
vec3 sampleCA(vec2 uv, float k) {
  vec2 d = (uv - 0.5); float r2 = dot(d, d);
  vec2 off = d * (ca / uRes.x) * (0.5 + 2.0 * r2) * 2.0 * k;
  vec2 hs = vec2(rgbSplit / uRes.x, 0.0);
  return vec3(texture(scene, uv + off + hs).r, texture(scene, uv).g, texture(scene, uv - off - hs).b);
}
void main() {
  float asp = uRes.x / uRes.y;
  vec2 p = (vUv - 0.5) * vec2(asp, 1.0);
  p = rot2(rot) * p / zoom;
  p -= shake / uRes.y;
  vec2 uv = p / vec2(asp, 1.0) + 0.5;
  if (glitch > 0.0) {
    float fr = floor(frame / 2.0);
    float rows = 18.0 + floor(hash11(fr) * 30.0);
    float row = floor(uv.y * rows);
    float r = hash12(vec2(row, fr));
    if (r < glitch * 0.6) uv.x += (hash12(vec2(row + 7.0, fr)) - 0.5) * glitch * 0.25;
    float blk = hash12(floor(uv * vec2(12.0, 7.0)) + fr * 3.1);
    if (blk < glitch * 0.12) uv += (hash22(floor(uv * vec2(12.0, 7.0)) + fr) - 0.5) * 0.06;
  }
  vec3 col;
  if (zoomBlur > 0.001) {
    vec3 acc = vec3(0.0); float wsum = 0.0;
    for (int i = 0; i < 16; i++) {
      float f = float(i) / 15.0; float s = 1.0 - zoomBlur * 0.22 * f;
      vec2 u = (uv - 0.5) * s + 0.5; float w = 1.0 - f * 0.6;
      acc += sampleCA(u, 1.0 + f) * w; wsum += w;
    }
    col = acc / wsum;
  } else {
    col = sampleCA(uv, 1.0);
  }
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) col = vec3(0.0);
  col += texture(bloomTex, uv).rgb * bloomStrength;
  col = col * exposure * tint + lift;
  col = neutral(col);
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(luma), col, saturation);
  col = mix(col, flashColor, clamp(flash, 0.0, 1.0));
  col = mix(col, vec3(1.0) - col, invert);
  vec2 vq = vUv - 0.5; vq.x *= asp * 0.8;
  col *= 1.0 - vignette * smoothstep(0.25, 1.05, length(vq) * 1.15);
  if (scan > 0.0) col *= 1.0 - scan * (0.5 + 0.5 * sin(vUv.y * uRes.y * PI * 0.5));
  col *= 1.0 - fade;
  vec3 srgb = toSRGB(clamp(col, 0.0, 1.0));
  float n = hash13(vec3(gl_FragCoord.xy, mod(frame, 997.0))) + hash13(vec3(gl_FragCoord.xy + 31.0, mod(frame, 991.0))) - 1.0;
  float gw = grain * (1.0 - 0.6 * dot(srgb, vec3(0.333)));
  srgb += n * gw + (hash12(gl_FragCoord.xy + frame) - 0.5) / 255.0;
  gl_FragColor = vec4(srgb, 1.0);
}`;

export class Post {
  private mips: THREE.WebGLRenderTarget[] = [];
  private down: FSPass;
  private up: FSPass;
  private final: FSPass;
  constructor() {
    let w = W / 2, h = H / 2;
    for (let i = 0; i < 6; i++) {
      this.mips.push(makeRT(Math.max(2, Math.round(w)), Math.max(2, Math.round(h)), { depth: false }));
      w /= 2; h /= 2;
    }
    this.down = new FSPass(DOWN, {
      src: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 0.9 }, knee: { value: 0.4 }, prefilter: { value: 0 },
    });
    this.up = new FSPass(UP, { src: { value: null }, texel: { value: new THREE.Vector2() }, radius: { value: 1 }, weight: { value: 1 } }, {});
    this.up.mat.blending = THREE.AdditiveBlending;
    this.up.mat.transparent = true;
    this.final = new FSPass(FINAL, {
      scene: { value: null }, bloomTex: { value: null }, exposure: { value: 1 }, bloomStrength: { value: 0.5 }, ca: { value: 1 },
      grain: { value: 0.05 }, vignette: { value: 0.3 }, scan: { value: 0 }, flash: { value: 0 }, fade: { value: 0 }, invert: { value: 0 },
      zoom: { value: 1 }, rot: { value: 0 }, zoomBlur: { value: 0 }, glitch: { value: 0 }, rgbSplit: { value: 0 }, saturation: { value: 1 },
      lift: { value: 0 }, frame: { value: 0 }, flashColor: { value: new THREE.Vector3(1, 1, 1) }, tint: { value: new THREE.Vector3(1, 1, 1) },
      shake: { value: new THREE.Vector2() },
    });
  }

  render(renderer: THREE.WebGLRenderer, src: THREE.Texture, pp: PostParams, frame: number, target: THREE.WebGLRenderTarget | null = null) {
    const P = { ...POST_DEFAULTS, ...pp };
    // bloom pyramid
    let prev: THREE.Texture = src;
    let pw = W, ph = H;
    for (let i = 0; i < this.mips.length; i++) {
      const u = this.down.u;
      u.src!.value = prev;
      (u.texel!.value as THREE.Vector2).set(1 / pw, 1 / ph);
      u.threshold!.value = P.bloomThreshold;
      u.knee!.value = Math.max(0.05, P.bloomThreshold * 0.5);
      u.prefilter!.value = i === 0 ? 1 : 0;
      this.down.render(renderer, this.mips[i]!);
      prev = this.mips[i]!.texture;
      pw = this.mips[i]!.width; ph = this.mips[i]!.height;
    }
    for (let i = this.mips.length - 1; i > 0; i--) {
      const u = this.up.u;
      u.src!.value = this.mips[i]!.texture;
      (u.texel!.value as THREE.Vector2).set(1 / this.mips[i]!.width, 1 / this.mips[i]!.height);
      u.radius!.value = P.bloomRadius * 1.6;
      u.weight!.value = 0.9;
      this.up.render(renderer, this.mips[i - 1]!);
    }
    const u = this.final.u;
    u.scene!.value = src;
    u.bloomTex!.value = this.mips[0]!.texture;
    u.exposure!.value = P.exposure;
    u.bloomStrength!.value = P.bloom * 0.35;
    u.ca!.value = P.ca;
    u.grain!.value = P.grain;
    u.vignette!.value = P.vignette;
    u.scan!.value = P.scanlines;
    u.flash!.value = P.flash;
    u.fade!.value = P.fade;
    u.invert!.value = P.invert;
    u.zoom!.value = P.zoom;
    u.rot!.value = P.rot;
    u.zoomBlur!.value = P.zoomBlur;
    u.glitch!.value = P.glitch;
    u.rgbSplit!.value = P.rgbSplit;
    u.saturation!.value = P.saturation;
    u.lift!.value = P.lift;
    u.frame!.value = frame;
    const fc = P.flashColor ?? [1, 1, 1];
    (u.flashColor!.value as THREE.Vector3).set(fc[0], fc[1], fc[2]);
    const tc = P.tint ?? [1, 1, 1];
    (u.tint!.value as THREE.Vector3).set(tc[0], tc[1], tc[2]);
    const sh = P.shake ?? [0, 0];
    (u.shake!.value as THREE.Vector2).set(sh[0], sh[1]);
    this.final.render(renderer, target);
  }
}

/** merge post params: numbers in `b` override, flash/glitch etc. take the max */
export function mergePost(a: PostParams, b: PostParams | void): PostParams {
  if (!b) return a;
  const o: PostParams = { ...a, ...b };
  for (const k of ['flash', 'glitch', 'invert', 'zoomBlur', 'rgbSplit'] as const) {
    if (a[k] !== undefined || b[k] !== undefined) o[k] = Math.max(a[k] ?? 0, b[k] ?? 0);
  }
  if (a.shake && b.shake) o.shake = [a.shake[0] + b.shake[0], a.shake[1] + b.shake[1]];
  return o;
}
