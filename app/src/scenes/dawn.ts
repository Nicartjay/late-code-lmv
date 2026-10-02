// Pre-chorus 2 (bars 27.75–34.5): the night turns. A window; the sky literally goes
// violet on 紫 and blue on 青; the city and a first train; a kick-slam on ケリ in front
// of the buggy file; the prayer 「神様、どうか通して」 in vertical brush type under light
// rays; trembling type and a compile bar racing into chorus 2.
import * as THREE from 'three';
import { FSPass, H, Layer2D, W } from '../engine/gl';
import { enter, gstate } from '../engine/kinetic';
import { LEAD, type Line } from '../engine/lyrics';
import { BUG_COL, BUG_LINE, CODE, drawEditor, drawProgress, storyClock } from '../engine/motifs';
import { css } from '../engine/palette';
import type { PostParams } from '../engine/post';
import { Scene, type Frame } from '../engine/scene';
import { drawGlyphs2D, layout2D, text2D, type Lay2D } from '../engine/type2d';
import { clamp, ease, hash, lerp, noise1, smoothstep } from '../engine/util';

interface Row { line: Line; lay: Lay2D; x: number; y: number; next: number }

export default class Dawn extends Scene {
  sky = new FSPass(/* glsl */ `
    uniform float t, violet, blue, light, win, rays, train, trainX;
    void main() {
      vec2 uv = vUv;
      vec3 night = mix(vec3(0.003, 0.004, 0.012), vec3(0.008, 0.012, 0.045), uv.y);
      vec3 vio = mix(vec3(0.16, 0.04, 0.30), vec3(0.025, 0.008, 0.08), pow(uv.y, 0.8));
      vec3 blu = mix(vec3(0.16, 0.30, 0.85), vec3(0.015, 0.05, 0.25), pow(uv.y, 0.8));
      vec3 dwn = mix(vec3(0.55, 0.50, 0.80), vec3(0.08, 0.20, 0.62), pow(uv.y, 0.7));
      vec3 c = mix(mix(mix(night, vio, violet), blu, blue), dwn, light);
      vec2 g = floor(uv * vec2(380.0, 214.0));
      float s = step(0.9965, hash12(g)) * (0.6 + 0.4 * sin(t * 2.0 + hash12(g + 7.0) * 30.0));
      c += vec3(0.7, 0.75, 1.0) * s * smoothstep(0.3, 0.9, uv.y) * clamp(1.0 - blue * 0.7 - light, 0.0, 1.0);
      // skyline
      float x = uv.x * 58.0, col = floor(x);
      float hgt = 0.1 + 0.15 * hash11(col * 1.7) + (hash11(col * 7.3) > 0.86 ? 0.1 : 0.0);
      vec3 city = vec3(0.003, 0.004, 0.01) + vec3(0.01, 0.015, 0.05) * blue;
      vec2 wv = vec2(fract(x) * 6.0, uv.y * 150.0);
      float lit = step(0.82, hash12(floor(wv) + col * 13.0)) * step(uv.y, hgt - 0.012) * step(0.25, fract(wv.x)) * step(0.35, fract(wv.y));
      city += vec3(1.0, 0.72, 0.38) * lit * 0.55 * (1.0 - light * 0.5);
      // the first train on an elevated line
      float ty = abs(uv.y - 0.07);
      float tx = uv.x - trainX;
      float car = step(0.0, tx) * step(tx, 0.16) * step(0.3, fract(tx * 90.0));
      city += vec3(1.2, 0.95, 0.6) * train * car * step(ty, 0.006);
      city += vec3(0.02, 0.025, 0.06) * step(abs(uv.y - 0.062), 0.0015);
      c = mix(city, c, step(hgt, uv.y));
      // light rays (the prayer)
      vec2 rp = uv - vec2(0.5, 1.15);
      float ang = atan(rp.x, -rp.y);
      float ray = pow(max(0.0, sin(ang * 36.0 + t * 0.25)), 5.0) * smoothstep(1.5, 0.1, length(rp));
      c += vec3(1.0, 0.92, 0.8) * ray * rays * 0.22 + vec3(0.25, 0.25, 0.35) * rays * smoothstep(0.6, 1.0, uv.y) * 0.4;
      // window frame (mullions + sash)
      float fr = step(abs(uv.x - 0.5), 0.011) + step(abs(uv.y - 0.56), 0.014) + step(uv.x, 0.055) + step(0.945, uv.x) + step(uv.y, 0.06) + step(0.94, uv.y);
      c = mix(c, vec3(0.0015, 0.0015, 0.004), clamp(fr, 0.0, 1.0) * win);
      gl_FragColor = vec4(c, 1.0);
    }`, {
    t: { value: 0 }, violet: { value: 0 }, blue: { value: 0 }, light: { value: 0 }, win: { value: 1 },
    rays: { value: 0 }, train: { value: 0 }, trainX: { value: 0 },
  });
  hud = new Layer2D();
  rows: Row[] = [];

  async init() {
    const { lyrics, start, end } = this.ctx;
    const ls = lyrics.lines.filter((l) => l.start >= start - 0.01 && l.start < end);
    const spec: [string, number, number, number, boolean?][] = [
      ['mincho', 128, W / 2, 690],
      ['mincho', 132, W / 2, 600],
      ['mincho', 118, W / 2, 470],
      ['dela', 122, W / 2, 880],
      ['brush', 150, W / 2, H / 2 - 20, true],
      ['sans9', 112, W / 2, 430],
    ];
    ls.forEach((line, i) => {
      const [fk, size, x, y, vert] = spec[i]!;
      const lay = layout2D(line, { font: fk as never, size, vertical: vert, wrap: vert ? 920 : 1560, lineHeight: vert ? 1.35 : 1.25 });
      this.rows.push({ line, lay, x, y, next: ls[i + 1]?.start ?? end });
    });
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    const { renderer: r, comp } = this.ctx;
    const t = f.t, T = t + LEAD;
    const [l24, l25, l26, l27, l28, l29] = this.rows.map((x) => x.line);
    const w = (l: Line, s: string) => l.words.find((x) => x.w.includes(s))!.start;
    const u = this.sky.u;
    u.t!.value = t;
    u.violet!.value = smoothstep(w(l25!, '紫') - 0.1, w(l25!, '紫') + 0.7, T);
    u.blue!.value = smoothstep(w(l25!, '青') - 0.05, w(l25!, '青') + 1.3, T);
    u.light!.value = 0.65 * smoothstep(l26!.start, this.ctx.end, t);
    u.win!.value = T < l26!.start ? 1 : 0;
    u.train!.value = T >= l26!.start && T < l27!.start ? 1 : 0;
    u.trainX!.value = -0.2 + 1.3 * clamp((T - l26!.start) / (l27!.start - l26!.start));
    u.rays!.value = smoothstep(l28!.start - 0.2, l28!.start + 1.2, T) * (1 - smoothstep(l29!.start, l29!.start + 0.6, T));
    this.sky.render(r, out);
    const hc = this.hud.clear();
    // the buggy file behind ケリ
    const inKeri = T >= l27!.start - 0.15 && T < l28!.start;
    if (inKeri) {
      const k = ease.outExpo(clamp((T - l27!.start + 0.15) / 0.35));
      hc.save();
      hc.globalAlpha = 0.92 * k;
      hc.translate(W / 2, 430);
      hc.scale(lerp(0.9, 1, k), lerp(0.9, 1, k));
      drawEditor(hc, -620, -300, 1240, 600, { px: 28, scroll: 0, highlight: BUG_LINE, errorLine: BUG_LINE, errorCol: [BUG_COL - 1, BUG_COL + 1], cursor: { line: BUG_LINE, col: BUG_COL + 1, on: f.beatPhase < 0.5 }, title: 'night.ts — 1 error' });
      hc.restore();
    }
    // compile bar for the last line
    if (T >= l29!.start - 0.1) {
      const p = ease.inQuad(clamp((T - l29!.start) / (this.ctx.end - l29!.start - 0.15)));
      const shake = 6 * p * noise1(t * 40);
      text2D(hc, 'コンパイル中…', W / 2 - 600 + shake, 700, 'dot', 40, css('ice'), { glow: css('cyan', 0.7), glowBlur: 16 });
      drawProgress(hc, W / 2 - 600 + shake, 730, 1200, 26, p, css('cyan'));
      text2D(hc, `${Math.floor(p * 100)}%`, W / 2 + 630, 754, 'dela', 34, css('bone'));
    }
    // lyrics
    this.rows.forEach((row, i) => {
      const { line, lay } = row;
      if (T < line.start - 0.4 || T > row.next + 0.12) return;
      const out2 = clamp((T - row.next) / 0.12);
      const isKeri = i === 3, isPrayer = i === 4, isTremble = i === 5;
      drawGlyphs2D(hc, lay, row.x, row.y, (g) => {
        const s = gstate(g, line, t, isKeri ? 'word' : 'line', isKeri ? 0.02 : 0.35);
        if (!s.vis) return null;
        const ch = g.ch!;
        let kind: Parameters<typeof enter>[0] = isPrayer ? 'rise' : 'rise';
        if (isKeri) kind = ch.wi === 2 ? 'slam' : ch.wi === 3 ? 'stamp' : 'whip';
        if (isTremble) kind = 'pop';
        const kin = enter(kind, isKeri ? s.e : s.since, g.gi, isKeri ? 1 : 0.8);
        if (!s.on && !isKeri) { kin.alpha = 0.35; kin.dy = 0; kin.sc = 1; kin.blur = 0; }
        if (isTremble) {
          const amp = 2 + 6 * clamp((T - line.start) / 4);
          kin.dx += amp * noise1(t * 31 + g.gi * 3.1, 1);
          kin.dy += amp * noise1(t * 29 + g.gi * 1.7, 2);
        }
        kin.alpha *= 1 - out2;
        let fill = css('bone');
        if (i === 1) fill = ch.wi === 0 ? css('violet') : ch.wi === 1 ? css('blue') : css('ice');
        if (isKeri && ch.wi === 2) fill = css('cyan');
        if (isPrayer) fill = css('bone');
        return {
          style: {
            fill: s.on || isKeri ? fill : css('steel', 0.9),
            glow: s.on ? (isPrayer ? css('gold', 0.8) : i === 1 ? fill : css('ice', 0.5)) : null,
            glowBlur: isPrayer ? 34 : 22,
            stroke: isKeri ? css('ink', 0.9) : null, strokeWidth: 8,
          },
          kin,
        };
      });
    });
    // small clock
    text2D(hc, storyClock(t), W - 130, 96, 'dot', 34, css('ice', 0.75), { align: 'right' });
    comp.draw(r, this.hud.upload(), out);
    // post: slow push-ins per line, impacts on ケリ, riser at the end
    const cur = this.rows.findLast?.((x) => T >= x.line.start - 0.05) ?? this.rows[0]!;
    const lt = T - cur.line.start;
    const keri = w(l27!, 'ケリ'), dk = T - keri;
    const hit = dk >= 0 ? Math.exp(-dk / 0.09) : 0;
    const rise = clamp((t - (this.ctx.end - 1.6)) / 1.6);
    return {
      bloom: 0.7 + 0.4 * u.rays!.value, grain: 0.05, vignette: 0.4,
      zoom: 1 + 0.035 * clamp(lt / 2.6) + 0.04 * hit + 0.06 * ease.inQuad(rise),
      shake: [Math.sin(t * 90) * 18 * hit, Math.cos(t * 80) * 12 * hit],
      ca: 1.2 + 4 * hit + 5 * rise, zoomBlur: 0.9 * ease.inCubic(rise),
      flash: Math.max(0.5 * hit * 0.2, t > this.ctx.end - 0.08 ? 0.6 : 0), flashColor: [0.9, 0.9, 1],
    };
  }
}
