"""Character-level lyric alignment -> data/lyrics.json

Pipeline
  1. separate.py      : Demucs htdemucs_ft stems (vocals used here).
  2. ctc_emissions.py : MMS_FA CTC log-probs (20 ms frames) of the vocal stem,
                        mono / left / right.
  3. this script      : romanized readings (jp.py) aligned in ONE global
                        constrained Viterbi pass over the whole song on the
                        fused emissions.  A garbage "star" token sits between
                        lines (it absorbs backing vocals / ad-libs /
                        instrumentals), each line's tokens are confined to a
                        window around its LRC timestamps.  Alternative
                        readings (開いた ひらいた/あいた, 行く いく/ゆく) are
                        chosen by path score.  Character starts = first CTC
                        frame of the character's first mora; ends = next
                        character's start, or the end of vocal activity before
                        a rest.
  4. whisper_check.py : cross-check against mlx-whisper word timestamps.

Run:  uv run python align.py
"""
import common
import json
import sys

import numba
import numpy as np
import torchaudio

import jp

FRAME = 0.02
LABELS = list(torchaudio.pipelines.MMS_FA.get_labels(star=None))
LIDX = {c: i for i, c in enumerate(LABELS)}
STAR = len(LABELS)
PRE, POST = 1.2, 1.2      # line window around [lrc_start, lrc_end] (s)
STAR_MARGIN = 1.5


def emissions():
    es = [np.load(common.WORK / f"emission_{s}.npy").astype(np.float64) for s in ("mono", "L", "R")]
    E = np.logaddexp.reduce(np.stack(es), axis=0) - np.log(len(es))
    star = E.max(axis=1, keepdims=True) - STAR_MARGIN
    return np.concatenate([E, star], axis=1)


@numba.njit(cache=True)
def viterbi(E, tgt, lo, hi):
    T = E.shape[0]
    L = len(tgt)
    S = 2 * L + 1
    NEG = -1e18
    prev = np.full(S, NEG)
    cur = np.full(S, NEG)
    bp = np.zeros((T, S), np.int8)
    prev[0] = E[0, 0]
    if lo[0] <= 0:
        prev[1] = E[0, tgt[0]]
    for t in range(1, T):
        for s in range(S):
            if s % 2 == 1:
                j = (s - 1) // 2
                if t < lo[j] or t > hi[j]:
                    cur[s] = NEG
                    bp[t, s] = 0
                    continue
                e = E[t, tgt[j]]
            else:
                e = E[t, 0]
            best = prev[s]
            arg = 0
            if s >= 1 and prev[s - 1] > best:
                best = prev[s - 1]
                arg = 1
            if s >= 2 and s % 2 == 1:
                j = (s - 1) // 2
                if tgt[j] != tgt[j - 1] and prev[s - 2] > best:
                    best = prev[s - 2]
                    arg = 2
            cur[s] = best + e
            bp[t, s] = arg
        for s in range(S):
            prev[s] = cur[s]
    s = S - 1 if prev[S - 1] >= prev[S - 2] else S - 2
    score = prev[s]
    path = np.zeros(T, np.int64)
    for t in range(T - 1, -1, -1):
        path[t] = s
        s -= bp[t, s]
    return path, score


def build(lines, T):
    """Target ids + per-token windows + index of (li, wi, ci, mi, a, b) mora spans."""
    tgt, lo, hi, index = [STAR], [0], [T - 1], []
    for li, l in enumerate(lines):
        wl = int(max(0, l["lrc_start"] - PRE) / FRAME)
        end = l["lrc_end"] if l["lrc_end"] else l["lrc_start"] + 6
        wh = int(min(T * FRAME, end + POST) / FRAME)
        for wi, w in enumerate(l["words"]):
            for ci, ch in enumerate(w["chars"]):
                for mi, (m, r) in enumerate(ch["morae"]):
                    letters = [c for c in r if c in LIDX]
                    if not letters:
                        continue
                    a = len(tgt)
                    for c in letters:
                        tgt.append(LIDX[c]); lo.append(wl); hi.append(wh)
                    index.append((li, wi, ci, mi, a, len(tgt)))
        tgt.append(STAR); lo.append(0); hi.append(T - 1)
    return np.array(tgt, np.int64), np.array(lo, np.int64), np.array(hi, np.int64), index


def run(lines, E):
    T = E.shape[0]
    tgt, lo, hi, index = build(lines, T)
    path, score = viterbi(E, tgt, lo, hi)
    tokpos = np.where(path % 2 == 1, (path - 1) // 2, -1)
    P = np.exp(E[np.arange(T), np.where(tokpos >= 0, tgt[np.maximum(tokpos, 0)], 0)])
    spans = {}
    for (li, wi, ci, mi, a, b) in index:
        fr = np.where((tokpos >= a) & (tokpos < b))[0]
        spans[(li, wi, ci, mi)] = (fr.min() * FRAME, (fr.max() + 1) * FRAME, float(P[fr].mean()))
    return spans, float(score)


def vocal_activity():
    """10 ms vocal RMS (dB) and an activity mask (absolute floor + relative to
    the local maximum, so quiet verses still count)."""
    from scipy.ndimage import maximum_filter1d, median_filter
    y, sr = common.load_stem("vocals", sr=16000)
    hop, win = 160, 480
    n = len(y) // hop
    pad = np.pad(y, (win // 2, win // 2))
    fr = np.lib.stride_tricks.sliding_window_view(pad, win)[::hop][:n]
    db = 20 * np.log10(np.sqrt((fr ** 2).mean(axis=1)) + 1e-6)
    db = median_filter(db, 5)
    loc = maximum_filter1d(db, 300)
    act = (db > -50) & (db > loc - 24)
    return act, db, 0.01


def rest_after(act, hop, t0, t1, min_rest=0.14):
    """First moment in [t0, t1] where the voice stops for >= min_rest; else None."""
    a, b = int(t0 / hop), int(t1 / hop)
    need = int(min_rest / hop)
    run = 0
    for i in range(a, min(b, len(act))):
        if not act[i]:
            run += 1
            if run >= need:
                return (i - run + 1) * hop
        else:
            run = 0
    return None


def assemble(lines, spans, act, hop):
    out_lines = []
    for li, l in enumerate(lines):
        chars = []  # flat list for the line
        for wi, w in enumerate(l["words"]):
            for ci, ch in enumerate(w["chars"]):
                ms = [spans[(li, wi, ci, mi)] for mi in range(len(ch["morae"])) if (li, wi, ci, mi) in spans]
                chars.append(dict(li=li, wi=wi, c=ch["c"], kana=ch["kana"],
                                  roma="".join(r for _, r in ch["morae"]),
                                  start=ms[0][0] if ms else None,
                                  mora=[round(m[0], 3) for m in ms],
                                  conf=float(np.mean([m[2] for m in ms])) if ms else None))
        # chars without morae (punctuation, small kana, silent letters): inherit
        for k, c in enumerate(chars):
            if c["start"] is None:
                prev = next((chars[j] for j in range(k - 1, -1, -1) if chars[j]["start"] is not None), None)
                nxt = next((chars[j] for j in range(k + 1, len(chars)) if chars[j]["start"] is not None), None)
                if c["c"] in "「『" and nxt:
                    c["start"] = nxt["start"]
                elif prev:
                    c["start"] = prev["start"]
                else:
                    c["start"] = nxt["start"]
        # ends
        next_line_start = None
        if li + 1 < len(lines):
            nl = [s for (a, *_), s in spans.items() if a == li + 1]
            next_line_start = min(s[0] for s in nl) if nl else None
        for k, c in enumerate(chars):
            nxt = next((chars[j]["start"] for j in range(k + 1, len(chars)) if chars[j]["start"] > c["start"]), None)
            if nxt is not None:
                r = rest_after(act, hop, c["start"] + 0.12, nxt)
                c["end"] = r if r is not None else nxt
            else:
                cap = min(next_line_start - 0.02 if next_line_start else c["start"] + 4.0, c["start"] + 4.0)
                r = rest_after(act, hop, c["start"] + 0.15, cap, min_rest=0.2)
                c["end"] = r if r is not None else cap
            c["end"] = max(c["end"], c["start"] + 0.04)
        # zero-width chars end where they start
        for c in chars:
            if not c["roma"]:
                c["end"] = c["start"]
        words = []
        for wi, w in enumerate(l["words"]):
            cs = [c for c in chars if c["wi"] == wi]
            voiced = [c for c in cs if c["roma"]] or cs
            words.append(dict(
                w=w["w"], sp=w.get("sp", False),
                start=round(voiced[0]["start"], 3), end=round(max(c["end"] for c in voiced), 3),
                conf=round(float(np.mean([c["conf"] for c in voiced if c["conf"] is not None] or [0])), 3),
                chars=[dict(c=c["c"], start=round(c["start"], 3), end=round(c["end"], 3), kana=c["kana"],
                            roma=c["roma"]) for c in cs]))
        out_lines.append(dict(i=li, text=l["text"], start=words[0]["start"], end=words[-1]["end"],
                              lrc=l["lrc_start"], words=words))
    return out_lines


def main():
    E = emissions()
    lines = jp.parse_lines()
    spans, score = run(lines, E)
    # alternative readings: try each, keep the best global path score
    chosen = {}
    for li, l in enumerate(lines):
        for w in l["words"]:
            if w["w"] in jp.ALTERNATIVES:
                best = None
                for rd in jp.ALTERNATIVES[w["w"]]:
                    alt = {k: dict(v) for k, v in chosen.items()}
                    alt.setdefault(li, {})[w["w"]] = rd
                    sc = run(jp.parse_lines(alt), E)[1]
                    print(f"  L{li:02d} {w['w']} {rd}: {sc:.1f}")
                    if best is None or sc > best[0]:
                        best = (sc, rd)
                chosen.setdefault(li, {})[w["w"]] = best[1]
    if chosen:
        lines = jp.parse_lines(chosen)
        spans, score = run(lines, E)
    print("score", round(score, 1), "alternatives", chosen)
    act, db, hop = vocal_activity()
    out = assemble(lines, spans, act, hop)
    # report
    for l in out:
        lowc = [c["c"] for w in l["words"] for c in w["chars"] if c["roma"] and w["conf"] < 0.35]
        print(f"L{l['i']:02d} lrc {l['lrc']:6.2f}  aligned {l['start']:6.2f}-{l['end']:6.2f}  "
              f"Δ{l['start'] - l['lrc']:+.2f}  " + " ".join(f"{w['w']}@{w['start']:.2f}({w['conf']:.2f})" for w in l["words"]))
    doc = dict(
        title="2時のデバッグ",
        duration=round(len(E) * FRAME, 3),
        lines=out,
        notes=("Times in seconds on the timeline of audio/2時のデバッグ.wav. Words are bunsetsu-like display "
               "chunks (analysis/jp.py WORDS); every character has start/end; kana = reading of that "
               "character (furigana), roma = its romanization. Starts: CTC forced alignment (torchaudio "
               "MMS_FA on the Demucs htdemucs_ft vocal stem, mono/L/R fused, one global Viterbi pass, "
               "lines confined to their LRC windows ±1.2 s). Ends: next character's start, or the end of "
               "vocal activity before a rest. Punctuation is zero-width at the previous character."),
    )
    (common.DATA / "lyrics.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1))
    print("wrote", common.DATA / "lyrics.json")


if __name__ == "__main__":
    main()
