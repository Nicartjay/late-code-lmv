"""Frame-wise CTC log-probabilities (20 ms frames) of the vocal stem with
torchaudio's MMS_FA (multilingual wav2vec2 trained for forced alignment on
romanized text).  Computed for the mono sum and the L / R channels (chorus
vocals are double-tracked), on overlapping chunks with context, stitched.

Writes work/emission_<src>.npy  (shape [frames, 28]; labels = MMS_FA labels
without the star token).
Run:  uv run python ctc_emissions.py
"""
import common
import sys
import numpy as np
import torch
import torchaudio

HOP = 320  # samples @ 16 kHz -> 20 ms


def compute(src, chunk_s=20.0, ctx_s=3.0):
    bundle = torchaudio.pipelines.MMS_FA
    model = bundle.get_model(with_star=False)
    dev = "mps" if torch.backends.mps.is_available() else "cpu"
    model = model.to(dev).eval()
    if src == "mono":
        y, _ = common.load_stem("vocals", sr=16000)
    else:
        y2, _ = common.load_stem("vocals", sr=16000, mono=False)
        y = y2[0 if src == "L" else 1]
    y = (y / (np.abs(y).max() + 1e-9)).astype(np.float32)
    n_frames = len(y) // HOP
    chunk, ctx = int(chunk_s * 16000), int(ctx_s * 16000)
    out = None
    for s in range(0, len(y), chunk):
        a, b = max(0, s - ctx), min(len(y), s + chunk + ctx)
        x = torch.from_numpy(y[a:b])[None].to(dev)
        with torch.inference_mode():
            em, _ = model(x)
            em = torch.log_softmax(em, dim=-1)[0].float().cpu().numpy()
        if out is None:
            out = np.full((n_frames, em.shape[1]), np.nan, np.float32)
        f0 = a // HOP
        lo, hi = s // HOP, min(n_frames, (s + chunk) // HOP)
        seg = em[lo - f0: hi - f0]
        out[lo: lo + len(seg)] = seg
    last = np.where(~np.isnan(out[:, 0]))[0].max()
    out[last + 1:] = out[last]
    np.save(common.WORK / f"emission_{src}.npy", out)
    print(src, out.shape)


if __name__ == "__main__":
    for src in (sys.argv[1:] or ["mono", "L", "R"]):
        compute(src)
