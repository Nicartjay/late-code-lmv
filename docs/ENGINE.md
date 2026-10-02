# Engine guide (for scene authors)

The video is a web app (`app/`, TypeScript + three.js, bun + Vite) that renders any song time `t` **deterministically** at 1920×1080. The same code drives the live preview and the offline 60 fps export. Read `docs/TREATMENT.md` (style bible + scene briefs) and `docs/timeline.txt` (exact windows + per-word times) first.

## Running things (from `app/`)

- Shared dev server **without live reload** is running at http://localhost:5190 (start one if not: `LNC_NO_HMR=1 bunx vite --port 5190 --strictPort &`). Live preview with audio: http://localhost:5190/?t=23.0 (space play/pause, ←/→ ±1 s, shift ±5 s, `,`/`.` ±1 frame, `[`/`]` prev/next entry, `l` loop entry, `h` hide UI).
- **Stills** (the main way to check your work — then LOOK at the PNGs with the Read tool):
  `bun scripts/render.ts stills --url http://localhost:5190 --only open --t 1.0,2.4,3.6 --out ../out/wip/open`
- **Contact sheet** of an entry or range (one PNG, 480×270 tiles):
  `bun scripts/render.ts sheet --url http://localhost:5190 --only open --entry open --n 16 --cols 4 --out ../out/wip/open/sheet.png`
  (or `--from 1.5 --to 9 --n 12`, or `--times 1,2,3`)
- **Short video** to judge motion (optional; slower): `bun scripts/render.ts video --url http://localhost:5190 --only open --from 0 --to 6 --preset veryfast --out ../out/wip/open.mp4`
- **Perf**: `bun scripts/render.ts perf --url http://localhost:5190 --only open --from 2 --to 4` (avg ms/frame; aim < 30 ms).
- `--only a,b` loads only those timeline entries (fast, isolates you from other scenes). Without a matching entry nothing renders (black).
- Typecheck: `bunx tsc --noEmit -p tsconfig.json 2>&1 | grep scenes/yourscene`
- The render script prints `SCENE ERRORS` and browser console errors — read them.
- Fonts are subset to: all lyric characters + ASCII + kana + ~3000 common kanji (JIS level 1) + symbols + every non-ASCII char in `app/src/**/*.ts`. If you use a rare kanji, re-run `cd ../analysis && uv run python make_fonts.py`.

## Data

- `this.ctx.lyrics` (`src/engine/lyrics.ts`): `lines[]` with `{i, text, start, end, words[], chars[]}`; word `{w, sp, start, end, chars[]}`; char `{c, start, end, kana, roma, li, wi, ci}`. Times are aligned to the vocal (character level). **Find lines by content, never hard-code times**: `const l = lyrics.get('部屋の明かりを落として')`; repeated chorus lines: `lyrics.get('タイピングの音だけが BGM', 1)` (2nd occurrence) — or use the entry window: `lyrics.lines.filter(l => l.start >= ctx.start && l.start < ctx.end)`. `lyrics.word(line, '落として')`. Helpers: `Lyrics.p(x, t)` (0..1 sung progress of a char/word/line), `Lyrics.on(x, t)`, `Lyrics.since(x, t)`, `Lyrics.charsSung(line, t)`. All include the 40 ms visual lead (`LEAD`).
- `this.ctx.audio` (`src/engine/audio.ts`): `bpm` (91.85), `period` (0.6532 s), `beats[]`, `downbeats[]`, `beat(t)` / `bar(t)` (continuous index), `beatTime(i)`, `barTime(k)`, `beatFloor(t, step)`, `beatPulse(t, decay, step)`, `barPulse(t)`, `env(name, t)` for `rms|low|mid|high|vocal|drums|bass|other` (0..1), `hit('kick'|'snare'|'hat'|'vocal', t, decay)` decaying onset pulses, `events(kind, t0, t1)`, `lastOnset(kind, t)`, `band(i, t)` — 16 log-spaced spectrum bands (i = 0 → 40 Hz … 15 → 12 kHz), 0..1, for equalizers.
- Every `Frame` carries `t, dt, lt (local time), p (local progress), frame (integer frame index), beat, bar, beatPhase, barPhase`, and `f.a = {rms, low, mid, high, vocal, drums, bass, other, kick, snare, hat}`.
- Arrangement (from the stems): verse 1 (0–31.6) is sparse — no bass, light drums; chorus 1 bass enters exactly on the downbeat 32.93 (bar 12); verse 2 (52.7–72.6) mid energy; dawn 74–85 is quiet (almost no drums), building 85–92; chorus 2 enters 93.02; 108.7–118.8 full-band instrumental; 127.0 (bar 48) is the big drop (ビルド成功); 140.06 short break; 145–158 loud outro, drums stop ~158.3.

## Writing a scene

One file `app/src/scenes/<name>.ts` (+ optional helpers `app/src/scenes/<name>-*.ts`), default-exporting a class extending `Scene`:

```ts
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass, Layer2D, W, H, screenCamera } from '../engine/gl';
import { Glyphs3D, tint } from '../engine/text3d';
import { gstate, enter } from '../engine/kinetic';
import { col, css } from '../engine/palette';
import type { Line } from '../engine/lyrics';

export default class MyScene extends Scene {
  bg = new FSPass(`uniform float t; void main(){ gl_FragColor = vec4(C_INK, 1.0); }`, { t: { value: 0 } });
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(40, W / H, 0.1, 500);
  hud = new Layer2D();
  rows: { line: Line; g: Glyphs3D }[] = [];

  async init() {                       // build everything here (fonts are loaded, text layout is async)
    const l = this.ctx.lyrics.get('部屋の明かりを落として');
    const g = new Glyphs3D(l, { font: 'sans9', size: 1.2, color: col('bone') });   // world units here
    this.scene.add(g.group);
    this.rows.push({ line: l, g });
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp } = this.ctx;
    this.bg.u.t!.value = f.t;
    this.bg.render(renderer, out);                       // fullscreen shader (overwrites)
    for (const { line, g } of this.rows) for (const it of g.items) {
      const s = gstate(it, line, f.t, 'word', 0.3);       // visible from its word's start - 0.3 s
      it.mesh.visible = s.vis && f.t < line.end + 0.6;
      const k = enter('slam', s.since, it.gi);
      it.mesh.scale.setScalar(s.on ? k.sc : 1);
      tint(it.mesh, s.on ? col('bone', k.bright) : col('steel'), s.on ? k.alpha : 0.35);
    }
    this.cam.position.set(Math.sin(f.t * 0.3) * 2, 0, 12); this.cam.lookAt(0, 0, 0);
    this.draw(this.scene, this.cam, out);                // three.js scene over what's there
    const ctx = this.hud.clear();                        // Canvas2D layer (px, y down)
    /* ...draw... */
    comp.draw(renderer, this.hud.upload(), out);          // alpha-over
    return { bloom: 0.7, ca: 1.5 };                       // post overrides (optional)
  }
}
```

Register nothing: the timeline (`src/timeline.ts`, lead-owned) already maps entry ids to `src/scenes/<module>.ts`; a missing module shows `_placeholder.ts`. Don't edit `src/timeline.ts` or `src/engine/*` — ask the lead (report what you need in your final message). One module may serve several entries (`this.ctx.params`), e.g. `chorus` gets `{ n: 1 | 2 }`.

### Rules

- **Deterministic**: output must be a pure function of `f.t` (and seeded randomness: `hash(a,b,c)`, `mulberry32(seed)`, `noise1`, `fbm1`). Never `Math.random()`, `Date.now()`, `performance.now()`, never accumulate state across `render()` calls (frames are rendered out of order; the export averages sub-frames for motion blur). Per-frame flicker: key it on `f.frame` (constant over a shutter), not `Math.floor(t*60)`.
- `out` is cleared to black before `render()`. It's a HalfFloat **linear HDR** target (MSAA 4×). Values > ~0.9 bloom. Colours: `col('cyan', 3)` (linear THREE.Color ×3 → glows), `lin('red')` for GLSL uniforms, `css('bone', 0.5)` for Canvas2D.
- `f.lt` / `f.p` are local time / progress; `this.ctx.start/end` the window. Cuts between entries are hard cuts (windows touch). Make the **first frame of your entry** a strong composition (it's a cut on the beat) and the last frames should not fade to black unless the brief says so.
- troika text (`text3d`, `Glyphs3D`): create in `init()`; in `render()` only change transforms, `visible`, colour/opacity (`tint`), `fillOpacity`, `outlineOpacity`, `strokeOpacity`. Never change `text`, `font`, `fontSize`, `letterSpacing` after init (re-layout is async → flicker/non-determinism). For text that changes every frame (counters, scrambles, typing, logs) use Canvas2D (`Layer2D` + `type2d.ts`).
- Performance: aim < 30 ms/frame. A `Layer2D` upload costs ~2–4 ms; use at most 2–3 per scene. Avoid per-frame geometry allocation; precompute in `init()`. Thousands of instanced meshes are fine.
- **Flash is strong**: `flash` mixes toward `flashColor` in *linear* light before the sRGB encode, so `flash: 0.08` already lifts black to ~31% grey. Use ≤ 0.05 for per-word accents and 0.3–0.8 only for 1–4 frame impact hits.
- Post overrides you can return (defaults in `src/engine/post.ts`): `exposure, bloom, bloomThreshold, bloomRadius, ca, grain, vignette, scanlines, flash, flashColor, fade, invert, shake:[x,y] (px), zoom, rot, zoomBlur, glitch, rgbSplit, tint:[r,g,b], saturation, lift`. Use `flash`/`invert`/`shake`/`zoomBlur`/`glitch` for impacts — briefly (1–6 frames), timed to the vocal or the kick/snare.

## Toolbox

- `gl.ts`: `W, H` (1920×1080), `FSPass(frag, uniforms, {blending, transparent})` fullscreen pass (gets `vUv`, `uRes`, `GLSL_COMMON`, writes `gl_FragColor`), `Compositor` via `this.ctx.comp.draw(renderer, tex, out, {mode: 'normal'|'add'|'screen'|'multiply'|'replace', opacity, tint, offset, scale})` (tint > 1 makes a 2D layer glow), `Layer2D(w?, h?)` (Canvas2D → sRGB premultiplied texture: `clear()` returns the ctx, `upload()` returns the texture — also usable as a texture on 3D meshes, e.g. a monitor screen), `makeRT(w, h, {samples, depth})`, `clearRT`, `screenCamera()` (orthographic, px units, origin centre, y up).
- `GLSL_COMMON`: `C_INK, C_BLUE, C_CYAN, C_RED, C_GREEN, C_AMBER, C_VIOLET, C_BONE` (linear), `hash11/12/22/13`, `vnoise`, `fbm`, `snoise`, `sdBox`, `sdRoundBox`, `sdSeg`, `rot2`, `aaStep`, `toSRGB/toLinear`.
- `text3d.ts`: `text3d(str, {font, size, color, opacity, anchorX, anchorY, tracking, maxWidth, align, outlineWidth, outlineColor, outlineBlur, strokeWidth, strokeColor, blend: 'normal'|'add', depthTest, renderOrder, curveRadius})` → troika `Text` (a Mesh). `Glyphs3D(lineOrString, {...T3, vertical, wrap, lineHeight, align, tracking})` → `group` + `items[]` (one mesh per character with `x, y, adv, rot, ch, wi, gi, row`; layout y is flipped so the group is y-up). `tint(mesh, color, opacity)`. Use `size` in px with `screenCamera()`, or world units in a perspective scene.
- `kinetic.ts`: `layoutGlyphs(src, {font, size, tracking, vertical, wrap, lineHeight, align, anchor})` (shared layout; horizontal or 縦書き with rotated ー「」 and offset 、。), `gstate(glyph, line, t, appear: 'char'|'word'|'line', antic)` → `{vis, e, s, on, since}`, `enter(kind, e, gi, amt)` → `{dx, dy, sc, sx, sy, rot, alpha, bright, blur}` for kinds `slam | stamp | pop | drop | rise | whip | zoom | type | none`, `scrambleChar(final, t, lockAt, gi)`.
- `type2d.ts`: `layout2D(src, opts)`, `drawGlyphs2D(ctx, lay, x, y, g => ({style: {fill, stroke, strokeWidth, glow, glowBlur, alpha, char, font, clip}, kin}) | null)`, `text2D(ctx, s, x, y, fontKey, px, fill, {align, baseline, tracking, alpha, glow})`, `rrect`.
- `fonts.ts`: `font(key, px)` → CSS font string, `measure(key, s, px)`, `advance(key, ch, px)`; keys: `dela sans9 sans7 sans4 sans3 serif9 serif5 mincho dot code7 code4 mono8 mono4 brush reggae rampart zen`.
- `motifs.ts`: `CODE`, `BUG_LINE`, `BUG_COL`, `BUG_ERROR`, `CODE_FIXED`, `CODE_POOL` (filler code / error strings), `tokenize`, `drawCodeLine`, `drawEditor(ctx, x, y, w, h, {lines, px, scroll, highlight, errorLine, errorCol, typed, cursor, title})`, `drawCursor(ctx, x, y, w, h, f.beatPhase, {color, glow, solid})`, `storyClock(t)` / `storyMinutes(t)`, `drawProgress`.
- `fx.ts`: `SpeedLines` (集中線, additive: `.render(renderer, out, {frame: f.frame, intensity, center:[u,v], color, inner, density})`), `Shockwave` (`.render(renderer, out, secondsSinceImpact, {center, color, speed, width})`), `Burst(n, {seed, speed, size, life, drag, gravity, color, color2, spread3d, dir, cone})` (deterministic particles: add `.points` to a scene, `update(e, origin)` each frame; px units under `screenCamera()`).
- `util.ts`: `clamp, lerp, invLerp, remap, smoothstep, fract, ease.* (outExpo, outBack, outBackStrong, inOutCubic, …), prog(x, a, b, ease), keys(t, [[t, v, ease], …]), spring(t, freq, damp), pulse(t, t0, attack, decay), mulberry32, hash, hashSigned, noise1, fbm1, shuffled, pick, frameIdx`.
- `palette.ts`: `HEX`, `col(key, intensity)`, `lin(key, intensity)`, `css(key, alpha)`, `cssMix(a, b, t, alpha)`.

## Checking your work

Render stills at every lyric word onset of your scene and a contact sheet of the whole entry; **look at them**. Check: every lyric character is visible and legible when sung, in a Japanese font; nothing is cut off at the frame edge; the first frame is strong; motion reads as fast and intentional; colours follow the palette; no black frames; no console errors. Then check perf.
