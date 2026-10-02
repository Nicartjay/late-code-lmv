// Recurring story motifs (Canvas2D), shared so they look identical in every scene:
//  * CODE — the one file we debug all night. Line 3 has the bug: `hour: 2;` (a semicolon
//    where a comma belongs). It shows up all video long; the bridge finds it.
//  * the cursor █ — the hero. Blinks on the beat.
//  * the story clock — 02:00 at the first frame, sunrise at the end.
import { font, type FontKey } from './fonts';
import { css, HEX } from './palette';
import { clamp, lerp } from './util';

export const CODE: string[] = [
  '// night.ts — 2時のデバッグ',
  'const night = {',
  '  hour: 2;',
  '  coffee: "cold",',
  '  tabs: 147,',
  '  patience: 0.02,',
  '};',
  '',
  'export async function debug(bug: Bug) {',
  '  while (!bug.fixed) {',
  '    await coffee.sip();',
  '    const answer = await search(bug.message);',
  '    if (!answer) console.log("仕様です");',
  '    bug.fixed = compile(night);',
  '  }',
  '  return "ビルド成功";',
  '}',
];
/** 0-based index of the buggy line, and the column of the ';' */
export const BUG_LINE = 2;
export const BUG_COL = CODE[BUG_LINE]!.indexOf(';');
export const BUG_ERROR = "error TS1005: ',' expected.  night.ts(3,10)";
export const CODE_FIXED = CODE.map((l, i) => (i === BUG_LINE ? l.replace(';', ',') : l));

/** filler code for walls / backgrounds (deterministic) */
export const CODE_POOL: string[] = [
  'for (let i = 0; i < tabs.length; i++) {', 'if (err) throw new Error("undefined is not a function");',
  'const res = await fetch(url, { method: "POST" });', 'return items.filter((x) => x.ok).map(render);',
  'console.log("ここまで来た");', '} catch (e) { console.error(e); }', 'export default function App() {',
  'while (true) { retry(); }', 'let answer = stackoverflow.search(q) ?? null;', 'git commit -m "fix: たぶん直った"',
  'TypeError: Cannot read properties of undefined', 'npm ERR! code ERESOLVE', 'Segmentation fault (core dumped)',
  'const sleep = (ms) => new Promise((r) => setTimeout(r, ms));', '// TODO: あとで直す', 'assert(night.hour < 3);',
  'import { coffee } from "./kitchen";', 'function why() { return why(); }', 'build failed with 1 error',
  'warning: unused variable `hope`', 'ReferenceError: tomorrow is not defined', 'SyntaxError: Unexpected token ;',
  'Maximum call stack size exceeded', '0 results for "この現象"', 'docs: Returns a Promise that resolves to',
];

// ---------------------------------------------------------------- syntax colours
const KW = new Set(['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'await', 'async', 'export', 'import', 'from', 'new', 'throw', 'try', 'catch', 'default', 'true', 'false', 'null', 'undefined']);
export const SYN = {
  text: '#c9d3ea', kw: '#7aa2ff', str: '#9ee6a8', num: '#ffb648', com: '#55607e', fn: '#62e6ff', punc: '#8a94b0', err: HEX.red,
};
export type Tok = { s: string; c: string };
export function tokenize(line: string): Tok[] {
  const out: Tok[] = [];
  const re = /(\/\/.*$)|("[^"]*"|'[^']*'|`[^`]*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+)|(.)/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const [s, com, str, num, id, ws] = m;
    if (com) out.push({ s, c: SYN.com });
    else if (str) out.push({ s, c: SYN.str });
    else if (num) out.push({ s, c: SYN.num });
    else if (id) out.push({ s, c: KW.has(id) ? SYN.kw : line[m.index + id.length] === '(' ? SYN.fn : SYN.text });
    else if (ws) out.push({ s, c: SYN.text });
    else out.push({ s, c: /[^\x00-\x7f]/.test(s) ? SYN.str : SYN.punc });
  }
  return out;
}

/** draw one syntax-highlighted code line; returns x after the line. Mono font cell width = px * 0.6 */
export function drawCodeLine(ctx: CanvasRenderingContext2D, line: string, x: number, y: number, px: number, o: { alpha?: number; fontKey?: FontKey; maxChars?: number } = {}) {
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = o.alpha ?? 1;
  let cx = x, n = 0;
  for (const tk of tokenize(line)) {
    for (const ch of tk.s) {
      if (o.maxChars !== undefined && n >= o.maxChars) { ctx.restore(); return cx; }
      const jp = /[^\x00-\x7f]/.test(ch);
      ctx.font = font(jp ? 'code4' : (o.fontKey ?? 'mono4'), px);
      ctx.fillStyle = tk.c;
      ctx.fillText(ch, cx, y);
      cx += jp ? px : px * 0.6;
      n++;
    }
  }
  ctx.restore();
  return cx;
}

export interface EditorOpts {
  lines?: string[];
  px?: number; // font size
  scroll?: number; // first visible line (fractional)
  highlight?: number; // highlighted line index (current line)
  errorLine?: number; // red squiggle under this line
  errorCol?: [number, number];
  typed?: number; // number of characters typed so far (typewriter); undefined = all
  cursor?: { line: number; col: number; on: boolean } | null;
  title?: string;
  alpha?: number;
  glow?: number; // 0..1 screen glow
}

/** an editor window: dark panel, tab header, line numbers, syntax colours */
export function drawEditor(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, o: EditorOpts = {}) {
  const lines = o.lines ?? CODE, px = o.px ?? 26, lh = px * 1.55;
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.fillStyle = css('ink2', 0.96);
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 14); ctx.fill();
  ctx.strokeStyle = css('steel', 0.35); ctx.lineWidth = 1.5; ctx.stroke();
  // header
  const hh = px * 1.9;
  ctx.fillStyle = css('ink3', 1);
  ctx.beginPath(); ctx.roundRect(x, y, w, hh, [14, 14, 0, 0]); ctx.fill();
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + 26 + i * 24, y + hh / 2, 6.5, 0, Math.PI * 2); ctx.fill(); });
  ctx.font = font('code4', px * 0.72); ctx.fillStyle = css('mist'); ctx.textBaseline = 'middle';
  ctx.fillText(o.title ?? 'night.ts', x + 110, y + hh / 2);
  // body
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y + hh, w, h - hh); ctx.clip();
  const scroll = o.scroll ?? 0;
  const first = Math.max(0, Math.floor(scroll));
  let typedLeft = o.typed ?? Infinity;
  for (let i = 0; i < first; i++) typedLeft -= (lines[i]?.length ?? 0) + 1;
  for (let i = first; i < lines.length; i++) {
    const ly = y + hh + px * 0.9 + (i - scroll) * lh;
    if (ly > y + h + lh) break;
    if (i === o.highlight) { ctx.fillStyle = css('blue', 0.14); ctx.fillRect(x, ly - lh / 2, w, lh); }
    ctx.font = font('mono4', px * 0.8); ctx.fillStyle = css('steel', i === o.highlight ? 1 : 0.7); ctx.textAlign = 'right';
    ctx.fillText(String(i + 1), x + px * 2.6, ly);
    ctx.textAlign = 'left';
    const line = lines[i] ?? '';
    const n = clamp(typedLeft, 0, line.length);
    const ex = drawCodeLine(ctx, line, x + px * 3.6, ly, px, { maxChars: Math.floor(n) });
    if (i === o.errorLine) {
      const c0 = o.errorCol?.[0] ?? 0, c1 = o.errorCol?.[1] ?? line.length;
      const sx = x + px * 3.6 + c0 * px * 0.6, sw = (c1 - c0) * px * 0.6;
      ctx.strokeStyle = css('red'); ctx.lineWidth = 2.2; ctx.beginPath();
      for (let k = 0; k <= sw; k += 2) ctx.lineTo(sx + k, ly + px * 0.62 + Math.sin(k * 0.55) * 2.4);
      ctx.stroke();
    }
    if (o.cursor && o.cursor.line === i && o.cursor.on) {
      const cx = o.cursor.col >= 0 ? x + px * 3.6 + o.cursor.col * px * 0.6 : ex;
      ctx.fillStyle = css('cyan'); ctx.shadowColor = css('cyan', 0.9); ctx.shadowBlur = 16;
      ctx.fillRect(cx, ly - px * 0.62, px * 0.56, px * 1.24); ctx.shadowBlur = 0;
    }
    typedLeft -= line.length + 1;
  }
  ctx.restore();
  ctx.restore();
}

/** the block cursor, blinking on the beat (beatPhase from the Frame) */
export function drawCursor(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, beatPhase: number, o: { color?: string; glow?: number; solid?: boolean } = {}) {
  const on = o.solid || beatPhase < 0.55;
  if (!on) return;
  ctx.save();
  ctx.fillStyle = o.color ?? css('cyan');
  ctx.shadowColor = o.color ?? css('cyan');
  ctx.shadowBlur = 30 * (o.glow ?? 1);
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

// ---------------------------------------------------------------- story clock
// song time -> story time (minutes after midnight). 02:00 at the first frame; the
// sky starts to lighten in the dawn scene; sunrise during the outro.
const CLOCK: [number, number][] = [[0, 120], [31, 133], [52, 149], [74, 287], [92, 301], [118, 336], [127, 341], [143, 357], [160, 362]];
export function storyMinutes(t: number) {
  for (let i = 1; i < CLOCK.length; i++) {
    const [t1, m1] = CLOCK[i]!, [t0, m0] = CLOCK[i - 1]!;
    if (t <= t1) return lerp(m0, m1, clamp((t - t0) / (t1 - t0)));
  }
  return CLOCK[CLOCK.length - 1]![1];
}
export function storyClock(t: number) {
  const m = Math.floor(storyMinutes(t));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** progress bar (rounded), p 0..1 */
export function drawProgress(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: number, color = css('cyan'), bg = css('ink3')) {
  ctx.save();
  ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fill();
  ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 18;
  ctx.beginPath(); ctx.roundRect(x, y, Math.max(h, w * clamp(p)), h, h / 2); ctx.fill();
  ctx.restore();
}
