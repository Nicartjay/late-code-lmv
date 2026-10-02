import * as THREE from 'three';

/** logical output size; every scene lays out in these pixels */
export const W = 1920;
export const H = 1080;

/** HDR linear render target (HalfFloat). samples > 0 = MSAA. */
export function makeRT(w = W, h = H, o: { samples?: number; depth?: boolean; float?: boolean } = {}) {
  return new THREE.WebGLRenderTarget(w, h, {
    type: o.float ? THREE.FloatType : THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    depthBuffer: o.depth ?? true,
    samples: o.samples ?? 0,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
    colorSpace: THREE.LinearSRGBColorSpace,
  });
}

export function clearRT(renderer: THREE.WebGLRenderer, rt: THREE.WebGLRenderTarget | null, rgb: [number, number, number] = [0, 0, 0], a = 1) {
  const prevColor = new THREE.Color();
  renderer.getClearColor(prevColor);
  const prevAlpha = renderer.getClearAlpha();
  renderer.setRenderTarget(rt);
  renderer.setClearColor(new THREE.Color(rgb[0], rgb[1], rgb[2]), a);
  renderer.clear(true, true, true);
  renderer.setClearColor(prevColor, prevAlpha);
}

export const GLSL_COMMON = /* glsl */ `
#define PI 3.14159265359
#define TAU 6.28318530718
const vec3 C_INK = vec3(0.0015, 0.0018, 0.0033);
const vec3 C_BLUE = vec3(0.0284, 0.147, 1.0);
const vec3 C_CYAN = vec3(0.122, 0.79, 1.0);
const vec3 C_RED = vec3(1.0, 0.0242, 0.0761);
const vec3 C_GREEN = vec3(0.0467, 1.0, 0.275);
const vec3 C_AMBER = vec3(1.0, 0.47, 0.0648);
const vec3 C_VIOLET = vec3(0.258, 0.1, 1.0);
const vec3 C_BONE = vec3(0.855, 0.888, 0.955);
float hash11(float p) { p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float hash13(vec3 p3) { p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p) { float v = 0., a = .5; for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.03 + 17.1; a *= .5; } return v; }
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy)); vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1; i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0); m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0; vec3 h = abs(x) - 0.5; vec3 ox = floor(x + 0.5); vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g; g.x = a0.x * x0.x + h.x * x0.y; g.yz = a0.yz * x12.xz + h.yz * x12.yw; return 130.0 * dot(m, g);
}
float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float sdRoundBox(vec2 p, vec2 b, float r) { return sdBox(p, b - r) - r; }
float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h); }
mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float aaStep(float d) { float w = fwidth(d); return clamp(0.5 - d / max(w, 1e-5), 0., 1.); }
vec3 toSRGB(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
`;

const FS_VERT = /* glsl */ `
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const triGeo = new THREE.BufferGeometry();
triGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

/** Fullscreen pass (GLSL 300 es). Fragment shader gets vUv, uRes, GLSL_COMMON; writes gl_FragColor. */
export class FSPass {
  mat: THREE.ShaderMaterial;
  u: Record<string, THREE.IUniform>;
  private scene = new THREE.Scene();
  constructor(frag: string, uniforms: Record<string, THREE.IUniform> = {}, o: { blending?: THREE.Blending; transparent?: boolean } = {}) {
    this.u = { uRes: { value: new THREE.Vector2(W, H) }, ...uniforms };
    this.mat = new THREE.ShaderMaterial({
      // no explicit glslVersion: three compiles GLSL 300 es and maps gl_FragColor / texture2D for us
      vertexShader: FS_VERT,
      fragmentShader: `precision highp float;\nin vec2 vUv;\nuniform vec2 uRes;\n${GLSL_COMMON}\n${frag}`,
      uniforms: this.u,
      depthTest: false,
      depthWrite: false,
      blending: o.blending ?? THREE.NoBlending,
      transparent: o.transparent ?? false,
    });
    const m = new THREE.Mesh(triGeo, this.mat);
    m.frustumCulled = false;
    this.scene.add(m);
  }
  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null) {
    renderer.setRenderTarget(target);
    renderer.render(this.scene, fsCam);
  }
}

export type BlendMode = 'normal' | 'add' | 'screen' | 'multiply' | 'replace';

/** Draws a texture onto a target with a blend mode (textures are premultiplied). */
export class Compositor {
  private passes = new Map<BlendMode, FSPass>();
  private frag = /* glsl */ `
    uniform sampler2D tex; uniform float opacity; uniform vec3 tint; uniform vec2 offset; uniform vec2 scale; uniform float flipY;
    void main() {
      vec2 uv = (vUv - 0.5) / scale + 0.5 - offset;
      if (flipY > 0.5) uv.y = 1.0 - uv.y;
      if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) { gl_FragColor = vec4(0); return; }
      vec4 c = texture(tex, uv);
      gl_FragColor = vec4(c.rgb * tint, c.a) * opacity;
    }`;
  private get(mode: BlendMode) {
    let p = this.passes.get(mode);
    if (!p) {
      const blend: Partial<THREE.Material> = {};
      p = new FSPass(this.frag, {
        tex: { value: null }, opacity: { value: 1 }, tint: { value: new THREE.Vector3(1, 1, 1) },
        offset: { value: new THREE.Vector2() }, scale: { value: new THREE.Vector2(1, 1) }, flipY: { value: 0 },
      }, { transparent: mode !== 'replace' });
      const m = p.mat;
      m.blending = mode === 'replace' ? THREE.NoBlending : THREE.CustomBlending;
      m.blendEquation = THREE.AddEquation;
      if (mode === 'normal') { m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor; }
      if (mode === 'add') { m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneFactor; }
      if (mode === 'screen') { m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcColorFactor; }
      if (mode === 'multiply') { m.blendSrc = THREE.DstColorFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor; }
      m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
      void blend;
      this.passes.set(mode, p);
    }
    return p;
  }
  draw(renderer: THREE.WebGLRenderer, tex: THREE.Texture, target: THREE.WebGLRenderTarget | null,
    o: { mode?: BlendMode; opacity?: number; tint?: number[] | number; offset?: [number, number]; scale?: number | [number, number]; flipY?: boolean } = {}) {
    const p = this.get(o.mode ?? 'normal');
    p.u.tex!.value = tex;
    p.u.opacity!.value = o.opacity ?? 1;
    const tint = typeof o.tint === 'number' ? [o.tint, o.tint, o.tint] : o.tint ?? [1, 1, 1];
    (p.u.tint!.value as THREE.Vector3).set(tint[0]!, tint[1]!, tint[2]!);
    (p.u.offset!.value as THREE.Vector2).set(o.offset?.[0] ?? 0, o.offset?.[1] ?? 0);
    const s = typeof o.scale === 'number' ? [o.scale, o.scale] : o.scale ?? [1, 1];
    (p.u.scale!.value as THREE.Vector2).set(s[0]!, s[1]!);
    p.u.flipY!.value = o.flipY ? 1 : 0;
    p.render(renderer, target);
  }
}

/** A Canvas2D layer (logical px, y down) uploaded as an sRGB premultiplied texture. */
export class Layer2D {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  w: number;
  h: number;
  constructor(w = W, h = H) {
    this.w = w;
    this.h = h;
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d', { alpha: true })!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.premultiplyAlpha = true;
    this.tex.generateMipmaps = false;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.magFilter = THREE.LinearFilter;
  }
  clear() {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.globalAlpha = 1;
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.filter = 'none';
    this.ctx.shadowBlur = 0;
    this.ctx.shadowColor = 'transparent';
    this.ctx.clearRect(0, 0, this.w, this.h);
    return this.ctx;
  }
  upload() {
    this.tex.needsUpdate = true;
    return this.tex;
  }
}

/** Screen-space orthographic camera: units = px, origin at the centre, y up. */
export function screenCamera() {
  const c = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, -5000, 5000);
  c.position.z = 1000;
  return c;
}
