// Canvas2D typography: dynamic text (scramble, typing, wipes, glow) drawn every frame.
import { font, type FontKey } from './fonts';
import { layoutGlyphs, type Glyph, type Kin, type LayoutOpts } from './kinetic';
import type { Char, Line } from './lyrics';

export interface Lay2D { glyphs: Glyph[]; width: number; height: number; o: LayoutOpts; }

export function layout2D(src: string | Line | Char[], o: LayoutOpts): Lay2D {
  return { ...layoutGlyphs(src, o), o };
}

export interface GlyphStyle {
  fill?: string | CanvasGradient | CanvasPattern | null;
  stroke?: string | null;
  strokeWidth?: number;
  glow?: string | null; // shadow colour
  glowBlur?: number;
  alpha?: number;
  char?: string; // override drawn character (scramble)
  font?: FontKey; // override font
  clip?: [number, number, number, number] | null; // local clip rect (x, y, w, h) relative to glyph centre (karaoke wipes)
}

/**
 * Draw a laid-out glyph block at (x, y) with an optional per-glyph style + kinetic transform.
 * fn returns null to skip a glyph.
 */
export function drawGlyphs2D(
  ctx: CanvasRenderingContext2D, lay: Lay2D, x: number, y: number,
  fn: (g: Glyph) => { style: GlyphStyle; kin?: Kin } | null,
) {
  const size = lay.o.size;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const g of lay.glyphs) {
    if (g.c === ' ') continue;
    const r = fn(g);
    if (!r) continue;
    const { style: s, kin: k } = r;
    const a = (s.alpha ?? 1) * (k?.alpha ?? 1);
    if (a <= 0.001) continue;
    ctx.save();
    ctx.translate(x + g.x + (k?.dx ?? 0), y + g.y + (k?.dy ?? 0));
    ctx.rotate(g.rot + (k?.rot ?? 0));
    const sc = k?.sc ?? 1;
    ctx.scale(sc * (k?.sx ?? 1), sc * (k?.sy ?? 1));
    ctx.globalAlpha = a;
    ctx.font = font(s.font ?? lay.o.font, size);
    if (k && k.blur > 0.3) ctx.filter = `blur(${k.blur.toFixed(1)}px)`;
    if (s.clip) {
      ctx.beginPath();
      ctx.rect(s.clip[0], s.clip[1], s.clip[2], s.clip[3]);
      ctx.clip();
    }
    if (s.glow) {
      ctx.shadowColor = s.glow;
      ctx.shadowBlur = s.glowBlur ?? 24;
    }
    const ch = s.char ?? g.c;
    if (s.fill) {
      ctx.fillStyle = s.fill;
      ctx.fillText(ch, 0, size * 0.04);
    }
    if (s.stroke) {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = s.stroke;
      ctx.lineWidth = s.strokeWidth ?? 2;
      ctx.lineJoin = 'round';
      ctx.strokeText(ch, 0, size * 0.04);
    }
    ctx.restore();
  }
  ctx.restore();
}

/** simple text helper (single run, no per-glyph logic) */
export function text2D(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, k: FontKey, px: number, fill: string,
  o: { align?: CanvasTextAlign; baseline?: CanvasTextBaseline; tracking?: number; alpha?: number; glow?: string; glowBlur?: number } = {}) {
  ctx.save();
  ctx.font = font(k, px);
  ctx.textAlign = o.align ?? 'left';
  ctx.textBaseline = o.baseline ?? 'alphabetic';
  ctx.fillStyle = fill;
  ctx.globalAlpha = o.alpha ?? 1;
  if (o.tracking) ctx.letterSpacing = `${o.tracking * px}px`;
  if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = o.glowBlur ?? 20; }
  ctx.fillText(s, x, y);
  ctx.restore();
}

/** rounded rect path */
export function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
