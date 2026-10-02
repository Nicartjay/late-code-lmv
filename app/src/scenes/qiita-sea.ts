// qiita: the sea of article cards. Thousands of instanced cards ride a wave field computed
// on the GPU (the same wave function is mirrored in JS so lyric glyphs can float on it).
import * as THREE from 'three';
import { font } from '../engine/fonts';
import { mulberry32 } from '../engine/util';
import { canvasTexture } from './loop-util';

// generic article titles (no brand, no UI imitation)
export const TITLES = [
  '【解決】npm install が終わらない件', '【初心者】async/await が分からない', 'undefined is not a function の直し方',
  'CORSエラーで3日溶かした話', '【解決済み】ビルドが通らない件', '型エラーが消えない件について', '【図解】Promise を完全に理解した',
  '動かないときに見るチェックリスト', '【解決】なぜか動いた件', '環境変数が読めない件', '【初心者向け】エラーの読み方',
  'npm ERR! の対処法まとめ', '【悲報】本番環境で動かない', 'TypeScript の型パズルに疲れた', 'Docker が起動しない件',
  '【解決】キャッシュを消したら直った', 'console.log デバッグのすすめ', '【保存版】よく使うコマンド集', '【未解決】誰か助けてください',
  '深夜2時のデバッグ術', '【解決】再起動したら直った', '正規表現チートシート【完全版】', 'git rebase で全部消えた話',
  'null と undefined の違い', '【備忘録】ビルドエラー集', 'なぜ動くのか分からない件', 'Segmentation fault の原因',
  '無限ループから抜け出す方法', 'エラー文をちゃんと読もう', '【やってみた】全部書き直した', 'その設定、本当に必要？', 'スタックトレースの読み方',
];
const TAGS = ['#JavaScript', '#TypeScript', '#初心者', '#エラー', '#npm', '#Git', '#Node.js', '#未解決', '#ポエム', '#備忘録', '#Docker', '#CSS'];

export const ATLAS_COLS = 4, ATLAS_ROWS = 8;
function atlas() {
  const tw = 512, th = 256;
  return canvasTexture(tw * ATLAS_COLS, th * ATLAS_ROWS, (c) => {
    const rnd = mulberry32(52);
    for (let i = 0; i < ATLAS_COLS * ATLAS_ROWS; i++) {
      const x = (i % ATLAS_COLS) * tw, y = Math.floor(i / ATLAS_COLS) * th;
      const unsolved = TITLES[i]!.includes('未解決');
      c.save();
      c.beginPath(); c.roundRect(x + 6, y + 6, tw - 12, th - 12, 18); c.clip();
      const g = c.createLinearGradient(x, y, x, y + th);
      g.addColorStop(0, '#16203f'); g.addColorStop(1, '#0b1126');
      c.fillStyle = g; c.fillRect(x, y, tw, th);
      c.fillStyle = unsolved ? '#ff2b4e' : rnd() < 0.5 ? '#62e6ff' : '#2f6bff';
      c.fillRect(x, y, tw, 7);
      // meta row
      c.fillStyle = '#3a4568'; c.beginPath(); c.arc(x + 38, y + 44, 15, 0, Math.PI * 2); c.fill();
      c.font = font('sans4', 21); c.fillStyle = '#9aa6c2'; c.textBaseline = 'middle';
      c.fillText(`@user_${Math.floor(rnd() * 9000 + 1000)}  ·  ${1 + Math.floor(rnd() * 23)}時間前`, x + 64, y + 45);
      // title (wrap into two lines)
      c.font = font('sans9', 37); c.fillStyle = '#eef2fa'; c.textBaseline = 'alphabetic';
      const t = TITLES[i]!;
      const chars = [...t];
      let l1 = '', k = 0;
      while (k < chars.length && c.measureText(l1 + chars[k]).width < tw - 60) l1 += chars[k++];
      const l2 = chars.slice(k).join('');
      c.fillText(l1, x + 26, y + 112);
      if (l2) c.fillText(l2, x + 26, y + 158);
      // tags + likes
      c.font = font('sans7', 21);
      let tx = x + 26;
      for (let j = 0; j < 2; j++) {
        const tag = TAGS[Math.floor(rnd() * TAGS.length)]!;
        const w = c.measureText(tag).width + 22;
        c.fillStyle = '#1f2a52'; c.beginPath(); c.roundRect(tx, y + 188, w, 34, 8); c.fill();
        c.fillStyle = '#c4ecff'; c.textBaseline = 'middle'; c.fillText(tag, tx + 11, y + 206);
        tx += w + 10;
      }
      c.font = font('sans7', 22); c.fillStyle = '#ffb648'; c.textAlign = 'right';
      c.fillText(`★ ${Math.floor(Math.pow(rnd(), 3) * 1800)}`, x + tw - 28, y + 206);
      c.textAlign = 'left';
      c.restore();
    }
  }, { aniso: 16 });
}

// ---------------------------------------------------------------- wave field (GLSL + JS twins)
export const WAVE_GLSL = /* glsl */ `
float waveH(vec2 p, float t, float amp) {
  return amp * (0.55 * sin(0.42 * p.x + 0.31 * p.y - 1.25 * t)
    + 0.30 * sin(-0.27 * p.x + 0.58 * p.y - 1.7 * t + 1.3)
    + 0.18 * sin(0.9 * p.x - 0.75 * p.y - 2.3 * t + 2.1)
    + 0.10 * sin(1.6 * p.x + 1.3 * p.y - 3.1 * t + 0.7));
}`;
export function waveH(x: number, z: number, t: number, amp: number) {
  return amp * (0.55 * Math.sin(0.42 * x + 0.31 * z - 1.25 * t)
    + 0.3 * Math.sin(-0.27 * x + 0.58 * z - 1.7 * t + 1.3)
    + 0.18 * Math.sin(0.9 * x - 0.75 * z - 2.3 * t + 2.1)
    + 0.1 * Math.sin(1.6 * x + 1.3 * z - 3.1 * t + 0.7));
}

const VERT = /* glsl */ `
attribute vec2 aBase; attribute float aTile; attribute vec3 aRnd;
uniform float uT; uniform float uAmp;
varying vec2 vUv; varying float vTile; varying float vH; varying vec3 vW; varying float vRnd; varying vec3 vN;
${WAVE_GLSL}
void main() {
  vec2 b = aBase;
  float h = waveH(b, uT, uAmp);
  float e = 0.35;
  float hx = (waveH(b + vec2(e, 0.0), uT, uAmp) - waveH(b - vec2(e, 0.0), uT, uAmp)) / (2.0 * e);
  float hz = (waveH(b + vec2(0.0, e), uT, uAmp) - waveH(b - vec2(0.0, e), uT, uAmp)) / (2.0 * e);
  vec3 T = normalize(vec3(1.0, hx, 0.0));
  vec3 Z = normalize(vec3(0.0, hz, 1.0));
  float yaw = (aRnd.x - 0.5) * 0.5;
  vec2 lp = vec2(position.x * cos(yaw) - position.y * sin(yaw), position.x * sin(yaw) + position.y * cos(yaw));
  // bob a little more than the surface so the cards jostle
  float bob = (aRnd.z - 0.5) * 0.12 * sin(uT * 2.0 + aRnd.y * 6.28);
  vec3 w = vec3(b.x, h + bob, b.y) + T * lp.x - Z * lp.y;
  vUv = uv; vTile = aTile; vH = h / max(uAmp, 1e-3); vW = w; vRnd = aRnd.y; vN = normalize(cross(T, -Z));
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D uAtlas; uniform vec3 uCam; uniform vec3 uFog; uniform float uFogK; uniform float uGain; uniform float uT; uniform float uUnder;
varying vec2 vUv; varying float vTile; varying float vH; varying vec3 vW; varying float vRnd; varying vec3 vN;
void main() {
  float cols = ${ATLAS_COLS.toFixed(1)}, rows = ${ATLAS_ROWS.toFixed(1)};
  vec2 tile = vec2(mod(vTile, cols), floor(vTile / cols));
  vec2 uv = (vec2(tile.x, rows - 1.0 - tile.y) + vUv) / vec2(cols, rows);
  vec4 c = texture2D(uAtlas, uv);
  if (c.a < 0.5) discard;
  float crest = smoothstep(-0.5, 0.9, vH);
  float glint = pow(max(0.0, sin(vW.x * 0.6 + vW.z * 0.9 + uT * 2.2 + vRnd * 6.0)), 18.0) * crest;
  vec3 col = c.rgb * (0.38 + 0.9 * crest) * uGain + vec3(0.35, 0.75, 1.0) * glint * 0.35;
  // the far light glitters on the cards that face it (a moon path across the sea)
  vec3 vd = normalize(vW - uCam);
  vec3 md = normalize(vec3(0.3, 0.05, -1.0));
  float sp = pow(max(dot(reflect(vd, normalize(vN)), md), 0.0), 90.0);
  col += vec3(0.55, 0.85, 1.0) * sp * 2.4 * (1.0 - uUnder);
  if (!gl_FrontFacing) {
    // seen from below: dark silhouettes with a bright rim
    float rim = smoothstep(0.42, 0.5, max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)));
    col = vec3(0.004, 0.012, 0.03) + vec3(0.2, 0.55, 1.0) * rim * 0.5;
  }
  float d = length(vW - uCam);
  float fog = exp(-max(0.0, d - 4.0) * uFogK);
  col = mix(uFog, col, fog);
  gl_FragColor = vec4(col, 1.0);
}`;

export class CardSea {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  constructor(o: { cols: number; rows: number; sx: number; sz: number; z0: number; seed?: number }) {
    const base = new THREE.PlaneGeometry(2.0, 1.0);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.getAttribute('position'));
    g.setAttribute('uv', base.getAttribute('uv'));
    const n = o.cols * o.rows;
    const aBase = new Float32Array(n * 2), aTile = new Float32Array(n), aRnd = new Float32Array(n * 3);
    const rnd = mulberry32(o.seed ?? 7);
    let k = 0;
    for (let r = 0; r < o.rows; r++) for (let q = 0; q < o.cols; q++) {
      const off = (r % 2) * 0.5;
      aBase[k * 2] = (q - o.cols / 2 + off) * o.sx + (rnd() - 0.5) * 0.25;
      aBase[k * 2 + 1] = o.z0 - r * o.sz + (rnd() - 0.5) * 0.15;
      aTile[k] = Math.floor(rnd() * ATLAS_COLS * ATLAS_ROWS);
      aRnd[k * 3] = rnd(); aRnd[k * 3 + 1] = rnd(); aRnd[k * 3 + 2] = rnd();
      k++;
    }
    g.setAttribute('aBase', new THREE.InstancedBufferAttribute(aBase, 2));
    g.setAttribute('aTile', new THREE.InstancedBufferAttribute(aTile, 1));
    g.setAttribute('aRnd', new THREE.InstancedBufferAttribute(aRnd, 3));
    g.instanceCount = n;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        uAtlas: { value: atlas() }, uT: { value: 0 }, uAmp: { value: 0.55 }, uCam: { value: new THREE.Vector3() },
        uFog: { value: new THREE.Color(0.004, 0.007, 0.02) }, uFogK: { value: 0.045 }, uGain: { value: 1 }, uUnder: { value: 0 },
      },
      side: THREE.DoubleSide, depthTest: true, depthWrite: true,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
  }
  update(t: number, cam: THREE.Camera, o: { amp?: number; gain?: number; fog?: THREE.Color; fogK?: number; under?: number } = {}) {
    this.mat.uniforms.uUnder!.value = o.under ?? 0;
    const u = this.mat.uniforms;
    u.uT!.value = t;
    u.uAmp!.value = o.amp ?? 0.55;
    u.uGain!.value = o.gain ?? 1;
    (u.uCam!.value as THREE.Vector3).copy(cam.position);
    if (o.fog) (u.uFog!.value as THREE.Color).copy(o.fog);
    u.uFogK!.value = o.fogK ?? 0.045;
  }
}
