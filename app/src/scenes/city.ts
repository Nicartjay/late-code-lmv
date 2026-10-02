// city — 16.27 → 21.50 s (L6 街の喧騒はもう遠く / L7 世界に一人取り残された気分)
//  C1  inside the dark room, looking out of our window at the city far away. The words recede
//      in depth along a line into the night: 街の on the glass, 喧騒は (jittering noise) in the air,
//      もう further, 遠く over the skyline; a dolly-zoom on 遠く pushes the city even further away.
//  C2  outside: our lit window in a dark tower, 一人 standing in it. Huge exponential pull-back:
//      the tower, the sleeping city, then darkness — our window the only light left, a reticle
//      tracking it ("lit 1 / 41,592"). 世界に top-left, 取り残された / 気分 in vertical columns.
import * as THREE from 'three';
import { font } from '../engine/fonts';
import { H, Layer2D, W } from '../engine/gl';
import { gstate } from '../engine/kinetic';
import { LEAD, type Line } from '../engine/lyrics';
import { storyClock } from '../engine/motifs';
import { col, css } from '../engine/palette';
import type { PostParams } from '../engine/post';
import { Scene, type Frame } from '../engine/scene';
import { Glyphs3D, tint } from '../engine/text3d';
import { layout2D, type Lay2D } from '../engine/type2d';
import { clamp, ease, hash, lerp, prog } from '../engine/util';
import { CityModel, WIN } from './city-model';
import { cutBefore, glyph2D } from './open-util';

interface Times { cut: number; machi: number; kenso: number; mou: number; tooku: number; c2: number; sekai: number; hitori: number; nokosa: number; kibun: number; end: number }

const C1_POS = new THREE.Vector3(0, 29.0, 4.0);
const C1_LOOK = new THREE.Vector3(0, 31.0, -200);
const GLASS_Z = 0;

export default class City extends Scene {
  scene3 = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(40, W / H, 0.05, 20000);
  model = new CityModel();
  hud = new Layer2D();
  L6!: Line; L7!: Line;
  T!: Times;
  words1: { g: Glyphs3D; depth: number; jitter: number }[] = [];
  hitori!: Glyphs3D;
  laySekai!: Lay2D; layNokosa!: Lay2D; layKibun!: Lay2D;
  tmp = new THREE.Vector3();

  async init() {
    const { lyrics: Ly, audio: A } = this.ctx;
    const L6 = (this.L6 = Ly.get('街の喧騒はもう遠く'));
    const L7 = (this.L7 = Ly.get('世界に一人取り残された気分'));
    const ws = (l: Line, s: string) => Ly.word(l, s).start - LEAD;
    this.T = {
      cut: this.ctx.start, machi: ws(L6, '街の'), kenso: ws(L6, '喧騒は'), mou: ws(L6, 'もう'), tooku: ws(L6, '遠く'),
      c2: cutBefore(A, L7, L6), sekai: ws(L7, '世界に'), hitori: ws(L7, '一人'), nokosa: ws(L7, '取り残された'), kibun: ws(L7, '気分'),
      end: this.ctx.end,
    };
    this.scene3.add(this.model.group);

    // L6 words placed in depth along a line into the city (positions from screen targets with the C1 camera)
    const c1 = new THREE.PerspectiveCamera(40, W / H, 0.05, 20000);
    c1.position.copy(C1_POS); c1.lookAt(C1_LOOK); c1.updateMatrixWorld(); c1.updateProjectionMatrix();
    const place = (sx: number, sy: number, depth: number) => {
      const ndc = new THREE.Vector3((sx / W) * 2 - 1, -(sy / H) * 2 + 1, 0.5).unproject(c1);
      const dir = ndc.sub(c1.position).normalize();
      const fwd = new THREE.Vector3(); c1.getWorldDirection(fwd);
      return c1.position.clone().add(dir.multiplyScalar(depth / dir.dot(fwd)));
    };
    const pxPerUnit = (depth: number) => 540 / (depth * Math.tan((20 * Math.PI) / 180));
    const word = (s: string, sx: number, sy: number, depth: number, px: number, fk: 'mincho' | 'sans9', jitter = 0) => {
      const g = new Glyphs3D(Ly.word(L6, s).chars, { font: fk, size: px / pxPerUnit(depth), color: col('bone'), renderOrder: 40 });
      g.group.position.copy(place(sx, sy, depth));
      g.group.lookAt(C1_POS.clone().setY(g.group.position.y));
      this.scene3.add(g.group);
      this.words1.push({ g, depth, jitter });
    };
    word('街の', 690, 735, C1_POS.z - GLASS_Z - 0.06, 230, 'mincho');
    word('喧騒は', 790, 515, 45, 165, 'mincho', 1);
    word('もう', 1065, 405, 220, 120, 'mincho');
    word('遠く', 1335, 330, 1400, 112, 'mincho');

    // 一人 — standing in our window, facing the outside camera
    this.hitori = new Glyphs3D(Ly.word(L7, '一人').chars, { font: 'mincho', size: 0.66, color: col('ink'), depthTest: true, renderOrder: 45 });
    this.hitori.group.position.set(WIN.x - 0.66, WIN.y - 0.1, WIN.z - 0.07);
    this.hitori.group.rotation.y = Math.PI;
    this.scene3.add(this.hitori.group);

    this.laySekai = layout2D(Ly.word(L7, '世界に').chars, { font: 'mincho', size: 148 });
    this.layNokosa = layout2D(Ly.word(L7, '取り残された').chars, { font: 'mincho', size: 112, vertical: true, tracking: 0.04 });
    this.layKibun = layout2D(Ly.word(L7, '気分').chars, { font: 'mincho', size: 112, vertical: true });
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    return f.t < this.T.c2 ? this.shot1(f, out) : this.shot2(f, out);
  }

  private clock(c: CanvasRenderingContext2D, f: Frame, a = 0.75) {
    const s = storyClock(f.t);
    c.save();
    c.font = font('dot', 34); c.fillStyle = css('mist', a);
    c.fillText(s.slice(0, 2), 112, 134);
    const w1 = c.measureText(s.slice(0, 2)).width;
    c.globalAlpha = f.beatPhase < 0.5 ? 1 : 0.25; c.fillText(':', 112 + w1, 134);
    c.globalAlpha = 1; c.fillText(s.slice(3), 112 + w1 + c.measureText(':').width, 134);
    c.restore();
  }

  // ================================================================ C1 — the window
  private shot1(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    const { renderer, comp, audio: A } = this.ctx;
    const T = this.T, t = f.t;
    const M = this.model;
    M.set(t, 1, 2600);
    M.interior.visible = true;
    M.windowMat.uniforms.uI!.value = 0;
    M.glowMat.uniforms.uI!.value = 0;
    const kz = prog(t, T.tooku + 0.1, T.c2, ease.inOutCubic);
    const z = lerp(lerp(4.0, 3.62, prog(t, T.cut, T.tooku + 0.1, ease.inOutSine)), 2.05, kz);
    const fov = (2 * Math.atan((Math.tan((20 * Math.PI) / 180) * (4.0 - GLASS_Z)) / (z - GLASS_Z)) * 180) / Math.PI;
    const cam = this.cam;
    const kick = A.hit('kick', t, 0.1) * 0.012 + A.hit('snare', t, 0.08) * 0.008;
    cam.position.set(C1_POS.x + 0.04 * Math.sin(t * 0.8), C1_POS.y + 0.02 * Math.sin(t * 1.1) - kick, z);
    cam.fov = fov;
    cam.near = 0.05; cam.far = 20000;
    cam.up.set(0, 1, 0);
    cam.lookAt(C1_LOOK);
    cam.updateProjectionMatrix();
    // words
    for (const w of this.words1) {
      w.g.group.visible = true;
      for (const it of w.g.items) {
        const s = gstate(it, this.L6, t, 'word', 0.3);
        it.mesh.visible = s.vis;
        if (!s.vis) continue;
        const size = it.mesh.fontSize as number;
        let jx = 0, jy = 0;
        if (w.jitter && s.on) {
          const amp = 0.09 * size * Math.exp(-s.since / 0.55);
          jx = (hash(f.frame, it.gi, 1) - 0.5) * amp; jy = (hash(f.frame, it.gi, 2) - 0.5) * amp;
        }
        it.mesh.position.set(it.x + jx, -it.y + jy, 0);
        const pop = s.on ? 1 + 0.18 * Math.exp(-s.since / 0.08) : 1;
        it.mesh.scale.setScalar(pop);
        const fl = s.on ? Math.exp(-s.since / 0.14) : 0;
        tint(it.mesh, s.on ? col('bone', 1.05 + 2.5 * fl) : col('steel'), s.on ? 1 : 0.32);
      }
    }
    this.hitori.group.visible = false;
    this.draw(this.scene3, cam, out);

    const c = this.hud.clear();
    this.clock(c, f);
    comp.draw(renderer, this.hud.upload(), out);
    return { bloom: 0.9, vignette: 0.5, ca: 0.9, grain: 0.05, zoomBlur: 0.18 * Math.sin(Math.PI * kz) };
  }

  // ================================================================ C2 — the pull-back
  private shot2(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    const { renderer, comp } = this.ctx;
    const T = this.T, t = f.t;
    const M = this.model;
    const u = clamp((t - T.nokosa) / (T.end - 0.04 - T.nokosa));
    const eu = ease.inOutQuad(u);
    const d0 = lerp(5.4, 7.6, prog(t, T.c2, T.nokosa, ease.inOutSine));
    const d = d0 * Math.exp(Math.log(4200 / 7.6) * eu);
    const dark = prog(t, T.kibun - 0.2, T.end, ease.inOutSine);
    const darkR = lerp(6500, 60, ease.inQuad(prog(t, T.kibun - 0.35, T.end - 0.08)));
    M.set(t, 1, lerp(2600, 5200, eu), darkR, dark);
    M.interior.visible = false;
    M.windowMat.uniforms.uI!.value = 1.0;
    M.glowMat.uniforms.uI!.value = clamp((d - 30) / 200) * (1.6 + 1.2 * dark);
    M.glowMat.uniforms.uSize!.value = 28 + 26 * dark;
    const dir = new THREE.Vector3(0.24, 0.24 + 0.32 * eu, -1).normalize();
    const W0 = new THREE.Vector3(WIN.x, WIN.y, WIN.z);
    const tgt = W0.clone().add(new THREE.Vector3(0.95, 0.28, 0).multiplyScalar(1 - eu));
    const cam = this.cam;
    cam.position.copy(W0).addScaledVector(dir, d);
    cam.fov = 38;
    cam.near = Math.max(0.05, d * 0.02);
    cam.far = 20000;
    cam.up.set(0, 1, 0);
    cam.lookAt(tgt);
    cam.rotateZ(-0.1 * eu + 0.02 * Math.sin(t * 0.9));
    cam.updateProjectionMatrix();
    for (const w of this.words1) w.g.group.visible = false;
    // 一人 in the window
    this.hitori.group.visible = true;
    for (const it of this.hitori.items) {
      const s = gstate(it, this.L7, t, 'char', 0);
      it.mesh.visible = s.vis;
      if (!s.vis) continue;
      const k = ease.outBack(clamp(s.since / 0.22));
      it.mesh.scale.setScalar(0.7 + 0.3 * k);
      it.mesh.position.set(it.x, -it.y - 0.25 * (1 - k), 0);
      tint(it.mesh, col('ink'), clamp(s.since / 0.06));
    }
    this.draw(this.scene3, cam, out);

    // ------------------------------------------------ HUD
    const c = this.hud.clear();
    this.clock(c, f, 0.75 * (1 - 0.5 * dark));
    // 世界に (top-left)
    for (const g of this.laySekai.glyphs) {
      const s = gstate(g, this.L7, t, 'word', 0.3);
      if (!s.vis) continue;
      const x = 150 + this.laySekai.width / 2 + g.x, y = 300 + g.y;
      if (!s.on) { glyph2D(c, g.c, 'mincho', 148, x, y, { fill: css('steel', 0.25) }); continue; }
      const a = clamp(s.since / 0.08);
      glyph2D(c, g.c, 'mincho', 148, x, y - 26 * (1 - ease.outCubic(clamp(s.since / 0.3))), {
        fill: css('bone', a), glow: css('blue', 0.7 * a), glowBlur: 30,
      });
    }
    // 取り残された / 気分 (vertical columns, right side)
    const col1x = W - 230, col2x = W - 380, top = 200;
    const vert = (lay: Lay2D, x0: number, y0: number) => {
      for (const g of lay.glyphs) {
        const s = gstate(g, this.L7, t, 'word', 0.25);
        if (!s.vis) continue;
        const x = x0 + g.x, y = y0 + lay.height / 2 + g.y;
        if (!s.on) { glyph2D(c, g.c, 'mincho', 112, x, y, { fill: css('steel', 0.22), rot: g.rot }); continue; }
        const a = clamp(s.since / 0.07);
        const k = ease.outCubic(clamp(s.since / 0.35));
        glyph2D(c, g.c, 'mincho', 112, x, y + 30 * (1 - k), { fill: css('bone', a), glow: css('blue', 0.6 * a), glowBlur: 26, rot: g.rot });
      }
    };
    vert(this.layNokosa, col1x, top);
    vert(this.layKibun, col2x, top + this.layNokosa.height - this.layKibun.height);
    // reticle on our window once it gets small
    const rk = prog(t, T.nokosa + 0.45, T.nokosa + 0.75, ease.outExpo);
    if (rk > 0) {
      const p = this.tmp.set(WIN.x, WIN.y, WIN.z).project(cam);
      const sx = (p.x * 0.5 + 0.5) * W, sy = (-p.y * 0.5 + 0.5) * H;
      const half = lerp(90, 26, rk);
      c.save();
      c.strokeStyle = css('cyan', 0.85 * rk); c.lineWidth = 2;
      c.shadowColor = css('cyan', 0.8); c.shadowBlur = 10;
      const L = 12;
      for (const [ax, ay] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        c.beginPath();
        c.moveTo(sx + ax * half, sy + ay * (half - L)); c.lineTo(sx + ax * half, sy + ay * half); c.lineTo(sx + ax * (half - L), sy + ay * half);
        c.stroke();
      }
      c.shadowBlur = 0;
      c.font = font('dot', 22); c.fillStyle = css('mist', 0.9 * rk); c.textBaseline = 'middle';
      const n = this.model.windowCount.toLocaleString('en-US');
      c.fillText(`lit 1 / ${n}`, sx + half + 14, sy - half + 10);
      c.restore();
    }
    comp.draw(renderer, this.hud.upload(), out);
    return { bloom: 0.95, vignette: 0.5 + 0.3 * dark, ca: 0.9, grain: 0.05, zoomBlur: 0.05 * Math.sin(Math.PI * clamp(u * 1.4)) };
  }
}
