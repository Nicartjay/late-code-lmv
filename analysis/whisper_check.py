"""Cross-check data/lyrics.json character starts against mlx-whisper word
timestamps (work/whisper_turbo.json): whisper words are matched to lyric
characters by text (difflib over the concatenated text, whisper's homophone
mistakes simply don't match), then per line the median |Δstart| is reported."""
import common
import json
from difflib import SequenceMatcher
import numpy as np

lyr = json.load(open(common.DATA / "lyrics.json"))
wh = json.load(open(common.WORK / "whisper_turbo.json"))
chars = [(c["c"], c["start"], l["i"]) for l in lyr["lines"] for w in l["words"] for c in w["chars"]]
A = "".join(c for c, _, _ in chars)
ww = [(w["word"].strip(), w["start"]) for s in wh["segments"] for w in s.get("words", [])]
B, bstart = "", []
for txt, st in ww:
    for k, ch in enumerate(txt):
        B += ch
        bstart.append(st if k == 0 else None)   # only the first char of a whisper word has a start
sm = SequenceMatcher(None, A, B, autojunk=False)
per_line = {}
for a, b, n in sm.get_matching_blocks():
    for k in range(n):
        if bstart[b + k] is not None and A[a + k] not in "、。「」…？":
            c, st, li = chars[a + k]
            per_line.setdefault(li, []).append(bstart[b + k] - st)
allv = []
for l in lyr["lines"]:
    d = per_line.get(l["i"], [])
    allv += d
    flag = "  <-- check" if d and np.median(np.abs(d)) > 0.25 else ""
    print(f"L{l['i']:02d} n={len(d):2d} med|Δ|={np.median(np.abs(d)) if d else float('nan'):.2f} "
          f"medΔ={np.median(d) if d else float('nan'):+.2f}  {l['text']}{flag}")
allv = np.abs(np.array(allv))
print(f"\nall: n={len(allv)} median |Δ| {np.median(allv):.3f}s  p90 {np.percentile(allv, 90):.3f}s  within 0.15s: {(allv < 0.15).mean():.0%}")
