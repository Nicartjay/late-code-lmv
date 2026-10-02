// The edit. Windows are derived from the aligned lyrics and the beat grid — never
// hard-code times: cuts land on the 8th-note grid just before a line's first sung mora.
import type { AudioData } from './engine/audio';
import type { EntryDef } from './engine/engine';
import type { Lyrics } from './engine/lyrics';
import type { Scene } from './engine/scene';

type Mod = { default: new () => Scene };
const BUNDLED = import.meta.glob<Mod>('./scenes/*.ts');

// Resolved at runtime (not import.meta.glob) so scene files created while the dev server
// runs are picked up without a restart. A missing module falls back to the placeholder;
// a module that exists but fails to load reports its error (SCENE ERRORS).
function loader(module: string) {
  // production build (the website): every scene is bundled
  if (import.meta.env.PROD) return BUNDLED[`./scenes/${module}.ts`] ?? BUNDLED['./scenes/_placeholder.ts']!;
  return async (): Promise<Mod> => {
    const url = `/src/scenes/${module}.ts`;
    const head = await fetch(url, { method: 'HEAD' }).catch(() => null);
    // (Vite answers unknown paths with the SPA index.html, so check the content type)
    const js = !!head && head.ok && /javascript/.test(head.headers.get('content-type') ?? '');
    if (!js) return import('./scenes/_placeholder');
    return import(/* @vite-ignore */ url) as Promise<Mod>;
  };
}

export function buildTimeline(L: Lyrics, A: AudioData): EntryDef[] {
  const cut = (text: string, nth = 0, lead = 0.06) => A.beatFloor(L.get(text, nth).start - lead, 0.5);
  const bar = (k: number) => A.barTime(k);
  const END = A.duration;
  const T: [string, string, number, number, Record<string, unknown>?][] = [
    // id            module       start                                   end
    ['open', 'open', 0, cut('マグカップの底に残った')],
    ['mug', 'mug', cut('マグカップの底に残った'), cut('街の喧騒はもう遠く')],
    ['city', 'city', cut('街の喧騒はもう遠く'), cut('さっきからずっと同じ場所')],
    ['loop', 'loop', cut('さっきからずっと同じ場所'), cut('タイピングの音だけが BGM')],
    ['chorus1', 'chorus', cut('タイピングの音だけが BGM'), bar(18), { n: 1 }],
    ['inter1', 'inter1', bar(18), cut('Qiitaの海はもう泳ぎ疲れた')],
    ['qiita', 'qiita', cut('Qiitaの海はもう泳ぎ疲れた'), cut('「仕様です」って言葉の裏で')],
    ['spec', 'spec', cut('「仕様です」って言葉の裏で'), cut('開いたタブは数え切れない')],
    ['tabs', 'tabs', cut('開いたタブは数え切れない'), cut('スタックオーバーフローにも')],
    ['stack', 'stack', cut('スタックオーバーフローにも'), cut('窓の外が少しずつ')],
    ['dawn', 'dawn', cut('窓の外が少しずつ'), cut('タイピングの音だけが BGM', 1)],
    ['chorus2', 'chorus', cut('タイピングの音だけが BGM', 1), bar(41), { n: 2 }],
    ['drop', 'drop', bar(41), cut('…あれ？')],
    ['typo', 'typo', cut('…あれ？'), cut('ビルド成功。')],
    ['success', 'success', cut('ビルド成功。'), cut('明日の自分、よろしく頼むよ。')],
    ['outro', 'outro', cut('明日の自分、よろしく頼むよ。'), END],
  ];
  return T.map(([id, module, start, end, params]) => ({ id, start, end, load: loader(module), params: { module, ...params } }));
}
