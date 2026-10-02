// stack (68.20 → 74.08) — L22 スタックオーバーフローにも / L23 私の答えは載っていない (+ 1-bar fill)
// A literal call stack: lyric slabs (スタック / オーバー / フロー / にも) are PUSHED in from
// below — so the tower reads top-down in sung order — with `why()` frames squeezed in
// between on the moras. After も the frames burst in, the tower shoots through the red
// STACK LIMIT line (RangeError) and topples. L23: a search panel drops in, 私の答えは is
// typed, Enter → 0件 / 載っていない while the stack rains past. The fill: the panel and
// the debris fall into the void; only the cursor stays, blinking — a quiet hand-off to dawn.
import * as THREE from 'three';
import { font, measure } from '../engine/fonts';
import { FSPass, Layer2D, H, W } from '../engine/gl';
import { enter, gstate } from '../engine/kinetic';
import type { Char, Line } from '../engine/lyrics';
import { drawCursor, storyClock } from '../engine/motifs';
import { col, css } from '../engine/palette';
import type { PostParams } from '../engine/post';
import { Scene, type Frame } from '../engine/scene';
import { Glyphs3D, text3d, tint } from '../engine/text3d';
import { drawGlyphs2D, layout2D, rrect, text2D, type Lay2D } from '../engine/type2d';
import { clamp, ease, hash, lerp, noise1 } from '../engine/util';
import type { Text } from 'troika-three-text';
import { charsOf, impactFrame, lastPulse, on, shake } from './spec-kit';

const SLAB_VERT = /* glsl */ `
varying vec3 vP; varying vec3 vN; varying vec3 vHalf; varying float vDepth; varying float vWY;
void main() {
  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
  m = modelMatrix * instanceMatrix;
  #endif
  vec3 s = vec3(length(m[0].xyz), length(m[1].xyz), length(m[2].xyz));
  vP = position * s; vHalf = s * 0.5; vN = normal;
  vec4 wp = m * vec4(position, 1.0);
  vWY = wp.y;
  vec4 mv = viewMatrix * wp;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const SLAB_FRAG = /* glsl */ `
uniform vec3 base; uniform vec3 edge; uniform float glow; uniform float fogD; uniform float floorY;
varying vec3 vP; varying vec3 vN; varying vec3 vHalf; varying float vDepth; varying float vWY;
void main() {
  if (vWY < floorY) discard;  // slabs rise out of the floor slot
  vec3 n = abs(vN);
  vec2 q, hq;
  if (n.x > 0.5) { q = vP.yz; hq = vHalf.yz; } else if (n.y > 0.5) { q = vP.xz; hq = vHalf.xz; } else { q = vP.xy; hq = vHalf.xy; }
  vec2 d = hq - abs(q);
  float e = min(d.x, d.y);
  float line = 1.0 - smoothstep(0.012, 0.045, e);
  float shade = n.y > 0.5 ? (vN.y > 0.0 ? 1.7 : 0.35) : (n.z > 0.5 ? 1.0 : 0.62);
  // a soft vertical gradient on the faces
  float grad = 0.85 + 0.15 * (q.y / max(hq.y, 1e-3));
  vec3 c = base * shade * grad + edge * line * glow;
  float fog = 1.0 - exp(-max(0.0, vDepth - 8.0) / fogD);
  c = mix(c, vec3(0.0015, 0.0018, 0.0033), clamp(fog, 0.0, 1.0));
  gl_FragColor = vec4(c, 1.0);
}`;

const BG = /* glsl */ `
uniform float t; uniform float down; uniform float red; uniform float dawn;
void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float g = exp(-dot(p - vec2(0.1, -0.1), p - vec2(0.1, -0.1)) * 1.4);
  vec3 c = C_INK + C_BLUE * 0.03 * g * (1.0 - 0.6 * down) + C_RED * red * 0.05 * g;
  // the void: fine far specks drifting up as we fall
  vec2 q = vec2(p.x, p.y - t * 0.12) * 60.0;
  vec2 cell = floor(q), f = fract(q) - 0.5;
  float h = hash12(cell);
  float sp = step(0.93, h) * smoothstep(0.12, 0.0, length(f + (hash22(cell) - 0.5) * 0.6));
  c += vec3(0.10, 0.12, 0.22) * sp * down;
  // first light far below: violet -> blue (hands off to the dawn)
  float d = exp(-dot(p - vec2(0.0, -0.75), p - vec2(0.0, -0.75)) * 1.1);
  c += mix(C_VIOLET, C_BLUE, 0.4 + 0.3 * p.x) * 0.05 * dawn * d;
  gl_FragColor = vec4(c, 1.0);
}`;

interface Slab {
  g: THREE.Group; mesh: THREE.Mesh<THREE.BoxGeometry, THREE.ShaderMaterial>; h: number; w: number; d: number; push: number; xo: number;
  lyric?: { glyphs: Glyphs3D; line: Line }; label: Text; idx: number;
}

const PW = 1600, PH = 900; // panel texture
const PANEL_W = 15, PANEL_H = (15 * PH) / PW;

export default class Stack extends Scene {
  bg = new FSPass(BG, { t: { value: 0 }, down: { value: 0 }, red: { value: 0 }, dawn: { value: 0 } });
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(40, W / H, 0.1, 800);
  tower = new THREE.Group();
  slabs: Slab[] = [];
  floor!: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  limit = new THREE.Group();
  limitMat!: THREE.MeshBasicMaterial;
  limitLabel!: Text;
  debris!: THREE.InstancedMesh;
  debrisMat!: THREE.ShaderMaterial;
  panel = new Layer2D(PW, PH);
  panelMesh!: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  hud = new Layer2D();
  L22!: Line;
  L23!: Line;
  layAns!: Lay2D;
  layNot!: Lay2D;
  tStart = 0; tMo = 0; tBurst = 0; tTop = 0; tWata = 0; tNo = 0; tEnter = 0; tFill = 0; tEnd = 0; tLimit = 0;
  boxGeo = new THREE.BoxGeometry(1, 1, 1);

  async init() {
    const { lyrics } = this.ctx;
    this.L22 = lyrics.get('スタックオーバーフローにも');
    this.L23 = lyrics.get('私の答えは載っていない');
    const L22 = this.L22, L23 = this.L23;
    const A = this.ctx.audio;
    this.tStart = on(L22.chars[0]!);
    this.tMo = on(L22.chars[L22.chars.length - 1]!);
    this.tWata = on(L23.chars[0]!);
    this.tTop = this.tWata;
    this.tEnter = on(charsOf(L23, '載')[0]!);
    this.tFill = L23.end + 0.02;
    this.tEnd = this.ctx.end;
    this.tBurst = this.tMo + 0.06;

    // ---------------- the stack: lyric slabs + why() frames, in push order
    const parts: [string, string[]][] = [['スタック', ['ク']], ['オーバー', ['バ', 'ー']], ['フロー', ['ロ', 'ー']], ['にも', ['も']]];
    const pushes: { t: number; lyric?: Char[]; label: string }[] = [];
    let from = 0;
    const lineTxt = L22.chars.map((c) => c.c).join('');
    for (const [txt, extra] of parts) {
      const i0 = lineTxt.indexOf(txt, from);
      const chars = L22.chars.slice(i0, i0 + [...txt].length);
      from = i0 + chars.length;
      // lyric slabs start rising a hair early so their first glyph is above the floor when it lights
      pushes.push({ t: pushes.length === 0 ? Math.min(on(chars[0]!), this.ctx.start + 0.005) : on(chars[0]!) - 0.07, lyric: chars, label: '' });
      // frames squeezed in on later moras of the word (search from the 2nd char)
      let k = 1;
      for (const e of extra) {
        const ci = chars.findIndex((c, j) => j >= k && c.c === e);
        if (ci < 0) continue;
        pushes.push({ t: on(chars[ci]!), label: '' });
        k = ci + 1;
      }
    }
    // the overflow burst: frames come faster and faster
    for (let j = 0; j < 11; j++) pushes.push({ t: this.tBurst + 0.26 * (1 - Math.pow(0.78, j)) / (1 - 0.78) * 0.22, label: '' });
    const fnames = ['why()', 'debug(bug)', 'search(q)', 'why()', 'retry()', 'why()', 'compile(night)', 'why()', 'why()', 'why()', 'why()', 'why()', 'why()', 'why()', 'why()', 'why()', 'why()', 'why()'];
    let fi = 0;
    pushes.forEach((p, idx) => {
      const isL = !!p.lyric;
      const h = isL ? 2.35 : 0.62, w = isL ? 12.4 : 9.6 + 2.2 * hash(idx, 1), d = isL ? 3.2 : 2.6 + 0.6 * hash(idx, 2);
      const mat = new THREE.ShaderMaterial({
        vertexShader: SLAB_VERT, fragmentShader: SLAB_FRAG,
        uniforms: {
          base: { value: isL ? new THREE.Vector3(0.022, 0.028, 0.06) : new THREE.Vector3(0.016, 0.019, 0.04) },
          edge: { value: new THREE.Vector3(...col(isL ? 'cyan' : 'blue').toArray()) }, glow: { value: 1 }, fogD: { value: 60 }, floorY: { value: 0 },
        },
      });
      const mesh = new THREE.Mesh(this.boxGeo, mat);
      mesh.scale.set(w, h, d);
      const g = new THREE.Group();
      g.add(mesh);
      const name = isL ? `#${pushes.length - idx}  at stack (night.ts:${12 + idx})` : `at ${fnames[fi++ % fnames.length]} (night.ts:${3 + (idx % 7)})`;
      const label = text3d(name, { font: 'mono4', size: isL ? 0.3 : 0.3, color: col('mist'), anchorX: isL ? 'left' : 'center', depthTest: true, renderOrder: 4 });
      if (isL) label.position.set(-w / 2 + 0.35, h / 2 - 0.32, d / 2 + 0.02);
      else label.position.set((hash(idx, 5) - 0.5) * 2, 0, d / 2 + 0.02);
      g.add(label);
      const s: Slab = { g, mesh, h, w, d, push: p.t, xo: isL ? 0 : (hash(idx, 3) - 0.5) * 0.9, label, idx };
      if (p.lyric) {
        const glyphs = new Glyphs3D(p.lyric, { font: 'sans9', size: 1.62, color: col('bone'), depthTest: true, renderOrder: 5, tracking: 0.02 });
        glyphs.group.position.set(0.55, -0.12, d / 2 + 0.03);
        g.add(glyphs.group);
        s.lyric = { glyphs, line: L22 };
      }
      this.tower.add(g);
      this.slabs.push(s);
    });
    this.scene.add(this.tower);

    // ---------------- floor with the push slot
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShaderMaterial({
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float t; uniform float k; uniform float pulse; varying vec3 vW;
        void main(){
          vec2 g = abs(fract(vW.xz / 2.0) - 0.5);
          float line = smoothstep(0.47, 0.5, max(g.x, g.y));
          float fade = exp(-length(vW.xz) / 26.0);
          float slot = (1.0 - smoothstep(6.4, 6.6, abs(vW.x))) * (1.0 - smoothstep(1.7, 1.9, abs(vW.z)));
          float rim = slot * (1.0 - smoothstep(0.0, 0.12, min(6.6 - abs(vW.x), 1.9 - abs(vW.z))));
          vec3 c = vec3(0.004, 0.005, 0.01) + vec3(0.02, 0.05, 0.16) * line * fade;
          c = mix(c, vec3(0.0), slot * 0.9);
          c += vec3(0.12, 0.6, 1.0) * rim * (0.6 + 2.0 * pulse);
          gl_FragColor = vec4(c * k, 1.0);
        }`,
      uniforms: { t: { value: 0 }, k: { value: 1 }, pulse: { value: 0 } },
    }));
    this.floor.rotation.x = -Math.PI / 2;
    this.scene.add(this.floor);

    // ---------------- STACK LIMIT line
    this.limitMat = new THREE.MeshBasicMaterial({ color: col('red', 2.2), transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false });
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(40, 0.07), this.limitMat);
    this.limitLabel = text3d('STACK LIMIT  —  1 MB  —  これ以上は積めません', { font: 'dot', size: 0.42, color: col('red', 1.4), anchorX: 'left', anchorY: 'bottom', renderOrder: 6 });
    this.limitLabel.position.set(-9.5, 0.1, 0);
    this.limit.add(bar, this.limitLabel);
    this.limit.position.set(0, 15.2, 1.7);
    this.scene.add(this.limit);

    // ---------------- debris rain (instanced, same slab look)
    this.debrisMat = new THREE.ShaderMaterial({
      vertexShader: SLAB_VERT, fragmentShader: SLAB_FRAG,
      uniforms: { base: { value: new THREE.Vector3(0.016, 0.02, 0.042) }, edge: { value: new THREE.Vector3(...col('blue').toArray()) }, glow: { value: 0.9 }, fogD: { value: 45 }, floorY: { value: -1e6 } },
    });
    this.debris = new THREE.InstancedMesh(this.boxGeo, this.debrisMat, 140);
    this.debris.frustumCulled = false;
    this.scene.add(this.debris);

    // ---------------- search panel
    this.panelMesh = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_W, PANEL_H), new THREE.MeshBasicMaterial({
      map: this.panel.tex, transparent: true, premultipliedAlpha: true, toneMapped: false, side: THREE.DoubleSide,
    }));
    this.panelMesh.renderOrder = 20;
    this.scene.add(this.panelMesh);
    this.layAns = layout2D(charsOf(L23, '私の答えは'), { font: 'sans9', size: 112, anchor: 'topleft' });
    this.layNot = layout2D(charsOf(L23, '載っていない'), { font: 'dela', size: 200, tracking: 0.02 });
    void A;
  }

  // ---------------------------------------------------------------- stack kinematics
  /** push progress of slab j (0 below the floor -> 1 in place), outBack */
  pk(j: number, t: number) {
    const e = t - this.slabs[j]!.push;
    if (e < 0) return 0;
    return ease.outBack(clamp(e / 0.14));
  }

  /** bottom y of every slab (push from below: later slabs lift earlier ones) */
  stackY(t: number): number[] {
    const n = this.slabs.length;
    const y = new Array<number>(n).fill(-100);
    let acc = 0;
    for (let j = n - 1; j >= 0; j--) {
      const k = this.pk(j, t);
      if (k <= 0) continue;
      y[j] = acc - this.slabs[j]!.h * (1 - k);
      acc += this.slabs[j]!.h * k;
    }
    return y;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const A = this.ctx.audio;
    const ys = this.stackY(t);
    const eTop = t - this.tTop;
    const fallK = clamp((t - this.tFill) / (this.tEnd - this.tFill));

    // ---------------- tower: push, then topple (analytic)
    const theta = eTop > 0 ? 1.7 * Math.pow(eTop / 0.72, 2) : 0;
    const pivot = new THREE.Vector3(6.2, 0, 0);
    let topY = 0;
    this.slabs.forEach((s, j) => {
      const vis = ys[j]! > -50;
      s.g.visible = vis;
      if (!vis) return;
      const yc = ys[j]! + s.h / 2;
      topY = Math.max(topY, ys[j]! + s.h);
      // wobble as it gets tall
      const wob = Math.max(0, yc - 6) * 0.004 * Math.sin(t * 9 + 0.3) * (t > this.tBurst ? 3 : 1);
      let x = s.xo + wob * yc, y = yc, z = 0, rz = -wob * 0.6, rx = 0;
      if (eTop > 0) {
        // rigid tip around the base pivot + separation, then free fall
        const sep = 1 + 0.12 * theta * theta;
        const lx = x - pivot.x, ly = y * sep;
        const c = Math.cos(-theta), sn = Math.sin(-theta);
        x = pivot.x + c * lx - sn * ly;
        y = sn * lx + c * ly;
        rz = -theta * (1 + 0.15 * (hash(j, 7) - 0.5));
        const tb = 0.32 + 0.025 * (this.slabs.length - j) * 0.3;
        const ff = Math.max(0, eTop - tb);
        y -= 0.5 * 34 * ff * ff;
        x += ff * (2 + 6 * hash(j, 8));
        z += ff * (hash(j, 9) - 0.5) * 10;
        rz -= ff * (1 + 3 * hash(j, 10));
        rx = ff * (hash(j, 11) - 0.5) * 4;
      }
      s.g.position.set(x, y, z);
      s.g.rotation.set(rx, 0, rz);
      // edge flash on push, red when overflowing
      const e = t - s.push;
      const fl = e >= 0 ? Math.exp(-e / 0.12) : 0;
      const over = t >= this.tLimitCross(t) ? 1 : 0;
      const u = s.mesh.material.uniforms;
      u.glow!.value = 0.7 + 3.5 * fl;
      const ec = over && !s.lyric ? col('red') : col(s.lyric ? 'cyan' : 'blue');
      (u.edge!.value as THREE.Vector3).set(ec.r, ec.g, ec.b);
      u.floorY!.value = eTop > 0 ? -1e6 : 0;
      // lyric glyphs: unsung steel, sung bone with a pop
      if (s.lyric) {
        for (const it of s.lyric.glyphs.items) {
          const st = gstate(it, s.lyric.line, t, 'line', 2);
          it.mesh.visible = true;
          if (!st.on) { tint(it.mesh, col('steel', 0.55), 1); it.mesh.scale.setScalar(1); continue; }
          const k = enter('pop', st.since, it.gi, 0.5);
          it.mesh.scale.setScalar(k.sc);
          tint(it.mesh, col('bone', 1 + 1.4 * Math.exp(-st.since / 0.08)), 1);
        }
        tint(s.label, col('mist', 0.8), 0.85);
      } else {
        tint(s.label, over ? col('red', 1.2) : col('steel', 1.1), 0.9);
      }
    });
    this.floor.material.uniforms.t!.value = t;
    this.floor.material.uniforms.pulse!.value = lastPulse(t, this.slabs.map((s) => s.push), 0.1);
    this.floor.material.uniforms.k!.value = 1 - clamp((t - this.tTop - 0.2) / 0.5);
    this.floor.visible = t < this.tTop + 0.7;
    // limit line: blinks once crossed
    const crossed = t >= this.tLimitCross(t);
    this.limit.visible = t < this.tTop + 0.4;
    this.limitMat.opacity = crossed ? 0.5 + 0.5 * (f.frame % 6 < 3 ? 1 : 0) : 0.55;
    tint(this.limitLabel, col('red', crossed ? 1.8 : 1.0), 0.95);

    // ---------------- debris rain (after the topple)
    this.layoutDebris(t);

    // ---------------- panel
    const panelOn = t >= this.tWata - 0.06;
    this.panelMesh.visible = panelOn;
    if (panelOn) {
      this.drawPanel(f);
      this.panel.upload();
      this.layoutPanel(t);
    }

    // ---------------- camera + background
    this.camera(f, topY);
    this.bg.u.t!.value = t;
    this.bg.u.down!.value = ease.inOutCubic(fallK);
    this.bg.u.red!.value = crossed && t < this.tTop + 0.5 ? 1 : 0;
    this.bg.u.dawn!.value = ease.inOutCubic(clamp((t - this.tEnd + 0.9) / 0.9));
    this.bg.render(renderer, out);
    this.draw(this.scene, this.cam, out);

    // ---------------- HUD: overflow error, the lone cursor, clock
    const ctx = this.hud.clear();
    this.drawHud(ctx, f);
    comp.draw(renderer, this.hud.upload(), out);
    void A;
    return this.post(f);
  }

  /** time the tower crosses the limit line (first frame topY >= limit) — found analytically by scanning pushes */
  private crossCache = -1;
  tLimitCross(_t: number) {
    if (this.crossCache >= 0) return this.crossCache;
    for (let x = this.tStart; x < this.tTop; x += 1 / 240) {
      const ys = this.stackY(x);
      let top = 0;
      this.slabs.forEach((s, j) => { if (ys[j]! > -50) top = Math.max(top, ys[j]! + s.h); });
      if (top >= this.limit.position.y) { this.crossCache = x; return x; }
    }
    this.crossCache = this.tTop;
    return this.crossCache;
  }

  layoutDebris(t: number) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), ps = new THREE.Vector3(), sc = new THREE.Vector3();
    const t0 = this.tTop + 0.25;
    const A = this.ctx.audio;
    let n = 0;
    for (let i = 0; i < 140; i++) {
      // spawned on the 8th grid, denser during the fill
      const s = t0 + i * (A.period / 6) * (i < 70 ? 1 : 0.7) + hash(i, 1) * 0.1;
      const e = t - s;
      if (e < 0) continue;
      const g = 26;
      const late = i >= 70;
      const x = (hash(i, 2) - 0.5) * (late ? 30 : 46) + (late ? -3 : 3), z = late ? -14 + hash(i, 3) * 34 : -22 + hash(i, 3) * 30;
      const y0 = (late ? 18 : 30) + hash(i, 4) * 8;
      const y = y0 - 0.5 * g * e * e - 4 * e;
      if (y < -160) continue;
      const big = hash(i, 5);
      const w = big > 0.85 ? 4 + 4 * hash(i, 6) : 0.5 + 1.8 * hash(i, 6);
      ps.set(x, y, z);
      e3.set(e * (hash(i, 7) - 0.5) * 5, e * (hash(i, 8) - 0.5) * 4, e * (hash(i, 9) - 0.5) * 6);
      q.setFromEuler(e3);
      sc.set(w, big > 0.85 ? 0.6 : w * (0.4 + 0.6 * hash(i, 10)), w * (0.5 + 0.5 * hash(i, 11)));
      m.compose(ps, q, sc);
      this.debris.setMatrixAt(n++, m);
    }
    this.debris.count = n;
    this.debris.instanceMatrix.needsUpdate = true;
    this.debrisMat.uniforms.glow!.value = 0.9 + 1.2 * clamp((t - this.tFill) / 0.6);
  }

  // ---------------------------------------------------------------- panel (search)
  panelPos = new THREE.Vector3(-5.0, 7.0, 8.5);

  layoutPanel(t: number) {
    const e = t - (this.tWata - 0.06);
    // drops in from above with a bounce
    const k = ease.outBackStrong(clamp(e / 0.32));
    const p = this.panelMesh;
    p.position.set(this.panelPos.x, lerp(this.panelPos.y + 9, this.panelPos.y, k), this.panelPos.z);
    p.rotation.set(lerp(-0.5, 0, k), 0, lerp(0.15, 0, k));
    // the fill: tips back and falls into the void
    const ef = t - this.tFill;
    p.material.opacity = 1;
    if (ef > 0) {
      const a = Math.min(1.5, 3.2 * ef * ef + 0.6 * ef);
      p.rotation.x = -a;
      p.rotation.z = 0.25 * ef;
      p.position.y = this.panelPos.y - 0.5 * 46 * ef * ef - 2 * ef;
      p.position.z = this.panelPos.z - 9 * ef;
      p.material.opacity = 1 - clamp((ef - 0.45) / 0.6);
    }
  }

  drawPanel(f: Frame) {
    const t = f.t;
    const c = this.panel.clear();
    const L = this.L23;
    c.fillStyle = '#0e1428';
    rrect(c, 0, 0, PW, PH, 30); c.fill();
    c.strokeStyle = css('steel', 0.45); c.lineWidth = 3;
    rrect(c, 1.5, 1.5, PW - 3, PH - 3, 30); c.stroke();
    const res = t >= this.tEnter;
    // hollow 404 in the background once the results are in
    if (res) {
      const k = ease.outExpo(clamp((t - this.tEnter) / 0.3));
      text2D(c, '404', PW - 90, PH - 40, 'rampart', 420, css('steel', 0.22 * k), { align: 'right', baseline: 'alphabetic' });
    }
    // search bar
    const bx = 60, by = 56, bw = PW - 120, bh = 176;
    c.fillStyle = '#060914';
    rrect(c, bx, by, bw, bh, bh / 2); c.fill();
    c.strokeStyle = res ? css('steel', 0.5) : css('cyan', 0.75); c.lineWidth = 4;
    rrect(c, bx, by, bw, bh, bh / 2); c.stroke();
    // magnifier
    c.strokeStyle = css('mist'); c.lineWidth = 9; c.lineCap = 'round';
    c.beginPath(); c.arc(bx + 100, by + bh / 2 - 6, 30, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(bx + 122, by + bh / 2 + 16); c.lineTo(bx + 146, by + bh / 2 + 40); c.stroke();
    // typed lyric: 私の答えは (each char appears when sung, cursor after it)
    const tx = bx + 190, ty = by + (bh - 112) / 2 - 6;
    let lastX = tx;
    drawGlyphs2D(c, this.layAns, tx, ty, (g) => {
      const s = gstate(g, L, t, 'char', 0);
      if (!s.vis) return null;
      lastX = Math.max(lastX, tx + g.x + g.adv / 2);
      const k = enter('type', s.since, g.gi);
      return { style: { fill: css('bone'), glow: css('cyan', 0.5 * (k.bright - 1)), glowBlur: 20 }, kin: { ...k, sc: 1 + 0.25 * Math.exp(-s.since / 0.05) } };
    });
    if (t < this.tFill - 0.02) drawCursor(c, lastX + 10, by + 34, 50, bh - 68, f.beatPhase, { glow: 0.8 });
    // 検索 button (pressed on Enter)
    const press = res ? Math.exp(-(t - this.tEnter) / 0.12) : 0;
    c.fillStyle = res ? css('blue', 0.9 + 0.1 * press) : css('blue', 0.75);
    rrect(c, bx + bw - 250, by + 30 + press * 8, 210, bh - 60, (bh - 60) / 2); c.fill();
    text2D(c, '検索', bx + bw - 145, by + bh / 2 + press * 8, 'sans9', 56, css('bone'), { align: 'center', baseline: 'middle' });
    if (!res) {
      // hint rows while typing
      c.globalAlpha = 0.5;
      for (let i = 0; i < 4; i++) {
        c.fillStyle = css('steel', 0.4);
        rrect(c, 110, 330 + i * 120, 900 - i * 120, 26, 13); c.fill();
      }
      c.globalAlpha = 1;
      return;
    }
    // results
    const er = t - this.tEnter;
    const k = ease.outExpo(clamp(er / 0.2));
    c.save();
    c.globalAlpha = k;
    text2D(c, '検索結果', 110, 330, 'sans7', 50, css('mist'), { baseline: 'middle' });
    text2D(c, '0件', 110 + measure('sans7', '検索結果', 50) + 30, 330, 'dot', 76, css('amber'), { baseline: 'middle', glow: css('amber', 0.7), glowBlur: 24 });
    text2D(c, '「私の答えは」に一致する質問は見つかりませんでした。', 110, 800, 'sans4', 38, css('mist', 0.85), { baseline: 'middle' });
    c.restore();
    // 載っていない — the lyric, slammed per mora
    drawGlyphs2D(c, this.layNot, PW / 2 - 40, 575, (g) => {
      const s = gstate(g, L, t, 'word', 0.0);
      if (!s.vis) return null;
      if (!s.on) return { style: { fill: css('steel', 0.4) } };
      const kin = enter('stamp', s.since, g.gi, 1);
      return { style: { fill: css('bone'), stroke: css('red', 0.9), strokeWidth: 5, glow: css('red', 0.8), glowBlur: 30 * kin.bright }, kin };
    });
  }

  // ---------------------------------------------------------------- camera
  camera(f: Frame, topY: number) {
    const t = f.t;
    const pos = new THREE.Vector3(), tgt = new THREE.Vector3();
    let roll = 0;
    if (t < this.tWata - 0.06) {
      // track the growing tower: tight on スタック, pulling back as it grows; low angle
      const grow = clamp((Math.min(topY, 14.2) - 2.35) / 11.5);
      const g = ease.inOutCubic(grow);
      const burst = clamp((t - this.tBurst) / 0.25);
      const dist = lerp(10.5, 23, g) + 2 * burst;
      const ty = lerp(1.7, 7.4, g) + 1.4 * ease.outCubic(burst);
      pos.set(lerp(3.4, 6.5, g), lerp(0.9, 3.0, g), dist);
      tgt.set(lerp(0.4, 0.6, g), ty, 0);
      roll = lerp(-0.04, 0.05, g) + 0.03 * Math.sin(t * 2);
      // push kicks: the camera bumps on each push
      const bump = lastPulse(t, this.slabs.map((s) => s.push), 0.08);
      pos.z -= bump * 0.6;
      if (t >= this.tStart - 0.1 && t < this.tStart + 0.25) pos.z += (1 - ease.outExpo(clamp((t - this.tStart + 0.1) / 0.35))) * 3;
    } else {
      // whip wide (panel left, tower toppling right), then push in on the panel; then down into the void
      const w = ease.outExpo(clamp((t - this.tWata + 0.06) / 0.22));
      const pin = ease.inOutCubic(clamp((t - this.tWata - 0.2) / 0.55));
      const p = this.panelPos;
      const drift = (t - this.tWata) * 0.2;
      const wide = new THREE.Vector3(-1.2, 8.2, 31), wideT = new THREE.Vector3(-0.8, 7.6, 3);
      const near = new THREE.Vector3(p.x + 0.5 - drift * 0.4, p.y + 0.4, p.z + 14.6 - drift * 0.6), nearT = new THREE.Vector3(p.x + 0.1, p.y, p.z);
      pos.set(lerp(6.5, lerp(wide.x, near.x, pin), w), lerp(3, lerp(wide.y, near.y, pin), w), lerp(25, lerp(wide.z, near.z, pin), w));
      tgt.set(lerp(0.6, lerp(wideT.x, nearT.x, pin), w), lerp(8.8, lerp(wideT.y, nearT.y, pin), w), lerp(0, lerp(wideT.z, nearT.z, pin), w));
      roll = lerp(0.05, lerp(0.04, -0.025, pin), w);
      const fk = ease.inOutCubic(clamp((t - this.tFill) / (this.tEnd - this.tFill)));
      if (fk > 0) {
        // look down into the abyss (a fixed far point: the panel and debris fall away from us)
        const dk = ease.inOutCubic(clamp(fk * 1.25));
        tgt.lerp(new THREE.Vector3(p.x + 1.5, -70, p.z - 18), dk * 0.85);
        pos.y += 3 * dk;
        roll += 0.08 * dk;
      }
    }
    pos.x += noise1(t * 1.4, 4) * 0.08;
    pos.y += noise1(t * 1.2, 5) * 0.08;
    this.cam.position.copy(pos);
    this.cam.up.set(Math.sin(roll), Math.cos(roll), 0);
    this.cam.lookAt(tgt);
    this.cam.updateMatrixWorld();
  }

  /** screen px of the panel's typing cursor (canvas y down) at time t (before the fall) */
  cursorScreen(): [number, number, number] {
    const lastX = 60 + 190 + this.layAns.width + 10 + 25; // px in panel texture
    const u = lastX / PW - 0.5, v = 0.5 - (56 + 176 / 2) / PH;
    const p = new THREE.Vector3(u * PANEL_W, v * PANEL_H, 0.01).applyMatrix4(this.panelMesh.matrixWorld).project(this.cam);
    const p2 = new THREE.Vector3(u * PANEL_W, v * PANEL_H + 1, 0.01).applyMatrix4(this.panelMesh.matrixWorld).project(this.cam);
    return [(p.x * 0.5 + 0.5) * W, (0.5 - p.y * 0.5) * H, Math.abs(p2.y - p.y) * 0.5 * H];
  }

  drawHud(ctx: CanvasRenderingContext2D, f: Frame) {
    const t = f.t;
    // overflow error banner
    const xc = this.tLimitCross(t);
    const eE = t - xc;
    if (eE >= 0 && t < this.tWata + 0.12) {
      const k = ease.outExpo(clamp(eE / 0.1));
      const y = H * 0.5 + 280;
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = css('red', 0.9);
      ctx.fillRect(0, y - 52 * k, W, 104 * k);
      const msg = 'RangeError: Maximum call stack size exceeded';
      const jit = f.frame % 4 < 2 ? (hash(f.frame, 3) - 0.5) * 16 : 0;
      text2D(ctx, msg, W / 2 + jit, y + 2, 'mono8', 54, css('ink'), { align: 'center', baseline: 'middle' });
      ctx.restore();
      for (let i = 0; i < 5; i++) {
        text2D(ctx, `    at why (night.ts:${3 + i})`, 140, y + 92 + i * 30, 'mono4', 24, css('red', 0.75 * k), { baseline: 'middle' });
      }
    }
    // the lone cursor: detaches from the panel when it falls, stays, blinks
    if (t >= this.tFill - 0.02) {
      const [cx, cy, unit] = this.cursorAt;
      const k = ease.inOutCubic(clamp((t - this.tFill) / (this.tEnd - this.tFill)));
      const x = lerp(cx, W / 2, k), y = lerp(cy, H / 2, k);
      const ch = lerp(unit * 0.5, 64, k), cw = ch * 0.5;
      drawCursor(ctx, x - cw / 2, y - ch / 2, cw, ch, f.beatPhase, { glow: 1.2 });
    }
    text2D(ctx, storyClock(t), W - 110, H - 72, 'dot', 34, css('steel'), { align: 'right' });
  }

  get cursorAt(): [number, number, number] {
    // where the cursor was on screen just before the panel started to fall (computed from the panel layout at tFill)
    const t = this.tFill;
    const saveP = this.panelMesh.position.clone(), saveR = this.panelMesh.rotation.clone();
    const camP = this.cam.position.clone(), camQ = this.cam.quaternion.clone(), camU = this.cam.up.clone();
    this.layoutPanel(t);
    this.panelMesh.updateMatrixWorld();
    // camera at tFill
    this.camera({ t } as Frame, 0);
    const r = this.cursorScreen();
    this.panelMesh.position.copy(saveP); this.panelMesh.rotation.copy(saveR); this.panelMesh.updateMatrixWorld();
    this.cam.position.copy(camP); this.cam.quaternion.copy(camQ); this.cam.up.copy(camU); this.cam.updateMatrixWorld();
    return r;
  }

  post(f: Frame): PostParams {
    const t = f.t;
    const pushes = this.slabs.map((s) => s.push);
    const xc = this.tLimitCross(t);
    const sh = shake(t, pushes.filter((p) => p < this.tBurst), 7, 0.06, 1);
    const sh2 = shake(t, [xc, this.tTop + 0.3], 22, 0.12, 2);
    const sh3 = shake(t, charsOf(this.L23, '載っていない').map(on), 8, 0.06, 3);
    const fk = clamp((t - this.tFill) / (this.tEnd - this.tFill));
    const pp: PostParams = {
      shake: [sh[0] + sh2[0] + sh3[0], sh[1] + sh2[1] + sh3[1]],
      bloom: 0.7, vignette: 0.42 + 0.2 * fk, ca: 1.3,
      zoomBlur: 0.35 * lastPulse(t, [this.tWata - 0.06], 0.1) + 0.25 * lastPulse(t, [this.tEnter], 0.08),
      glitch: 0.4 * lastPulse(t, [xc], 0.08),
      rgbSplit: t >= xc && t < this.tWata ? 4 : 0,
      flash: impactFrame(f.frame, [xc], 2) * 0.4,
      flashColor: [1, 0.1, 0.15],
      grain: 0.05,
    };
    return pp;
  }
}
