// Shared typography layout + lyric timing states + kinetic entrance presets.
// Used by both the Canvas2D (type2d.ts) and the troika 3D (text3d.ts) renderers.
import { advance, type FontKey } from './fonts';
import { LEAD, type Char, type Line } from './lyrics';
import { clamp, ease, hash, spring } from './util';

export interface Glyph {
  c: string; // character drawn (vertical forms are handled by rot / offsets)
  x: number; // centre x (px, block-local, y down)
  y: number; // centre y
  adv: number; // advance (px)
  rot: number; // radians (vertical punctuation / long-vowel bar)
  ch?: Char; // lyric char (if laid out from a Line)
  wi: number; // word index
  gi: number; // glyph index
  row: number; // row (horizontal) or column (vertical)
}

export interface LayoutOpts {
  font: FontKey;
  size: number;
  tracking?: number; // em
  vertical?: boolean; // 縦書き (columns right -> left)
  wrap?: number; // max row width (px); rows break between words only
  lineHeight?: number; // em, 1.25
  align?: 'left' | 'center' | 'right'; // row alignment
  anchor?: 'center' | 'topleft'; // block origin
}

const V_ROT = new Set(['ー', '〜', '～', '—', '―', '…', '‥', '「', '」', '『', '』', '（', '）', '(', ')', '〈', '〉', '【', '】', '-', '–']);
const V_SMALL = new Set([...'ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ']);
const V_PUNCT = new Set(['、', '。', '，', '．']);

/** Lay out a string, a lyric line, or a list of chars into glyph positions. */
export function layoutGlyphs(src: string | Line | Char[], o: LayoutOpts): { glyphs: Glyph[]; width: number; height: number } {
  const size = o.size, tr = (o.tracking ?? 0) * size, lh = (o.lineHeight ?? 1.25) * size;
  // words: arrays of {c, ch}
  let words: { c: string; ch?: Char; sp: boolean }[][];
  if (typeof src === 'string') {
    words = [[...src].map((c) => ({ c, sp: false }))];
  } else if (Array.isArray(src)) {
    words = [src.map((ch) => ({ c: ch.c, ch, sp: false }))];
  } else {
    words = src.words.map((w) => w.chars.map((ch, k) => ({ c: ch.c, ch, sp: k === 0 && w.sp })));
  }
  const glyphs: Glyph[] = [];
  if (!o.vertical) {
    // rows of words
    const rows: { items: typeof words[number]; wi: number }[][] = [[]];
    let rowW = 0;
    const wordW = (w: typeof words[number]) => w.reduce((s, g) => s + advance(o.font, g.c, size) + tr, 0) + (w[0]?.sp ? advance(o.font, ' ', size) : 0);
    words.forEach((w, wi) => {
      const ww = wordW(w);
      if (o.wrap && rowW > 0 && rowW + ww > o.wrap) {
        rows.push([]);
        rowW = 0;
      }
      rows[rows.length - 1]!.push({ items: w, wi });
      rowW += ww;
    });
    let maxW = 0;
    const rowWidths: number[] = [];
    rows.forEach((r) => {
      let x = 0;
      r.forEach(({ items }, k) => items.forEach((g, gi) => {
        if (gi === 0 && g.sp && k > 0) x += advance(o.font, ' ', size);
        x += advance(o.font, g.c, size) + tr;
      }));
      rowWidths.push(x - tr);
      maxW = Math.max(maxW, x - tr);
    });
    let gi = 0;
    rows.forEach((r, ri) => {
      const rw = rowWidths[ri]!;
      let x = o.align === 'left' ? 0 : o.align === 'right' ? maxW - rw : (maxW - rw) / 2;
      const y = ri * lh;
      r.forEach(({ items, wi }, k) => items.forEach((g, j) => {
        if (j === 0 && g.sp && k > 0) x += advance(o.font, ' ', size);
        const a = advance(o.font, g.c, size);
        glyphs.push({ c: g.c, x: x + a / 2, y, adv: a, rot: 0, ch: g.ch, wi, gi: gi++, row: ri });
        x += a + tr;
      }));
    });
    const width = maxW, height = (rows.length - 1) * lh + size;
    if ((o.anchor ?? 'center') === 'center') for (const g of glyphs) { g.x -= width / 2; g.y -= (rows.length - 1) * lh / 2; }
    else for (const g of glyphs) g.y += size / 2;
    return { glyphs, width, height };
  }
  // vertical: one column per wrap segment (wrap = max column height)
  const cols: { items: typeof words[number]; wi: number }[][] = [[]];
  let colH = 0;
  const step = size + tr;
  words.forEach((w, wi) => {
    const wh = w.length * step;
    if (o.wrap && colH > 0 && colH + wh > o.wrap) { cols.push([]); colH = 0; }
    cols[cols.length - 1]!.push({ items: w, wi });
    colH += wh;
  });
  const colGap = lh;
  let gi = 0, maxH = 0;
  cols.forEach((c, ci) => {
    const x = -ci * colGap; // right to left
    let y = 0;
    c.forEach(({ items, wi }) => items.forEach((g) => {
      let gx = x, gy = y + size / 2, rot = 0;
      if (V_ROT.has(g.c)) rot = -Math.PI / 2;
      if (V_PUNCT.has(g.c)) { gx += size * 0.55; gy -= size * 0.55; }
      if (V_SMALL.has(g.c)) { gx += size * 0.1; gy -= size * 0.1; }
      if (/[A-Za-z0-9]/.test(g.c)) rot = -Math.PI / 2;
      glyphs.push({ c: g.c, x: gx, y: gy, adv: size, rot, ch: g.ch, wi, gi: gi++, row: ci });
      y += step;
    }));
    maxH = Math.max(maxH, y - tr);
  });
  const width = (cols.length - 1) * colGap + size, height = maxH;
  if ((o.anchor ?? 'center') === 'center') for (const g of glyphs) { g.x += (cols.length - 1) * colGap / 2; g.y -= height / 2; }
  return { glyphs, width, height };
}

// ------------------------------------------------------------------ timing
export type AppearMode = 'char' | 'word' | 'line';

export interface GState {
  vis: boolean; // visible at all
  e: number; // seconds since the glyph appeared (>= 0 when vis)
  s: number; // sung progress 0..1 (0 = not yet sung, 1 = fully sung)
  on: boolean; // being / has been sung
  since: number; // seconds since sung start (negative before)
}

/** state of a lyric glyph at time t. appear: when it becomes visible (its own start, its word's start, or the line's start), minus `antic` seconds */
export function gstate(g: Glyph, line: Line | undefined, t: number, appear: AppearMode = 'char', antic = 0): GState {
  const ch = g.ch;
  if (!ch) return { vis: true, e: 1e3, s: 1, on: true, since: 1e3 };
  const T = t + LEAD;
  let ta = ch.start;
  if (appear === 'word' && line) ta = line.words[ch.wi]!.start;
  if (appear === 'line' && line) ta = line.start;
  ta -= antic;
  const s = ch.end > ch.start ? clamp((T - ch.start) / (ch.end - ch.start)) : T >= ch.start ? 1 : 0;
  return { vis: T >= ta, e: T - ta, s, on: T >= ch.start, since: T - ch.start };
}

// ------------------------------------------------------------------ entrance presets
export interface Kin {
  dx: number; dy: number; sc: number; sx: number; sy: number; rot: number; alpha: number; bright: number; blur: number;
}
export const KIN0 = (): Kin => ({ dx: 0, dy: 0, sc: 1, sx: 1, sy: 1, rot: 0, alpha: 1, bright: 1, blur: 0 });

export type Enter = 'slam' | 'pop' | 'drop' | 'rise' | 'whip' | 'type' | 'zoom' | 'stamp' | 'none';

/** entrance transform for a glyph `e` seconds after it appeared; gi seeds variation */
export function enter(kind: Enter, e: number, gi = 0, amt = 1): Kin {
  const k = KIN0();
  if (e < 0) { k.alpha = 0; return k; }
  switch (kind) {
    case 'slam': {
      const p = clamp(e / 0.14);
      k.sc = 1 + (2.6 - 1) * (1 - ease.outCubic(p)) * amt;
      k.alpha = clamp(e / 0.04);
      k.bright = 1 + 2.5 * Math.exp(-e / 0.07) * amt;
      k.rot = (hash(gi, 3) - 0.5) * 0.35 * (1 - p) * amt;
      break;
    }
    case 'stamp': {
      const p = clamp(e / 0.09);
      k.sc = 1 + 1.4 * (1 - ease.outQuad(p)) * amt;
      k.alpha = clamp(e / 0.03);
      k.bright = 1 + 3 * Math.exp(-e / 0.05);
      break;
    }
    case 'pop': {
      k.sc = spring(e, 3.2, 0.42) * amt + (1 - amt);
      k.alpha = clamp(e / 0.05);
      k.bright = 1 + 1.2 * Math.exp(-e / 0.1);
      break;
    }
    case 'drop': {
      const p = clamp(e / 0.28);
      k.dy = -160 * (1 - ease.outBackStrong(p)) * amt;
      k.alpha = clamp(e / 0.06);
      k.rot = (hash(gi, 5) - 0.5) * 0.6 * (1 - ease.outCubic(p)) * amt;
      break;
    }
    case 'rise': {
      const p = clamp(e / 0.42);
      k.dy = 46 * (1 - ease.outCubic(p)) * amt;
      k.alpha = ease.outQuad(clamp(e / 0.3));
      k.blur = 8 * (1 - ease.outCubic(p)) * amt;
      break;
    }
    case 'whip': {
      const p = clamp(e / 0.22);
      k.dx = 420 * (1 - ease.outExpo(p)) * amt;
      k.sx = 1 + 1.6 * (1 - ease.outExpo(p)) * amt;
      k.alpha = clamp(e / 0.05);
      k.bright = 1 + 1.5 * Math.exp(-e / 0.08);
      break;
    }
    case 'zoom': {
      const p = clamp(e / 0.3);
      k.sc = 0.2 + 0.8 * ease.outBack(p);
      k.alpha = clamp(e / 0.08);
      break;
    }
    case 'type': {
      k.alpha = e >= 0 ? 1 : 0;
      k.bright = 1 + 1.5 * Math.exp(-e / 0.06);
      break;
    }
    case 'none':
      break;
  }
  return k;
}

/** scramble: returns the character to display `e` seconds before/after it locks (code-ish decoding effect) */
const SCR = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン01{}<>[]();=+*#$%&/\\|?!';
export function scrambleChar(final: string, t: number, lockAt: number, gi: number, rate = 30) {
  if (t >= lockAt) return final;
  const i = Math.floor(t * rate);
  return SCR[Math.floor(hash(gi, i, 7) * SCR.length)]!;
}
