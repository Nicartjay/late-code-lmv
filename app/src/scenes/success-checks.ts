// ✓ rain: instanced SDF check marks falling through the frame (screen px space, pure function of t).
import * as THREE from 'three';
import { H, W } from '../engine/gl';
import { mulberry32 } from '../engine/util';
import { CHECK_GLSL } from './success-kit';
import { GLSL_COMMON } from '../engine/gl';

export class CheckRain {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  constructor(n = 220, seed = 7, o: { blend?: 'add' | 'normal'; size?: [number, number]; speed?: [number, number] } = {}) {
    const geo = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    const a = new Float32Array(n * 4), b = new Float32Array(n * 4);
    const r = mulberry32(seed);
    const [z0, z1] = o.size ?? [26, 120];
    const [v0, v1] = o.speed ?? [300, 900];
    for (let i = 0; i < n; i++) {
      const depth = Math.pow(r(), 1.8); // most are small/far
      a.set([r(), r(), v0 + (v1 - v0) * (1 - depth) * (0.7 + 0.3 * r()), z0 + (z1 - z0) * (1 - depth)], i * 4);
      b.set([(r() - 0.5) * 0.8, (r() - 0.5) * 1.5, r(), depth], i * 4);
    }
    geo.setAttribute('aA', new THREE.InstancedBufferAttribute(a, 4));
    geo.setAttribute('aB', new THREE.InstancedBufferAttribute(b, 4));
    geo.instanceCount = n;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        t: { value: 0 }, c1: { value: new THREE.Color(1, 1, 1) }, c2: { value: new THREE.Color(1, 1, 1) }, alpha: { value: 1 },
        area: { value: new THREE.Vector2(W, H) }, reveal: { value: 1 }, sizeK: { value: 1 }, burst: { value: 0 }, center: { value: new THREE.Vector2(0, 0) },
        streak: { value: 0 }, dir: { value: -1 },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aA; attribute vec4 aB; uniform float t; uniform vec2 area; uniform float sizeK; uniform float burst; uniform vec2 center; uniform float streak; uniform float dir;
        varying vec2 vUv; varying float vMix; varying float vDepth; varying float vStreak;
        void main() {
          float sz = aA.w * sizeK;
          float span = area.y + 400.0;
          float y = mod(aA.y * span - t * aA.z, span) - span * 0.5;
          y *= -dir;
          float x = (aA.x - 0.5) * (area.x + 200.0) + sin(t * 1.3 + aA.y * 30.0) * 18.0 * aB.y;
          vec2 p = vec2(x, y);
          // burst: start at the centre and fly out
          p = mix(p, center + (p - center) * (0.15 + 0.85 * (1.0 - burst)), burst);
          float rot = aB.x + sin(t * 2.0 + aB.z * 6.28) * 0.25 * aB.y;
          vec2 lp = position.xy * vec2(1.0, 1.0 + streak * aA.z / 600.0);
          lp.y += streak * aA.z / 1200.0 * sz * 0.0;
          float c = cos(rot), s = sin(rot);
          vec2 q = mat2(c, s, -s, c) * (lp * sz);
          vUv = uv; vMix = aB.z; vDepth = aB.w; vStreak = streak;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p + q, 0.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        ${GLSL_COMMON}
        ${CHECK_GLSL}
        uniform vec3 c1; uniform vec3 c2; uniform float alpha; uniform float reveal;
        varying vec2 vUv; varying float vMix; varying float vDepth; varying float vStreak;
        void main() {
          vec2 p = (vUv - 0.5) * vec2(1.0, 1.0);
          p *= 1.18;
          float d = sdCheckPath(p, reveal);
          float w = 0.085;
          float aa = fwidth(d) * 1.2 + 1e-4;
          float m = smoothstep(w + aa, w - aa, d);
          float g = exp(-max(d - w, 0.0) * 18.0) * 0.35;
          vec3 c = mix(c1, c2, step(0.8, vMix));
          float fade = mix(1.0, 0.45, vDepth);
          float A = (m + g * (1.0 - m)) * alpha * fade;
          gl_FragColor = vec4(c * A, ${o.blend === 'normal' ? 'A' : '1.0'});
        }`,
      transparent: true, depthTest: false, depthWrite: false,
      blending: o.blend === 'normal' ? THREE.CustomBlending : THREE.AdditiveBlending,
    });
    if (o.blend === 'normal') {
      this.mat.blendSrc = THREE.OneFactor; this.mat.blendDst = THREE.OneMinusSrcAlphaFactor; this.mat.blendEquation = THREE.AddEquation;
    }
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }
  set(t: number, o: { c1?: THREE.Color; c2?: THREE.Color; alpha?: number; reveal?: number; sizeK?: number; burst?: number; streak?: number; dir?: number }) {
    const u = this.mat.uniforms;
    u.t!.value = t;
    if (o.c1) (u.c1!.value as THREE.Color).copy(o.c1);
    if (o.c2) (u.c2!.value as THREE.Color).copy(o.c2);
    u.alpha!.value = o.alpha ?? 1;
    u.reveal!.value = o.reveal ?? 1;
    u.sizeK!.value = o.sizeK ?? 1;
    u.burst!.value = o.burst ?? 0;
    u.streak!.value = o.streak ?? 0;
    u.dir!.value = o.dir ?? -1;
  }
}
