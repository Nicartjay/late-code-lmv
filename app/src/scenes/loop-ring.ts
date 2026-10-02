// loop / shot B — L9 ループする思考が止まらない: the thought is a dial that turns one notch per
// sung mora (the sung character always lands at 12 o'clock). The phrase repeats around the
// wheel (it loops). On 止まらない the wheel spins up out of control around the stamped word.
import * as THREE from 'three';
import { SpeedLines } from '../engine/fx';
import { H, W } from '../engine/gl';
import { enter, gstate } from '../engine/kinetic';
import { LEAD, type Line } from '../engine/lyrics';
import { CODE_POOL } from '../engine/motifs';
import { col } from '../engine/palette';
import type { PostParams } from '../engine/post';
import type { Ctx, Frame } from '../engine/scene';
import { Glyphs3D, text3d, tint, type G3Item } from '../engine/text3d';
import { clamp, ease, fbm1, keys, smoothstep } from '../engine/util';
import { addMat, canvasTexture, circleText, drawScene } from './loop-util';
import type { Text } from 'troika-three-text';

const R = 4.5; // glyph ring radius
const G = 1.0; // glyph size
const SLOTS = 27;
const STEP = (Math.PI * 2) / SLOTS;

function codeRingTexture() {
  return canvasTexture(2048, 2048, (c) => {
    const cx = 1024, cy = 1024;
    const s = 1024 / 6.2; // px per world unit (plane is 12.4 units wide)
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    const ring = (r: number, w: number, a = 1) => { c.globalAlpha = a; c.lineWidth = w; c.beginPath(); c.arc(cx, cy, r * s, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1; };
    ring(3.72, 3); ring(5.24, 3); ring(5.32, 1.5, 0.5); ring(3.05, 1.5, 0.6); ring(2.35, 1.5, 0.4);
    // dial ticks
    for (let i = 0; i < 180; i++) {
      const a = (i / 180) * Math.PI * 2, big = i % 15 === 0, mid = i % 5 === 0;
      const r0 = 5.42, r1 = big ? 5.95 : mid ? 5.75 : 5.6;
      c.globalAlpha = big ? 1 : mid ? 0.7 : 0.4;
      c.lineWidth = big ? 5 : 2.5;
      c.beginPath(); c.moveTo(cx + Math.cos(a) * r0 * s, cy + Math.sin(a) * r0 * s); c.lineTo(cx + Math.cos(a) * r1 * s, cy + Math.sin(a) * r1 * s); c.stroke();
    }
    c.globalAlpha = 1;
    circleText(c, 'while (!bug.fixed) { think(); }  ', cx, cy, 3.35 * s, 30, 'mono4', { fill: 'rgba(200,215,255,0.85)', tracking: 0.02 });
    circleText(c, CODE_POOL.slice(3, 9).join('  ·  ') + '  ·  ', cx, cy, 2.62 * s, 24, 'mono4', { fill: 'rgba(160,175,215,0.6)', tracking: 0.0 });
  }, { aniso: 8 });
}

export class Ring {
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(36, W / H, 0.1, 300);
  tilt = new THREE.Group();
  wheel = new THREE.Group();
  inner = new THREE.Group();
  line!: Line;
  sung!: Glyphs3D;
  ghosts: Glyphs3D[] = [];
  seps: Text[] = [];
  trails: Glyphs3D[] = [];
  center!: Glyphs3D;
  dial!: THREE.Mesh;
  spinner!: THREE.InstancedMesh;
  speed = new SpeedLines();
  tStop = 0;
  private tw: number[] = [];

  constructor(private ctx: Ctx, private t0: number, private t1: number) {}

  async init() {
    const L = this.ctx.lyrics.get('ループする思考が止まらない');
    this.line = L;
    const ringChars = [...L.words[0]!.chars, ...L.words[1]!.chars];
    const stopChars = L.words[2]!.chars;
    this.tStop = L.words[2]!.start;
    this.tw = L.words.map((w) => w.start - LEAD);
    const opts = { font: 'sans9' as const, size: G, color: col('bone'), outlineWidth: '4%', outlineColor: col('ink'), outlineBlur: '14%' };
    this.sung = new Glyphs3D(ringChars, opts);
    this.wheel.add(this.sung.group);
    for (let k = 0; k < 2; k++) {
      const g = new Glyphs3D('ループする思考が', { font: 'sans9', size: G, color: col('steel') });
      this.ghosts.push(g);
      this.wheel.add(g.group);
    }
    for (let k = 0; k < 3; k++) {
      const s = text3d('・', { font: 'sans9', size: G * 0.8, color: col('cyan', 1.5) });
      this.seps.push(s);
      this.wheel.add(s);
    }
    for (let k = 0; k < 3; k++) {
      const g = new Glyphs3D('ループする思考が・ループする思考が・ループする思考が・', { font: 'sans9', size: G, color: col('cyan'), blend: 'add' });
      this.trails.push(g);
      this.wheel.add(g.group);
    }
    // decorations: dial plane with rings, ticks, circular code
    const dtex = codeRingTexture();
    this.dial = new THREE.Mesh(new THREE.PlaneGeometry(12.4, 12.4), addMat(dtex, col('blue', 1.0), 0.9));
    this.dial.renderOrder = 1;
    this.inner.add(this.dial);
    // spinner: 60 bars outside the dial, a fading tail (classic loading spinner)
    const bar = new THREE.PlaneGeometry(0.09, 0.62);
    this.spinner = new THREE.InstancedMesh(bar, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), 60);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), a - Math.PI / 2);
      m.compose(new THREE.Vector3(Math.cos(a) * 6.55, Math.sin(a) * 6.55, 0), q, sc);
      this.spinner.setMatrixAt(i, m);
      const k = i / 60;
      this.spinner.setColorAt(i, col('cyan', 0.15 + 2.2 * Math.pow(k, 3)));
    }
    this.spinner.renderOrder = 2;
    this.spinner.frustumCulled = false;
    this.tilt.add(this.inner, this.spinner, this.wheel);
    this.center = new Glyphs3D(stopChars, { font: 'dela', size: 1.42, color: col('bone'), outlineWidth: '5%', outlineColor: col('ink'), outlineBlur: '20%', tracking: 0.04 });
    this.tilt.add(this.center.group);
    this.scene.add(this.tilt);
  }

  /** wheel angle: one notch per sung mora, then an accelerating spin on 止まらない */
  private phi(t: number) {
    const T = t + LEAD;
    let p = -STEP;
    for (const ch of this.sung.items) {
      const e = T - ch.ch!.start;
      if (e > 0) p += STEP * ease.outBack(clamp(e / 0.13));
    }
    const tau = T - this.tStop;
    if (tau > 0) {
      p += 5.2 * Math.pow(tau, 3) + 1.4 * tau;
      for (const ch of this.center.items) {
        const e = T - ch.ch!.start;
        if (e > 0) p += STEP * 1.5 * ease.outExpo(clamp(e / 0.16));
      }
    }
    return p;
  }

  private placeSlot(mesh: THREE.Object3D, slot: number, phi: number, r = R) {
    const a = Math.PI / 2 - slot * STEP + phi;
    mesh.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
    mesh.rotation.set(0, 0, a - Math.PI / 2);
    return a;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    const { renderer } = this.ctx;
    const t = f.t;
    const T = t + LEAD;
    const phi = this.phi(t);
    const h = 1 / 240;
    const omega = (this.phi(t + h) - this.phi(t - h)) / (2 * h);
    const tau = T - this.tStop;
    const spin = smoothstep(0, 1.1, tau);
    const [w0, w1, w2] = this.tw as [number, number, number];

    // -------- glyph ring
    this.sung.items.forEach((it, i) => {
      const a = this.placeSlot(it.mesh, i, phi);
      const s = gstate(it, this.line, t, 'line', 0.6);
      const top = Math.exp(-Math.pow((a - Math.PI / 2) / 0.35, 2));
      if (!s.vis) { it.mesh.visible = false; return; }
      it.mesh.visible = true;
      if (s.on) {
        const k = enter('stamp', s.since, it.gi, 0.7);
        k.alpha = Math.max(k.alpha, 0.45);
        it.mesh.scale.setScalar(k.sc * (1 + 0.12 * top));
        tint(it.mesh, col('bone', 1.15 + 0.6 * top).multiplyScalar(k.bright), 1);
      } else {
        it.mesh.scale.setScalar(1);
        tint(it.mesh, col('steel'), 0.45 * clamp(s.e / 0.15));
      }
    });
    const sepSlots = [8, 17, 26];
    this.seps.forEach((s, k) => { this.placeSlot(s, sepSlots[k]!, phi); tint(s, col('cyan', 1.2 + spin), 0.8); });
    this.ghosts.forEach((g, k) => g.items.forEach((it, i) => {
      const a = this.placeSlot(it.mesh, 9 * (k + 1) + i, phi);
      // during the spin, each ghost lights up as it passes 12 o'clock
      const aa = ((a - Math.PI / 2) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
      const pass = Math.exp(-Math.pow(aa / 0.5, 2)) * spin;
      tint(it.mesh, col('mist').lerp(col('cyan', 2.2), pass), 0.32 + 0.4 * spin + 0.3 * pass);
    }));
    // motion trails behind every glyph while spinning
    const tr = clamp(Math.abs(omega) / 14) * spin;
    this.trails.forEach((g, k) => {
      const lag = (k + 1) * clamp(omega * 0.012, -0.12, 0.12);
      g.items.forEach((it) => {
        const slot = it.gi; // '・' included -> 27 slots
        this.placeSlot(it.mesh, slot, phi - lag);
        it.mesh.visible = tr > 0.02;
        tint(it.mesh, col('cyan', 1.4), tr * (0.32 - k * 0.09));
      });
    });

    // -------- dial + spinner
    this.inner.rotation.z = -phi * 0.35 + t * 0.15;
    (this.dial.material as THREE.MeshBasicMaterial).color.copy(col('blue', 0.85 + 0.9 * f.a.kick + 0.8 * spin));
    // the loading spinner ticks forward on the 8th-note grid, then whirls
    const eighth = Math.floor(f.beat * 2);
    this.spinner.rotation.z = -(eighth * (Math.PI * 2) / 12) - phi * 0.6;
    (this.spinner.material as THREE.MeshBasicMaterial).opacity = 0.9;

    // -------- 止まらない
    this.center.items.forEach((it) => {
      const s = gstate(it, this.line, t, 'word', 0.0);
      it.mesh.visible = s.vis;
      if (!s.vis) return;
      if (s.on) {
        const k = enter('slam', s.since, it.gi, 1);
        it.mesh.position.set(it.x + k.dx * 0.004, -it.y + 0.05, 0.3);
        it.mesh.scale.setScalar(k.sc);
        it.mesh.rotation.z = k.rot;
        tint(it.mesh, col('bone', 1.35).multiplyScalar(k.bright), Math.max(k.alpha, 0.4));
      } else {
        it.mesh.position.set(it.x, -it.y + 0.05, 0.3);
        it.mesh.scale.setScalar(1);
        tint(it.mesh, col('steel'), 0.4 * clamp(s.e / 0.12));
      }
    });

    // -------- camera: close on 12 o'clock -> swing -> pull back to the whole wheel
    const oE = ease.outExpo;
    const tiltX = keys(t, [[this.t0, -0.62], [w1, -0.55], [w1 + 0.35, -0.42, oE], [w2 - 0.14, -0.38], [w2 + 0.22, -0.16, oE], [this.t1, -0.1]]);
    const tiltY = keys(t, [[this.t0, 0.0], [w1, 0.04], [w1 + 0.35, -0.22, oE], [w2 - 0.14, -0.2], [w2 + 0.22, 0.06, oE], [this.t1, 0.1]]);
    this.tilt.rotation.set(tiltX, tiltY, 0);
    const camZ = keys(t, [[this.t0, 6.4], [w0 + 0.3, 6.9, ease.outCubic], [w1, 7.2], [w1 + 0.35, 8.6, oE], [w2 - 0.14, 9.0], [w2 + 0.24, 12.6, oE], [this.t1, 11.6, ease.inQuad]]);
    const camY = keys(t, [[this.t0, 2.65], [w1, 2.6], [w1 + 0.35, 2.2, oE], [w2 - 0.14, 2.05], [w2 + 0.24, -0.05, oE], [this.t1, 0]]);
    const camX = keys(t, [[this.t0, 0], [w1, 0], [w1 + 0.35, -0.9, oE], [w2 - 0.14, -0.95], [w2 + 0.24, 0, oE], [this.t1, 0]]);
    const lookY = keys(t, [[this.t0, 3.42], [w1, 3.4], [w1 + 0.35, 3.1, oE], [w2 - 0.14, 3.0], [w2 + 0.24, 0, oE], [this.t1, 0]]);
    const roll = keys(t, [[this.t0, 0.0], [w1, 0.01], [w1 + 0.35, -0.12, ease.outBack], [w2 - 0.14, -0.13], [w2 + 0.26, 0.06, ease.outBack], [this.t1, -0.05]]);
    const sh = 0.025 + 0.06 * f.a.kick + 0.05 * spin;
    this.cam.position.set(camX + fbm1(t * 2.1, 5) * sh, camY + fbm1(t * 2.3, 9) * sh, camZ);
    this.cam.up.set(Math.sin(roll), Math.cos(roll), 0);
    this.cam.lookAt(camX * 0.4, lookY, 0);
    this.cam.fov = 36 + 6 * spin * spin;
    this.cam.updateProjectionMatrix();

    drawScene(renderer, this.scene, this.cam, out);
    if (spin > 0.02) this.speed.render(renderer, out, { frame: f.frame, intensity: 0.25 + 0.75 * spin * spin, inner: 0.42 - 0.12 * spin, color: [0.35, 0.8, 1.2], density: 260 });

    const cut = Math.exp(-(t - this.t0) / 0.1);
    const end = smoothstep(this.t1 - 0.35, this.t1, t);
    return {
      bloom: 0.9 + 0.5 * spin, bloomThreshold: 0.85, ca: 1.6 + 3 * spin, vignette: 0.45,
      zoomBlur: 0.1 * spin + 0.22 * end, zoom: 1 + 0.05 * cut + 0.03 * end,
      shake: [fbm1(t * 30, 1) * 6 * spin, fbm1(t * 30, 2) * 6 * spin],
    };
  }
}

export type { G3Item };
