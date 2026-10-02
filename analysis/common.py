"""Shared paths / cache setup for the analysis scripts.

Import this module FIRST (before torch / huggingface / mlx imports) so that all
model downloads land in analysis/.cache/.
"""
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent          # analysis/
PROJECT = ROOT.parent                            # project root
CACHE = ROOT / ".cache"
for var, sub in [("TORCH_HOME", "torch"), ("HF_HOME", "hf"), ("HF_HUB_CACHE", "hf/hub"),
                 ("XDG_CACHE_HOME", "xdg"), ("MPLCONFIGDIR", "mpl"),
                 ("NUMBA_CACHE_DIR", "numba")]:
    os.environ.setdefault(var, str(CACHE / sub))
    (CACHE / sub).mkdir(parents=True, exist_ok=True)
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

SONG = "2時のデバッグ"
AUDIO = PROJECT / "audio" / f"{SONG}.wav"
LRC = PROJECT / "lyrics" / f"{SONG}.lrc"
STEMS = ROOT / "stems"          # htdemucs_ft stems, 44.1 kHz float wav, same timeline as AUDIO
DATA = PROJECT / "data"
QA = ROOT / "qa"
WORK = ROOT / "work"
for d in (STEMS, DATA, QA, WORK):
    d.mkdir(exist_ok=True)


def load_lrc():
    """Parse the LRC file -> list of dict(start, end, text).

    A timestamp with empty text closes the previous line (marks a rest); a
    lyric line otherwise ends where the next timestamp starts."""
    rows = []
    for raw in LRC.read_text(encoding="utf-8").splitlines():
        m = re.match(r"\[(\d+):(\d+(?:\.\d+)?)\](.*)$", raw.strip())
        if not m:
            continue
        t = int(m.group(1)) * 60 + float(m.group(2))
        rows.append((t, m.group(3).strip()))
    lines = []
    for i, (t, txt) in enumerate(rows):
        if not txt:
            continue
        nxt = rows[i + 1][0] if i + 1 < len(rows) else None
        lines.append(dict(start=t, end=nxt, text=txt))
    return lines


def load_audio(sr=None, mono=True):
    import soundfile as sf
    y, s = sf.read(AUDIO, dtype="float32", always_2d=True)
    y = y.mean(axis=1) if mono else y.T
    if sr and sr != s:
        import soxr
        import numpy as np
        y = soxr.resample(y, s, sr) if mono else np.stack([soxr.resample(c, s, sr) for c in y])
        s = sr
    return y, s


def load_stem(name, sr=None, mono=True):
    import soundfile as sf
    import numpy as np
    y, s = sf.read(STEMS / f"{name}.wav", dtype="float32", always_2d=True)
    y = y.mean(axis=1) if mono else y.T
    if sr and sr != s:
        import soxr
        y = soxr.resample(y, s, sr) if mono else np.stack([soxr.resample(c, s, sr) for c in y])
        s = sr
    return y, s
