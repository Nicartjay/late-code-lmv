// Reusable GPU effects. All are pure functions of their inputs (time, seeds).
// NOTE: three's AdditiveBlending is (SRC_ALPHA, ONE): additive shaders must write alpha = 1.
import * as THREE from 'three';
import { FSPass, H, W } from './gl';

/** anime speed lines (集中線) around a centre; additive. intensity 0..1 */
export class SpeedLines {
  pass = new FSPass(/* glsl */ `
    uniform vec2 center; uniform float intensity; uniform float frame; uniform vec3 color; uniform float inner; uniform float density;
    void main() {
      vec2 p = (vUv - center) * vec2(uRes.x / uRes.y, 1.0);
      float r = length(p); float a = atan(p.y, p.x);
      float fr = floor(frame / 2.0);
      float n = density;
      float cell = floor((a / TAU + 0.5) * n);
      float h = hash12(vec2(cell, fr));
      float w = (fract((a / TAU + 0.5) * n) - 0.5);
      float thin = 0.08 + 0.35 * h * h;
      float line = smoothstep(thin, thin * 0.3, abs(w));
      float reach = inner + 0.25 * hash12(vec2(cell + 17.0, fr));
      float m = line * smoothstep(reach, reach + 0.35, r) * step(0.45, h);
      gl_FragColor = vec4(color * m * intensity, 1.0);
    }`, {
    center: { value: new THREE.Vector2(0.5, 0.5) }, intensity: { value: 1 }, frame: { value: 0 },
    color: { value: new THREE.Vector3(1, 1, 1) }, inner: { value: 0.25 }, density: { value: 220 },
  }, { transparent: true, blending: THREE.AdditiveBlending });
  render(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, o: { frame: number; intensity: number; center?: [number, number]; color?: [number, number, number]; inner?: number; density?: number }) {
    const u = this.pass.u;
    u.frame!.value = o.frame;
    u.intensity!.value = o.intensity;
    (u.center!.value as THREE.Vector2).set(o.center?.[0] ?? 0.5, o.center?.[1] ?? 0.5);
    const c = o.color ?? [1, 1, 1];
    (u.color!.value as THREE.Vector3).set(c[0], c[1], c[2]);
    u.inner!.value = o.inner ?? 0.25;
    u.density!.value = o.density ?? 220;
    this.pass.render(renderer, out);
  }
}

/** expanding ring shockwave (additive), time since impact `e` seconds */
export class Shockwave {
  pass = new FSPass(/* glsl */ `
    uniform vec2 center; uniform float e; uniform vec3 color; uniform float speed; uniform float width;
    void main() {
      vec2 p = (vUv - center) * vec2(uRes.x / uRes.y, 1.0);
      float r = length(p); float R = e * speed;
      float d = abs(r - R);
      float ring = exp(-d * d / (width * width)) * exp(-e * 2.5);
      gl_FragColor = vec4(color * ring, 1.0);
    }`, {
    center: { value: new THREE.Vector2(0.5, 0.5) }, e: { value: 0 }, color: { value: new THREE.Vector3(1, 1, 1) },
    speed: { value: 1.6 }, width: { value: 0.02 },
  }, { transparent: true, blending: THREE.AdditiveBlending });
  render(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, e: number, o: { center?: [number, number]; color?: [number, number, number]; speed?: number; width?: number } = {}) {
    if (e < 0 || e > 2) return;
    const u = this.pass.u;
    u.e!.value = e;
    (u.center!.value as THREE.Vector2).set(o.center?.[0] ?? 0.5, o.center?.[1] ?? 0.5);
    const c = o.color ?? [1, 1, 1];
    (u.color!.value as THREE.Vector3).set(c[0], c[1], c[2]);
    u.speed!.value = o.speed ?? 1.6;
    u.width!.value = o.width ?? 0.02;
    this.pass.render(renderer, out);
  }
}

/**
 * Deterministic particle burst rendered as additive points (screen px space or world space).
 * Positions are analytic: p = o + v * (1 - exp(-drag*e)) / drag + 0.5 * g * e^2.
 * Add `points` to a THREE.Scene and call update(e) each frame (e = seconds since burst).
 */
export class Burst {
  points: THREE.Points;
  private mat: THREE.ShaderMaterial;
  constructor(n: number, o: { seed?: number; speed?: [number, number]; size?: [number, number]; life?: [number, number]; drag?: number; gravity?: [number, number, number]; color?: THREE.Color; color2?: THREE.Color; spread3d?: boolean; dir?: [number, number, number]; cone?: number } = {}) {
    const seed = o.seed ?? 1;
    const vel = new Float32Array(n * 3), attr = new Float32Array(n * 4);
    let s = seed * 9301 + 49297;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const [s0, s1] = o.speed ?? [200, 900];
    for (let i = 0; i < n; i++) {
      let x: number, y: number, z: number;
      if (o.spread3d) {
        const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
        x = r * Math.cos(th); y = r * Math.sin(th); z = u;
      } else {
        const th = rnd() * Math.PI * 2; x = Math.cos(th); y = Math.sin(th); z = 0;
      }
      if (o.dir) {
        const c = o.cone ?? 0.5;
        x = o.dir[0] + x * c; y = o.dir[1] + y * c; z = o.dir[2] + z * c;
        const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
      }
      const sp = s0 + (s1 - s0) * Math.pow(rnd(), 1.6);
      vel.set([x * sp, y * sp, z * sp], i * 3);
      const [z0, z1] = o.size ?? [2, 7], [l0, l1] = o.life ?? [0.4, 1.4];
      attr.set([z0 + (z1 - z0) * rnd(), l0 + (l1 - l0) * rnd(), rnd(), rnd()], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('vel', new THREE.BufferAttribute(vel, 3));
    g.setAttribute('attr', new THREE.BufferAttribute(attr, 4));
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        e: { value: 0 }, drag: { value: o.drag ?? 3 }, grav: { value: new THREE.Vector3(...(o.gravity ?? [0, -400, 0])) },
        c1: { value: o.color ?? new THREE.Color(4, 4, 4) }, c2: { value: o.color2 ?? o.color ?? new THREE.Color(2, 2, 2) },
        origin: { value: new THREE.Vector3() }, pxScale: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 vel; attribute vec4 attr; uniform float e, drag, pxScale; uniform vec3 grav, origin; varying float vA; varying float vMix;
        void main() {
          float life = attr.y; float k = clamp(e / life, 0.0, 1.0);
          vec3 p = origin + vel * (1.0 - exp(-drag * e)) / drag + 0.5 * grav * e * e;
          vA = (1.0 - k) * (1.0 - k) * step(0.0, e) * step(e, life); vMix = attr.z;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = attr.x * pxScale * (projectionMatrix[3][3] > 0.5 ? 1.0 : 300.0 / max(1.0, -mv.z));
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 c1, c2; varying float vA; varying float vMix;
        void main() { vec2 q = gl_PointCoord - 0.5; float d = length(q); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(mix(c1, c2, vMix) * a * vA, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
  }
  update(e: number, origin?: THREE.Vector3 | [number, number, number], pxScale = 1) {
    this.mat.uniforms.e!.value = e;
    if (origin) (this.mat.uniforms.origin!.value as THREE.Vector3).set(...(Array.isArray(origin) ? origin : (origin.toArray() as [number, number, number])));
    this.mat.uniforms.pxScale!.value = pxScale;
    this.points.visible = e >= 0;
  }
}

export { W, H };
