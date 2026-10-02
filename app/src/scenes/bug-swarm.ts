// The bug: a beetle made of thousands of red error glyphs (instanced quads, all motion
// in the vertex shader). Shared by the chorus boss act and the drop.
// Uniforms: t, kick, snare, frame, hitE (s since a strike, -1 = none), hitP (bug units),
// scale (px per bug unit), center (px from screen centre, y up), wound (0..1).
// Use under screenCamera() (px space).
import * as THREE from 'three';
import { font } from '../engine/fonts';
import { lin } from '../engine/palette';
import { lerp, mulberry32 } from '../engine/util';

const SYMS = ['✕', '!', '?', ';', '{', '}', '<', '>', '/', '0', '1', '#', '$', '%', '&', '*', '~', '^', '|', '=', '+', '¥', '@', 'Ø', 'E', 'R', '×', '▲', '■', '◆', '※', '!?'];
export const BUG_SCALE = 300; // px per bug unit
export const BUG_C = new THREE.Vector2(330, 40); // centre (px from screen centre, y up)

type Seg2 = [number, number, number, number];
const LEGS: Seg2[][] = [];
for (const s of [-1, 1]) {
  LEGS.push([[0.42 * s, 0.5, 0.95 * s, 0.9], [0.95 * s, 0.9, 1.3 * s, 0.62]]);
  LEGS.push([[0.58 * s, 0.12, 1.12 * s, 0.25], [1.12 * s, 0.25, 1.5 * s, -0.12]]);
  LEGS.push([[0.55 * s, -0.42, 1.05 * s, -0.68], [1.05 * s, -0.68, 1.32 * s, -1.15]]);
}
const ANT: Seg2[][] = [[[-0.1, 1.08, -0.38, 1.45], [-0.38, 1.45, -0.66, 1.52]], [[0.1, 1.08, 0.38, 1.45], [0.38, 1.45, 0.66, 1.52]]];

function inBody(x: number, y: number) {
  const e = (cx: number, cy: number, rx: number, ry: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1;
  if (Math.abs(x) < 0.025 && y < 0.3 && y > -1.0) return false; // elytra split
  return e(0, -0.28, 0.64, 0.8) || e(0, 0.52, 0.5, 0.3) || e(0, 0.92, 0.23, 0.2);
}

export function makeBugSwarm(o: { seed: number; count: number; wound?: number }): { mesh: THREE.Mesh; mat: THREE.ShaderMaterial } {
  // ---- glyph atlas
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  SYMS.forEach((s, i) => {
    const x = (i % 8) * 64 + 32, y = Math.floor(i / 8) * 64 + 34;
    g.font = font(s.length > 1 ? 'mono8' : 'dot', s.length > 1 ? 34 : 52);
    g.fillText(s, x, y);
  });
  const atlas = new THREE.CanvasTexture(cv);
  // ---- sample the beetle
  const rnd = mulberry32(o.seed);
  const N = o.count;
  const pos: number[] = [], data: number[] = [], part: number[] = [];
  const segPoint = (segs: Seg2[], u: number): [number, number] => {
    const k = Math.min(segs.length - 1, Math.floor(u * segs.length));
    const f = u * segs.length - k;
    const [a, b, c, d] = segs[k]!;
    return [lerp(a, c, f), lerp(b, d, f)];
  };
  let i = 0;
  while (i < N) {
    let x: number, y: number, pid = 0, rx = 0, ry = 0;
    const r = rnd();
    if (r < 0.2) {
      const li = Math.floor(rnd() * 6);
      [x, y] = segPoint(LEGS[li]!, rnd());
      x += (rnd() - 0.5) * 0.07; y += (rnd() - 0.5) * 0.07;
      pid = 1 + li; [rx, ry] = [LEGS[li]![0]![0], LEGS[li]![0]![1]];
    } else if (r < 0.25) {
      const ai = Math.floor(rnd() * 2);
      [x, y] = segPoint(ANT[ai]!, rnd());
      x += (rnd() - 0.5) * 0.035; y += (rnd() - 0.5) * 0.035;
      pid = 7 + ai; [rx, ry] = [ANT[ai]![0]![0], ANT[ai]![0]![1]];
    } else {
      x = (rnd() - 0.5) * 1.4; y = -1.1 + rnd() * 2.25;
      if (!inBody(x, y)) continue;
    }
    pos.push(x, y, 0);
    // size, glyph, colour variant, phase
    data.push(0.5 + rnd() * 0.9, Math.floor(rnd() * SYMS.length), rnd(), rnd());
    part.push(pid, rx, ry, 0);
    i++;
  }
  // eyes
  for (const s of [-1, 1]) { pos.push(0.1 * s, 0.98, 0); data.push(3.2, 0, 2.0, 0.5); part.push(0, 0, 0, 1); }
  const quad = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.getAttribute('position'));
  geo.setAttribute('uv', quad.getAttribute('uv'));
  geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('aData', new THREE.InstancedBufferAttribute(new Float32Array(data), 4));
  geo.setAttribute('aPart', new THREE.InstancedBufferAttribute(new Float32Array(part), 4));
  geo.instanceCount = pos.length / 3;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      atlas: { value: atlas }, t: { value: 0 }, kick: { value: 0 }, snare: { value: 0 }, frame: { value: 0 },
      hitE: { value: -1 }, hitP: { value: new THREE.Vector2(0.15, 0.1) }, scale: { value: BUG_SCALE }, center: { value: BUG_C.clone() },
      cRed: { value: new THREE.Vector3(...lin('red', 2.2)) }, cEmber: { value: new THREE.Vector3(...lin('ember', 2.0)) }, wound: { value: o.wound ?? 0 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aPos; attribute vec4 aData; attribute vec4 aPart;
      uniform float t, kick, snare, frame, hitE, scale, wound; uniform vec2 hitP, center;
      varying vec2 vUv; varying float vGlyph; varying vec4 vData; varying float vAlpha;
      float h11(float p) { p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
      void main() {
        vec2 p = aPos.xy;
        float pid = aPart.x;
        // legs / antennae twitch around their roots
        if (pid > 0.5) {
          vec2 root = aPart.yz; float ph = pid * 1.7;
          float a = (pid > 6.5 ? 0.22 : 0.12) * sin(t * (pid > 6.5 ? 5.0 : 9.0) + ph) + 0.12 * kick * sign(root.x);
          vec2 d = p - root; float c = cos(a), s = sin(a); p = root + vec2(c * d.x - s * d.y, s * d.x + c * d.y);
        }
        // breathing + kick pulse
        p *= 1.0 + 0.02 * sin(t * 3.0) + 0.05 * kick;
        // jitter
        float ph = aData.w * 100.0;
        p += 0.008 * vec2(sin(t * 7.0 + ph), cos(t * 6.0 + ph * 1.3));
        // glitch slices on snares
        float band = floor((p.y + 2.0) * 9.0);
        float gl = step(0.7, h11(band * 13.1 + floor(frame / 3.0))) * snare;
        p.x += gl * (h11(band + floor(frame / 3.0) * 7.0) - 0.5) * 0.5;
        // damage crater
        vAlpha = 1.0;
        if (hitE >= 0.0) {
          vec2 dd = p - hitP; float r = length(dd);
          float m = smoothstep(0.55, 0.0, r);
          float k = 1.0 - exp(-hitE * 3.5);
          p += normalize(dd + 1e-4) * k * m * (1.2 + h11(ph) * 1.6);
          vAlpha = 1.0 - m * smoothstep(0.0, 0.9, hitE);
        }
        vAlpha *= 1.0 - wound * step(0.82, h11(ph * 3.3)) ;
        vec2 sp = center + p * scale;
        float sz = aData.x * (aPart.w > 0.5 ? 13.0 : 15.0) * (1.0 + 0.25 * kick);
        vec3 wp = vec3(sp + position.xy * sz, 0.0);
        vUv = uv; vGlyph = aData.y; vData = aData;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D atlas; uniform vec3 cRed, cEmber; uniform float kick, t;
      varying vec2 vUv; varying float vGlyph; varying vec4 vData; varying float vAlpha;
      void main() {
        vec2 cell = vec2(mod(vGlyph, 8.0), 7.0 - floor(vGlyph / 8.0));
        float a = texture2D(atlas, (cell + vUv) / 8.0).a;
        vec3 c = vData.z > 1.5 ? vec3(6.0, 5.0, 5.0) : vData.z > 0.86 ? vec3(2.2, 1.6, 1.6) : vData.z > 0.5 ? cEmber : cRed;
        c *= 0.75 + 0.5 * kick + 0.25 * sin(t * 13.0 + vData.w * 50.0);
        gl_FragColor = vec4(c * a * vAlpha, 1.0);
      }`,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, mat };
}
