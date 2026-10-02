// The green build log: a static atlas of real-looking build/test output lines (drawn once),
// streamed by a fullscreen shader as an infinite plane seen through a virtual camera
// (flat terminal -> tilted crawl -> skimming flight over a floor of light).
import * as THREE from 'three';
import { font } from '../engine/fonts';
import { FSPass } from '../engine/gl';
import { css, HEX } from '../engine/palette';
import { drawCheck } from './success-kit';

type Seg = [string, string];
type LogRow = { ic: 'ok' | 'dot' | 'none' | 'bar'; segs: Seg[] };

const G = HEX.green, B = HEX.bone, M = HEX.mist, S = HEX.steel;
const ok = (...segs: Seg[]): LogRow => ({ ic: 'ok', segs });
const no = (...segs: Seg[]): LogRow => ({ ic: 'none', segs });
const dot = (...segs: Seg[]): LogRow => ({ ic: 'dot', segs });

export const LOG_ROWS: LogRow[] = [
  no(['> night@1.0.0 build', M]),
  no(['> tsc --noEmit && vite build', M]),
  ok(['night.ts', B], ['  (3:10)  ', S], ['hour: 2,', G], ['  fixed', S]),
  ok(['142 modules transformed.', B]),
  dot(['dist/index.html', S], ['            0.46 kB', M]),
  dot(['dist/assets/night-4f2a9c.js', S], ['  142.18 kB │ gzip: 46.03 kB', M]),
  ok(['built in ', B], ['13260.42s', G]),
  no(['PASS', G], ['  tests/coffee.test.ts', B], ['  (4 tests) 18ms', S]),
  ok(['debug() returns "ビルド成功"', B], ['  2ms', S]),
  ok(['night.hour === 2', B], ['  1ms', S]),
  ok(['coffee.sip() resolves', B], ['  0ms', S]),
  no(['PASS', G], ['  tests/patience.test.ts', B], ['  (2 tests) 3ms', S]),
  ok(['patience > 0', B], ['  (0.02)', S]),
  no(['Tests:', M], ['  147 passed', G], [', 147 total', M]),
  no(['Snapshots:', M], ['  0 total', M]),
  no(['Time:', M], ['  3.41 s', B]),
  ok(['lint', B], ['  0 problems (0 errors, 0 warnings)', G]),
  ok(['typecheck', B], ['  Found 0 errors.', G]),
  { ic: 'bar', segs: [['100%', G]] },
  ok(['compile(night)', B], ['  → true', G]),
  ok(['bug.fixed', B], ['  = true', G]),
  dot(['watching for file changes…', S]),
  ok(['src/kitchen.ts', B], ['  ok', G]),
  ok(['src/stackoverflow.ts', B], ['  ok', G]),
  ok(['src/tabs/147.ts', B], ['  closed', G]),
  no(['PASS', G], ['  tests/night.test.ts', B], ['  (12 tests) 40ms', S]),
  ok(['"仕様です" is not a bug', B], ['  ok', G]),
  ok(['search(bug.message) skipped', B], ['  1ms', S]),
  no(['tsc: Found 0 errors. Watching for file changes.', G]),
  ok(['build passed', G], ['  05:41', M]),
  dot(['dist/assets/coffee-91b0e2.css', S], ['  3.12 kB', M]),
  ok(['all checks have passed', G]),
  ok(['night.ts:3', B], ['  hour: 2,', G], ['  // セミコロンじゃなくてカンマ', S]),
  ok(['1 file changed, 1 insertion(+), 1 deletion(-)', G]),
  ok(['memory: 31%', B], ['  ok', G]),
  ok(['patience restored', B], ['  1.00', G]),
  ok(['tests/qiita.test.ts', B], ['  (0 tests needed)', S]),
  no(['Done in 13260.42s.', G]),
];

export class LogAtlas {
  tex: THREE.CanvasTexture;
  rows: number;
  rowH = 48;
  w = 2048;
  constructor(renderer: THREE.WebGLRenderer) {
    this.rows = LOG_ROWS.length;
    const cv = document.createElement('canvas');
    cv.width = this.w; cv.height = this.rows * this.rowH;
    const c = cv.getContext('2d')!;
    c.fillStyle = 'rgba(0,0,0,0)';
    c.clearRect(0, 0, cv.width, cv.height);
    c.textBaseline = 'middle';
    LOG_ROWS.forEach((r, k) => {
      const y = k * this.rowH + this.rowH / 2;
      let x = 64;
      if (r.ic === 'ok') drawCheck(c, x + 10, y, 24, css('green'), 4.5);
      if (r.ic === 'dot') { c.fillStyle = css('steel'); c.fillRect(x + 6, y - 2, 6, 4); }
      x += 44;
      if (r.ic === 'bar') {
        const bw = 760;
        c.fillStyle = css('ink3'); c.fillRect(x, y - 9, bw, 18);
        c.fillStyle = css('green'); c.fillRect(x, y - 9, bw, 18);
        x += bw + 24;
      }
      for (const [s, colr] of r.segs) {
        for (const ch of s) {
          const jp = /[^\x00-\x7f]/.test(ch);
          c.font = font(jp ? 'code4' : 'mono4', 27);
          c.fillStyle = colr;
          c.fillText(ch, x, y + 1);
          x += jp ? 27 : 27 * 0.6;
        }
      }
    });
    this.tex = new THREE.CanvasTexture(cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.premultiplyAlpha = true;
    this.tex.generateMipmaps = true;
    this.tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    this.tex.wrapS = THREE.ClampToEdgeWrapping;
    this.tex.wrapT = THREE.ClampToEdgeWrapping;
    this.tex.needsUpdate = true;
  }
}

/** infinite floor of log text seen from a virtual camera */
export class LogFloor {
  pass: FSPass;
  constructor(public atlas: LogAtlas) {
    this.pass = new FSPass(/* glsl */ `
      uniform sampler2D atlas; uniform float rows; uniform float pitch; uniform float camH; uniform float scroll;
      uniform float tanF; uniform float bright; uniform float glow; uniform float colW; uniform float rowW;
      uniform float roll; uniform float xoff; uniform vec3 fogCol; uniform float fogK; uniform float flashRows; uniform float t;
      uniform float alpha; uniform float bgAmt; uniform float dk; uniform vec3 glowCol; uniform float glare; uniform vec4 shadeBox; uniform float shade;
      void main() {
        vec2 q = (vUv - 0.5) * 2.0; q.x *= uRes.x / uRes.y;
        q = rot2(roll) * q;
        vec3 f = vec3(0.0, -sin(pitch), -cos(pitch));
        vec3 u = vec3(0.0, cos(pitch), -sin(pitch));
        vec3 r = vec3(1.0, 0.0, 0.0);
        vec3 d = normalize(f + q.x * tanF * r + q.y * tanF * u);
        vec3 col = C_INK * bgAmt;
        float a = 0.0;
        if (d.y < -1e-4) {
          float tt = camH / -d.y;
          vec3 p = vec3(xoff, camH, 0.0) + d * tt;
          float vv = -p.z - scroll;
          float rowF = vv / rowW;
          float colF = p.x / colW + 0.5;
          float row = floor(rowF), fy = fract(rowF);
          float cl = floor(colF), fx = fract(colF);
          float k = floor(hash12(vec2(row, cl * 7.0 + 3.0)) * rows);
          vec2 auv = vec2(fx, 1.0 - (k + (1.0 - fy)) / rows);
          vec2 cuv = vec2(colF, -rowF / rows);
          vec4 tx = textureGrad(atlas, auv, dFdx(cuv), dFdy(cuv));
          // occasional row flash (a line being printed)
          float fl = step(0.93, hash12(vec2(row, floor(t * 6.0)))) * flashRows;
          float dist = tt;
          float fog = 1.0 - exp(-dist * fogK);
          vec3 c = tx.rgb * bright * (1.0 + fl * 2.5) * exp(-dist * dk);
          c += vec3(0.02, 0.12, 0.05) * fl * smoothstep(0.0, 0.2, fy) * smoothstep(1.0, 0.8, fy) * bright;
          col = mix(col + c, fogCol, fog);
          a = 1.0;
        } else {
          col = fogCol;
        }
        // horizon glow: a thin hot line + a soft halo + a glare around the vanishing point
        float hz = exp(-abs(d.y) * 60.0) + 0.35 * exp(-abs(d.y) * 9.0);
        col += glowCol * hz * glow;
        vec2 vp = vec2(0.0, tan(pitch) / tanF);
        float gl = exp(-length((q - vp) * vec2(0.35, 1.0)) * 2.2);
        col += glowCol * gl * glare;
        // darken behind the lyric block (soft box in uv)
        vec2 bq = max(shadeBox.xy - vUv, vUv - shadeBox.zw);
        float bd = max(bq.x, bq.y);
        col *= 1.0 - shade * smoothstep(0.12, -0.02, bd);
        gl_FragColor = vec4(col * alpha, 1.0);
      }`, {
      atlas: { value: atlas.tex }, rows: { value: atlas.rows }, pitch: { value: Math.PI / 2 }, camH: { value: 1 }, scroll: { value: 0 },
      tanF: { value: Math.tan((50 * Math.PI) / 360) }, bright: { value: 1 }, glow: { value: 0 }, colW: { value: 1.69 }, rowW: { value: 0.0397 },
      roll: { value: 0 }, xoff: { value: 0 }, fogCol: { value: new THREE.Vector3(0, 0, 0) }, fogK: { value: 0.05 }, flashRows: { value: 0 },
      t: { value: 0 }, alpha: { value: 1 }, bgAmt: { value: 1 }, dk: { value: 0 }, glowCol: { value: new THREE.Vector3(0, 0, 0) }, glare: { value: 0 },
      shadeBox: { value: new THREE.Vector4(0, 0, 0, 0) }, shade: { value: 0 },
    });
  }
  /** row height in world units such that, looking straight down from camH, a row is `px` tall on screen */
  static rowFor(px: number, camH: number, tanF: number) { return (2 * camH * tanF * px) / 1080; }
}
