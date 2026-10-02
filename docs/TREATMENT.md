# 2時のデバッグ — treatment & style bible

## The idea

One night in the life of a developer, told as an **anime-opening-grade kinetic typography music video**. The verses are lonely and quiet (a dark room, cold coffee, a city far away); the choruses are an **adrenaline boss fight against the bug**. The story pays off in the bridge: the whole night's bug is **one character** — `hour: 2;` should be `hour: 2,` (「セミコロンじゃなくてカンマ」). Enter → the build goes green → git push → sunrise.

The video is the lyric. Every lyric character is on screen, **readable, and timed to the vocal** (character-level alignment in `data/lyrics.json`). Typography is the main actor: big Japanese type slamming, sliding, typing, orbiting, breaking — staged inside each scene's world (an editor, a fan, a mug, a city, a stack of blocks, a stamp, a sunrise), never as subtitles pasted on top.

## Tone

- **Fast and epic.** Something always moves. Cuts and hits land on the beat (91.85 BPM, bar = 2.613 s; cuts on the 8th grid, slams on the sung mora, flashes on kicks/snares). Inside a scene: sub-cuts, re-framings, snaps, camera whips — at least one new composition per lyric line, often one per word. Strong eases (outExpo, outBack, springs), holds, then snaps. No floaty screensaver motion.
- **Verses are dark and restrained** (but still dynamic: slow push-ins, precise motion, single light sources); **choruses explode** (speed lines 集中線, impact frames, shockwaves, shake, zoom blur, colour).
- **Specific, witty, made by someone who codes.** Real code, real error messages, real UI idioms (editor, terminal, tabs, progress bars, stack frames, git graph). The humour is deadpan: a bug report stamped 「仕様です」, a tab counter going to 2048, patience at 0.02.
- **Not slop:** no generic purple/cyan neon cyberpunk soup, no lens-flare soup, no stock "hacker" imagery (hooded figures, green Matrix rain), no emoji, no mascots, no anime characters or faces, no real logos (Qiita / Stack Overflow / GitHub appear only as the lyric words — no logos, no imitation of their UIs or brand colours).

## Palette (`src/engine/palette.ts`) — follows the story

| key | hex | use |
|---|---|---|
| ink / ink2 / ink3 | `#05060b` `#0c0f1c` `#161b2e` | night background, panels |
| steel / mist / bone | `#55607e` `#9aa6c2` `#eef2fa` | dim UI / secondary type / primary type |
| blue / cyan / ice | `#2f6bff` `#62e6ff` `#c4ecff` | the blue light of the screen; the cursor |
| red / ember | `#ff2b4e` `#ff6a3d` | the bug, errors (verse 2 and chorus fights) |
| amber / gold | `#ffb648` `#ffd977` | coffee, warnings, and the sunrise (outro) |
| violet / rose | `#8b5cff` `#ff7ab8` | dawn (purple → blue) |
| green | `#3dff8f` | **build success — owned by `success`** (nobody else uses green, except one hint in `typo` when the fix lands) |

Arc: ink + blue (night) → red invades (bug) → violet→blue sky (dawn) → **green** (success) → amber (sunrise). Bloom only on light sources and glowing type (linear > ~0.9). Body type stays crisp.

## Typography (`src/engine/fonts.ts`)

**Japanese text is always set in a Japanese typeface.** Latin-only code may use JetBrains Mono.

- **Noto Sans JP Black** (`sans9`) / **Dela Gothic One** (`dela`): the main lyric voice; Dela for slams and the chorus.
- **Shippori Mincho B1 / Noto Serif JP** (`mincho`, `serif9/5`): emotional and quiet moments (city, dawn, outro).
- **DotGothic16** (`dot`): the system voice (clock, terminal, HUD labels, glitches).
- **M PLUS 1 Code** (`code4/7`) + JetBrains Mono (`mono4/8`): code.
- **Yuji Syuku** (`brush`): only the prayer 「神様、どうか通して」. **Reggae One** (`reggae`): only the bug laughing (ｗｗｗ). **Rampart One** (`rampart`): rare hollow display.
- 縦書き (vertical layout) is supported (`vertical: true`) — use it for at least the prayer and a few dramatic verse moments.

## Karaoke rules (every scene)

- Every lyric line must be **readable** and **synced per character**: a character appears or lights up exactly at its `start` (the engine adds a 40 ms visual lead) and is fully "sung" by its `end`. Anticipation is fine (show the line or the word dim up to ~0.5 s early), but highlighting never runs ahead of the voice.
- Unsung = dim (steel / ~35% opacity, or outline only); sung = bright (bone/cyan/scene accent). A line stays readable for at least ~0.4 s after its last character before it exits (unless a cut replaces it).
- Each scene integrates the lyric **graphically and differently** (orbiting a fan, sinking in coffee, stamped, typed into an editor, stacked as blocks, written on the sky…).
- Keep lyric text inside the safe area (≥ 96 px from the edges). Big is good: 90–260 px for main lyric type; a single slammed word can go full-frame.

## Motifs (`src/engine/motifs.ts`)

1. **The cursor █** — the hero. Cyan block, blinks on the beat (`drawCursor(..., f.beatPhase)`). Appears in the opening, runs through the chorus maze, makes the fix, blinks one last time at sunrise.
2. **The code** — `CODE` (night.ts). Line 3 is `  hour: 2;` with the bug. Show it (or parts of it) whenever an editor is on screen (`drawEditor`). Before the bridge it always has the red squiggle / error `BUG_ERROR`; after the fix (`CODE_FIXED`) it's clean.
3. **The story clock** — `storyClock(t)`: 02:00 at the start, 04:47 when dawn starts, 05:41 at the build success, ~06:00 at the end. Put it somewhere small in most scenes (DotGothic16), big in the opening/outro.
4. **The bug** — red. Glitch, ✕ marks, error text, `BUG_ERROR`. It grows through verse 2 and the chorus fights and dies in the bridge.

## Scenes (one module each in `src/scenes/`) — see `docs/timeline.txt` for exact windows and per-word times

Times below are approximate; always look lines up through the `Lyrics` API.

### `open` (0 → 11.37, bars −0.6–3.75) — L0–L3
- Cold open: black, DotGothic clock `01:59` → `02:00` flip on the first beat (0.27 s); a hint of the title 「2時のデバッグ」 small.
- L0 部屋の明かりを落として: a room light; it clicks OFF on 「落として」 (2.28): the world goes dark except the monitor glow; the words stay, lit only by the screen.
- L1 PCのファンだけが回ってる: a big 3D PC fan (blades, hub, frame) spinning fast; the lyric glyphs orbit on a ring around the hub; 「回ってる」 spins.
- L2 ブルーライトに照らされた: the monitor's blue light floods the frame (rays); type lit by a raking blue gradient.
- L3 私の顔はきっと、ひどい疲れ顔: the type reflected in dark glass; 「疲れ顔」 droops/sags, flickers like a dying screen.

### `mug` (11.37 → 16.27) — L4–L5
- Top-down 3D mug; camera dives in; type circles the rim / sinks to the bottom of the dark liquid. 冷え切って: frost and a falling thermometer (°C ticking down); 液体: ripples.

### `city` (16.27 → 21.50) — L6–L7
- Window → a night city far away; type shrinks with distance (遠く). 世界に一人取り残された気分: huge pull-back: one lit window in a dark tower → the city → darkness; 一人 tiny and alone.

### `loop` (21.50 → 31.62, bars 7.6–11.5) — L8–L11, builds to the chorus
- 同じ場所: an infinite corridor of code that loops seamlessly (we pass the same sign again). ループする: text on a spinning ring / spinner accelerating. 何が正解か: branching choices, ？ marks, scrambled text. 画面越しに自分を問い詰める: recursive screen-in-screen (Droste) zoom; riser into the chorus (zoom blur, whiteout at the cut).

### `chorus` ×2 (31.62 → 48.61 and 91.72 → 108.71) — L12–L15 / L30–L33 — lead
- タイピングの音だけが BGM: 3D keycaps slam down in sync with every mora; BGM = equalizer. 迷宮入りのコード、終わらない夜: flight through a 3D maze of code walls, lyric glyphs on the walls. でもバグに負けるのは癪だから: the BUG boss (red glitch swarm) with an HP bar; impact frames. 光るカーソル、明日を迎えに行く: the cursor dashes forward like a comet toward the light. Chorus 2 is the same with dawn colours and more destruction.

### `inter1` (48.61 → 52.53, 4 s instrumental)
- Error-log barrage cut on every beat (TypeError, Segmentation fault, npm ERR!, …) — red/white, hard cuts, then everything sinks underwater into `qiita`.

### `qiita` (52.53 → 57.75) — L16–L17
- Qiitaの海: an ocean of article cards (titles like 「【解決】〜が動かない件」), waves; 泳ぎ疲れた sinks. 英語のドキュメントは呪文みたい: a magic circle (魔法陣) of English API-doc text rings rotating; 呪文 glows like an incantation.

### `spec` (57.75 → 62.98) — L18–L19
- 「仕様です」: a red hanko stamp SLAMS onto a bug report (Status: 仕様 / By design). 言葉の裏で: the paper flips to its back. バグが嘲笑ってる気がする: ｗｗｗ (Reggae One) flood the frame on the beat; red glitch presence.

### `tabs` (62.98 → 68.20) — L20–L21
- Tabs multiply exponentially until they're slivers; a tab counter. メモリも私の根気も、もう限界: two gauges (MEMORY, 根気) racing to red; 限界 cracks the screen with an alarm.

### `stack` (68.20 → 74.08) — L22–L23 (+ 1-bar fill)
- スタックオーバーフロー: a literal stack of frames/blocks (function names) growing past the top of the frame and toppling. 私の答えは載っていない: search → 「0件」 / 404; debris falls into the void; quiet handoff to dawn.

### `dawn` (74.08 → 91.72, bars 27.75–34.5: quiet, then building) — L24–L29
- 窓の外が少しずつ: a window; the sky begins to lighten. 紫から青に: the sky literally turns violet → blue; the words take those colours. 街が動き出す前に: city silhouette, first train. このコードにケリをつけたい: determination, a kick slam. 「神様、どうか通して」: vertical brush text (Yuji Syuku), light rays — the only brush type in the video. 震える指で…: trembling type, compile progress bar racing; riser into chorus 2.

### `drop` (108.71 → 118.50, 9.8 s instrumental, full band) — lead
- The compile as a hyperspeed tunnel; the boss bug takes a hit on every kick; damage numbers; 99%… then a hard stop.

### `typo` (118.50 → 127.00) — L34–L37 (spoken)
- …あれ？: everything freezes. ここ、セミコロンじゃなくてカンマ…: extreme macro on line 3 — a giant `;` beside `,`. たった一行、これだけのタイポかよ。: the single line highlighted; deadpan exasperation. Enter…: a giant Enter keycap pressed in slow motion → cut to `success` on the downbeat.

### `success` (127.00 → 137.45) — L38–L42
- ビルド成功。: a green explosion — shockwave, BUILD SUCCESSFUL. 画面に流れる、眩しいくらいの緑色。: green log lines streaming, dazzling (the green bloom moment of the video). やっと終わった。: an exhale, slow pull-back. Git push…: the commit graph line shoots up like a rocket. もうリファクタリングなんて知らない。: messy code tossed away, casual.

### `outro` (137.45 → 159.60) — L43 + instrumental climax 145–158, silence at the end
- 明日の自分、よろしく頼むよ。: a sticky note (付箋) for tomorrow's self on the monitor; sunrise through the window (amber). Then fly out the window into the sunrise; the title card 「2時のデバッグ」 big; the clock ~06:00; the cursor blinks one last time; fade to black by ~159.3.
