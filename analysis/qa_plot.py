"""QA plots: vocal-stem log-mel spectrogram + RMS per lyric line with the aligned
character starts.  uv run python qa_plot.py 13 15 21   (line indices; default all)"""
import common
import json
import sys
import librosa
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
import numpy as np

fp = common.ROOT / "fonts-src/NotoSansJP-VF.ttf"
font_manager.fontManager.addfont(str(fp))
plt.rcParams["font.family"] = font_manager.FontProperties(fname=str(fp)).get_name()
lyr = json.load(open(common.DATA / "lyrics.json"))
y, sr = common.load_stem("vocals", sr=22050)
sel = [int(a) for a in sys.argv[1:]] or [l["i"] for l in lyr["lines"]]
for li in sel:
    l = lyr["lines"][li]
    t0, t1 = l["start"] - 0.5, l["end"] + 0.5
    seg = y[int(t0 * sr):int(t1 * sr)]
    M = librosa.power_to_db(librosa.feature.melspectrogram(y=seg, sr=sr, n_mels=96, hop_length=128, fmax=8000), ref=np.max)
    fig, ax = plt.subplots(2, 1, figsize=(max(10, (t1 - t0) * 3.2), 5), sharex=True, gridspec_kw=dict(height_ratios=[3, 1]))
    ax[0].imshow(M, origin="lower", aspect="auto", extent=[t0, t1, 0, 96], cmap="magma", vmin=-70)
    rms = librosa.feature.rms(y=seg, hop_length=128)[0]
    tt = t0 + np.arange(len(rms)) * 128 / sr
    ax[1].plot(tt, 20 * np.log10(rms + 1e-6), lw=0.8, color="k")
    for w in l["words"]:
        ax[0].axvline(w["start"], color="cyan", lw=1.6)
        ax[1].axvline(w["start"], color="cyan", lw=1.6)
        for c in w["chars"]:
            if not c["roma"]:
                continue
            ax[0].axvline(c["start"], color="w", lw=0.6, alpha=0.8)
            ax[0].axvspan(c["start"], c["end"], ymin=0.93, ymax=0.99, color="lime", alpha=0.5)
            ax[0].text(c["start"] + 0.01, 84, c["c"], color="w", fontsize=13)
            ax[0].text(c["start"] + 0.01, 76, c["roma"], color="yellow", fontsize=8)
    ax[0].set_title(f"L{li:02d}  {l['text']}  (lrc {l['lrc']:.2f})")
    ax[1].set_xlim(t0, t1)
    fig.tight_layout()
    fig.savefig(common.QA / f"line_{li:02d}.png", dpi=80)
    plt.close(fig)
    print(common.QA / f"line_{li:02d}.png")
