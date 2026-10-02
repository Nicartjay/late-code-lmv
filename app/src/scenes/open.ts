// open — 0 → 11.37 s (L0–L3). The first thing anyone sees.
//  A  clock 01:59 → 02:00 rolls over on the first beat; the title types out beside the cursor.
//  B  部屋の明かりを — a round ceiling light, pull cord; it clicks OFF on 落として: the type flips
//     from ink-on-light to lit-from-below by the monitor; 落として drops in.
//  C  PCのファンだけが回ってる — a giant 3D fan ticking on the beat; the lyric rides a karaoke
//     wheel around the hub; 回ってる whirls on the hub while the fan spins up.
//  D  ブルーライトに照らされた — the monitor behind the type; god rays through the letters;
//     照らされた floods on the kick and lights the second row.
//  E  私の顔はきっと、ひどい疲れ顔 — Mincho on dark glass with reflections; 疲れ顔 sags and
//     flickers like a dying screen.
import * as THREE from 'three';
import { advance, font, measure } from '../engine/fonts';
import { FSPass, H, Layer2D, W } from '../engine/gl';
import { enter, gstate, type Glyph } from '../engine/kinetic';
import { LEAD, type Line } from '../engine/lyrics';
import { drawEditor, storyClock } from '../engine/motifs';
import { col, css, cssMix, HEX } from '../engine/palette';
import type { PostParams } from '../engine/post';
import { Scene, type Frame } from '../engine/scene';
import { Glyphs3D, tint } from '../engine/text3d';
import { layout2D, rrect, type Lay2D } from '../engine/type2d';
import { clamp, ease, hash, lerp, prog, spring } from '../engine/util';
import { Fan } from './open-fan';
import { cutBefore, glyph2D, Rays } from './open-util';

const TAU = Math.PI * 2;

interface Times {
  flip: number; light: number; off: number; fan: number; fanW: number; mawa: number;
  blue: number; teras: number; glass: number; hidoi: number; tsukare: number; end: number;
}

export default class Open extends Scene {
  hud = new Layer2D();
  glow = new Layer2D(W / 2, H / 2);
  mask = new Layer2D(W / 2, H / 2);
  rays = new Rays();

  // ------------------------------------------------------------ backgrounds
  bgClock = new FSPass(/* glsl */ `
    uniform float flash, t;
    void main(){
      vec2 p = (vUv - vec2(0.5, 0.54)) * vec2(uRes.x / uRes.y, 1.0);
      float r = length(p * vec2(0.62, 1.3));
      vec3 c = C_INK + C_BLUE * (0.03 + 0.05 * flash) * exp(-r * 3.2) + C_CYAN * 0.03 * flash * exp(-r * 1.6);
      float desk = smoothstep(0.215, 0.205, vUv.y);
      c += C_BLUE * 0.012 * desk * (1.0 - vUv.y * 2.0);
      gl_FragColor = vec4(c, 1.0);
    }`, { flash: { value: 0 }, t: { value: 0 } });

  bgLight = new FSPass(/* glsl */ `
    uniform float on, after, blue, zoom; uniform vec2 lc, lr, pan;
    void main(){
      vec2 px = vUv * uRes;
      px = (px - uRes * 0.5) / zoom + uRes * 0.5 - pan;
      vec2 q = (px - lc) * vec2(1.0, 1.7);
      float d = length(q) / uRes.y;
      float lit = on * (0.42 * exp(-d * 2.1) + 0.025);
      vec3 c = mix(C_INK, vec3(0.60, 0.65, 0.80), lit);
      vec2 e = (px - lc) / lr;
      float r = length(e);
      float aa = fwidth(r) * 1.5;
      float disc = 1.0 - smoothstep(1.0 - aa, 1.0, r);
      float diff = 1.0 - smoothstep(0.90 - aa, 0.90, r);
      vec3 lamp = vec3(1.0, 1.0, 1.03) * (2.4 + 2.2 * (1.0 - r * r)) * on;
      vec3 rimc = vec3(0.50, 0.55, 0.68) * on;
      float tube = exp(-pow((r - 0.72) / 0.03, 2.0));
      vec3 offc = vec3(0.008, 0.010, 0.018) + C_BLUE * 0.06 * blue * smoothstep(0.3, -1.0, e.y) + C_CYAN * tube * after * 0.5;
      vec3 lampC = mix(mix(offc * 0.6, rimc, on), mix(offc, lamp, on), diff);
      c = mix(c, lampC, disc);
      float b = blue * (0.30 * exp(-vUv.y * 4.6) + 0.006);
      c += C_BLUE * b;
      gl_FragColor = vec4(c, 1.0);
    }`, {
    on: { value: 1 }, after: { value: 0 }, blue: { value: 0 }, zoom: { value: 1 },
    lc: { value: new THREE.Vector2(960, 915) }, lr: { value: new THREE.Vector2(640, 140) }, pan: { value: new THREE.Vector2() },
  });

  bgFan = new FSPass(/* glsl */ `
    uniform float glow; uniform vec2 c0;
    void main(){
      vec2 p = (vUv - c0) * vec2(uRes.x / uRes.y, 1.0);
      float r = length(p);
      vec3 c = C_INK + C_BLUE * 0.07 * exp(-r * 2.0) * glow + vec3(0.003, 0.004, 0.010) * (1.0 - vUv.y);
      gl_FragColor = vec4(c, 1.0);
    }`, { glow: { value: 1 }, c0: { value: new THREE.Vector2(0.5, 0.5) } });

  bgScreen = new FSPass(/* glsl */ `
    uniform sampler2D code; uniform vec4 rect; uniform float I, flood;
    void main(){
      vec2 d = (vUv - rect.xy) / rect.zw;
      float box = sdBox(d, vec2(1.0));
      vec3 c = C_INK;
      c += C_BLUE * (0.02 * I) * exp(-max(box, 0.0) * 2.6) + C_BLUE * 0.03 * flood;
      float aa = fwidth(box) * 1.5;
      float inside = 1.0 - smoothstep(-aa, 0.0, box);
      vec2 suv = d * 0.5 + 0.5;
      vec3 sc = texture2D(code, suv).rgb;
      vec3 scr = (vec3(0.16, 0.34, 1.0) * 0.45 + sc * 1.3) * I;
      float bez = (1.0 - smoothstep(0.0, aa, box - 0.035)) * (1.0 - inside);
      c = mix(c, vec3(0.006, 0.008, 0.014), bez);
      c = mix(c, scr, inside);
      gl_FragColor = vec4(c, 1.0);
    }`, { code: { value: null }, rect: { value: new THREE.Vector4(0.5, 0.53, 0.2, 0.2) }, I: { value: 1 }, flood: { value: 0 } });

  emit = new FSPass(/* glsl */ `
    uniform sampler2D mask, code; uniform vec4 rect; uniform float I;
    void main(){
      vec2 d = (vUv - rect.xy) / rect.zw;
      float box = sdBox(d, vec2(1.0));
      float inside = 1.0 - smoothstep(-0.03, 0.03, box);
      vec3 sc = texture2D(code, d * 0.5 + 0.5).rgb;
      vec3 e = (vec3(0.16, 0.34, 1.0) * 0.45 + sc * 1.3) * inside * I;
      float m = texture2D(mask, vUv).a;
      gl_FragColor = vec4(e * (1.0 - m), 1.0);
    }`, { mask: { value: null }, code: { value: null }, rect: { value: new THREE.Vector4(0.5, 0.53, 0.2, 0.2) }, I: { value: 1 } });

  bgGlass = new FSPass(/* glsl */ `
    uniform float t, flick, yf, zoom; uniform vec2 pan;
    void main(){
      vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uRes;
      px = (px - uRes * 0.5) / zoom + uRes * 0.5 + pan;
      vec3 c = C_INK;
      float above = step(px.y, yf);
      c += C_BLUE * 0.045 * exp(-(yf - px.y) / 520.0) * above * flick;
      float fl = 1.0 - above;
      float depth = (px.y - yf) / 380.0;
      c += C_BLUE * 0.028 * exp(-depth * 1.6) * fl * flick;
      c += C_CYAN * 0.22 * exp(-abs(px.y - yf) / 1.6) * flick * smoothstep(1150.0, 150.0, abs(px.x - 960.0));
      for (int i = 0; i < 14; i++) {
        float fi = float(i);
        vec2 bc = vec2(hash11(fi * 3.1) * 2200.0 - 140.0 + t * (8.0 + 14.0 * hash11(fi)), yf - 80.0 - hash11(fi * 7.7) * 520.0);
        float br = 34.0 + 60.0 * hash11(fi * 5.3);
        float bd = length(px - bc);
        float disk = smoothstep(br, br - 3.0, bd) * (0.55 + 0.45 * smoothstep(br * 0.5, br, bd));
        c += mix(C_BLUE, C_CYAN, hash11(fi * 2.2)) * disk * 0.015 * (0.4 + 0.6 * hash11(fi * 9.1)) * flick * above;
        vec2 rc = vec2(bc.x, 2.0 * yf - bc.y);
        float rd = length((px - rc) * vec2(1.0, 1.6));
        c += mix(C_BLUE, C_CYAN, hash11(fi * 2.2)) * smoothstep(br, br - 6.0, rd) * 0.008 * flick * fl;
      }
      float s = px.x * 0.6 + (px.y - yf) * 1.4 - t * 140.0;
      float streak = exp(-pow(fract(s / 1500.0) - 0.5, 2.0) / 0.0015);
      c += vec3(0.010, 0.016, 0.040) * streak * fl * flick;
      gl_FragColor = vec4(c, 1.0);
    }`, { t: { value: 0 }, flick: { value: 1 }, yf: { value: 640 }, zoom: { value: 1 }, pan: { value: new THREE.Vector2() } });

  // ------------------------------------------------------------ 3D (fan)
  scene3 = new THREE.Scene();
  cam3 = new THREE.PerspectiveCamera(34, W / H, 0.1, 400);
  fan = new Fan();
  ring!: Glyphs3D;
  hubTxt!: Glyphs3D;

  L0!: Line; L1!: Line; L2!: Line; L3!: Line;
  T!: Times;
  layB1!: Lay2D; layB2!: Lay2D; layD1!: Lay2D; layD2!: Lay2D; layE1!: Lay2D; layE2a!: Lay2D; layE2b!: Lay2D;
  codeTex!: THREE.Texture;

  async init() {
    const { lyrics: Ly, audio: A } = this.ctx;
    const L0 = (this.L0 = Ly.get('部屋の明かりを落として'));
    const L1 = (this.L1 = Ly.get('PCのファンだけが回ってる'));
    const L2 = (this.L2 = Ly.get('ブルーライトに照らされた'));
    const L3 = (this.L3 = Ly.get('私の顔はきっと、ひどい疲れ顔'));
    const ws = (l: Line, s: string) => Ly.word(l, s).start - LEAD;
    this.T = {
      flip: A.beats.find((b) => b >= 0) ?? 0.27,
      light: cutBefore(A, L0),
      off: ws(L0, '落として'),
      fan: cutBefore(A, L1, L0),
      fanW: ws(L1, 'ファン'),
      mawa: ws(L1, '回ってる'),
      blue: cutBefore(A, L2, L1),
      teras: ws(L2, '照らされた'),
      glass: cutBefore(A, L3, L2),
      hidoi: ws(L3, 'ひどい'),
      tsukare: ws(L3, '疲れ顔'),
      end: this.ctx.end,
    };
    const W0 = (l: Line, s: string) => Ly.word(l, s);
    this.layB1 = layout2D([...W0(L0, '部屋の').chars, ...W0(L0, '明かりを').chars], { font: 'sans9', size: 160 });
    this.layB2 = layout2D(W0(L0, '落として').chars, { font: 'sans9', size: 215 });
    this.layD1 = layout2D(W0(L2, 'ブルーライトに').chars, { font: 'sans9', size: 165 });
    this.layD2 = layout2D(W0(L2, '照らされた').chars, { font: 'sans9', size: 215 });
    this.layE1 = layout2D([...W0(L3, '私の').chars, ...W0(L3, '顔は').chars, ...W0(L3, 'きっと').chars], { font: 'mincho', size: 160 });
    this.layE2a = layout2D(W0(L3, 'ひどい').chars, { font: 'mincho', size: 150 });
    this.layE2b = layout2D(W0(L3, '疲れ顔').chars, { font: 'mincho', size: 280 });

    // fan + lights
    this.scene3.add(this.fan.group);
    this.scene3.add(new THREE.AmbientLight(0x1a2448, 0.7));
    const key = new THREE.DirectionalLight(col('blue'), 3.2); key.position.set(-6, 8, 10); this.scene3.add(key);
    const rim = new THREE.DirectionalLight(col('ice'), 0.7); rim.position.set(9, -4, -5); this.scene3.add(rim);
    const pt = new THREE.PointLight(col('cyan'), 60, 40, 2); pt.position.set(5, 3, 7); this.scene3.add(pt);
    const ringChars = [...W0(L1, 'PCの').chars, ...W0(L1, 'ファンだけが').chars];
    this.ring = new Glyphs3D(ringChars, { font: 'sans9', size: 1.08, color: col('bone'), renderOrder: 30 });
    this.fan.group.add(this.ring.group);
    this.hubTxt = new Glyphs3D(W0(L1, '回ってる').chars, { font: 'sans9', size: 0.98, color: col('bone'), renderOrder: 31 });
    this.fan.group.add(this.hubTxt.group);

    // the monitor content (static)
    const cv = document.createElement('canvas');
    cv.width = 1280; cv.height = 720;
    const c2 = cv.getContext('2d')!;
    c2.fillStyle = HEX.ink2; c2.fillRect(0, 0, 1280, 720);
    drawEditor(c2, 0, 0, 1280, 720, { px: 30, highlight: 2 });
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    this.codeTex = tex;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    const T = this.T, t = f.t;
    if (t < T.light) return this.shotClock(f, out);
    if (t < T.fan) return this.shotLight(f, out);
    if (t < T.blue) return this.shotFan(f, out);
    if (t < T.glass) return this.shotBlue(f, out);
    return this.shotGlass(f, out);
  }

  // ================================================================ helpers
  private hudClock(c: CanvasRenderingContext2D, f: Frame, color: string) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    const s = storyClock(f.t);
    const px = 34, x = 112, y = 134;
    c.save();
    c.font = font('dot', px);
    c.textBaseline = 'alphabetic';
    c.fillStyle = color;
    const hh = s.slice(0, 2), mm = s.slice(3, 5);
    c.fillText(hh, x, y);
    const w1 = c.measureText(hh).width, wc = c.measureText(':').width;
    c.globalAlpha = f.beatPhase < 0.5 ? 1 : 0.25;
    c.fillText(':', x + w1, y);
    c.globalAlpha = 1;
    const w2 = c.measureText(mm).width;
    c.fillText(mm, x + w1 + wc, y);
    c.font = font('dot', 18);
    c.globalAlpha = 0.6;
    c.fillText('AM', x + w1 + wc + w2 + 10, y);
    c.restore();
  }

  private cam2D(c: CanvasRenderingContext2D, z: number, cx = 960, cy = 540, px = 0, py = 0, s = 1) {
    c.setTransform(z * s, 0, 0, z * s, (cx - cx * z + px) * s, (cy - cy * z + py) * s);
  }

  // ================================================================ A — clock
  private clockDigits(c: CanvasRenderingContext2D, f: Frame, flash: number, glowPass: boolean) {
    const px = 360, y = 500;
    const A0 = '01:59', B0 = '02:00';
    const e = f.t - this.T.flip;
    const cw = [...B0].map((ch, k) => Math.max(advance('dot', ch, px), advance('dot', A0[k]!, px)));
    const total = cw.reduce((a, b) => a + b, 0);
    const delays = [0, 0.07, 0, 0.035, 0];
    const fill = glowPass ? css('cyan', 0.5 + 0.5 * flash) : cssMix('ice', 'bone', flash);
    const st = { fill, glow: glowPass ? null : css('cyan', 0.75), glowBlur: 46 };
    let x = 960 - total / 2;
    for (let k = 0; k < 5; k++) {
      const a = A0[k]!, b = B0[k]!, w = cw[k]!, cx = x + w / 2;
      if (k === 2) {
        if (e < 0 || f.beatPhase < 0.5) glyph2D(c, ':', 'dot', px, cx, y, st);
      } else if (a === b) {
        glyph2D(c, b, 'dot', px, cx, y, st);
      } else if (e < delays[k]!) {
        glyph2D(c, a, 'dot', px, cx, y, st);
      } else {
        // pixel scramble for a few frames, then lock with a jolt
        const d = e - delays[k]!;
        const locked = d >= 0.1;
        const ch = locked ? b : String(Math.floor(hash(k, f.frame, 17) * 10));
        const jy = locked ? -18 * Math.exp(-(d - 0.1) / 0.05) : (hash(k, f.frame, 3) - 0.5) * 40;
        glyph2D(c, ch, 'dot', px, cx, y + jy, { ...st, alpha: locked ? 1 : 0.75, sx: locked ? 1 : 1 + (hash(k, f.frame, 9) - 0.5) * 0.25 });
        if (!locked && !glowPass) {
          c.save(); c.fillStyle = css('ice', 0.35);
          for (let j = 0; j < 5; j++) c.fillRect(x + hash(k, f.frame, 20 + j) * w * 0.8, y - px * 0.4 + hash(k, f.frame, 40 + j) * px * 0.8, w * 0.35, px * 0.045);
          c.restore();
        }
      }
      x += w;
    }
  }

  private shotClock(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    const { renderer, comp } = this.ctx;
    const T = this.T, t = f.t, e = t - T.flip;
    const flash = e >= 0 ? Math.exp(-e / 0.09) : 0;
    this.bgClock.u.flash!.value = flash;
    this.bgClock.render(renderer, out);
    const c = this.hud.clear(), g = this.glow.clear();
    const z = 1 + 0.045 * (t / T.light) + (e >= 0 ? 0.03 * Math.exp(-e / 0.1) : 0);
    this.cam2D(c, z, 960, 520);
    this.cam2D(g, z, 960, 520, 0, 0, 0.5);
    this.clockDigits(c, f, flash, false);
    this.clockDigits(g, f, flash, true);
    // reflection of the digits on the desk (faint)
    // title + cursor
    const title = '2時のデバッグ';
    const tpx = 40, tr = 0.42;
    const full = measure('dot', title, tpx, tr);
    const n = e < 0.03 ? 0 : Math.min(title.length, Math.floor((e - 0.03) / 0.034) + 1);
    let tx = 960 - full / 2;
    const ty = 770;
    for (let i = 0; i < n; i++) {
      const ch = title[i]!;
      const a = advance('dot', ch, tpx);
      const age = e - 0.03 - i * 0.034;
      glyph2D(c, ch, 'dot', tpx, tx + a / 2, ty, { fill: css('mist', 0.95), glow: css('cyan', 0.5 * Math.exp(-age / 0.1)), glowBlur: 18 });
      tx += a + tr * tpx;
    }
    const solid = e < 0 || n < title.length || e < 0.5;
    if (solid || f.beatPhase < 0.55) {
      c.save();
      c.fillStyle = css('cyan'); c.shadowColor = css('cyan'); c.shadowBlur = 22;
      c.fillRect(tx + 2, ty - tpx * 0.55, tpx * 0.56, tpx * 1.1);
      c.restore();
      g.fillStyle = css('cyan', 0.8); g.fillRect(tx + 2, ty - tpx * 0.55, tpx * 0.56, tpx * 1.1);
    }
    comp.draw(renderer, this.hud.upload(), out);
    comp.draw(renderer, this.glow.upload(), out, { mode: 'add', tint: 1.4 + 3.5 * flash });
    return { bloom: 0.95, vignette: 0.55, scanlines: 0.12, grain: 0.05, ca: 1.6, shake: e >= 0 && e < 0.1 ? [0, 5 * Math.exp(-e / 0.03)] : [0, 0] };
  }

  // ================================================================ B — the room light
  private shotLight(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    const { renderer, comp } = this.ctx;
    const T = this.T, t = f.t, eo = t - T.off;
    const on = eo < 0 ? 1 : 0;
    const after = eo >= 0 ? Math.exp(-eo / 0.16) : 0;
    const blue = eo >= 0 ? 0.62 + 0.38 * ease.outCubic(clamp(eo / 0.7)) : 0;
    const z = 1.0 + 0.05 * prog(t, T.light, T.off, ease.outCubic) + (eo >= 0 ? 0.035 * ease.outExpo(clamp(eo / 0.25)) + 0.03 * prog(t, T.off + 0.25, T.fan, ease.inOutSine) : 0);
    const panY = eo >= 0 ? -10 * prog(t, T.off, T.fan, ease.outCubic) : 0;
    const u = this.bgLight.u;
    u.on!.value = on; u.after!.value = after; u.blue!.value = blue; u.zoom!.value = z;
    (u.pan!.value as THREE.Vector2).set(0, -panY);
    this.bgLight.render(renderer, out);

    const c = this.hud.clear();
    this.cam2D(c, z, 960, 540, 0, panY);
    // pull cord + knob
    const ax = 960, ay = 196;
    const pull = eo < 0 ? 64 * ease.inCubic(clamp((t - (T.off - 0.12)) / 0.12)) : 64 * (1 - spring(eo, 2.3, 0.2));
    const swing = 0.03 * Math.sin(t * 2.1 + 0.4) + (eo >= 0 ? 0.15 * Math.sin(eo * 7.2) * Math.exp(-eo / 0.55) : 0);
    const len = 205 + pull;
    const kx = ax + Math.sin(swing) * len, ky = ay + Math.cos(swing) * len;
    c.save();
    c.strokeStyle = on ? css('ink', 0.8) : css('navy', 0.95);
    c.lineWidth = 3;
    c.beginPath(); c.moveTo(ax, ay); c.lineTo(kx, ky); c.stroke();
    if (!on) { c.strokeStyle = css('blue', 0.35); c.lineWidth = 1; c.beginPath(); c.moveTo(ax + 1.5, ay + 40); c.lineTo(kx + 1.5, ky); c.stroke(); }
    c.translate(kx, ky); c.rotate(-swing);
    rrect(c, -14, 0, 28, 60, 10);
    if (on) {
      c.fillStyle = css('bone'); c.fill(); c.strokeStyle = css('ink', 0.55); c.lineWidth = 2; c.stroke();
    } else {
      const gr = c.createLinearGradient(0, 0, 0, 60);
      gr.addColorStop(0, css('ink2')); gr.addColorStop(0.65, css('navy')); gr.addColorStop(1, css('blue', 0.95));
      c.fillStyle = gr; c.fill();
    }
    c.restore();

    // dust motes drifting in the lamp light
    if (on) {
      for (let i = 0; i < 70; i++) {
        const sp = 6 + 18 * hash(i, 2);
        const x = 960 + (hash(i, 1) - 0.5) * 1500 + Math.sin(t * 0.6 + i) * 20;
        const y = ((hash(i, 3) * 700 + t * sp) % 700) + 120;
        const dl = Math.hypot((x - 960) / 1.6, y - 170);
        const b = Math.exp(-dl / 380) * (0.35 + 0.65 * hash(i, 5));
        c.fillStyle = css('bone', clamp(b * 0.9));
        c.beginPath(); c.arc(x, y, 1 + 2.2 * hash(i, 6), 0, TAU); c.fill();
      }
    }
    // row 1: 部屋の明かりを
    const y1 = 572, y2 = 812;
    const gradBelow = (cc: CanvasRenderingContext2D, px: number) => {
      const gr = cc.createLinearGradient(0, -px * 0.5, 0, px * 0.5);
      gr.addColorStop(0, '#0a1028'); gr.addColorStop(0.5, '#1a46c8'); gr.addColorStop(1, '#a9d8ff');
      return gr;
    };
    const gradBelow2 = (cc: CanvasRenderingContext2D, px: number) => {
      const gr = cc.createLinearGradient(0, -px * 0.5, 0, px * 0.5);
      gr.addColorStop(0, '#080b18'); gr.addColorStop(0.45, '#183a9e'); gr.addColorStop(1, HEX.cyan);
      return gr;
    };
    for (const g of this.layB1.glyphs) {
      const s = gstate(g, this.L0, t, 'word', 0.3);
      if (!s.vis) continue;
      const x = 960 + g.x, y = y1 + g.y;
      if (!s.on) {
        glyph2D(c, g.c, 'sans9', 160, x, y, { fill: on ? css('ink', 0.13) : css('steel', 0.22) });
        continue;
      }
      const k = enter('stamp', s.since, g.gi, 0.45);
      if (on) glyph2D(c, g.c, 'sans9', 160, x, y, { fill: css('ink', 0.95), sc: k.sc, alpha: k.alpha, glow: css('ink', 0.35), glowBlur: 22, glowY: 14 });
      else glyph2D(c, g.c, 'sans9', 160, x, y, { grad: gradBelow, glow: css('blue', 0.7), glowBlur: 26, glowY: 4 });
    }
    // row 2: 落として — drops out of a slot (masked) so it never crosses row 1
    c.save();
    c.beginPath(); c.rect(0, y2 - 132, W, 420); c.clip();
    for (const g of this.layB2.glyphs) {
      const s = gstate(g, this.L0, t, 'char', 0);
      if (!s.vis) continue;
      const dp = clamp(s.since / 0.24);
      const dy = -235 * (1 - ease.outBack(dp));
      const rot = (hash(g.gi, 5) - 0.5) * 0.5 * (1 - ease.outCubic(dp));
      glyph2D(c, g.c, 'sans9', 215, 960 + g.x, y2 + g.y + dy, { grad: gradBelow2, glow: css('cyan', 0.6), glowBlur: 40, glowY: 8, rot, alpha: 1, sy: 1 - 0.1 * Math.exp(-Math.max(0, s.since - 0.16) / 0.05) * (dp > 0.6 ? 1 : 0) });
    }
    c.restore();
    this.hudClock(c, f, on ? css('ink', 0.75) : css('mist', 0.75));
    comp.draw(renderer, this.hud.upload(), out);
    return {
      bloom: on ? 0.75 : 0.7, bloomThreshold: on ? 1.2 : 0.9, vignette: on ? 0.3 : 0.5, grain: 0.05,
      shake: eo >= 0 && eo < 0.2 ? [3 * Math.sin(eo * 90) * Math.exp(-eo / 0.05), 12 * Math.exp(-eo / 0.05)] : [0, 0],
      flash: eo >= 0 && eo < 0.02 ? 0.0 : 0,
    };
  }

  // ================================================================ C — the fan
  private fanTheta(t: number) {
    const A = this.ctx.audio, T = this.T;
    const sector = TAU / 7;
    const b0 = Math.floor(A.beat(T.fan) - 1e-6);
    const k = Math.floor(A.beat(t) + 1e-6);
    const tk = A.beatTime(k);
    const ticks = sector * (k - b0 - 1 + ease.outExpo(clamp((t - tk) / 0.24)));
    const drift = 2.4 * (t - T.fan);
    const Wm = 150, D = 0.7, d = t - T.mawa;
    const spin = d <= 0 ? 0 : d < D ? (Wm * d * d * d) / (3 * D * D) : Wm * (D / 3 + (d - D));
    return ticks + drift + spin;
  }
  private ringSpin(t: number) {
    const d = t - this.T.mawa;
    if (d <= 0) return 0;
    return 1.6 * d * d * d + 1.2 * d * d;
  }

  private shotFan(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    const { renderer, comp, audio: A } = this.ctx;
    const T = this.T, t = f.t;
    const k1 = prog(t, T.fan, T.fanW, ease.inOutSine);
    const kW = prog(t, T.fanW, T.fanW + 0.34, ease.outExpo);
    const kM = prog(t, T.mawa, T.mawa + 0.9, ease.outCubic);
    this.bgFan.u.glow!.value = 1 + 0.6 * kM;
    this.bgFan.render(renderer, out);

    const th = this.fanTheta(t), h = 1 / 240;
    const om = (this.fanTheta(t + h) - this.fanTheta(t - h)) / (2 * h);
    this.fan.update(th, om, 0.5 / 60, 1, 0.45 + 0.4 * A.beatPulse(t, 0.2) + 0.8 * kM);

    // karaoke wheel
    const R = 4.25, anchor = 0.92;
    const items = this.ring.items;
    let X = items[0]!.x - 1.9, prevX = X;
    for (const it of items) {
      const s0 = it.ch!.start - LEAD;
      X += (it.x - prevX) * ease.outBack(clamp((t - s0) / 0.2));
      prevX = it.x;
    }
    const spinR = this.ringSpin(t);
    for (const it of items) {
      const a = anchor + (X - it.x) / R + spinR;
      it.mesh.position.set(Math.cos(a) * R, Math.sin(a) * R, 1.7);
      it.mesh.rotation.set(0, 0, a - Math.PI / 2);
      const s = gstate(it, this.L1, t, 'line', 0.8);
      it.mesh.visible = s.vis;
      if (!s.on) { tint(it.mesh, col('steel'), 0.38); it.mesh.scale.setScalar(1); continue; }
      const fl = Math.exp(-s.since / 0.12);
      it.mesh.scale.setScalar(1 + 0.3 * Math.exp(-s.since / 0.07));
      tint(it.mesh, col('bone', 1 + 3.2 * fl - 0.35 * kM), 1);
    }
    for (const it of this.hubTxt.items) {
      const s = gstate(it, this.L1, t, 'word', 0.35);
      it.mesh.visible = s.vis;
      if (!s.vis) continue;
      it.mesh.position.z = 1.05;
      if (!s.on) { it.mesh.rotation.set(0, 0, 0); it.mesh.scale.setScalar(1); tint(it.mesh, col('steel'), 0.3); continue; }
      const sp = ease.outCubic(clamp(s.since / 0.34));
      it.mesh.rotation.set(0, 0, -TAU * (1 - sp));
      it.mesh.scale.setScalar(0.55 + 0.45 * spring(s.since, 3, 0.4));
      tint(it.mesh, col('bone', 1 + 3 * Math.exp(-s.since / 0.1)), 1);
    }

    // camera
    const yaw = lerp(lerp(-0.85, -0.66, k1), -0.12, kW) + 0.22 * kM;
    const pitch = lerp(lerp(0.3, 0.24, k1), 0.07, kW) - 0.05 * kM;
    const dist = lerp(lerp(23, 21, k1), 19.8, kW) - 9.6 * kM;
    const tx = lerp(1.6, 0.0, kW), ty = lerp(0.8, 0.95, kW) - 0.95 * kM;
    const cam = this.cam3;
    cam.position.set(tx + dist * Math.sin(yaw) * Math.cos(pitch), ty + dist * Math.sin(pitch), dist * Math.cos(yaw) * Math.cos(pitch));
    cam.lookAt(tx, ty, 0);
    cam.rotateZ(lerp(-0.14, 0.03, kW) - 0.07 * kM);
    this.draw(this.scene3, cam, out);

    const c = this.hud.clear();
    this.hudClock(c, f, css('mist', 0.8));
    const omX = Math.max(0, om - 2.4);
    const rpm = Math.round(1180 + 14 * Math.min(omX, 160) + (hash(f.frame >> 2, 3) - 0.5) * 12);
    c.save();
    c.font = font('dot', 28); c.textAlign = 'right'; c.fillStyle = css(kM > 0.3 ? 'cyan' : 'steel', 0.9);
    c.fillText(`CPU_FAN  ${rpm} RPM`, W - 112, H - 108);
    c.restore();
    comp.draw(renderer, this.hud.upload(), out);
    const whip = kW > 0 && kW < 0.95 ? (1 - kW) : 0;
    return { bloom: 0.85, ca: 1.6 + 2 * whip, zoomBlur: 0.55 * whip + 0.35 * (kM > 0 && kM < 0.98 ? 1 - kM : 0), vignette: 0.45 };
  }

  // ================================================================ D — blue light
  private shotBlue(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    const { renderer, comp } = this.ctx;
    const T = this.T, t = f.t, L2 = this.L2;
    const p = prog(t, T.blue, T.glass);
    const ef = t - T.teras;
    const flood = ef >= 0 ? Math.exp(-ef / 0.32) : 0;
    const punch = ef >= 0 ? Math.exp(-ef / 0.16) : 0;
    let pul = 0;
    for (const ch of L2.words[0]!.chars) { const d = t + LEAD - ch.start; if (d >= 0) pul += Math.exp(-d / 0.14) * 0.22; }
    const I = ef < 0 ? 0.34 + 0.3 * prog(t, T.blue, T.teras, ease.inQuad) + pul : 1.05 + 2.6 * flood;
    const zs = 1 + 0.07 * p + 0.05 * punch;
    const zt = 1 + 0.15 * p + 0.07 * punch;
    const rect = new THREE.Vector4(0.5, 0.56, 0.158 * zs, 0.158 * zs);
    const u = this.bgScreen.u;
    u.code!.value = this.codeTex; (u.rect!.value as THREE.Vector4).copy(rect); u.I!.value = I; u.flood!.value = flood;
    this.bgScreen.render(renderer, out);

    const c = this.hud.clear(), m = this.mask.clear(), g = this.glow.clear();
    this.cam2D(c, zt);
    this.cam2D(m, zt, 960, 540, 0, 0, 0.5);
    const y1 = 475, y2 = 770;
    const sil = (cc: CanvasRenderingContext2D, px: number) => {
      const gr = cc.createLinearGradient(0, -px * 0.5, 0, px * 0.5);
      gr.addColorStop(0, '#0a0f24'); gr.addColorStop(1, '#03040a');
      return gr;
    };
    const litG = (cc: CanvasRenderingContext2D, px: number) => {
      const gr = cc.createLinearGradient(-px * 0.5, -px * 0.5, px * 0.4, px * 0.6);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, HEX.ice); gr.addColorStop(1, '#4f8dff');
      return gr;
    };
    for (const gl of this.layD1.glyphs) {
      const s = gstate(gl, L2, t, 'word', 0.35);
      if (!s.vis) continue;
      const x = 960 + gl.x, y = y1 + gl.y;
      if (!s.on) { glyph2D(c, gl.c, 'sans9', 165, x, y, { fill: css('ink', 0.55) }); continue; }
      const k = enter('pop', s.since, gl.gi);
      glyph2D(c, gl.c, 'sans9', 165, x, y, { grad: sil, glow: css('cyan', 0.85), glowBlur: 22 + 40 * Math.exp(-s.since / 0.15), sc: k.sc, alpha: k.alpha });
      glyph2D(m, gl.c, 'sans9', 165, x, y, { fill: '#fff', sc: k.sc });
    }
    for (const gl of this.layD2.glyphs) {
      const s = gstate(gl, L2, t, 'word', 0.3);
      if (!s.vis) continue;
      const x = 960 + gl.x, y = y2 + gl.y;
      if (!s.on) { glyph2D(c, gl.c, 'sans9', 215, x, y, { fill: css('steel', 0.2) }); continue; }
      const k = enter('stamp', s.since, gl.gi, 0.5);
      const lit = ease.outCubic(clamp(s.since / 0.16));
      glyph2D(c, gl.c, 'sans9', 215, x, y, { grad: sil, glow: css('cyan', 0.8), glowBlur: 30, sc: k.sc, alpha: k.alpha });
      glyph2D(c, gl.c, 'sans9', 215, x, y, { grad: litG, glow: css('blue', 0.95), glowBlur: 36, sc: k.sc, alpha: k.alpha * lit });
      const sw = clamp(s.since / 0.22);
      if (sw < 1) glyph2D(c, gl.c, 'sans9', 215, x, y, { sc: k.sc, alpha: (1 - sw) * 0.9, grad: (cc, px) => {
        const gr = cc.createLinearGradient(-px * 0.7, 0, px * 0.7, 0);
        const q = clamp(-0.2 + 1.4 * sw, 0, 1);
        gr.addColorStop(Math.max(0, q - 0.18), 'rgba(255,255,255,0)'); gr.addColorStop(q, 'rgba(255,255,255,1)'); gr.addColorStop(Math.min(1, q + 0.18), 'rgba(255,255,255,0)');
        return gr;
      } });
      glyph2D(m, gl.c, 'sans9', 215, x, y, { fill: '#fff', sc: k.sc });
      // glow copy for bloom
      g.save(); this.cam2D(g, zt, 960, 540, 0, 0, 0.5);
      glyph2D(g, gl.c, 'sans9', 215, x, y, { fill: css('ice', 0.35 + 0.65 * Math.exp(-s.since / 0.2)), sc: k.sc, alpha: lit });
      g.restore();
    }
    // dust in the beams
    g.setTransform(0.5, 0, 0, 0.5, 0, 0);
    for (let i = 0; i < 120; i++) {
      const sp = 10 + 26 * hash(i, 2);
      const x = (((hash(i, 1) * 2200 + t * sp * (hash(i, 4) - 0.35)) % 2200) + 2200) % 2200 - 140;
      const y = (((hash(i, 3) * 1300 - t * sp * 0.5) % 1300) + 1300) % 1300 - 110;
      const d = Math.hypot(x - 960, y - 570);
      const b = Math.exp(-d / 480) * (0.35 + 0.65 * hash(i, 5)) * Math.min(1.5, I * 0.5);
      g.fillStyle = css('ice', clamp(b));
      g.beginPath(); g.arc(x, y, 1.2 + 2.2 * hash(i, 6), 0, TAU); g.fill();
    }
    // rays
    const eu = this.emit.u;
    eu.mask!.value = this.mask.upload(); eu.code!.value = this.codeTex; (eu.rect!.value as THREE.Vector4).copy(rect); eu.I!.value = I;
    this.emit.render(renderer, this.rays.em);
    this.rays.blur(renderer, [rect.x, rect.y], { decay: 0.972, density: 1.15, weight: 0.034, exposure: 1 });
    comp.draw(renderer, this.rays.out.texture, out, { mode: 'add', tint: 1 });
    this.hudClock(c, f, css('mist', 0.8));
    comp.draw(renderer, this.hud.upload(), out);
    comp.draw(renderer, this.glow.upload(), out, { mode: 'add', tint: 1.8 });
    return {
      bloom: 1.0, vignette: 0.5, ca: 1.5,
      flash: ef >= 0 && ef < 0.1 ? 0.35 * (1 - ef / 0.1) : 0, flashColor: [0.55, 0.75, 1.0],
      shake: ef >= 0 && ef < 0.25 ? [6 * Math.sin(ef * 80) * Math.exp(-ef / 0.07), 8 * Math.exp(-ef / 0.06)] : [0, 0],
    };
  }

  // ================================================================ E — dark glass
  private reflectRow(c: CanvasRenderingContext2D, lay: Lay2D, ox: number, yf: number, px: number, t: number,
    style: (g: Glyph) => { alpha: number; dy?: number; rot?: number; sy?: number; dx?: number; ghost?: number } | null) {
    const fk = lay.o.font;
    for (const g of lay.glyphs) {
      const st = style(g);
      if (!st || st.alpha <= 0.002) continue;
      const cy = yf - px * 0.5 - px * 0.04 + (st.dy ?? 0);
      const x = ox + g.x + (st.dx ?? 0);
      // reflection
      c.save();
      c.translate(x, yf + (yf - cy) + Math.sin(t * 2 + g.gi) * 1.5);
      c.scale(1, -(st.sy ?? 1));
      c.rotate(-(st.rot ?? 0));
      c.font = font(fk, px);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      const gr = c.createLinearGradient(0, px * 0.5, 0, -px * 0.5);
      gr.addColorStop(0, css('ice', 0.0)); gr.addColorStop(1, css('ice', 0.26 * st.alpha));
      c.fillStyle = gr;
      c.fillText(g.c, 0, px * 0.04);
      c.restore();
      if (st.ghost) glyph2D(c, g.c, fk, px, x + 9 + 5 * Math.sin(t * 3.1), cy + 3, { fill: css('cyan', 0.22 * st.ghost * st.alpha), rot: st.rot, sy: st.sy });
      glyph2D(c, g.c, fk, px, x, cy, { fill: css('bone', st.alpha), rot: st.rot, sy: st.sy, glow: css('blue', 0.55 * st.alpha), glowBlur: 26 });
    }
  }

  private shotGlass(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    const { renderer, comp } = this.ctx;
    const T = this.T, t = f.t, L3 = this.L3;
    const e2 = t - T.hidoi;
    const k2 = e2 >= 0 ? ease.outExpo(clamp(e2 / 0.26)) : 0;
    const et = t - T.tsukare;
    const dying = et > 0.25;
    const fh = hash(f.frame, 11), fh2 = hash(f.frame >> 1, 13);
    const flickOn = dying && (fh < 0.16 || (fh2 < 0.1 && et > 0.55));
    const flick = flickOn ? 0.35 : 1;
    // camera: E1 tracks the sung char, then whips down to row 2
    const sung = L3.chars.filter((ch) => t + LEAD >= ch.start && ch.wi <= 2).length;
    const focusG = this.layE1.glyphs[Math.max(0, Math.min(this.layE1.glyphs.length - 1, sung - 1))]!;
    const zr = lerp(1.3, 1.0, prog(t, T.glass, T.hidoi - 0.25, ease.inOutCubic));
    const fx = lerp(960 + focusG.x * 0.55, 960, prog(t, T.glass + 0.9, T.hidoi - 0.2, ease.inOutCubic));
    const z1 = lerp(zr, 1.0, k2), panX = lerp(fx - 960, 0, k2);
    const yf1 = 610, yf2 = 780;
    const scroll = lerp(0, 330, k2);
    const z = z1 * (1 + 0.05 * prog(t, T.hidoi, T.end));
    const u = this.bgGlass.u;
    u.t!.value = t; u.flick!.value = flick; u.zoom!.value = z; u.yf!.value = lerp(yf1, yf2, k2);
    (u.pan!.value as THREE.Vector2).set(panX, 0);
    this.bgGlass.render(renderer, out);

    const c = this.hud.clear();
    c.setTransform(z, 0, 0, z, 960 - 960 * z - panX * z, 540 - 540 * z);
    // row 1 (scrolls up and recedes when row 2 arrives)
    c.save();
    const s1 = lerp(1, 0.5, k2);
    c.translate(960, yf1 - scroll); c.scale(s1, s1); c.translate(-960, -yf1);
    this.reflectRow(c, this.layE1, 960, yf1, 160, t, (g) => {
      const s = gstate(g, L3, t, 'word', 0.3);
      if (!s.vis) return null;
      if (!s.on) return { alpha: 0.3 };
      const k = enter('rise', s.since * 4, g.gi);
      return { alpha: k.alpha * lerp(1, 0.6, k2), dy: k.dy };
    });
    c.restore();
    // row 2: ひどい + 疲れ顔 (big)
    if (e2 > -0.35) {
      const wa = this.layE2a.width, wb = this.layE2b.width, gap = 40;
      const x0 = 960 - (wa + gap + wb) / 2;
      const yIn = (1 - k2) * 260;
      c.save(); c.translate(0, yIn);
      this.reflectRow(c, this.layE2a, x0 + wa / 2, yf2, 150, t, (g) => {
        const s = gstate(g, L3, t, 'word', 0.3);
        if (!s.vis) return null;
        if (!s.on) return { alpha: 0.2 * k2 };
        const k = enter('rise', s.since, g.gi);
        return { alpha: k.alpha * (flickOn ? 0.5 : 1), dy: k.dy };
      });
      this.reflectRow(c, this.layE2b, x0 + wa + gap + wb / 2, yf2, 280, t, (g) => {
        const s = gstate(g, L3, t, 'word', 0.3);
        if (!s.vis) return null;
        if (!s.on) return { alpha: 0.18 * k2 };
        const k = enter('rise', s.since, g.gi);
        const j = g.gi - this.layE2b.glyphs[0]!.gi;
        const dr = ease.outCubic(clamp((s.since - 0.06) / (j === 2 ? 0.3 : 0.5)));
        const heavy = j === 2 ? 2.0 : 1 + j * 0.4;
        const glitchX = flickOn ? (hash(f.frame, j, 5) - 0.5) * 30 : 0;
        return {
          alpha: k.alpha * (flickOn ? 0.45 + 0.3 * hash(f.frame, j) : 1),
          dy: k.dy + 24 * dr * heavy, rot: (j === 2 ? 0.075 : j === 1 ? -0.05 : 0.045) * dr * heavy, sy: 1 - 0.05 * dr * heavy,
          dx: glitchX, ghost: dr,
        };
      });
      c.restore();
    }
    this.hudClock(c, f, css('mist', 0.75 * flick));
    comp.draw(renderer, this.hud.upload(), out);
    return {
      bloom: 0.65, vignette: 0.55, grain: 0.055,
      scanlines: dying ? 0.12 + (flickOn ? 0.25 : 0) : 0, rgbSplit: flickOn ? 3 : 0,
      exposure: flickOn ? 0.8 : 1,
    };
  }
}
