// The world of the ending (shared by success S5 and the outro): the dev's room — desk, monitor,
// cold mug, a big window with half-open blinds — high above a city; a camera-aware sky with the
// sun, high cirrus and a sea of clouds; screen-space god rays (occlusion pass + radial blur).
// Lighting is a small analytic model (screen area light, window sky light, sun through the
// window with blind-slat stripes and a monitor shadow), so it is cheap and fully deterministic.
import * as THREE from 'three';
import { FSPass, GLSL_COMMON, H, W, makeRT, type Compositor } from '../engine/gl';
import { col } from '../engine/palette';
import { mulberry32 } from '../engine/util';

export const ROOM = {
  wallZ: -70,
  win: [-118, 118, 6, 132] as [number, number, number, number], // x0 x1 y0 y1
  mullX: -34,
  blind: [86, 132, 2.6, 0.62] as [number, number, number, number], // y0 y1 spacing openFrac
  scr: { c: new THREE.Vector3(12, 30, -29.9), hw: 32, hh: 18 },
  mon: { min: new THREE.Vector3(-21.4, 10.6, -33.6), max: new THREE.Vector3(45.4, 49.4, -30) },
  mug: new THREE.Vector3(-40, 0, -2),
  groundY: -900,
};

const ROOM_VERT = /* glsl */ `
varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 lp = vec4(position, 1.0);
  vec3 n = normal;
  #ifdef USE_INSTANCING
  lp = instanceMatrix * lp; n = mat3(instanceMatrix) * n;
  #endif
  vec4 wp = modelMatrix * lp;
  vW = wp.xyz; vN = normalize(mat3(modelMatrix) * n); vL = position;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const ROOM_FRAG = /* glsl */ `
${GLSL_COMMON}
uniform vec3 uAlbedo; uniform vec3 uEmis; uniform float uOcc; uniform float uKeys; uniform float uGloss;
uniform vec3 uScrC; uniform vec2 uScrH; uniform vec3 uScrCol;
uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec4 uWin; uniform float uWallZ; uniform vec4 uBlind; uniform float uMullX;
uniform vec3 uSkyCol; uniform vec3 uAmb; uniform vec3 uMonMin; uniform vec3 uMonMax;
uniform sampler2D uMap; uniform float uUseMap; uniform float uAlpha;
varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec2 vUv;
float rectLight(vec3 p, vec3 n, vec3 c, vec2 hs, float facing) {
  vec3 q = vec3(clamp(p.x, c.x - hs.x, c.x + hs.x), clamp(p.y, c.y - hs.y, c.y + hs.y), c.z);
  vec3 L = q - p; float d2 = max(dot(L, L), 1.0); L *= inversesqrt(d2);
  float A = 4.0 * hs.x * hs.y;
  float ndl = clamp((dot(n, L) + 0.25) / 1.25, 0.0, 1.0);
  float cs = max(-L.z * facing, 0.0);
  return A / (d2 * 3.14159 + A * 0.6) * ndl * (0.35 + 0.65 * cs);
}
bool hitBox(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax) {
  vec3 inv = 1.0 / rd;
  vec3 t0 = (bmin - ro) * inv, t1 = (bmax - ro) * inv;
  vec3 tn = min(t0, t1), tf = max(t0, t1);
  float a = max(max(tn.x, tn.y), tn.z), b = min(min(tf.x, tf.y), tf.z);
  return b > max(a, 0.0);
}
void main() {
  vec3 n = normalize(vN);
  vec3 p = vW;
  vec3 alb = uAlbedo;
  float aOut = uAlpha;
  if (uUseMap > 0.5) { vec4 tx = texture(uMap, vUv); alb *= tx.rgb; aOut *= tx.a; }
  if (uKeys > 0.5 && n.y > 0.5) {
    vec2 k = vL.xz * vec2(42.0 / 2.0, 13.0 / 0.72);
    vec2 g = abs(fract(vec2(vL.x * 22.0, vL.z * 5.6)) - 0.5);
    alb *= mix(0.55, 1.35, smoothstep(0.46, 0.38, max(g.x, g.y)));
  }
  vec3 E = uAmb;
  E += uScrCol * rectLight(p, n, uScrC, uScrH, 1.0);
  vec3 wc = vec3((uWin.x + uWin.y) * 0.5, (uWin.z + uWin.w) * 0.5, uWallZ);
  vec2 wh = vec2((uWin.y - uWin.x) * 0.5, (uWin.w - uWin.z) * 0.5);
  E += uSkyCol * rectLight(p, n, wc, wh, 1.0) * step(uWallZ - 0.5, p.z);
  // sun through the window (blind slats, mullion, monitor shadow)
  if (uSunDir.z < -0.01 && p.z > uWallZ - 0.5) {
    float s = (uWallZ - p.z) / uSunDir.z;
    vec3 h = p + uSunDir * s;
    float inWin = smoothstep(uWin.x, uWin.x + 1.0, h.x) * smoothstep(uWin.y, uWin.y - 1.0, h.x) * smoothstep(uWin.z, uWin.z + 1.0, h.y) * smoothstep(uWin.w, uWin.w - 1.0, h.y);
    float bl = 1.0;
    if (h.y > uBlind.x && h.y < uBlind.y) { float f = fract((h.y - uBlind.x) / uBlind.z); bl = smoothstep(1.0 - uBlind.w, 1.0 - uBlind.w + 0.12, f); }
    float mull = smoothstep(1.6, 2.6, abs(h.x - uMullX));
    float sh = hitBox(p + n * 0.05, uSunDir, uMonMin, uMonMax) ? 0.0 : 1.0;
    float lit = inWin * bl * mull * sh;
    E += uSunCol * lit * max(dot(n, uSunDir), 0.0);
  }
  vec3 c = alb * (E + uEmis);
  // a touch of sheen toward the window (glossy desk)
  c += uSkyCol * uGloss * pow(max(dot(reflect(normalize(p - cameraPosition), n), normalize(wc - p)), 0.0), 24.0) * 0.08;
  if (uOcc > 0.5) c = vec3(0.0);
  gl_FragColor = vec4(c * aOut, aOut);
}`;

const CITY_VERT = /* glsl */ `
attribute vec4 aBox; attribute vec4 aBox2;
varying vec3 vW; varying vec3 vN; varying vec3 vLoc; varying float vSeed; varying vec3 vSize;
void main() {
  vec3 sz = vec3(aBox.z, aBox2.x, aBox.w);
  vec3 lp = position * sz + vec3(aBox.x, aBox2.z + aBox2.x * 0.5, aBox.y);
  vec4 wp = modelMatrix * vec4(lp, 1.0);
  vW = wp.xyz; vN = normal; vLoc = (position + 0.5) * sz; vSeed = aBox2.y; vSize = sz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const CITY_FRAG = /* glsl */ `
${GLSL_COMMON}
uniform float uOcc; uniform vec3 uBase; uniform vec3 uFog; uniform float uFogK; uniform vec3 uSunDir; uniform vec3 uSunCol;
uniform float uLitThr; uniform vec3 uWinA; uniform vec3 uWinB; uniform vec3 uTop; uniform float uRim;
varying vec3 vW; varying vec3 vN; varying vec3 vLoc; varying float vSeed; varying vec3 vSize;
void main() {
  if (uOcc > 0.5) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  vec3 n = vN;
  vec3 c = uBase * (0.75 + 0.25 * hash11(vSeed * 13.0));
  if (abs(n.y) < 0.5) {
    // windows on the side faces
    float u = abs(n.x) > 0.5 ? vLoc.z : vLoc.x;
    float v = vLoc.y;
    vec2 cell = floor(vec2(u / 7.0, v / 9.0));
    vec2 fr = fract(vec2(u / 7.0, v / 9.0));
    float wnd = step(0.18, fr.x) * step(fr.x, 0.82) * step(0.25, fr.y) * step(fr.y, 0.8);
    float h = hash13(vec3(cell, vSeed * 7.0 + n.x * 3.0 + n.z * 5.0));
    float lit = step(uLitThr, h) * wnd * step(12.0, v) * step(v, vSize.y - 6.0);
    c += mix(uWinA, uWinB, step(0.5, hash11(h * 91.0))) * lit * (0.6 + 0.4 * hash11(h * 37.0));
    c += uSunCol * uRim * max(dot(n, uSunDir), 0.0) * 0.06;
  } else if (n.y > 0.5) {
    c = mix(c, uTop, 0.5);
  }
  float d = length(vW - cameraPosition);
  float fog = 1.0 - exp(-d * uFogK);
  // height haze: lower = hazier
  fog = clamp(fog + smoothstep(-300.0, -900.0, vW.y) * 0.35, 0.0, 1.0);
  c = mix(c, uFog, fog);
  gl_FragColor = vec4(c, 1.0);
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 cR; uniform vec3 cU; uniform vec3 cF; uniform vec3 cP; uniform float tanF; uniform float uT;
uniform vec3 sunDir; uniform float dawn; uniform float occ; uniform float sunK; uniform float cloudY; uniform float cloudAmt;
uniform float cirrus; uniform vec3 hazeCol; uniform float whiteout; uniform float wind; uniform vec2 deckOff; uniform float occWide; uniform float glowK;
vec3 L(vec3 c) { return toLinear(c); }
vec3 skyCol(vec3 d, out float sunMask) {
  float e = d.y;
  float sd = max(dot(d, sunDir), 0.0);
  float ang = acos(clamp(dot(d, sunDir), -1.0, 1.0));
  // night (05:41)
  vec3 nZen = L(vec3(0.03, 0.035, 0.07)), nHor = L(vec3(0.09, 0.08, 0.2));
  vec3 night = mix(nHor, nZen, smoothstep(-0.05, 0.45, e));
  night += L(vec3(0.25, 0.18, 0.45)) * 0.25 * exp(-max(e, 0.0) * 14.0);
  // sunrise: deep indigo -> violet -> rose -> hot gold horizon
  vec3 zen = L(vec3(0.11, 0.13, 0.36)), upper = L(vec3(0.33, 0.24, 0.56)), mid = L(vec3(0.80, 0.42, 0.55)), hor = L(vec3(1.0, 0.62, 0.36));
  vec3 warm = L(vec3(1.0, 0.70, 0.30));
  float e2 = max(e, 0.0);
  float hz = exp(-e2 * 9.0);
  vec3 sky = mix(hor, mid, smoothstep(0.0, 0.12, e2));
  sky = mix(sky, upper, smoothstep(0.08, 0.34, e2));
  sky = mix(sky, zen, smoothstep(0.28, 0.8, e2));
  sky += warm * pow(sd, 22.0) * (0.25 + 0.75 * hz) * 0.9 * glowK;
  sky += L(vec3(1.0, 0.85, 0.55)) * pow(sd, 160.0) * 1.6 * glowK;
  // below the horizon: haze over the city
  if (e < 0.0) sky = mix(sky, hazeCol, smoothstep(0.0, -0.25, e));
  float disk = smoothstep(0.0125, 0.0105, ang);
  sunMask = disk;
  vec3 c = mix(night, sky, dawn);
  c += vec3(1.0, 0.86, 0.6) * (disk * 40.0 + (exp(-ang * 80.0) * 3.0 + exp(-ang * 26.0) * 0.32) * glowK) * sunK * dawn;
  return c;
}
void main() {
  vec2 q = (vUv - 0.5) * 2.0; q.x *= uRes.x / uRes.y;
  vec3 d = normalize(cF + q.x * tanF * cR + q.y * tanF * cU);
  float sm;
  vec3 c = skyCol(d, sm);
  float trans = 1.0;
  // high cirrus (lit by the low sun)
  if (d.y > 0.0 && cirrus > 0.0) {
    float tt = (3200.0 - cP.y) / d.y;
    vec2 pp = (cP.xz + d.xz * tt) * vec2(0.00035, 0.0011) + vec2(uT * 0.004 + wind, 0.0);
    float n = fbm(pp) * 0.8 + 0.2 * fbm(pp * 3.1 + 7.0);
    float a = smoothstep(0.52, 0.78, n) * exp(-tt * 0.00004) * cirrus;
    vec3 cc = mix(L(vec3(0.42, 0.36, 0.55)), L(vec3(1.0, 0.68, 0.5)), 0.55 + 0.45 * pow(max(dot(d, sunDir), 0.0), 4.0)) * mix(0.35, 1.25, dawn);
    c = mix(c, cc, a * 0.85);
    trans *= 1.0 - a * 0.85;
  }
  // the sea of clouds
  if (cloudAmt > 0.0) {
    float dy = cloudY - cP.y;
    if (abs(d.y) > 1e-3 && dy / d.y > 0.0) {
      float tt = dy / d.y;
      vec2 pp = (cP.xz + d.xz * tt + deckOff) * 0.0011 + vec2(0.0, uT * 0.02);
      vec2 w = vec2(fbm(pp * 0.7 + 3.0), fbm(pp * 0.7 + 11.0));
      float n = fbm(pp + w * 1.4);
      bool above = cP.y > cloudY;
      float a = (above ? smoothstep(0.30, 0.52, n) : smoothstep(0.40, 0.64, n)) * cloudAmt;
      float fade = exp(-tt * 0.00006);
      float n2 = fbm(pp + w * 1.4 + normalize(sunDir.xz + 1e-4) * 0.05);
      float lit = clamp((n - n2) * 7.0 + 0.45, 0.0, 1.0);
      float sdc = pow(max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(sunDir.x, 0.0, sunDir.z))), 0.0), 6.0);
      vec3 shade = L(vec3(0.36, 0.30, 0.56));
      vec3 sunTint = L(vec3(1.0, 0.74, 0.48));
      vec3 cc = above ? mix(shade, sunTint, lit * (0.55 + 0.45 * sdc) + 0.15 * smoothstep(0.5, 0.8, n)) * (0.75 + 0.7 * sdc)
                      : mix(L(vec3(0.30, 0.25, 0.45)), L(vec3(0.95, 0.62, 0.55)), 0.35 + 0.4 * n);
      cc = mix(hazeCol * 1.3, cc, fade);
      cc = mix(c, cc, smoothstep(0.0, 0.25, fade) * 0.9 + 0.1);
      c = mix(c, cc, a);
      trans *= 1.0 - a * fade;
    }
  }
  if (occ > 0.5) {
    float ang = acos(clamp(dot(d, sunDir), -1.0, 1.0));
    float s = (smoothstep(0.016, 0.01, ang) * 4.0 + exp(-ang * 16.0) * 2.0 * occWide + exp(-ang * 5.0) * 0.25) * trans;
    gl_FragColor = vec4(vec3(s), 1.0);
    return;
  }
  c = mix(c, L(vec3(1.0, 0.93, 0.84)) * 1.4, whiteout);
  gl_FragColor = vec4(c, 1.0);
}`;

const RAY_FRAG = /* glsl */ `
uniform sampler2D src; uniform vec2 sunUV; uniform float decay; uniform float density; uniform float weight; uniform float floorV; uniform float gam;
void main() {
  vec2 uv = vUv;
  vec2 dlt = (uv - sunUV) * density / 48.0;
  float illum = 1.0;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 48; i++) {
    uv -= dlt;
    acc += texture(src, uv).rgb * illum * weight;
    illum *= decay;
  }
  // contrast curve: drop the uniform in-scatter veil, keep the shafts
  acc = pow(max(acc - floorV, 0.0), vec3(gam));
  gl_FragColor = vec4(acc, 1.0);
}`;

const RAYCOMP_FRAG = /* glsl */ `
uniform sampler2D tex; uniform vec2 sunUV; uniform vec3 tint; uniform float beams; uniform float rot; uniform float uT;
void main() {
  vec3 r = texture(tex, vUv).rgb;
  vec2 p = (vUv - sunUV) * vec2(uRes.x / uRes.y, 1.0);
  float a = atan(p.y, p.x);
  float n = 26.0;
  float cell = floor((a / TAU + 0.5) * n + rot);
  float f = fract((a / TAU + 0.5) * n + rot) - 0.5;
  float h = hash12(vec2(cell, 7.0));
  float w = 0.12 + 0.3 * h;
  float beam = smoothstep(w, w * 0.25, abs(f)) * (0.45 + 0.55 * h) * (0.75 + 0.25 * sin(uT * 2.0 + h * 20.0));
  float m = mix(1.0, 0.25 + 1.5 * beam, beams);
  gl_FragColor = vec4(r * tint * m, 1.0);
}`;

export interface WorldState {
  dawn: number; // 0 = 05:41 pre-dawn night, 1 = sunrise
  sunDir: THREE.Vector3;
  sunK: number; // sun disk intensity
  scrCol: THREE.Color; // screen light colour (linear, HDR) for the room
  scrK: number; // emissive multiplier of the screen picture
  skyCol: THREE.Color; // window sky light into the room
  sunCol: THREE.Color; // sunlight through the window
  amb: THREE.Color;
  rays: number; // god-ray strength
  rayCol: THREE.Color;
  cloudY: number;
  cloudAmt: number;
  cirrus: number;
  city: boolean;
  room: boolean;
  whiteout: number;
  t: number;
  deckOff?: [number, number];
  rayDecay?: number;
  rayWeight?: number;
  occWide?: number;
  rayFloor?: number;
  rayGamma?: number;
  glowK?: number;
  beams?: number;
}

type Uni = Record<string, THREE.IUniform>;

export class World {
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(40, W / H, 0.5, 30000);
  U: Uni;
  roomGroup = new THREE.Group();
  mats: THREE.ShaderMaterial[] = [];
  screen: THREE.Mesh;
  screenMat: THREE.MeshBasicMaterial;
  city: THREE.Mesh;
  cityMat: THREE.ShaderMaterial;
  sky: FSPass;
  occRT = makeRT(480, 270, { depth: true });
  rayRT = makeRT(480, 270, { depth: false });
  rayPass: FSPass;
  rayComp = new FSPass(RAYCOMP_FRAG, { tex: { value: null }, sunUV: { value: new THREE.Vector2() }, tint: { value: new THREE.Vector3(1, 1, 1) }, beams: { value: 0 }, rot: { value: 0 }, uT: { value: 0 } }, { transparent: true, blending: THREE.AdditiveBlending });
  /** troika texts / meshes that should occlude the sun in the ray pass (set black there) */
  occluders: { obj: THREE.Object3D; set: (black: boolean) => void }[] = [];
  noteGroup = new THREE.Group();

  constructor() {
    this.U = {
      uScrC: { value: ROOM.scr.c.clone() }, uScrH: { value: new THREE.Vector2(ROOM.scr.hw, ROOM.scr.hh) }, uScrCol: { value: new THREE.Color(0, 0, 0) },
      uSunDir: { value: new THREE.Vector3(0, 0.1, -1).normalize() }, uSunCol: { value: new THREE.Color(0, 0, 0) },
      uWin: { value: new THREE.Vector4(...ROOM.win) }, uWallZ: { value: ROOM.wallZ }, uBlind: { value: new THREE.Vector4(...ROOM.blind) }, uMullX: { value: ROOM.mullX },
      uSkyCol: { value: new THREE.Color(0, 0, 0) }, uAmb: { value: new THREE.Color(0.002, 0.002, 0.004) }, uOcc: { value: 0 },
      uMonMin: { value: ROOM.mon.min.clone() }, uMonMax: { value: ROOM.mon.max.clone() },
    };
    this.scene.add(this.roomGroup);
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, albedo: string | THREE.Color, o: { emis?: THREE.Color; keys?: boolean; gloss?: number } = {}) => {
      const m = this.roomMat(albedo, o);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      this.roomGroup.add(mesh);
      return mesh;
    };
    const [x0, x1, y0, y1] = ROOM.win;
    const wz = ROOM.wallZ, wt = 12;
    const wall = '#1d2130';
    // wall around the window opening
    box(800, 400, wt, 0, y1 + 200, wz - wt / 2, wall);
    box(800, 400, wt, 0, y0 - 200, wz - wt / 2, wall);
    box(400, y1 - y0, wt, x0 - 200, (y0 + y1) / 2, wz - wt / 2, wall);
    box(400, y1 - y0, wt, x1 + 200, (y0 + y1) / 2, wz - wt / 2, wall);
    // side walls + ceiling (dark)
    box(10, 600, 300, -420, 60, 80, '#14161f');
    box(10, 600, 300, 420, 60, 80, '#14161f');
    box(900, 10, 300, 0, 260, 80, '#101219');
    // window frame + mullion + sill
    const fr = '#0d0f16';
    box(x1 - x0 + 8, 4, 6, 0, y1, wz + 2, fr);
    box(x1 - x0 + 8, 4, 6, 0, y0, wz + 2, fr);
    box(4, y1 - y0, 6, x0, (y0 + y1) / 2, wz + 2, fr);
    box(4, y1 - y0, 6, x1, (y0 + y1) / 2, wz + 2, fr);
    box(3, y1 - y0, 4, ROOM.mullX, (y0 + y1) / 2, wz + 1, fr);
    box(x1 - x0 + 30, 2, 16, 0, y0 - 1, wz + 6, '#20232e');
    // blinds (instanced slats)
    const [b0, b1, bs] = ROOM.blind;
    const nSl = Math.floor((b1 - b0) / bs);
    const slats = new THREE.InstancedMesh(new THREE.BoxGeometry(x1 - x0 - 2, 0.25, bs * 1.25), this.roomMat('#c9c3b8'), nSl);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Sv = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < nSl; i++) {
      Q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.95);
      M.compose(new THREE.Vector3(0, b0 + (i + 0.5) * bs, wz + 3), Q, Sv);
      slats.setMatrixAt(i, M);
    }
    this.roomGroup.add(slats);
    box(x1 - x0, 1.2, 3, 0, b0 - 0.8, wz + 3, '#bdb6aa'); // bottom rail
    // desk
    box(320, 4, 110, 0, -2, -12, '#24252c', { gloss: 1 });
    box(320, 60, 4, 0, -34, 42, '#121318');
    // monitor body, stand, screen
    const { min, max } = ROOM.mon;
    box(max.x - min.x, max.y - min.y, max.z - min.z, (min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2, '#0e1018');
    box(5, 12, 2.6, ROOM.scr.c.x, 5.4, -35, '#15171f');
    box(26, 1.2, 15, ROOM.scr.c.x, 0.6, -33, '#15171f');
    this.screenMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.screen = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.scr.hw * 2, ROOM.scr.hh * 2), this.screenMat);
    this.screen.position.copy(ROOM.scr.c).setZ(-29.95);
    this.roomGroup.add(this.screen);
    // keyboard
    box(44, 1.6, 14, 8, 0.8, 8, '#2a2d38', { keys: true });
    // mug (cold coffee) + handle
    const mugM = this.roomMat('#d9d4cc');
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(4.3, 4.0, 10, 32, 1, true), mugM);
    mug.position.set(ROOM.mug.x, 5, ROOM.mug.z);
    this.roomGroup.add(mug);
    const coffee = new THREE.Mesh(new THREE.CircleGeometry(4.1, 32), this.roomMat('#1a0f08'));
    coffee.rotation.x = -Math.PI / 2; coffee.position.set(ROOM.mug.x, 8.6, ROOM.mug.z);
    this.roomGroup.add(coffee);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.75, 10, 24, Math.PI * 1.1), mugM);
    handle.position.set(ROOM.mug.x + 4.5, 5.2, ROOM.mug.z); handle.rotation.z = -Math.PI * 0.55;
    this.roomGroup.add(handle);
    this.roomGroup.add(this.noteGroup);

    // --- city (instanced boxes)
    const geo = new THREE.InstancedBufferGeometry();
    const bg = new THREE.BoxGeometry(1, 1, 1);
    geo.index = bg.index;
    geo.setAttribute('position', bg.getAttribute('position'));
    geo.setAttribute('normal', bg.getAttribute('normal'));
    const r = mulberry32(42);
    const list: number[][] = [];
    for (let gz = 0; gz < 64; gz++) for (let gx = -30; gx <= 30; gx++) {
      if (r() < 0.12) continue;
      const z = -260 - gz * 150 - r() * 40;
      const x = gx * 150 + (r() - 0.5) * 50;
      const w = 50 + r() * 90, d = 50 + r() * 90;
      const near = Math.abs(x) < 300 && gz < 6;
      let h = 120 + Math.pow(r(), 2.2) * 900;
      if (near) h = Math.min(h, 700); // keep the view out of the window open
      // the flight corridor (an avenue straight ahead of the window)
      if (gz < 26 && Math.abs(x) < 150 + Math.max(w, d) / 2) continue;
      if (gz >= 4 && gz < 26 && Math.abs(x) < 420) h = Math.max(h, 650 + r() * 500); // a canyon of towers
      list.push([x, z, w, d, h, r() * 100]);
    }
    const n = list.length;
    const a = new Float32Array(n * 4), b = new Float32Array(n * 4);
    list.forEach((v, i) => { a.set([v[0]!, v[1]!, v[2]!, v[3]!], i * 4); b.set([v[4]!, v[5]!, ROOM.groundY, 0], i * 4); });
    geo.setAttribute('aBox', new THREE.InstancedBufferAttribute(a, 4));
    geo.setAttribute('aBox2', new THREE.InstancedBufferAttribute(b, 4));
    geo.instanceCount = n;
    this.cityMat = new THREE.ShaderMaterial({
      vertexShader: CITY_VERT, fragmentShader: CITY_FRAG,
      uniforms: {
        uOcc: this.U.uOcc!, uSunDir: this.U.uSunDir!, uSunCol: { value: new THREE.Color() },
        uBase: { value: new THREE.Color() }, uFog: { value: new THREE.Color() }, uFogK: { value: 0.0004 }, uLitThr: { value: 0.8 },
        uWinA: { value: col('amber', 1.2) }, uWinB: { value: col('ice', 0.8) }, uTop: { value: new THREE.Color() }, uRim: { value: 1 },
      },
    });
    this.city = new THREE.Mesh(geo, this.cityMat);
    this.city.frustumCulled = false;
    this.scene.add(this.city);

    this.sky = new FSPass(SKY_FRAG, {
      cR: { value: new THREE.Vector3() }, cU: { value: new THREE.Vector3() }, cF: { value: new THREE.Vector3() }, cP: { value: new THREE.Vector3() },
      tanF: { value: 0.36 }, uT: { value: 0 }, sunDir: { value: new THREE.Vector3(0, 0.05, -1).normalize() }, dawn: { value: 0 }, occ: { value: 0 },
      sunK: { value: 1 }, cloudY: { value: 1800 }, cloudAmt: { value: 0 }, cirrus: { value: 0 }, hazeCol: { value: new THREE.Color() }, whiteout: { value: 0 },
      wind: { value: 0 }, deckOff: { value: new THREE.Vector2(0, 0) }, occWide: { value: 1 }, glowK: { value: 1 },
    });
    this.rayPass = new FSPass(RAY_FRAG, { src: { value: this.occRT.texture }, sunUV: { value: new THREE.Vector2(0.5, 0.5) }, decay: { value: 0.955 }, density: { value: 0.9 }, weight: { value: 0.045 }, floorV: { value: 0 }, gam: { value: 1 } });
  }

  roomMat(albedo: string | THREE.Color, o: { emis?: THREE.Color; keys?: boolean; gloss?: number; map?: THREE.Texture; transparent?: boolean } = {}) {
    const m = new THREE.ShaderMaterial({
      vertexShader: ROOM_VERT, fragmentShader: ROOM_FRAG,
      uniforms: {
        ...this.U, uAlbedo: { value: (albedo instanceof THREE.Color ? albedo.clone() : col(albedo)) }, uEmis: { value: o.emis ?? new THREE.Color(0, 0, 0) },
        uKeys: { value: o.keys ? 1 : 0 }, uGloss: { value: o.gloss ?? 0 }, uMap: { value: o.map ?? null }, uUseMap: { value: o.map ? 1 : 0 },
        uAlpha: { value: 1 },
      },
      transparent: !!o.transparent, depthWrite: !o.transparent,
    });
    if (o.transparent) { m.blending = THREE.CustomBlending; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor; }
    this.mats.push(m);
    return m;
  }

  /** set lighting + sky state */
  set(s: WorldState) {
    const U = this.U;
    (U.uSunDir!.value as THREE.Vector3).copy(s.sunDir);
    (U.uSunCol!.value as THREE.Color).copy(s.sunCol);
    (U.uScrCol!.value as THREE.Color).copy(s.scrCol);
    (U.uSkyCol!.value as THREE.Color).copy(s.skyCol);
    (U.uAmb!.value as THREE.Color).copy(s.amb);
    this.screenMat.color.setScalar(s.scrK);
    this.roomGroup.visible = s.room;
    this.city.visible = s.city;
    const cu = this.cityMat.uniforms;
    const nightBase = new THREE.Color(0.006, 0.007, 0.014), dawnBase = new THREE.Color(0.03, 0.022, 0.04);
    (cu.uBase!.value as THREE.Color).copy(nightBase).lerp(dawnBase, s.dawn);
    const haze = new THREE.Color(0.03, 0.03, 0.08).lerp(col('#c98a7a', 0.55), s.dawn);
    (cu.uFog!.value as THREE.Color).copy(haze);
    (cu.uTop!.value as THREE.Color).copy(new THREE.Color(0.01, 0.012, 0.03).lerp(col('#6a4a6a', 0.5), s.dawn));
    cu.uFogK!.value = 0.00022 + 0.0001 * s.dawn;
    cu.uLitThr!.value = 0.72 + 0.2 * s.dawn;
    (cu.uSunCol!.value as THREE.Color).copy(s.sunCol);
    const su = this.sky.u;
    (su.sunDir!.value as THREE.Vector3).copy(s.sunDir);
    su.dawn!.value = s.dawn; su.sunK!.value = s.sunK; su.cloudY!.value = s.cloudY; su.cloudAmt!.value = s.cloudAmt; su.cirrus!.value = s.cirrus;
    (su.hazeCol!.value as THREE.Color).copy(haze);
    su.whiteout!.value = s.whiteout; su.uT!.value = s.t;
    (su.deckOff!.value as THREE.Vector2).set(s.deckOff?.[0] ?? 0, s.deckOff?.[1] ?? 0);
    su.occWide!.value = s.occWide ?? 1;
    su.glowK!.value = s.glowK ?? 1;
    this.rayPass.u.decay!.value = s.rayDecay ?? 0.965;
    this.rayPass.u.weight!.value = s.rayWeight ?? 0.05;
    this.rayPass.u.floorV!.value = s.rayFloor ?? 0;
    this.rayPass.u.gam!.value = s.rayGamma ?? 1;
    this.state = s;
  }
  state?: WorldState;

  private camUniforms() {
    const c = this.cam;
    c.updateMatrixWorld();
    const e = c.matrixWorld.elements;
    const su = this.sky.u;
    (su.cR!.value as THREE.Vector3).set(e[0]!, e[1]!, e[2]!);
    (su.cU!.value as THREE.Vector3).set(e[4]!, e[5]!, e[6]!);
    (su.cF!.value as THREE.Vector3).set(-e[8]!, -e[9]!, -e[10]!);
    (su.cP!.value as THREE.Vector3).setFromMatrixPosition(c.matrixWorld);
    su.tanF!.value = Math.tan((c.fov * Math.PI) / 360) / c.zoom;
  }

  /** draw sky + world (+ god rays) into out */
  render(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, comp: Compositor, extra?: THREE.Scene) {
    this.camUniforms();
    const s = this.state!;
    this.sky.u.occ!.value = 0;
    this.sky.render(renderer, out);
    renderer.setRenderTarget(out);
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.cam);
    if (s.rays > 0.001 && s.dawn > 0.01) {
      // sun position on screen
      const v = new THREE.Vector4(s.sunDir.x, s.sunDir.y, s.sunDir.z, 0).applyMatrix4(this.cam.matrixWorldInverse).applyMatrix4(this.cam.projectionMatrix);
      if (v.w > 0.0001) {
        const sx = v.x / v.w * 0.5 + 0.5, sy = v.y / v.w * 0.5 + 0.5;
        (this.rayPass.u.sunUV!.value as THREE.Vector2).set(sx, sy);
        this.sky.u.occ!.value = 1;
        this.U.uOcc!.value = 1;
        this.sky.render(renderer, this.occRT);
        renderer.setRenderTarget(this.occRT);
        renderer.clearDepth();
        for (const o of this.occluders) o.set(true);
        const sc = this.screenMat.color.r;
        this.screenMat.color.setScalar(0);
        renderer.render(this.scene, this.cam);
        if (extra) renderer.render(extra, this.cam);
        this.screenMat.color.setScalar(sc);
        for (const o of this.occluders) o.set(false);
        this.U.uOcc!.value = 0;
        this.sky.u.occ!.value = 0;
        this.rayPass.render(renderer, this.rayRT);
        const rc = s.rayCol;
        const ru = this.rayComp.u;
        ru.tex!.value = this.rayRT.texture;
        (ru.sunUV!.value as THREE.Vector2).set(sx, sy);
        (ru.tint!.value as THREE.Vector3).set(rc.r * s.rays, rc.g * s.rays, rc.b * s.rays);
        ru.beams!.value = s.beams ?? 0.35;
        ru.rot!.value = s.t * 0.05;
        ru.uT!.value = s.t;
        this.rayComp.render(renderer, out);
        const dbg = (globalThis as { __dbgRays?: number }).__dbgRays;
        if (dbg === 1) comp.draw(renderer, this.occRT.texture, out, { mode: 'replace' });
        if (dbg === 2) comp.draw(renderer, this.rayRT.texture, out, { mode: 'replace', tint: [rc.r * s.rays, rc.g * s.rays, rc.b * s.rays] });
      }
    }
    // foreground objects (title, words, cursor) after the rays: they occlude the rays but are not washed by them
    if (extra) {
      renderer.setRenderTarget(out);
      renderer.autoClear = false;
      renderer.render(extra, this.cam);
    }
  }
}
