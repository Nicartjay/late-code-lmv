// The bridge (spoken): the whole night's bug is one character.
//   …あれ？                         everything frozen, the cursor blinks
//   ここ、セミコロンじゃなくてカンマ…   macro on line 3: a giant `;` beside a giant `,`
//   たった一行、これだけのタイポかよ。   the single line lit, deadpan; the fix lands (the first green)
//   Enter…                          a giant Enter keycap, pressed in slow motion
import * as THREE from 'three';
import { font } from '../engine/fonts';
import { FSPass, H, Layer2D, W } from '../engine/gl';
import { enter, gstate } from '../engine/kinetic';
import { LEAD, type Line } from '../engine/lyrics';
import { BUG_COL, BUG_ERROR, BUG_LINE, CODE, CODE_FIXED, drawEditor, storyClock } from '../engine/motifs';
import { css } from '../engine/palette';
import type { PostParams } from '../engine/post';
import { Scene, type Frame } from '../engine/scene';
import { drawGlyphs2D, layout2D, text2D, type Lay2D } from '../engine/type2d';
import { clamp, ease, lerp, smoothstep } from '../engine/util';

export default class Typo extends Scene {
  bg = new FSPass(/* glsl */ `
    uniform float glow; uniform float green;
    void main() {
      vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
      vec3 c = vec3(0.004, 0.005, 0.012) + vec3(0.01, 0.03, 0.09) * exp(-dot(p, p) * 3.0) * glow;
      c += vec3(0.0, 0.05, 0.02) * green * exp(-dot(p, p) * 2.0);
      gl_FragColor = vec4(c, 1.0);
    }`, { glow: { value: 1 }, green: { value: 0 } });
  hud = new Layer2D();
  L!: Line[];
  lays: Lay2D[] = [];
  tFix = 0;

  async init() {
    const { lyrics, start, end } = this.ctx;
    this.L = lyrics.lines.filter((l) => l.start >= start - 0.01 && l.start < end);
    const [are, koko, tatta, ent] = this.L;
    this.lays = [
      layout2D(are!, { font: 'sans9', size: 150 }),
      layout2D(koko!, { font: 'sans9', size: 96, wrap: 1700 }),
      layout2D(tatta!, { font: 'sans9', size: 104, wrap: 1500 }),
      layout2D(ent!, { font: 'mono8', size: 150 }),
    ];
    // the fix lands on the last syllable of タイポかよ。
    const w = tatta!.words.find((x) => x.w.includes('タイポ'))!;
    this.tFix = w.chars[w.chars.length - 2]!.start;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    const { renderer: r, comp } = this.ctx;
    const t = f.t, T = t + LEAD;
    const [are, koko, tatta, ent] = this.L;
    const fixed = T >= this.tFix;
    const fixE = T - this.tFix;
    this.bg.u.glow!.value = 1;
    this.bg.u.green!.value = fixed && T < ent!.start ? Math.exp(-fixE / 0.6) : 0;
    this.bg.render(r, out);
    const hc = this.hud.clear();
    const px = 34, lh = px * 1.55;
    const edX = 260, edY = 150, edW = 1400, edH = 760;
    // where `;` sits in the editor (px), for the zoom
    const semiX = edX + px * 3.6 + BUG_COL * px * 0.6 + px * 0.3, semiY = edY + px * 1.9 + px * 0.9 + BUG_LINE * lh;
    let post: PostParams = { bloom: 0.7, vignette: 0.45, grain: 0.05, ca: 1.2 };
    const drawFile = (zoom: number, cx: number, cy: number, o: { dim?: number; lines?: string[]; err?: boolean; cursorCol?: number } = {}) => {
      hc.save();
      hc.translate(W / 2, H / 2);
      hc.scale(zoom, zoom);
      hc.translate(-cx, -cy);
      drawEditor(hc, edX, edY, edW, edH, {
        lines: o.lines ?? CODE, px, highlight: BUG_LINE, errorLine: o.err === false ? undefined : BUG_LINE, errorCol: [BUG_COL - 1, BUG_COL + 1],
        cursor: { line: BUG_LINE, col: o.cursorCol ?? BUG_COL + 1, on: f.beatPhase < 0.5 }, title: o.err === false ? 'night.ts' : 'night.ts — 1 error',
      });
      if (o.dim) {
        // dim every line except line 3
        hc.fillStyle = `rgba(5,6,11,${o.dim})`;
        hc.fillRect(edX, edY + px * 1.9, edW, semiY - lh / 2 - (edY + px * 1.9));
        hc.fillRect(edX, semiY + lh / 2, edW, edY + edH - (semiY + lh / 2));
      }
      hc.restore();
    };
    if (T < koko!.start) {
      // ---- …あれ？  frozen editor + status bar error
      drawFile(1, W / 2, H / 2);
      text2D(hc, BUG_ERROR, edX + 20, edY + edH + 56, 'mono4', 28, css('red'));
      const s = T - are!.start;
      if (s > -0.05) {
        const k = enter('pop', s, 0);
        hc.save(); hc.translate(W / 2, 960); hc.scale(k.sc, k.sc);
        drawGlyphs2D(hc, this.lays[0]!, 0, 0, (g) => ({ style: { fill: T >= g.ch!.start ? css('bone') : css('steel', 0.4), stroke: css('ink', 0.9), strokeWidth: 10 } }));
        hc.restore();
      }
      post = { ...post, saturation: 0.35, zoom: 1 + 0.01 * clamp(s), shake: s >= 0 && s < 0.2 ? [Math.sin(t * 80) * 6 * (1 - s / 0.2), 0] : [0, 0] };
    } else if (T < tatta!.start - 0.05) {
      // ---- ここ、セミコロン じゃなくて カンマ…
      const wSemi = koko!.words.find((x) => x.w.includes('セミコロン'))!;
      const wNot = koko!.words.find((x) => x.w.includes('じゃなくて'))!;
      const wComma = koko!.words.find((x) => x.w.includes('カンマ'))!;
      const zk = ease.inOutCubic(clamp((T - koko!.start) / 0.55));
      if (T < wSemi.start - 0.04) {
        drawFile(lerp(1, 5.5, zk), lerp(W / 2, semiX, zk), lerp(H / 2, semiY, zk));
        post = { ...post, zoomBlur: 0.5 * Math.sin(zk * Math.PI) };
      } else {
        // macro: two giant glyphs
        const e1 = T - wSemi.start, e3 = T - wComma.start;
        const k1 = enter('slam', e1, 1), k3 = enter('slam', e3, 3);
        const big = 620;
        hc.save(); hc.translate(620, 540 + k1.dy); hc.scale(k1.sc, k1.sc); hc.globalAlpha = k1.alpha;
        text2D(hc, ';', 0, 200, 'mono8', big, css('red'), { align: 'center', glow: css('red', 0.9), glowBlur: 60 });
        hc.restore();
        if (e3 >= -0.02) {
          hc.save(); hc.translate(1300, 540); hc.scale(k3.sc, k3.sc); hc.globalAlpha = k3.alpha;
          text2D(hc, ',', 0, 200, 'mono8', big, css('cyan'), { align: 'center', glow: css('cyan', 0.9), glowBlur: 60 });
          hc.restore();
        }
        // ≠ between them on じゃなくて
        const e2 = T - wNot.start;
        if (e2 >= 0) text2D(hc, '≠', 960, 600, 'dela', 200, css('mist', clamp(e2 / 0.15)), { align: 'center' });
        post = { ...post, ca: 1.5 + 5 * Math.exp(-Math.min(Math.abs(e1), Math.abs(e3)) / 0.08), shake: [Math.sin(t * 90) * 10 * (e1 >= 0 && e1 < 0.15 ? 1 : 0), 0] };
      }
      // the spoken line, bottom (labels under the glyphs)
      drawGlyphs2D(hc, this.lays[1]!, W / 2, 960, (g) => {
        const s = gstate(g, koko!, t, 'line', 0.3);
        if (!s.vis) return null;
        const ch = g.ch!;
        const fill = !s.on ? css('steel', 0.45) : ch.wi === 1 ? css('red') : ch.wi === 3 ? css('cyan') : css('bone');
        return { style: { fill, stroke: css('ink', 0.9), strokeWidth: 9 }, kin: s.on ? enter('pop', s.since, g.gi, 0.5) : undefined };
      });
    } else if (T < ent!.start - 0.05) {
      // ---- たった一行、これだけのタイポかよ。  (line 3 lit; the fix lands)
      const k = ease.outExpo(clamp((T - tatta!.start + 0.05) / 0.4));
      const typing = clamp((T - (this.tFix - 0.35)) / 0.35);
      const lines = fixed ? CODE_FIXED : CODE;
      drawFile(lerp(2.4, 1.7, k), semiX - 120, semiY + 40, { dim: 0.78, lines, err: !fixed, cursorCol: BUG_COL + (typing > 0 && !fixed ? 0 : 1) });
      if (fixed) {
        const a = clamp(fixE / 0.2);
        text2D(hc, '✓ 0 errors', W / 2, 850, 'mono8', 54, css('green', a), { align: 'center', glow: css('green', a * 0.8), glowBlur: 26 });
      }
      const band = hc.createLinearGradient(0, 60, 0, 380);
      band.addColorStop(0, 'rgba(5,6,11,0.95)'); band.addColorStop(0.75, 'rgba(5,6,11,0.88)'); band.addColorStop(1, 'rgba(5,6,11,0)');
      hc.fillStyle = band; hc.fillRect(0, 0, W, 380);
      drawGlyphs2D(hc, this.lays[2]!, W / 2, 200, (g) => {
        const s = gstate(g, tatta!, t, 'word', 0.05);
        if (!s.vis) return null;
        return { style: { fill: s.on ? css('bone') : css('steel', 0.5), stroke: css('ink', 0.9), strokeWidth: 10 }, kin: enter('drop', s.e, g.gi, 0.6) };
      });
      post = { ...post, flash: fixed ? 0.05 * Math.exp(-fixE / 0.1) : 0, flashColor: [0.6, 1, 0.75] };
    } else {
      // ---- Enter…  a giant keycap, pressed in slow motion
      const e = T - ent!.start;
      const press = ease.inOutCubic(clamp(e / (this.ctx.end - ent!.start - 0.05)));
      const kx = W / 2, ky = 560 + 46 * press, kw = 860, kh = 520;
      hc.save();
      // shadow + skirt
      hc.fillStyle = 'rgba(0,0,0,0.6)';
      hc.beginPath(); hc.roundRect(kx - kw / 2 + 10, ky - kh / 2 + 70 - 30 * press, kw, kh, 60); hc.fill();
      hc.fillStyle = '#1a2036';
      hc.beginPath(); hc.roundRect(kx - kw / 2, ky - kh / 2 + 44 - 30 * press, kw, kh, 60); hc.fill();
      const grd = hc.createLinearGradient(0, ky - kh / 2, 0, ky + kh / 2);
      grd.addColorStop(0, '#2a3354'); grd.addColorStop(1, '#141a2e');
      hc.fillStyle = grd;
      hc.beginPath(); hc.roundRect(kx - kw / 2, ky - kh / 2, kw, kh, 60); hc.fill();
      hc.strokeStyle = css('cyan', 0.35 + 0.5 * press); hc.lineWidth = 4; hc.stroke();
      hc.font = font('mono8', 110); hc.textAlign = 'right'; hc.fillStyle = css('steel', 0.8);
      hc.fillText('⏎', kx + kw / 2 - 60, ky + kh / 2 - 60);
      hc.restore();
      drawGlyphs2D(hc, this.lays[3]!, kx - 40, ky - 30, (g) => {
        const sung = T >= g.ch!.start;
        return { style: { fill: sung ? css('bone') : css('steel', 0.45), glow: sung ? css('cyan', 0.8) : null, glowBlur: 30 } };
      });
      post = { ...post, zoom: 1 + 0.08 * press, bloom: 0.8 + 0.6 * press, ca: 1.2 + 3 * press, vignette: 0.55, flash: t > this.ctx.end - 0.05 ? 0.4 : 0, flashColor: [0.7, 1, 0.8] };
    }
    text2D(hc, storyClock(t), W - 130, 96, 'dot', 34, css('ice', 0.75), { align: 'right' });
    comp.draw(r, this.hud.upload(), out);
    void smoothstep;
    return post;
  }
}
