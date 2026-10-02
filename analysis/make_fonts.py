"""Subset + instance the font sources in app/public/fonts/src -> app/public/fonts/*.ttf

Character set = every lyric character + ASCII + kana + CJK punctuation +
fullwidth forms + box drawing / arrows / misc symbols + every non-ASCII
character that appears in app/src/**/*.ts (so any Japanese string written in a
scene is always covered) + app/fonts.extra.txt.

Static instances are cut from the variable sources because troika-three-text
(SDF text) does not apply variation axes.
Run:  uv run python make_fonts.py      (re-run after adding new strings to scenes)
"""
import common
import json
import re

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

SRC = common.ROOT / "fonts-src"  # original font files: run analysis/fetch_fonts.sh
OUT = common.PROJECT / "app/public/fonts"
FONTS = [
    ("DelaGothicOne-Regular.ttf", "DelaGothicOne", None),
    ("NotoSansJP-VF.ttf", "NotoSansJP-Black", {"wght": 900}),
    ("NotoSansJP-VF.ttf", "NotoSansJP-Bold", {"wght": 700}),
    ("NotoSansJP-VF.ttf", "NotoSansJP-Regular", {"wght": 400}),
    ("NotoSansJP-VF.ttf", "NotoSansJP-Light", {"wght": 300}),
    ("NotoSerifJP-VF.ttf", "NotoSerifJP-Black", {"wght": 900}),
    ("NotoSerifJP-VF.ttf", "NotoSerifJP-Medium", {"wght": 500}),
    ("DotGothic16-Regular.ttf", "DotGothic16", None),
    ("MPLUS1Code-VF.ttf", "MPLUS1Code-Bold", {"wght": 700}),
    ("MPLUS1Code-VF.ttf", "MPLUS1Code-Regular", {"wght": 400}),
    ("JetBrainsMono-VF.ttf", "JetBrainsMono-ExtraBold", {"wght": 800}),
    ("JetBrainsMono-VF.ttf", "JetBrainsMono-Regular", {"wght": 400}),
    ("YujiSyuku-Regular.ttf", "YujiSyuku", None),
    ("ReggaeOne-Regular.ttf", "ReggaeOne", None),
    ("RampartOne-Regular.ttf", "RampartOne", None),
    ("ZenKakuGothicNew-Black.ttf", "ZenKakuGothicNew-Black", None),
    ("ShipporiMinchoB1-ExtraBold.ttf", "ShipporiMinchoB1-ExtraBold", None),
]


def charset():
    cs = set(chr(c) for c in range(0x20, 0x7F))
    for a, b in [(0x3000, 0x303F), (0x3041, 0x309F), (0x30A0, 0x30FF), (0xFF01, 0xFF5E), (0xFF61, 0xFF9F),
                 (0x2010, 0x2027), (0x2030, 0x205E), (0x2190, 0x21FF), (0x2500, 0x259F), (0x25A0, 0x25FF),
                 (0x2600, 0x2626), (0x2700, 0x2775), (0x00A0, 0x00FF), (0x2460, 0x24FF)]:
        cs.update(chr(c) for c in range(a, b + 1))
    # JIS X 0208 level-1 kanji (2965 common kanji): any everyday Japanese UI string is covered
    for hi in range(0x88, 0x99):
        for lo in list(range(0x40, 0x7F)) + list(range(0x80, 0xFD)):
            try:
                cs.add(bytes([hi, lo]).decode("shift_jis"))
            except UnicodeDecodeError:
                pass
    lyr = json.loads((common.DATA / "lyrics.json").read_text())
    for l in lyr["lines"]:
        cs.update(l["text"])
    for p in (common.PROJECT / "app/src").rglob("*.ts"):
        cs.update(c for c in p.read_text(encoding="utf-8") if ord(c) > 0x7F)
    extra = common.PROJECT / "app/fonts.extra.txt"
    if extra.exists():
        cs.update(extra.read_text(encoding="utf-8"))
    cs.discard("\n")
    return cs


def main():
    cs = charset()
    text = "".join(sorted(cs))
    OUT.mkdir(exist_ok=True)
    report = {}
    cache = {}
    for src, name, axes in FONTS:
        if src not in cache:
            cache[src] = (SRC / src).read_bytes()
        import io
        f = TTFont(io.BytesIO(cache[src]))
        if axes:
            f = instancer.instantiateVariableFont(f, axes, updateFontNames=True)
        opts = subset.Options()
        opts.layout_features = ["*"]
        opts.name_IDs = ["*"]
        opts.name_languages = ["*"]
        opts.notdef_outline = True
        opts.hinting = False
        opts.desubroutinize = True
        opts.drop_tables += ["STAT", "DSIG"]
        sub = subset.Subsetter(opts)
        sub.populate(text=text)
        sub.subset(f)
        cmap = f.getBestCmap()
        missing = [c for c in cs if ord(c) not in cmap and not c.isspace()]
        lyr_missing = sorted(set(c for l in json.loads((common.DATA / "lyrics.json").read_text())["lines"]
                                 for c in l["text"] if ord(c) not in cmap and not c.isspace()))
        out = OUT / f"{name}.ttf"
        f.save(out)
        report[name] = dict(kb=round(out.stat().st_size / 1024), glyphs=len(f.getGlyphOrder()),
                            lyric_missing="".join(lyr_missing))
        print(f"{name:28s} {report[name]['kb']:6d} KB  {report[name]['glyphs']:5d} glyphs  "
              f"lyric chars missing: {''.join(lyr_missing) or '-'}")
    (OUT / "fonts.json").write_text(json.dumps(report, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
