// qiita: 英語のドキュメントは呪文みたい — a magic circle (魔法陣) whose runes are English API docs.
// One static texture; each ring band rotates on its own and is "drawn on" by a sweep.
import * as THREE from 'three';
import { font } from '../engine/fonts';
import { canvasTexture, circleText } from './loop-util';

/** ring band boundaries (fraction of the radius) */
export const BANDS = [0, 0.26, 0.47, 0.6, 0.69, 0.79, 0.885, 1.0];
export const NB = BANDS.length - 1;

const OUTER = 'DOCUMENTATION  ·  Parameters  ·  Return value  ·  Exceptions  ·  Examples  ·  Specifications  ·  Browser compatibility  ·  See also  ·  ';
const R2 = 'Returns a Promise that resolves to a Response object.  If the request fails, the promise is rejected with a TypeError.  ';
const R3 = '@param {RequestInfo} input    @param {RequestInit} [init]    @returns {Promise<Response>}    @throws {TypeError}    @since v18.0.0    ';
const R4 = 'This method is not idempotent.  Behavior is implementation-defined.  Optional.  Defaults to undefined.  ';
const R5 = '{ }  =>  ( )  [ ]  < >  ;  ::  ?.  ??  &&  ||  !==  ...  <T>  ';
const R6 = 'async function*  ·  await  ·  yield  ·  new Proxy(target, handler)  ·  Symbol.iterator  ·  ';

function circleTex() {
  const S = 2048, C = S / 2, R = S / 2 - 8;
  return canvasTexture(S, S, (c) => {
    c.strokeStyle = '#fff'; c.fillStyle = '#fff';
    const ring = (f: number, w: number) => { c.lineWidth = w; c.beginPath(); c.arc(C, C, f * R, 0, Math.PI * 2); c.stroke(); };
    const poly = (f: number, n: number, step: number, rot: number, w: number) => {
      c.lineWidth = w; c.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = rot + ((i * step) % n) * (Math.PI * 2) / n;
        const x = C + Math.cos(a) * f * R, y = C + Math.sin(a) * f * R;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
    };
    // outer band 0.885..1
    ring(0.995, 6); ring(0.975, 2); ring(0.89, 4);
    circleText(c, OUTER, C, C, 0.932 * R, 44, 'mono8', { fill: '#fff', tracking: 0.04 });
    // 0.79..0.885: the sentence
    ring(0.795, 2);
    circleText(c, R2, C, C, 0.84 * R, 31, 'mono4', { fill: '#fff' });
    // 0.69..0.79: jsdoc + ticks
    ring(0.695, 3);
    for (let i = 0; i < 240; i++) {
      const a = (i / 240) * Math.PI * 2, big = i % 10 === 0;
      c.lineWidth = big ? 4 : 2;
      c.beginPath(); c.moveTo(C + Math.cos(a) * 0.70 * R, C + Math.sin(a) * 0.70 * R); c.lineTo(C + Math.cos(a) * (big ? 0.725 : 0.712) * R, C + Math.sin(a) * (big ? 0.725 : 0.712) * R); c.stroke();
    }
    circleText(c, R3, C, C, 0.755 * R, 26, 'mono4', { fill: '#fff' });
    // 0.6..0.69: a seven-pointed star + notes
    poly(0.685, 7, 3, -Math.PI / 2, 4);
    ring(0.605, 2.5);
    circleText(c, R4, C, C, 0.645 * R, 22, 'mono4', { fill: '#fff', alpha: 0.85 });
    // 0.47..0.6: punctuation runes between two rings
    ring(0.585, 2); ring(0.48, 3);
    circleText(c, R5, C, C, 0.532 * R, 40, 'mono8', { fill: '#fff' });
    // 0.26..0.47: hexagram + inner ring text
    poly(0.465, 6, 2, -Math.PI / 2, 4); poly(0.465, 6, 2, -Math.PI / 2 + Math.PI / 6, 2);
    ring(0.4, 2);
    circleText(c, R6, C, C, 0.365 * R, 26, 'mono4', { fill: '#fff' });
    ring(0.265, 4);
    // centre sigil
    ring(0.2, 2); ring(0.12, 3);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      c.lineWidth = 3; c.beginPath(); c.moveTo(C + Math.cos(a) * 0.12 * R, C + Math.sin(a) * 0.12 * R); c.lineTo(C + Math.cos(a) * 0.25 * R, C + Math.sin(a) * 0.25 * R); c.stroke();
    }
    c.font = font('mono8', 54); c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('{ }', C, C);
  }, { srgb: false, aniso: 16 });
}

const VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = /* glsl */ `
uniform sampler2D map; uniform float rot[${NB}]; uniform float rev[${NB}]; uniform float gain[${NB}]; uniform float bands[${NB + 1}];
uniform vec3 colA; uniform vec3 colB; uniform vec3 colR; uniform float redSeg; uniform float ghost;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  int b = 0;
  for (int i = 0; i < ${NB}; i++) if (r >= bands[i]) b = i;
  float a = atan(p.y, p.x) - rot[b];
  vec2 q = vec2(cos(a), sin(a)) * r;
  float m = texture2D(map, q * 0.5 + 0.5).a;
  // draw-on sweep, clockwise from 12 o'clock
  float u = fract((1.5707963 - a) / 6.2831853);
  float rv = rev[b];
  float vis = rv >= 0.999 ? 1.0 : smoothstep(rv + 0.002, rv - 0.01, u);
  float tip = rv > 0.001 && rv < 0.999 ? exp(-pow((u - rv) * 45.0, 2.0)) : 0.0;
  vec3 c = mix(colA, colB, smoothstep(0.2, 1.0, r));
  // a red @deprecated arc creeps in on one band
  float red = redSeg * step(0.79, r) * step(r, 0.885) * smoothstep(0.02, 0.0, abs(fract(u * 1.0 + 0.1) - 0.5) - 0.07);
  c = mix(c, colR, red);
  vec3 col = c * m * max(vis * gain[b], ghost) + colB * m * tip * 6.0;
  // faint glow disc under the runes
  col += colA * 0.03 * vis * gain[b] * smoothstep(1.0, 0.0, r);
  gl_FragColor = vec4(col, 1.0);
}`;

export class MagicCircle {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  rot = new Array(NB).fill(0);
  rev = new Array(NB).fill(0);
  gain = new Array(NB).fill(1);
  constructor(radius: number) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        map: { value: circleTex() }, rot: { value: this.rot }, rev: { value: this.rev }, gain: { value: this.gain }, bands: { value: BANDS },
        colA: { value: new THREE.Color(0.25, 0.9, 1.6) }, colB: { value: new THREE.Color(0.75, 0.95, 1.4) }, colR: { value: new THREE.Color(2.2, 0.08, 0.2) },
        redSeg: { value: 0 }, ghost: { value: 0.1 },
      },
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.renderOrder = 2;
  }
}
