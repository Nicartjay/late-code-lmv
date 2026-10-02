// Chorus act D — 「光るカーソル、明日を迎えに行く」: the cursor, a block of light, races
// forward through streaks and gates toward a horizon that opens on 明日を (dawn colours
// in chorus 2) and swallows everything on 行く.
import * as THREE from 'three';
import { SpeedLines } from '../engine/fx';
import { FSPass, H, Layer2D, W } from '../engine/gl';
import { LEAD, type Word } from '../engine/lyrics';
import { enter } from '../engine/kinetic';
import { CODE_POOL } from '../engine/motifs';
import { col, css } from '../engine/palette';
import type { PostParams } from '../engine/post';
import type { Frame } from '../engine/scene';
import { text3d, tint } from '../engine/text3d';
import { drawGlyphs2D, layout2D, type Lay2D } from '../engine/type2d';
import { clamp, ease, hash, lerp } from '../engine/util';
import type { Text } from 'troika-three-text';
import { Act } from './chorus-common';

const SPAN = 220; // wrap length of the streak field

export class DashAct extends Act {
  sky = new FSPass(/* glsl */ `
    uniform float t; uniform float open; uniform float dawn; uniform float white;
    void main() {
      vec2 p = (vUv - vec2(0.5, 0.56)) * vec2(uRes.x / uRes.y, 1.0);
      float r = length(p);
      vec3 base = mix(vec3(0.002, 0.003, 0.012), vec3(0.03, 0.015, 0.09), dawn);
      vec3 glowC = mix(vec3(0.5, 0.8, 1.6), vec3(1.8, 0.9, 0.5), dawn);
      vec3 rimC = mix(vec3(0.05, 0.2, 1.0), vec3(0.6, 0.15, 1.0), dawn);
      float sun = exp(-r * r * mix(900.0, 22.0, open));
      float halo = exp(-r * mix(30.0, 3.2, open)) * open;
      float rays = pow(max(0.0, sin(atan(p.y, p.x) * 24.0 + t * 0.6)), 8.0) * exp(-r * 2.2) * open;
      float horizon = exp(-abs(p.y + 0.02) * mix(60.0, 9.0, open)) * open;
      vec3 c = base + glowC * (sun * 4.0 + halo * 1.2 + rays * 0.35) + rimC * horizon * 0.6;
      c = mix(c, vec3(4.0), white);
      gl_FragColor = vec4(c, 1.0);
    }`, { t: { value: 0 }, open: { value: 0 }, dawn: { value: 0 }, white: { value: 0 } });
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(58, W / H, 0.05, 600);
  cursor!: THREE.Mesh;
  trail!: THREE.Mesh;
  streaks!: THREE.InstancedMesh;
  gates!: THREE.InstancedMesh;
  codes: { mesh: Text; x: number; y: number; z0: number }[] = [];
  seeds: { x: number; y: number; z0: number; len: number; c: number }[] = [];
  hud = new Layer2D();
  speed = new SpeedLines();
  words: { w: Word; lay: Lay2D; x: number; y: number; big: boolean }[] = [];
  tOpen = 0;
  tGo = 0;
  private m4 = new THREE.Matrix4();
  private v = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private c = new THREE.Color();

  async init() {
    const { line, n } = this.a;
    const accent = n === 2 ? col('violet') : col('cyan');
    // cursor + trail
    this.cursor = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.92, 0.16), new THREE.MeshBasicMaterial({ color: col('ice', 3), toneMapped: false }));
    this.scene.add(this.cursor);
    const tg = document.createElement('canvas');
    tg.width = 8; tg.height = 256;
    const g = tg.getContext('2d')!;
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 8, 256);
    const ttex = new THREE.CanvasTexture(tg);
    this.trail = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 1), new THREE.MeshBasicMaterial({ map: ttex, color: accent.clone().multiplyScalar(1.8), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.trail.rotation.x = -Math.PI / 2;
    this.scene.add(this.trail);
    // streak field
    const N = 420;
    this.streaks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), N);
    this.streaks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    for (let i = 0; i < N; i++) {
      const a = hash(i, 1) * Math.PI * 2, r = 2.2 + 30 * Math.pow(hash(i, 2), 1.4);
      this.seeds.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.75, z0: hash(i, 3) * SPAN, len: 0.5 + hash(i, 4) * 2, c: hash(i, 5) });
    }
    this.scene.add(this.streaks);
    // gates: square frames passing on the beat
    const frame = new THREE.EdgesGeometry(new THREE.BoxGeometry(9, 6, 0.01));
    const gg = new THREE.BufferGeometry().copy(frame as unknown as THREE.BufferGeometry);
    this.gates = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), 4 * 8);
    this.gates.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(4 * 8 * 3), 3);
    void gg;
    this.scene.add(this.gates);
    // code fragments rushing past
    for (let i = 0; i < 26; i++) {
      const side = i % 2 ? 1 : -1;
      const m = text3d(CODE_POOL[i % CODE_POOL.length]!, { font: 'mono4', size: 0.32, color: accent.clone().multiplyScalar(0.8), anchorX: side > 0 ? 'left' : 'right', opacity: 0.8 });
      const x = side * (2.6 + hash(i, 7) * 6), y = -1.5 + hash(i, 8) * 5;
      m.rotation.y = -side * 0.9;
      this.scene.add(m);
      this.codes.push({ mesh: m, x, y, z0: hash(i, 9) * SPAN });
    }
    // lyric layout (screen space)
    const [hikaru, cursorW, ashita, mukae, iku] = line.words;
    this.tOpen = ashita!.start;
    this.tGo = iku!.start;
    const mk = (w: Word, size: number, x: number, y: number, big = false) => this.words.push({ w, lay: layout2D(w.chars, { font: 'dela', size }), x, y, big });
    mk(hikaru!, 250, 560, 300);
    mk(cursorW!, 170, 1420, 470);
    mk(ashita!, 270, 960, 230);
    mk(mukae!, 210, 560, 560);
    mk(iku!, 430, 960, 560, true);
  }

  private travel(t: number) {
    // distance flown: fast, and much faster after 行く
    const d = t - this.a.t0;
    const g = Math.max(0, t - this.tGo);
    return 34 * d + 6 * d * d + 120 * g * g;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    const { ctx, n } = this.a;
    const r = ctx.renderer;
    const t = f.t, T = t + LEAD;
    const z = this.travel(t);
    const vel = (this.travel(t + 0.01) - this.travel(t - 0.01)) / 0.02;
    const accent = n === 2 ? col('violet') : col('cyan');
    const open = ease.inOutCubic(clamp((T - this.tOpen + 0.1) / 1.6));
    const white = ease.inQuad(clamp((t - (this.a.t1 - 0.32)) / 0.32));
    // cursor wobble + flare on word onsets
    let flare = 0;
    for (const w of this.a.line.words) { const d = T - w.start; if (d >= 0 && d < 0.4) flare = Math.max(flare, Math.exp(-d / 0.12)); }
    this.cursor.position.set(Math.sin(t * 2.1) * 0.25, -0.35 + Math.sin(t * 3.3) * 0.08, 0);
    this.cursor.rotation.set(0, Math.sin(t * 1.7) * 0.15, Math.sin(t * 2.4) * 0.06);
    this.cursor.scale.set(1 + 0.25 * flare, 1 + 0.25 * flare, 1 + Math.min(2, vel / 90));
    const on = f.beatPhase < 0.55 || t > this.tOpen;
    (this.cursor.material as THREE.MeshBasicMaterial).color.copy(col(n === 2 ? 'gold' : 'ice', on ? 2.6 + 3 * flare : 1.1));
    this.trail.position.set(this.cursor.position.x, this.cursor.position.y - 0.0, 2.2 + vel * 0.02);
    this.trail.scale.set(0.8, 3 + vel * 0.012, 1);
    this.trail.rotation.set(-Math.PI / 2, 0, 0);
    // streaks
    const stretch = 1 + vel * 0.12;
    this.seeds.forEach((s, i) => {
      const zz = ((s.z0 + z) % SPAN) - SPAN + 6;
      this.m4.compose(this.v.set(s.x, s.y, zz), this.q.identity(), this.s.set(0.022, 0.022, s.len * stretch));
      this.streaks.setMatrixAt(i, this.m4);
      const fade = clamp((zz + SPAN - 6) / 40) * (1 - clamp((zz + 2) / 8));
      this.c.copy(s.c > 0.7 ? col('bone') : s.c > 0.35 ? accent : col('blue')).multiplyScalar((0.45 + 0.9 * f.a.hat + 0.4 * f.a.kick) * fade);
      this.streaks.setColorAt(i, this.c);
    });
    this.streaks.instanceMatrix.needsUpdate = true;
    this.streaks.instanceColor!.needsUpdate = true;
    // gates: 8 square frames (4 bars each), spaced 28 units
    for (let gi = 0; gi < 8; gi++) {
      const zz = ((gi * 28 + z * 0.9) % 224) - 224 + 4;
      const glow = (1.5 + 3 * f.a.kick) * clamp((zz + 220) / 60);
      const bars: [number, number, number, number][] = [[0, 3.1, 9.4, 0.08], [0, -3.1, 9.4, 0.08], [-4.7, 0, 0.08, 6.2], [4.7, 0, 0.08, 6.2]];
      bars.forEach(([x, y, w, h], bi) => {
        this.m4.compose(this.v.set(x, y + 0.6, zz), this.q.identity(), this.s.set(w, h, 0.08));
        this.gates.setMatrixAt(gi * 4 + bi, this.m4);
        this.c.copy(gi % 2 ? accent : col('blue')).multiplyScalar(glow);
        this.gates.setColorAt(gi * 4 + bi, this.c);
      });
    }
    this.gates.instanceMatrix.needsUpdate = true;
    this.gates.instanceColor!.needsUpdate = true;
    for (const cdx of this.codes) {
      const zz = ((cdx.z0 + z) % SPAN) - SPAN + 4;
      cdx.mesh.position.set(cdx.x, cdx.y, zz);
      tint(cdx.mesh, accent.clone().multiplyScalar(0.9 + 1.5 * f.a.kick), clamp((zz + SPAN - 4) / 50) * 0.85);
    }
    // camera behind the cursor
    const shake = 0.04 * f.a.kick + 0.02 * clamp(vel / 200);
    this.cam.position.set(Math.sin(t * 1.3) * 0.5 + Math.sin(t * 47) * shake, 0.62 + Math.cos(t * 43) * shake, 4.8 - 0.9 * open);
    this.cam.lookAt(0, 0.35, -12);
    this.cam.fov = 58 + 22 * ease.inQuad(clamp((t - this.tGo) / (this.a.t1 - this.tGo)));
    this.cam.updateProjectionMatrix();
    // draw
    this.sky.u.t!.value = t;
    this.sky.u.open!.value = open;
    this.sky.u.dawn!.value = n === 2 ? 1 : 0;
    this.sky.u.white!.value = white;
    this.sky.render(r, out);
    this.draw(this.scene, this.cam, out);
    this.speed.render(r, out, { frame: f.frame, intensity: 0.1 + 0.8 * clamp((t - this.tGo) / 0.5), center: [0.5, 0.56], color: n === 2 ? [1.6, 1.0, 2.2] : [1.0, 1.8, 2.4], inner: 0.22, density: 200 });
    // words
    const hc = this.hud.clear();
    const ws = this.words;
    ws.forEach((W2, k) => {
      const d = T - W2.w.start;
      if (d < -0.02) return;
      const next = ws[k + 1]?.w.start ?? Infinity;
      const gone = clamp((T - next - 0.25) / 0.35);
      if (gone >= 1 && !W2.big) return;
      const kin = enter(W2.big ? 'zoom' : 'slam', d, k);
      const outward = ease.inQuad(gone);
      const dx = (W2.x - W / 2) * outward * 1.4, dy = (W2.y - H / 2) * outward * 1.4;
      const zoomOut = W2.big ? 1 + 1.6 * ease.inCubic(clamp((t - this.tGo - 0.25) / 0.4)) : 1 + outward * 0.8;
      hc.save();
      hc.translate(W2.x + dx, W2.y + dy);
      hc.scale(zoomOut, zoomOut);
      drawGlyphs2D(hc, W2.lay, 0, 0, (gph) => {
        const sung = T >= gph.ch!.start;
        const warm = n === 2 && k >= 2;
        return {
          style: {
            fill: sung ? (warm ? css('gold') : css('bone')) : css('mist', 0.35),
            glow: sung ? (warm ? css('amber', 0.9) : css(n === 2 ? 'violet' : 'cyan', 0.9)) : null, glowBlur: 36,
            alpha: 1 - outward,
          },
          kin,
        };
      });
      hc.restore();
    });
    ctx.comp.draw(r, this.hud.upload(), out, { tint: 1.25 });
    return {
      bloom: 0.9, bloomThreshold: 1.0, ca: 2 + 3 * flare + 8 * clamp((t - this.tGo) / 0.5), vignette: 0.45,
      zoomBlur: 0.08 + 1.0 * ease.inQuad(clamp((t - this.tGo) / (this.a.t1 - this.tGo))),
      flash: 0.035 * flare, flashColor: n === 2 ? [1, 0.9, 0.8] : [0.85, 0.95, 1],
      shake: [Math.sin(t * 91) * 8 * flare, Math.cos(t * 83) * 6 * flare],
    };
  }
}
