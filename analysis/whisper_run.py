"""mlx-whisper (large-v3-turbo, word timestamps) on the vocal stem, Japanese.
Independent cross-check for the CTC alignment.  Writes work/whisper_<tag>.json.
Run:  uv run python whisper_run.py [turbo|large]
"""
import common
import json
import sys
import soundfile as sf

MODELS = {"turbo": "mlx-community/whisper-large-v3-turbo", "large": "mlx-community/whisper-large-v3-mlx"}


def main(tag="turbo"):
    wav = common.WORK / "vocals16k.wav"
    if not wav.exists():
        y, sr = common.load_stem("vocals", sr=16000)
        sf.write(wav, y, sr)
    import mlx_whisper
    res = mlx_whisper.transcribe(
        str(wav), path_or_hf_repo=MODELS[tag], language="ja", word_timestamps=True,
        condition_on_previous_text=False, temperature=0.0,
        initial_prompt="深夜2時、デバッグ中。バグ、コード、コンパイル、Qiita、スタックオーバーフロー、Git push。",
    )
    (common.WORK / f"whisper_{tag}.json").write_text(json.dumps(res, ensure_ascii=False, indent=1, default=float))
    for seg in res["segments"]:
        print(f"{seg['start']:7.2f} {seg['end']:7.2f} {seg['text']}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "turbo")
