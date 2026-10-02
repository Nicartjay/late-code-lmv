import { clamp } from './util';

/** visual lead: highlights fire this much before the aligned vocal onset (perceived sync) */
export const LEAD = 0.04;

export interface Char { c: string; start: number; end: number; kana: string; roma: string; li: number; wi: number; ci: number; }
export interface Word { w: string; sp: boolean; start: number; end: number; conf: number; chars: Char[]; li: number; wi: number; }
export interface Line { i: number; text: string; start: number; end: number; lrc: number; words: Word[]; chars: Char[]; }

interface Doc { lines: { i: number; text: string; start: number; end: number; lrc: number; words: Omit<Word, 'li' | 'wi'>[] }[]; duration: number }

export class Lyrics {
  lines: Line[];
  constructor(doc: Doc) {
    this.lines = doc.lines.map((l) => {
      let ci = 0;
      const words: Word[] = l.words.map((w, wi) => ({
        ...w,
        li: l.i,
        wi,
        chars: w.chars.map((c) => ({ ...c, li: l.i, wi, ci: ci++ })),
      }));
      return { ...l, words, chars: words.flatMap((w) => w.chars) };
    });
  }

  /** line by content (exact text first, then substring). nth = which occurrence (choruses repeat) */
  get(text: string, nth = 0): Line {
    const exact = this.lines.filter((l) => l.text === text);
    const hits = exact.length ? exact : this.lines.filter((l) => l.text.includes(text));
    const l = hits[nth];
    if (!l) throw new Error(`lyric line not found: ${text} [${nth}]`);
    return l;
  }
  /** all occurrences */
  all(text: string): Line[] {
    return this.lines.filter((l) => l.text.includes(text));
  }
  /** the line being sung at t (or the last one started) */
  at(t: number): Line | undefined {
    let cur: Line | undefined;
    for (const l of this.lines) if (l.start <= t + LEAD) cur = l;
    return cur;
  }
  word(l: Line, w: string): Word {
    const x = l.words.find((x) => x.w === w || x.w.includes(w));
    if (!x) throw new Error(`word ${w} not in ${l.text}`);
    return x;
  }

  /** 0..1 progress through an item (char / word / line) with the visual lead */
  static p(x: { start: number; end: number }, t: number) {
    return clamp((t + LEAD - x.start) / Math.max(0.03, x.end - x.start));
  }
  /** has the item started (with lead)? */
  static on(x: { start: number }, t: number) {
    return t + LEAD >= x.start;
  }
  /** seconds since the item started (negative before) */
  static since(x: { start: number }, t: number) {
    return t + LEAD - x.start;
  }
  /** number of characters of a line whose start has passed (fractional within the current char) */
  static charsSung(l: Line, t: number) {
    let n = 0;
    for (const c of l.chars) {
      if (t + LEAD < c.start) break;
      n += c.end > c.start ? clamp((t + LEAD - c.start) / (c.end - c.start)) : 1;
      if (t + LEAD < c.end) break;
    }
    return n;
  }
}

/** punctuation / zero-width characters (no sung duration) */
export const isPunct = (c: string) => '、。「」『』…？！?!・ '.includes(c);
