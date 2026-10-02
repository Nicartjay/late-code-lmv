// Font registry. Every Japanese string is set in a Japanese typeface; Latin-only
// code uses JetBrains Mono. Files are subsets built by analysis/make_fonts.py
// (re-run it after adding new strings to scenes).
//
//   key        family                     voice
//   dela       Dela Gothic One            slams, chorus impact
//   sans9/7/4/3 Noto Sans JP 900/700/400/300  main lyric voice
//   serif9/5   Noto Serif JP 900/500      emotional / dawn
//   mincho     Shippori Mincho B1 XB      dramatic mincho
//   dot        DotGothic16                system / pixel / glitch
//   code7/4    M PLUS 1 Code 700/400      code with Japanese
//   mono8/4    JetBrains Mono 800/400     Latin-only code
//   brush      Yuji Syuku                 the prayer (神様)
//   reggae     Reggae One                 the bug laughing
//   rampart    Rampart One                hollow 3D display
//   zen        Zen Kaku Gothic New Black  alt heavy gothic

export const FONT_FILES = {
  dela: 'DelaGothicOne',
  sans9: 'NotoSansJP-Black',
  sans7: 'NotoSansJP-Bold',
  sans4: 'NotoSansJP-Regular',
  sans3: 'NotoSansJP-Light',
  serif9: 'NotoSerifJP-Black',
  serif5: 'NotoSerifJP-Medium',
  mincho: 'ShipporiMinchoB1-ExtraBold',
  dot: 'DotGothic16',
  code7: 'MPLUS1Code-Bold',
  code4: 'MPLUS1Code-Regular',
  mono8: 'JetBrainsMono-ExtraBold',
  mono4: 'JetBrainsMono-Regular',
  brush: 'YujiSyuku',
  reggae: 'ReggaeOne',
  rampart: 'RampartOne',
  zen: 'ZenKakuGothicNew-Black',
} as const;
export type FontKey = keyof typeof FONT_FILES;

export const fontURL = (k: FontKey) => `${import.meta.env.BASE_URL}fonts/${FONT_FILES[k]}.ttf`;
/** CSS family name registered for Canvas2D */
export const fontFamily = (k: FontKey) => `lnc-${k}`;
/** CSS font shorthand for Canvas2D */
export const font = (k: FontKey, px: number) => `${px}px "${fontFamily(k)}"`;

export async function loadFonts() {
  const all = Object.keys(FONT_FILES) as FontKey[];
  await Promise.all(
    all.map(async (k) => {
      const ff = new FontFace(fontFamily(k), `url(${fontURL(k)})`);
      await ff.load();
      document.fonts.add(ff);
    }),
  );
}

// ---- measuring (Canvas2D, synchronous; same font files as troika)
const mctx = document.createElement('canvas').getContext('2d')!;
const advCache = new Map<string, number>();
/** advance width of a single character at size px (cached) */
export function advance(k: FontKey, ch: string, px: number) {
  const key = `${k}|${ch}`;
  let a = advCache.get(key);
  if (a === undefined) {
    mctx.font = font(k, 100);
    a = mctx.measureText(ch).width / 100;
    advCache.set(key, a);
  }
  return a * px;
}
export function measure(k: FontKey, s: string, px: number, tracking = 0) {
  mctx.font = font(k, px);
  return mctx.measureText(s).width + tracking * px * Math.max(0, [...s].length - 1);
}
