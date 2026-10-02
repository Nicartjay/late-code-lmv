# 2時のデバッグ — music video

A code-rendered kinetic-typography music video for 「2時のデバッグ」 (2 AM Debugging). Every frame is generated deterministically from the song time, and **every lyric character appears on screen exactly when it is sung**: the lyrics are force-aligned to the vocal at character level. All Japanese text is set in Japanese typefaces.

Built the same way as [mexicat/pdoom-video](https://github.com/mexicat/pdoom-video): TypeScript + three.js rendered in the browser, exported offline through headless Chrome + ffmpeg, with a Python analysis pipeline for stems, beats and lyric timing.

- `out/` — renders, not in git (the finished video renders to `out/2時のデバッグ.mp4`)
- `app/` — the renderer (live preview + offline export). Scenes in `app/src/scenes/`, the edit in `app/src/timeline.ts`, engine in `app/src/engine/`.
- `analysis/` — Python (uv) tools that produced the timing data: Demucs stem separation, Japanese reading/romanization, CTC forced alignment (MMS_FA), Whisper cross-check, beat/onset/spectrum analysis.
- `data/lyrics.json` — character-level lyric timings (with readings / romaji); `data/audio.json` — tempo grid (91.85 BPM), downbeats, onsets, envelopes, 16-band spectrum.
- `docs/TREATMENT.md` — concept, style bible, scene-by-scene treatment. `docs/ENGINE.md` — how to write and check a scene. `docs/timeline.txt` — scene windows + per-word times.

## Website

The live player is deployed to GitHub Pages by `.github/workflows/pages.yml` on every push to `main`: **https://nicartjay.github.io/late-code-lmv/**. The video is rendered in real time in your browser with WebGL, using the same code as the offline export. Click play; keys are listed below. A recent desktop browser with a decent GPU is recommended: every frame is drawn at 1920×1080.

## Requirements

macOS (Apple Silicon tested), [bun](https://bun.sh), [uv](https://docs.astral.sh/uv/), ffmpeg (with libx264), Google Chrome (used headless for export).

## Preview

```bash
cd app
bun install
bunx vite
```

Open http://localhost:5173 (add `?t=92` to start at a time). Keys: space play/pause · ←/→ seek ±1 s (shift ±5 s) · `,` / `.` frame step · `[` / `]` previous/next scene · `l` loop the current scene · `h` hide the UI.

## Render the video

```bash
cd app
bun scripts/render.ts video --samples 4 --shutter 0.5 --out "../out/2時のデバッグ.mp4"
```

1920×1080, 60 fps, x264 CRF 16 (BT.709), AAC 320 kbps from the original WAV. `--samples N` averages N sub-frames per frame (motion blur). Other modes: `stills --t 12.5,40`, `sheet --entry chorus1 --n 16`, `perf --from 30 --to 32`, `--only <scene ids>`. A private Vite server is started automatically if none is running.

## Regenerate the timing data

```bash
cd analysis
uv sync
uv run python separate.py        # Demucs htdemucs_ft stems -> analysis/stems/
uv run python ctc_emissions.py   # MMS_FA CTC emissions of the vocal stem
uv run python align.py           # -> data/lyrics.json (character-level timings)
uv run python whisper_run.py     # optional cross-check, then: uv run python whisper_check.py
uv run python analyze.py         # -> data/audio.json
uv run python qa_plot.py 13 15   # spectrogram QA plots per line -> analysis/qa/
./fetch_fonts.sh                 # original OFL font files -> analysis/fonts-src/ (not in git)
uv run python make_fonts.py      # subset the Japanese fonts -> app/public/fonts/
```

The lyric source is `lyrics/2時のデバッグ.lrc` (line timings only). `analysis/jp.py` holds the word segmentation and the sung readings: overrides such as 私 = わたし, 明日 = あした, 嘲笑って = あざわらって. Downloads about 3 GB of model weights into `analysis/.cache/`.

## Credits

- Fonts (SIL Open Font License, via Google Fonts): Dela Gothic One, Noto Sans JP, Noto Serif JP, Shippori Mincho B1, DotGothic16, M PLUS 1 Code, JetBrains Mono, Yuji Syuku, Reggae One, Rampart One, Zen Kaku Gothic New.
- Technique and pipeline inspired by [pdoom-video](https://github.com/mexicat/pdoom-video) (MIT).
- Song audio and lyrics belong to their author.
