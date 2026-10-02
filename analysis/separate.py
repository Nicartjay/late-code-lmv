"""Demucs htdemucs_ft stem separation -> stems/{vocals,drums,bass,other}.wav (44.1 kHz).

Uses the Python API (soundfile I/O) so no torchaudio/ffmpeg audio backend is needed.
Run:  uv run python separate.py
"""
import common
import sys
import time
import numpy as np
import soundfile as sf
import soxr
import torch
from demucs.pretrained import get_model
from demucs.apply import apply_model

name = sys.argv[1] if len(sys.argv) > 1 else "htdemucs_ft"
model = get_model(name)
model.eval()
sr = model.samplerate
y, s = sf.read(common.AUDIO, dtype="float32", always_2d=True)   # (n, 2)
y = np.stack([soxr.resample(c, s, sr) for c in y.T])            # (2, n') @ 44.1k
wav = torch.from_numpy(y)
ref = wav.mean(0)
mean, std = ref.mean(), ref.std()
wav = (wav - mean) / std
dev = "mps" if torch.backends.mps.is_available() else "cpu"
t0 = time.time()
with torch.inference_mode():
    out = apply_model(model, wav[None], device=dev, shifts=1, split=True, overlap=0.25, progress=True)[0]
out = out * std + mean
for i, src in enumerate(model.sources):
    sf.write(common.STEMS / f"{src}.wav", out[i].cpu().numpy().T, sr, subtype="FLOAT")
print(f"done in {time.time() - t0:.1f}s ->", [str(common.STEMS / f'{s}.wav') for s in model.sources])
