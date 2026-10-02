"""Japanese lyric text -> display words, per-character readings, morae, romaji.

Display words are bunsetsu-like chunks (content word + trailing particles /
auxiliaries / punctuation), written out by hand in WORDS below so the edit can
rely on them.  Readings come from fugashi + unidic-lite with manual overrides
(sung pronunciation), are distributed over the characters of each word
(furigana-style), split into morae and romanized (Hepburn) for the MMS_FA CTC
aligner, whose alphabet is plain a-z.

    from jp import parse_lines
    lines = parse_lines()   # [{text, start, end, words:[{w, chars:[{c, kana, morae:[(kana, romaji)]}]}]}]
"""
import re
import unicodedata

import common

# --------------------------------------------------------------------------
# Display word segmentation, one entry per LRC lyric line ("|" separates words).
WORDS = [
    "部屋の|明かりを|落として",
    "PCの|ファンだけが|回ってる",
    "ブルーライトに|照らされた",
    "私の|顔は|きっと、|ひどい|疲れ顔",
    "マグカップの|底に|残った",
    "冷え切って|苦いだけの|液体",
    "街の|喧騒は|もう|遠く",
    "世界に|一人|取り残された|気分",
    "さっきから|ずっと|同じ|場所",
    "ループする|思考が|止まらない",
    "何が|正解か|分からなくなって",
    "画面越しに|自分を|問い詰める",
    "タイピングの|音だけが|BGM",
    "迷宮入りの|コード、|終わらない|夜",
    "でも|バグに|負けるのは|癪だから",
    "光る|カーソル、|明日を|迎えに|行く",
    "Qiitaの|海は|もう|泳ぎ疲れた",
    "英語の|ドキュメントは|呪文みたい",
    "「仕様です」って|言葉の|裏で",
    "バグが|嘲笑ってる|気がする",
    "開いた|タブは|数え切れない",
    "メモリも|私の|根気も、|もう|限界",
    "スタック|オーバーフローにも",
    "私の|答えは|載っていない",
    "窓の|外が|少しずつ",
    "紫から|青に|変わっていく",
    "街が|動き出す|前に",
    "この|コードに|ケリを|つけたい",
    "「神様、|どうか|通して」",
    "震える|指で|コンパイルを|走らせる",
    "タイピングの|音だけが|BGM",
    "迷宮入りの|コード、|終わらない|夜",
    "でも|バグに|負けるのは|癪だから",
    "光る|カーソル、|明日を|迎えに|行く",
    "…あれ？",
    "ここ、|セミコロン|じゃなくて|カンマ…",
    "たった|一行、|これだけの|タイポかよ。",
    "Enter…",
    "ビルド|成功。",
    "画面に|流れる、|眩しいくらいの|緑色。",
    "やっと|終わった。",
    "Git|push…",
    "もう|リファクタリング|なんて|知らない。",
    "明日の|自分、|よろしく|頼むよ。",
]

# Reading overrides for morpheme surfaces (sung pronunciation, katakana).
READING = {
    "私": "ワタシ",
    "明日": "アシタ",
    "嘲笑っ": "アザワラッ",
    "一行": "イチギョー",
    "何": "ナニ",
    "PC": "ピーシー",
    "BGM": "ビージーエム",
    "Qiita": "キータ",
    "タイポ": "タイポ",
    "Enter": "エンター",
    "Git": "ギット",
    "push": "プッシュ",
}

# Alternative pronunciations scored by the aligner (word surface -> readings).
ALTERNATIVES = {
    "開いた": ["ヒライタ", "アイタ"],
    "行く": ["イク", "ユク"],
}

# Per-character reading splits for kanji compounds where an even split by
# mora count would be wrong.
CHAR_SPLIT = {
    "部屋": ["ヘ", "ヤ"],
    "一人": ["ヒト", "リ"],
    "明日": ["アシ", "タ"],
    "今日": ["キョ", "ー"],
    "神様": ["カミ", "サマ"],
    "緑色": ["ミドリ", "イロ"],
    "BGM": ["ビー", "ジー", "エム"],
    "PC": ["ピー", "シー"],
    "Git": ["ギ", "ッ", "ト"],
    "push": ["プ", "", "ッ", "シュ"],
    "Qiita": ["キ", "ー", "", "タ", ""],
    "Enter": ["エ", "ン", "ター", "", ""],
}

SMALL = set("ャュョァィゥェォヮ")
PUNCT = set("、。「」『』…？！?!・ー〜")  # ー handled separately when inside kana words
KATA_LONG = "ー"


def hira2kata(s):
    return "".join(chr(ord(c) + 0x60) if "ぁ" <= c <= "ゖ" else c for c in s)


def is_kana(c):
    return ("ぁ" <= c <= "ゖ") or ("ァ" <= c <= "ヺ") or c == "ー"


def is_punct(c):
    if c == "ー":
        return False
    cat = unicodedata.category(c)
    return c in PUNCT or cat.startswith("P") or cat.startswith("Z") or c == " "


# ---------------------------------------------------------------- morae / romaji
ROMA = {}
_base = {
    "ア": "a", "イ": "i", "ウ": "u", "エ": "e", "オ": "o",
    "カ": "ka", "キ": "ki", "ク": "ku", "ケ": "ke", "コ": "ko",
    "ガ": "ga", "ギ": "gi", "グ": "gu", "ゲ": "ge", "ゴ": "go",
    "サ": "sa", "シ": "shi", "ス": "su", "セ": "se", "ソ": "so",
    "ザ": "za", "ジ": "ji", "ズ": "zu", "ゼ": "ze", "ゾ": "zo",
    "タ": "ta", "チ": "chi", "ツ": "tsu", "テ": "te", "ト": "to",
    "ダ": "da", "ヂ": "ji", "ヅ": "zu", "デ": "de", "ド": "do",
    "ナ": "na", "ニ": "ni", "ヌ": "nu", "ネ": "ne", "ノ": "no",
    "ハ": "ha", "ヒ": "hi", "フ": "fu", "ヘ": "he", "ホ": "ho",
    "バ": "ba", "ビ": "bi", "ブ": "bu", "ベ": "be", "ボ": "bo",
    "パ": "pa", "ピ": "pi", "プ": "pu", "ペ": "pe", "ポ": "po",
    "マ": "ma", "ミ": "mi", "ム": "mu", "メ": "me", "モ": "mo",
    "ヤ": "ya", "ユ": "yu", "ヨ": "yo",
    "ラ": "ra", "リ": "ri", "ル": "ru", "レ": "re", "ロ": "ro",
    "ワ": "wa", "ヲ": "o", "ン": "n", "ヴ": "vu",
    "ァ": "a", "ィ": "i", "ゥ": "u", "ェ": "e", "ォ": "o",
    "ャ": "ya", "ュ": "yu", "ョ": "yo", "ヮ": "wa",
}
ROMA.update(_base)
for k, c in [("キ", "k"), ("ギ", "g"), ("ニ", "n"), ("ヒ", "h"), ("ビ", "b"), ("ピ", "p"),
             ("ミ", "m"), ("リ", "r")]:
    ROMA[k + "ャ"], ROMA[k + "ュ"], ROMA[k + "ョ"] = c + "ya", c + "yu", c + "yo"
for k, c in [("シ", "sh"), ("ジ", "j"), ("チ", "ch"), ("ヂ", "j")]:
    ROMA[k + "ャ"], ROMA[k + "ュ"], ROMA[k + "ョ"], ROMA[k + "ェ"] = c + "a", c + "u", c + "o", c + "e"
ROMA.update({
    "ファ": "fa", "フィ": "fi", "フェ": "fe", "フォ": "fo", "フュ": "fyu",
    "ティ": "ti", "ディ": "di", "トゥ": "tu", "ドゥ": "du", "デュ": "dyu", "テュ": "tyu",
    "ウィ": "wi", "ウェ": "we", "ウォ": "wo", "ヴァ": "va", "ヴィ": "vi", "ヴェ": "ve", "ヴォ": "vo",
    "ツァ": "tsa", "ツェ": "tse", "ツォ": "tso", "イェ": "ye", "スィ": "si", "ズィ": "zi",
})


def split_morae(kana):
    """Katakana string -> list of morae (base + optional small kana)."""
    out = []
    for c in kana:
        if c in SMALL and out and out[-1] not in ("ッ", "ン", "ー") and (out[-1] + c) in ROMA:
            out[-1] += c
        else:
            out.append(c)
    return out


def romanize_morae(morae):
    """Romanize a mora sequence with context for ッ (gemination) and ー (long vowel)."""
    rs = []
    for i, m in enumerate(morae):
        if m == "ッ":
            nxt = next((ROMA.get(x, "") for x in morae[i + 1:] if x not in ("ッ", "ー")), "")
            rs.append("t" if nxt.startswith("ch") else (nxt[0] if nxt and nxt[0] not in "aiueon" else ""))
        elif m == "ー":
            prev = next((r for r in reversed(rs) if r), "")
            v = next((ch for ch in reversed(prev) if ch in "aiueo"), "")
            rs.append(v)
        else:
            rs.append(ROMA.get(m, ""))
    return rs


# ---------------------------------------------------------------- readings
_tagger = None


def tagger():
    global _tagger
    if _tagger is None:
        import fugashi
        _tagger = fugashi.Tagger()
    return _tagger


def morphemes(text):
    """[(surface, pron, kana)] katakana pronunciation / spelling readings, with
    overrides; punctuation gets ''."""
    out = []
    for w in tagger()(text):
        s = w.surface
        if s in READING:
            r = k = READING[s]
        elif all(is_punct(c) for c in s):
            r = k = ""
        else:
            r = w.feature.pron if w.feature.pron and w.feature.pron != "*" else hira2kata(s)
            k = w.feature.kana if w.feature.kana and w.feature.kana != "*" else r
        out.append((s, r, k))
    return out


def distribute2(surface, pron, kana):
    """Split by the spelling reading (okurigana match reliably), then put the
    pronounced morae (は->ワ, ウ->ー) in the same mora positions."""
    if surface in CHAR_SPLIT or kana == pron:
        return distribute(surface, pron)
    parts = distribute(surface, kana)
    pm = split_morae(pron)
    if sum(len(split_morae(x)) for x in parts) != len(pm):
        return distribute(surface, pron)
    out, k = [], 0
    for x in parts:
        n = len(split_morae(x))
        out.append("".join(pm[k:k + n]))
        k += n
    return out


def syllables(kana):
    """Morae grouped into syllables for splitting a reading over kanji: ン, ッ, ー and
    the second vowel of ai/ei/ui/oi/ou/uu attach to the preceding mora."""
    out = []
    for m in split_morae(kana):
        prev = ROMA.get(out[-1][-1], "") if out else ""
        pv = prev[-1:] if prev else ""
        if out and (m in ("ン", "ッ", "ー") or (m == "イ" and pv in "aeuo" and pv) or (m == "ウ" and pv in "ou" and pv)):
            out[-1].append(m)
        else:
            out.append([m])
    return ["".join(x) for x in out]


def split_even(reading, n):
    sy = syllables(reading)
    if len(sy) < n:
        sy = split_morae(reading)
    per = [len(sy) // n + (1 if i < len(sy) % n else 0) for i in range(n)]
    out, k = [], 0
    for p in per:
        out.append("".join(sy[k:k + p]))
        k += p
    return out


def distribute(surface, reading):
    """Split a morpheme reading over its characters -> list of kana strings."""
    if surface in CHAR_SPLIT:
        return CHAR_SPLIT[surface]
    chars = list(surface)
    if not reading:
        return [""] * len(chars)
    if all(is_kana(c) for c in chars):
        kk = hira2kata(surface)
        if len(split_morae(kk)) == len(split_morae(reading)) or kk == reading:
            # pron may differ from spelling (ウ->ー, は->ワ): map mora by mora
            mr = split_morae(reading)
            out, mi = [], 0
            for c in chars:
                if hira2kata(c) in SMALL and out:
                    out.append("")
                    continue
                out.append(mr[mi] if mi < len(mr) else "")
                mi += 1
            # attach small-kana morae (e.g. キャ) to the base char only
            return out
        return [hira2kata(c) for c in chars]
    # mixed kanji/latin + kana: regex-match kana runs (okurigana) literally
    runs = []
    for c in chars:
        k = is_kana(c)
        if runs and runs[-1][0] == k:
            runs[-1][1].append(c)
        else:
            runs.append((k, [c]))
    pat = "".join("(" + re.escape(hira2kata("".join(cs))) + ")" if k else "(.+?)" for k, cs in runs)
    m = re.fullmatch(pat, reading)
    if not m:
        # pron spelling mismatch (e.g. long vowels): fall back to an even split
        return split_even(reading, len(chars))
    out = []
    for (k, cs), g in zip(runs, m.groups()):
        if k:
            out.extend(hira2kata(c) for c in cs)
        else:
            out.extend(split_even(g, len(cs)))
    return out


def parse_line(text, word_spec, alt=None):
    """-> dict(text, words:[{w, chars:[{c, kana}]}]); alt = {word surface: reading} overrides."""
    words = word_spec.split("|")
    flat_text = text.replace(" ", "")
    assert "".join(words) == flat_text, (text, words)
    # words preceded by a space in the original line (e.g. "が BGM", "Git push")
    spaced, pos = set(), 0
    for wi, w in enumerate(words):
        k = text.find(w, pos)
        if k > 0 and text[k - 1] == " ":
            spaced.add(wi)
        pos = k + len(w)
    # readings per character for the whole line, via morphemes
    char_kana = []
    for s, r, k in morphemes(text):
        char_kana.extend(zip(s, distribute2(s, r, k)))
    assert "".join(c for c, _ in char_kana) == flat_text
    out_words, i = [], 0
    for w in words:
        cs = char_kana[i:i + len(w)]
        i += len(w)
        if alt and w in alt:
            # re-distribute the alternative reading over this word only
            ks = distribute(w, alt[w])
            cs = list(zip(w, ks))
        out_words.append(dict(w=w, sp=len(out_words) in spaced, chars=[dict(c=c, kana=k) for c, k in cs]))
    # morae + romaji, with cross-character context for ッ / ー
    flat = [(wi, ci, m) for wi, w in enumerate(out_words) for ci, ch in enumerate(w["chars"])
            for m in split_morae(ch["kana"])]
    roma = romanize_morae([m for _, _, m in flat])
    for (wi, ci, m), r in zip(flat, roma):
        out_words[wi]["chars"][ci].setdefault("morae", []).append((m, r))
    for w in out_words:
        for ch in w["chars"]:
            ch.setdefault("morae", [])
    return dict(text=text, words=out_words)


def parse_lines(alt=None):
    lrc = common.load_lrc()
    assert len(lrc) == len(WORDS), (len(lrc), len(WORDS))
    out = []
    for i, (l, spec) in enumerate(zip(lrc, WORDS)):
        p = parse_line(l["text"], spec, (alt or {}).get(i))
        p.update(i=i, lrc_start=l["start"], lrc_end=l["end"])
        out.append(p)
    return out


if __name__ == "__main__":
    for l in parse_lines():
        segs = []
        for w in l["words"]:
            segs.append(w["w"] + "[" + " ".join(
                f"{ch['c']}:{''.join(r for _, r in ch['morae'])}" for ch in w["chars"]) + "]")
        print(f"L{l['i']:02d} {l['lrc_start']:6.2f} " + " ".join(segs))
