"""Audio features -> data/audio.json

  * constant-tempo beat grid (Suno renders to a fixed tempo): BPM from the
    autocorrelation of a drum+mix onset envelope, refined by maximizing the
    envelope at grid points; phase refined on kick attacks
  * bar phase from the kick/snare pattern (snare on beats 2 and 4)
  * envelopes (100 fps, 0..1): rms, low (<150 Hz), mid (150-2000 Hz), high
    (>4 kHz) of the mix; vocal/drums/bass/other stem RMS
  * onsets [t, strength]: kick / snare / hat from the drum stem, vocal from
    the vocal stem

Run:  uv run python analyze.py
"""
import common
import json

import librosa
import numpy as np
from scipy.ndimage import uniform_filter1d
from scipy.signal import find_peaks

SR = 22050
FPS = 100
HOP = SR // FPS  # not integer-exact; we resample envelopes onto the 100 fps grid


def stft_mag(y, n_fft=2048, hop=256):
    return np.abs(librosa.stft(y, n_fft=n_fft, hop_length=hop)), hop


def band_env(S, freqs, lo, hi):
    m = (freqs >= lo) & (freqs < hi)
    return np.sqrt((S[m] ** 2).mean(axis=0))


def to_grid(x, hop, n):
    t_src = (np.arange(len(x)) * hop) / SR
    t_dst = np.arange(n) / FPS
    return np.interp(t_dst, t_src, x)


def smooth_env(x, attack=0.01, release=0.09):
    a_up, a_dn = np.exp(-1 / (attack * FPS)), np.exp(-1 / (release * FPS))
    out = np.zeros_like(x)
    v = 0.0
    for i, s in enumerate(x):
        a = a_up if s > v else a_dn
        v = a * v + (1 - a) * s
        out[i] = v
    return out


def norm01(x, q=99):
    p = np.percentile(x, q)
    return np.clip(x / (p + 1e-9), 0, 1)


def onset_peaks(env, hop, thr_rel=0.25, min_gap=0.07):
    """Attack peaks of a positive-flux curve. Returns [(t, strength01)]."""
    d = np.maximum(0, np.diff(env, prepend=env[0]))
    d = uniform_filter1d(d, 2)
    thr = thr_rel * np.percentile(d[d > 0], 99) if (d > 0).any() else 1
    pk, props = find_peaks(d, height=thr, distance=max(1, int(min_gap * SR / hop)))
    h = props["peak_heights"]
    h = np.clip(h / (np.percentile(h, 95) + 1e-9), 0, 1)
    return [(round(float(p * hop / SR), 3), round(float(s), 3)) for p, s in zip(pk, h)]


def main():
    mix, _ = common.load_audio(sr=SR)
    stems = {k: common.load_stem(k, sr=SR)[0] for k in ("vocals", "drums", "bass", "other")}
    dur = len(mix) / SR
    n = int(dur * FPS)

    # ---- envelopes
    S, hop = stft_mag(mix)
    freqs = librosa.fft_frequencies(sr=SR, n_fft=2048)
    env = {}
    env["rms"] = to_grid(np.sqrt((S ** 2).mean(axis=0)), hop, n)
    env["low"] = to_grid(band_env(S, freqs, 20, 150), hop, n)
    env["mid"] = to_grid(band_env(S, freqs, 150, 2000), hop, n)
    env["high"] = to_grid(band_env(S, freqs, 4000, 11000), hop, n)
    for k, y in stems.items():
        Sk, _ = stft_mag(y)
        env[{"vocals": "vocal"}.get(k, k)] = to_grid(np.sqrt((Sk ** 2).mean(axis=0)), hop, n)
    env = {k: np.round(norm01(smooth_env(v)), 3) for k, v in env.items()}

    # ---- 16 log-spaced spectrum bands of the mix (equalizer visuals), 50 fps
    edges = np.geomspace(40, 12000, 17)
    nb = int(dur * 50)
    bands = []
    for lo_f, hi_f in zip(edges[:-1], edges[1:]):
        b = to_grid(band_env(S, freqs, lo_f, hi_f), hop, n)
        b = norm01(smooth_env(np.log1p(b * 50)), 99.5)
        bands.append(np.round(np.interp(np.arange(nb) / 50, np.arange(n) / FPS, b), 2))
    bands = np.stack(bands, axis=1)  # [frames, 16]

    # ---- drum onsets by band
    Sd, hop = stft_mag(stems["drums"], n_fft=1024, hop=128)
    fd = librosa.fft_frequencies(sr=SR, n_fft=1024)
    low = np.log1p(30 * band_env(Sd, fd, 20, 120))
    snr = np.log1p(30 * band_env(Sd, fd, 1500, 5000))
    hat = np.log1p(30 * band_env(Sd, fd, 7000, 11000))
    kicks = onset_peaks(low, hop, 0.3, 0.12)
    snares = onset_peaks(snr, hop, 0.35, 0.12)
    hats = onset_peaks(hat, hop, 0.3, 0.06)
    # a snare attack that coincides with a kick is usually the kick's click
    kt = np.array([k[0] for k in kicks]) if kicks else np.zeros(0)
    snares = [s for s in snares if not (len(kt) and np.min(np.abs(kt - s[0])) < 0.03 and s[1] < 0.6)]
    st = np.array([s[0] for s in snares]) if snares else np.zeros(0)
    hats = [h for h in hats if not ((len(kt) and np.min(np.abs(kt - h[0])) < 0.03) or (len(st) and np.min(np.abs(st - h[0])) < 0.04))]
    Sv, hopv = stft_mag(stems["vocals"], n_fft=1024, hop=128)
    vflux = librosa.onset.onset_strength(S=librosa.amplitude_to_db(Sv), sr=SR, hop_length=hopv)
    vocal_on = onset_peaks(np.cumsum(np.maximum(vflux, 0)) * 0 + vflux, hopv, 0.3, 0.08)

    # ---- tempo: autocorrelation of an onset envelope (mix + drums)
    oe_hop = 256
    oe = librosa.onset.onset_strength(y=mix, sr=SR, hop_length=oe_hop) + \
        librosa.onset.onset_strength(y=stems["drums"], sr=SR, hop_length=oe_hop)
    tempo = float(librosa.feature.tempo(onset_envelope=oe, sr=SR, hop_length=oe_hop, start_bpm=120)[0])
    # refine the period + phase on a fine grid
    t_oe = np.arange(len(oe)) * oe_hop / SR
    best = None
    for bpm in np.arange(tempo * 0.985, tempo * 1.015, 0.005):
        per = 60 / bpm
        for ph in np.arange(0, per, 0.005):
            g = np.arange(ph, dur, per)
            sc = np.interp(g, t_oe, oe).sum() / len(g)
            if best is None or sc > best[0]:
                best = (sc, bpm, ph)
    _, bpm, phase = best
    per = 60 / bpm
    # phase refine on kick attacks (median offset to the grid)
    if len(kt):
        off = ((kt - phase + per / 2) % per) - per / 2
        strong = [o for o, k in zip(off, kicks) if k[1] > 0.3]
        if strong:
            phase += float(np.median(strong))
    phase = phase % per
    beats = np.arange(phase, dur, per)

    # ---- bar phase: snare on beats 2 & 4 (index offsets 1, 3 within the bar), kick on 1
    def at(evts, times, tol=0.06):
        if not len(evts):
            return np.zeros(len(times))
        et = np.array([e[0] for e in evts]); es = np.array([e[1] for e in evts])
        out = np.zeros(len(times))
        for i, t in enumerate(times):
            j = np.argmin(np.abs(et - t))
            if abs(et[j] - t) < tol:
                out[i] = es[j]
        return out
    ks, ss = at(kicks, beats), at(snares, beats)
    scores = []
    for off in range(4):
        idx = np.arange(len(beats))
        pos = (idx - off) % 4
        sc = ss[(pos == 1) | (pos == 3)].sum() - ss[(pos == 0) | (pos == 2)].sum() * 0.5 + ks[pos == 0].sum() * 0.5
        scores.append(sc)
    off = int(np.argmax(scores))
    downbeats = beats[off::4]

    doc = dict(
        duration=round(dur, 3), bpm=round(bpm, 3), beat_period=round(per, 5), time_signature=4,
        beats=[round(float(b), 3) for b in beats], downbeats=[round(float(b), 3) for b in downbeats],
        fps=FPS, **{k: v.tolist() for k, v in env.items()},
        bands_fps=50, bands=bands.tolist(),
        onsets=dict(kick=kicks, snare=snares, hat=hats, vocal=vocal_on),
        notes=(f"Timeline = audio/2時のデバッグ.wav. Constant tempo {bpm:.3f} BPM, first beat {phase:.3f} s, "
               f"bar phase offset {off} (scores {np.round(scores, 1).tolist()}). Envelopes 100 fps, one-pole "
               "smoothing (10 ms attack / 90 ms release), each divided by its own 99th percentile, clipped 0..1. "
               "Onsets [time, strength 0..1] from the drum stem bands (kick <120 Hz, snare 1.5-5 kHz, hat >7 kHz) "
               "and vocal stem spectral flux."),
    )
    (common.DATA / "audio.json").write_text(json.dumps(doc, separators=(",", ":")))
    print(f"bpm {bpm:.3f} period {per:.4f} phase {phase:.3f} baroff {off} scores {np.round(scores, 1)}")
    print(f"beats {len(beats)} downbeats {len(downbeats)} kicks {len(kicks)} snares {len(snares)} hats {len(hats)} vocal {len(vocal_on)}")
    # arrangement overview: per-bar mean energy
    print("bar  time   rms  drums bass  vocal other")
    for i, t in enumerate(downbeats):
        a, b = int(t * FPS), int(min(dur, t + 4 * per) * FPS)
        if b <= a:
            break
        print(f"{i:3d} {t:6.2f}  " + "  ".join(f"{env[k][a:b].mean():.2f}" for k in ("rms", "drums", "bass", "vocal", "other")))


if __name__ == "__main__":
    main()
