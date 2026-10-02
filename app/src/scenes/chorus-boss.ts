// Chorus act C — 「でもバグに負けるのは癪だから」: the bug. A giant beetle made of
// thousands of red error glyphs, an HP bar, comic-style word slams with impact frames,
// and on 癪 the cursor strikes: crater, shockwave, damage numbers.
import * as THREE from 'three';
import { Shockwave, SpeedLines } from '../engine/fx';
import { FSPass, H, Layer2D, W, screenCamera } from '../engine/gl';
import { LEAD, type Word } from '../engine/lyrics';
import { BUG_ERROR } from '../engine/motifs';
import { css, lin } from '../engine/palette';
import type { PostParams } from '../engine/post';
import type { Frame } from '../engine/scene';
import { drawGlyphs2D, layout2D, text2D, type Lay2D } from '../engine/type2d';
import { clamp, ease, hash, lerp, mulberry32, pulse } from '../engine/util';
import { enter } from '../engine/kinetic';
import { font } from '../engine/fonts';
import { Act } from './chorus-common';
import { BUG_C, BUG_SCALE, makeBugSwarm } from './bug-swarm';


export class BossAct extends Act {
  bg = new FSPass(/* glsl */ `
    uniform float t; uniform float kick; uniform float dawn; uniform float frame; uniform vec2 bugC;
    void main() {
      vec2 p = (vUv - 0.5) * uRes; vec2 q = p - bugC;
      float r = length(q) / 900.0;
      vec3 base = mix(vec3(0.012, 0.002, 0.004), vec3(0.03, 0.012, 0.05), dawn);
      vec3 c = base + vec3(0.22, 0.012, 0.025) * exp(-r * 3.2) * (0.6 + 0.6 * kick);
      float band = floor(vUv.y * 90.0); float g = step(0.985, hash12(vec2(band, floor(frame / 3.0))));
      c += vec3(0.25, 0.02, 0.04) * g * 0.5;
      float sl = 0.5 + 0.5 * sin(vUv.y * uRes.y * 1.6); c *= 0.9 + 0.1 * sl;
      gl_FragColor = vec4(c, 1.0);
    }`, { t: { value: 0 }, kick: { value: 0 }, dawn: { value: 0 }, frame: { value: 0 }, bugC: { value: BUG_C.clone() } });
  scene = new THREE.Scene();
  cam = screenCamera();
  swarm!: THREE.Mesh;
  swarmMat!: THREE.ShaderMaterial;
  hud = new Layer2D();
  type = new Layer2D();
  speed = new SpeedLines();
  shock = new Shockwave();
  lays: { w: Word; lay: Lay2D; slot: (T: number) => { x: number; y: number; s: number }; fill: string; stroke?: string; kind: 'whip' | 'stamp' | 'slam' }[] = [];
  tHit = 0;
  hp0 = 1;
  hp1 = 0.64;

  async init() {
    const { line, n } = this.a;
    const shaku = line.words.find((w) => w.w.includes('癪'))!;
    this.tHit = shaku.start;
    this.hp0 = n === 2 ? 0.64 : 1;
    this.hp1 = n === 2 ? 0.22 : 0.64;
    const sw = makeBugSwarm({ seed: 4242 + n, count: n === 2 ? 3000 : 3600, wound: n === 2 ? 1 : 0 });
    this.swarm = sw.mesh;
    this.swarmMat = sw.mat;
    this.scene.add(this.swarm);
    // ---- lyric layouts + where each word lives on screen (px, y down)
    const [demo, bagu, makeru, shakuDakara] = line.words;
    const dakaraIdx = shakuDakara!.chars.findIndex((c) => c.c === 'だ');
    const shakuChars = shakuDakara!.chars.slice(0, dakaraIdx), dakara = shakuDakara!.chars.slice(dakaraIdx);
    const th = this.tHit;
    const stack = (y0: number, y1: number) => (T: number) => {
      const k = ease.outExpo(clamp((T - th) / 0.3));
      return { x: lerp(170, 120, k), y: lerp(y0, y1, k), s: lerp(1, 0.62, k) };
    };
    this.lays.push({ w: demo!, lay: layout2D(demo!.chars, { font: 'dela', size: 190, anchor: 'topleft' }), slot: stack(170, 150), fill: css('bone'), kind: 'whip' });
    this.lays.push({ w: bagu!, lay: layout2D(bagu!.chars, { font: 'dela', size: 190, anchor: 'topleft' }), slot: stack(390, 290), fill: css('red'), stroke: css('bone'), kind: 'stamp' });
    this.lays.push({ w: makeru!, lay: layout2D(makeru!.chars, { font: 'dela', size: 150, anchor: 'topleft' }), slot: stack(640, 430), fill: css('bone'), kind: 'slam' });
    const shakuW = { ...shakuDakara!, chars: shakuChars, w: '癪', start: shakuChars[0]!.start, end: shakuChars[shakuChars.length - 1]!.end };
    const dakaraW = { ...shakuDakara!, chars: dakara, w: 'だから', start: dakara[0]!.start, end: dakara[dakara.length - 1]!.end };
    this.lays.push({ w: shakuW, lay: layout2D(shakuChars, { font: 'dela', size: 720, anchor: 'topleft' }), slot: () => ({ x: 760, y: 150, s: 1 }), fill: css('bone'), kind: 'slam' });
    this.lays.push({ w: dakaraW, lay: layout2D(dakara, { font: 'dela', size: 150, anchor: 'topleft' }), slot: () => ({ x: 1380, y: 800, s: 1 }), fill: css('bone'), kind: 'whip' });
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    const { ctx, n } = this.a;
    const r = ctx.renderer;
    const t = f.t, T = t + LEAD;
    const e = T - this.tHit;
    // background + swarm
    this.bg.u.t!.value = t;
    this.bg.u.kick!.value = f.a.kick;
    this.bg.u.dawn!.value = n === 2 ? 1 : 0;
    this.bg.u.frame!.value = f.frame;
    this.bg.render(r, out);
    const u = this.swarmMat.uniforms;
    u.t!.value = t;
    u.kick!.value = f.a.kick + 0.6 * pulse(T, this.tHit, 0.01, 0.2);
    u.snare!.value = Math.max(f.a.snare, e >= 0 ? Math.exp(-e / 0.25) : 0);
    u.frame!.value = f.frame;
    u.hitE!.value = e >= 0 ? e : -1;
    // slow push-in on the bug, recoil on the hit
    const push = 1 + 0.06 * clamp((t - this.a.t0) / (this.a.t1 - this.a.t0)) - (e >= 0 ? 0.05 * Math.exp(-e / 0.3) : 0);
    u.scale!.value = BUG_SCALE * push;
    this.draw(this.scene, this.cam, out);
    // cursor strike
    const strikeT = this.tHit - 0.07;
    const se = T - strikeT;
    const hitPx: [number, number] = [W / 2 + BUG_C.x + 0.15 * BUG_SCALE, H / 2 - BUG_C.y - 0.1 * BUG_SCALE];
    this.shock.render(r, out, e, { center: [hitPx[0] / W, 1 - hitPx[1] / H], color: [3, 2.6, 2.6], speed: 1.9, width: 0.025 });
    this.speed.render(r, out, { frame: f.frame, intensity: T >= this.lays[2]!.w.start ? (e >= 0 ? 0.9 * Math.exp(-e / 0.4) + 0.12 : 0.3) : 0, center: [hitPx[0] / W, 1 - hitPx[1] / H], color: [1.5, 0.3, 0.45], inner: 0.3, density: 150 });
    // ---- HUD: boss bar
    const hc = this.hud.clear();
    const hpNow = e < 0 ? this.hp0 : lerp(this.hp0, this.hp1, ease.outExpo(clamp(e / 0.25)));
    const ghost = e < 0 ? this.hp0 : lerp(this.hp0, this.hp1, ease.inOutCubic(clamp((e - 0.35) / 0.6)));
    const bx = 560, by = 78, bw = 800, bh = 26;
    text2D(hc, 'BUG', bx, by - 14, 'dela', 34, css('red'));
    text2D(hc, `Lv.99  ${BUG_ERROR}`, bx + 92, by - 16, 'dot', 20, css('mist', 0.85));
    hc.fillStyle = css('ink', 0.85); hc.fillRect(bx - 4, by - 4, bw + 8, bh + 8);
    hc.fillStyle = css('bone', 0.85); hc.fillRect(bx, by, bw * ghost, bh);
    const segs = 20;
    for (let i = 0; i < segs; i++) {
      const x0 = bx + (i / segs) * bw, x1 = bx + ((i + 1) / segs) * bw - 3;
      const fillTo = Math.min(x1, bx + bw * hpNow);
      if (fillTo > x0) { hc.fillStyle = css('red'); hc.fillRect(x0, by, fillTo - x0, bh); }
    }
    text2D(hc, `${Math.round(hpNow * 100)}%`, bx + bw + 18, by + 22, 'dela', 26, css('bone'));
    if (e >= 0 && e < 1.6) {
      const y = hitPx[1] - 80 - 160 * ease.outCubic(clamp(e / 0.8));
      const a = 1 - clamp((e - 1.0) / 0.6);
      text2D(hc, n === 2 ? '-4,096' : '-2,048', hitPx[0] + 40, y, 'dela', 84, css('gold', a), { glow: css('amber', a), glowBlur: 30 });
      text2D(hc, 'CRITICAL!', hitPx[0] + 60, y + 54, 'dot', 34, css('bone', a));
    }
    ctx.comp.draw(r, this.hud.upload(), out, { tint: 1.1 });
    // cursor streak
    const tc = this.type.clear();
    if (se > -0.01 && se < 0.12) {
      const k = ease.inQuad(clamp(se / 0.07));
      const x = lerp(-80, hitPx[0], k), y = lerp(H + 80, hitPx[1], k);
      tc.save();
      tc.translate(x, y); tc.rotate(-Math.atan2(H + 80 - hitPx[1], hitPx[0] + 80));
      const grd = tc.createLinearGradient(-420, 0, 0, 0);
      grd.addColorStop(0, css('cyan', 0)); grd.addColorStop(1, css('cyan', 1));
      tc.fillStyle = grd; tc.fillRect(-420, -10, 420, 20);
      tc.fillStyle = css('ice'); tc.shadowColor = css('cyan'); tc.shadowBlur = 40; tc.fillRect(-24, -34, 48, 68);
      tc.restore();
    }
    // ---- lyric words
    for (const L of this.lays) {
      const d = T - L.w.start;
      if (d < -0.02) continue;
      const slot = L.slot(T);
      tc.save();
      tc.translate(slot.x, slot.y);
      tc.scale(slot.s, slot.s);
      const kin = enter(L.kind, d, L.w.wi);
      drawGlyphs2D(tc, L.lay, 0, 0, (gph) => {
        const ch = gph.ch!;
        const sung = T >= ch.start;
        const big = L.lay.o.size > 500;
        return {
          style: {
            fill: sung ? L.fill : css('steel', 0.55),
            stroke: L.stroke ?? (big ? null : css('ink', 0.9)), strokeWidth: big ? 0 : 8,
            glow: sung ? (L.fill === css('red') ? css('red', 0.9) : css('cyan', big ? 0.0 : 0.35)) : null, glowBlur: 30,
          },
          kin: { ...kin, dx: kin.dx * (big ? 0 : 1) },
        };
      });
      // 癪: red/cyan offset echoes behind the slam
      if (L.lay.o.size > 500 && d >= 0) {
        const off = 14 + 40 * Math.exp(-d / 0.12);
        tc.globalCompositeOperation = 'destination-over';
        for (const [dx, c] of [[-off, css('red', 0.9)], [off * 0.6, css('cyan', 0.55)]] as [number, string][]) {
          drawGlyphs2D(tc, L.lay, dx, dx * 0.3, () => ({ style: { fill: c }, kin }));
        }
        tc.globalCompositeOperation = 'source-over';
      }
      tc.restore();
    }
    ctx.comp.draw(r, this.type.upload(), out);
    // impact frames on each word onset
    let imp = 0;
    for (const L of this.lays) { const d = T - L.w.start; if (d >= 0 && d < 0.1) imp = Math.max(imp, 1 - d / 0.1); }
    const big = e >= 0 ? Math.exp(-e / 0.08) : 0;
    return {
      bloom: 0.85, bloomThreshold: 0.85, ca: 2.5 + 6 * imp + 10 * big, vignette: 0.55,
      invert: e >= 0 && e < 0.05 ? 1 : 0, flash: 0.06 * imp * (1 - big), flashColor: [1, 0.85, 0.85],
      shake: [Math.sin(t * 97) * (10 * imp + 26 * big + 4 * f.a.kick), Math.cos(t * 89) * (8 * imp + 20 * big)],
      zoom: 1 + 0.03 * imp + 0.07 * big, glitch: 0.25 * f.a.snare + 0.5 * big, rgbSplit: 6 * big,
    };
  }
}
