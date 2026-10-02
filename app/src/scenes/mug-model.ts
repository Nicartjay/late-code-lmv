// The mug: lathe-turned ceramic body with a handle, coffee-stain rings on the inner wall,
// and a shader coffee surface (monitor reflection, drop ripples, frost growing from the rim).
import * as THREE from 'three';
import { GLSL_COMMON } from '../engine/gl';
import { col } from '../engine/palette';

export const R_IN = 3.6; // inner radius (cm-ish units)
export const R_OUT = 4.0;
export const RIM_Y = 9.54;
export const LIQ_Y = 2.0;

/** ripple height on the liquid at local (x, y) [screen-aligned], e seconds after the drop */
export function rippleH(x: number, y: number, e: number) {
  if (e <= 0) return 0;
  const r = Math.hypot(x, y), R = e * 3.0;
  const env = Math.exp(-Math.pow((r - R) * 1.25, 2)) * Math.exp(-e * 1.3);
  const trail = (r < R ? Math.exp(-(R - r) * 0.8) : 0) * Math.exp(-e * 1.8);
  const splash = Math.exp(-r * r * 3) * Math.exp(-e * 6) * Math.sin(e * 30);
  return Math.sin((r - R) * 8.0) * (env + 0.45 * trail) * 0.14 + splash * 0.25;
}

function stainTexture() {
  const cv = document.createElement('canvas');
  cv.width = 16; cv.height = 512;
  const c = cv.getContext('2d')!;
  c.clearRect(0, 0, 16, 512);
  // v: 0 (bottom) .. 1 (rim) -> canvas y flipped
  const ring = (v: number, w: number, a: number) => {
    const y = (1 - v) * 512;
    const g = c.createLinearGradient(0, y - w * 3, 0, y + w);
    g.addColorStop(0, 'rgba(70,40,18,0)');
    g.addColorStop(0.75, `rgba(70,40,18,${a})`);
    g.addColorStop(1, 'rgba(70,40,18,0)');
    c.fillStyle = g; c.fillRect(0, y - w * 3, 16, w * 4);
  };
  ring(0.86, 3, 0.25); ring(0.68, 4, 0.35); ring(0.5, 3, 0.4); ring(0.33, 5, 0.5); ring(0.18, 4, 0.6);
  // haze below the lowest ring
  const g = c.createLinearGradient(0, 512, 0, 512 * 0.7);
  g.addColorStop(0, 'rgba(50,28,12,0.55)'); g.addColorStop(1, 'rgba(50,28,12,0)');
  c.fillStyle = g; c.fillRect(0, 512 * 0.7, 16, 512 * 0.3);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class MugModel {
  group = new THREE.Group();
  liqMat: THREE.ShaderMaterial;
  ceramic: THREE.MeshStandardMaterial;
  constructor() {
    const P: [number, number][] = [
      [0.0, 0.0], [3.5, 0.0], [3.82, 0.08], [3.96, 0.3], [R_OUT, 0.62],
      [R_OUT, 9.2], [3.99, 9.38], [3.96, 9.47], [3.9, 9.53], [3.8, RIM_Y], [3.7, 9.53], [3.64, 9.47], [3.61, 9.38], [R_IN, 9.2],
      [R_IN, 1.0], [3.56, 0.78], [3.42, 0.64], [3.0, 0.6], [0.0, 0.6],
    ];
    const geo = new THREE.LatheGeometry(P.map(([x, y]) => new THREE.Vector2(x, y)), 160);
    this.ceramic = new THREE.MeshStandardMaterial({ color: col('bone'), roughness: 0.32, metalness: 0.0 });
    this.group.add(new THREE.Mesh(geo, this.ceramic));
    // coffee rings on the inner wall
    const sg = new THREE.LatheGeometry([new THREE.Vector2(R_IN - 0.012, 1.0), new THREE.Vector2(R_IN - 0.012, 9.2)], 160);
    const stain = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ map: stainTexture(), transparent: true, roughness: 0.4, depthWrite: false, side: THREE.DoubleSide }));
    stain.renderOrder = 1;
    this.group.add(stain);
    // handle
    const hg = new THREE.TorusGeometry(2.25, 0.5, 24, 64, Math.PI * 1.15);
    const handle = new THREE.Mesh(hg, this.ceramic);
    handle.rotation.z = -Math.PI * 0.575;
    handle.position.set(R_OUT + 0.9, 5.2, 0);
    handle.scale.set(0.8, 1.15, 1);
    this.group.add(handle);

    // coffee
    this.liqMat = new THREE.ShaderMaterial({
      uniforms: {
        uT: { value: 0 }, uWarm: { value: 1 }, uFrost: { value: 0 }, uRip: { value: -1 }, uLight: { value: 1 },
      },
      vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        ${GLSL_COMMON}
        uniform float uT, uWarm, uFrost, uRip, uLight; varying vec2 vP;
        float ripH(vec2 p){
          if (uRip <= 0.0) return 0.0;
          float r = length(p), R = uRip * 3.0;
          float env = exp(-pow((r - R) * 1.25, 2.0)) * exp(-uRip * 1.3);
          float trail = (r < R ? exp(-(R - r) * 0.8) : 0.0) * exp(-uRip * 1.8);
          float splash = exp(-r * r * 3.0) * exp(-uRip * 6.0) * sin(uRip * 30.0);
          return sin((r - R) * 8.0) * (env + 0.45 * trail) * 0.14 + splash * 0.25;
        }
        void main(){
          vec2 p = vP; float r = length(p);
          float e = 0.03, h = ripH(p);
          vec2 g = vec2(ripH(p + vec2(e, 0.0)) - h, ripH(p + vec2(0.0, e)) - h) / e;
          g += vec2(fbm(p * 0.8 + uT * 0.07) - 0.5, fbm(p * 0.8 - uT * 0.06 + 5.0) - 0.5) * 0.22;
          // the monitor reflected on the surface (soft rectangle, upper-left), bent by the ripples
          vec2 hp = rot2(0.5) * (p + g * 1.9 - vec2(-2.05, 1.75));
          float hl = (1.0 - smoothstep(0.7, 1.5, abs(hp.x))) * (1.0 - smoothstep(0.12, 0.42, abs(hp.y)));
          float lines = 0.75 + 0.25 * sin(hp.y * 60.0);
          vec3 cold = vec3(0.0025, 0.0035, 0.008), warm = vec3(0.011, 0.0055, 0.0022);
          vec3 c = mix(cold, warm, uWarm);
          c += mix(vec3(0.08, 0.2, 0.75), vec3(0.45, 0.4, 0.42), uWarm * 0.35) * hl * lines * 0.7 * uLight * (1.0 - 0.85 * uFrost);
          // ripple sheen
          c += C_BLUE * clamp(length(g) - 0.15, 0.0, 1.0) * 0.12 * uLight;
          // meniscus
          float men = exp(-pow((${R_IN.toFixed(2)} - r) * 6.0, 2.0));
          c += mix(vec3(0.03, 0.06, 0.16), vec3(0.07, 0.04, 0.015), uWarm) * men;
          // frost, growing in from the rim
          float edge = (${R_IN.toFixed(2)} - r) / ${R_IN.toFixed(2)};
          float n = fbm(p * 1.7 + 11.0);
          float front = uFrost * 0.3 - edge - 0.12 * (n - 0.5) - 0.06;
          float fr = smoothstep(0.0, 0.05, front);
          float cry = 0.0;
          for (int o = 0; o < 2; o++) {
            float sc = o == 0 ? 2.6 : 7.5;
            vec2 gg = p * sc + float(o) * 9.1; vec2 i0 = floor(gg), f0 = fract(gg);
            float d1 = 8.0, d2 = 8.0;
            for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
              vec2 b = vec2(float(x), float(y)); vec2 rr = b + hash22(i0 + b) - f0; float d = dot(rr, rr);
              if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
            }
            cry += (1.0 - smoothstep(0.0, 0.08, sqrt(d2) - sqrt(d1))) * (o == 0 ? 0.9 : 0.5) + (o == 0 ? 0.15 * (1.0 - sqrt(d1)) : 0.0);
          }
          vec3 ice = vec3(0.35, 0.55, 0.85) * (0.25 + cry) * (0.6 + 0.4 * uLight);
          c = mix(c, ice, fr * 0.85);
          c += vec3(0.5, 0.8, 1.0) * smoothstep(0.05, 0.0, abs(front - 0.02)) * uFrost * 0.35;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const liq = new THREE.Mesh(new THREE.CircleGeometry(R_IN - 0.005, 128), this.liqMat);
    liq.rotation.x = -Math.PI / 2;
    liq.position.y = LIQ_Y;
    this.group.add(liq);
  }
}
