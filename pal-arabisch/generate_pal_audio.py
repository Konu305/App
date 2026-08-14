#!/usr/bin/env python3
"""
Palestinian Arabic audio generator for the GitHub Pages learning app.

Designed for Google Colab with a GPU runtime.

Workflow:
1. Upload a clean 3-10 second Palestinian Arabic reference recording.
2. This script downloads the current course payload from GitHub.
3. It prioritizes beginner, then conversation, then grammar phrases.
4. Sofelia-TTS generates one WAV per phrase.
5. A pitch-preserving slow version is created.
6. manifest.json is generated for the web app.
7. The audio folder is zipped for upload to GitHub.
"""

import argparse
import base64
import gzip
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

REPO_RAW = "https://raw.githubusercontent.com/Konu305/App/main/pal-arabisch"
PAYLOAD_FILES = ["payload1.js", "payload2.js", "payload3.js"]
OUTPUT_SAMPLE_RATE = 48000
REFERENCE_SAMPLE_RATE = 16000


def ensure_packages():
    """Install runtime dependencies when executed in Colab."""
    packages = [
        "soundfile",
        "librosa",
        "requests",
    ]
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", *packages])
    subprocess.check_call([
        sys.executable, "-m", "pip", "install", "-q",
        "git+https://github.com/ysharma3501/MiraTTS.git"
    ])


def prepare_reference(reference_file, work_dir):
    """Trim silence and convert phone audio to Sofelia's preferred 16 kHz mono WAV."""
    work_dir.mkdir(parents=True, exist_ok=True)
    out = work_dir / "reference_sofelia.wav"
    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(reference_file),
        "-af", "silenceremove=start_periods=1:start_duration=0.15:start_threshold=-40dB:stop_periods=-1:stop_duration=0.35:stop_threshold=-40dB,loudnorm=I=-18:TP=-2:LRA=7",
        "-ac", "1", "-ar", str(REFERENCE_SAMPLE_RATE), "-c:a", "pcm_s16le", str(out)
    ]
    subprocess.check_call(cmd)
    return out


def download_course():
    import requests

    chunks = []
    for filename in PAYLOAD_FILES:
        url = f"{REPO_RAW}/{filename}"
        response = requests.get(url, timeout=60)
        response.raise_for_status()
        text = response.text
        matches = re.findall(r'\+\s*"([A-Za-z0-9+/=]+)"', text)
        if not matches:
            raise RuntimeError(f"Could not extract Base64 data from {filename}")
        chunks.extend(matches)

    compressed = base64.b64decode("".join(chunks))
    decoded = gzip.decompress(compressed).decode("utf-8")
    return json.loads(decoded)


def flatten_course(levels):
    priority = {"beginner": 0, "conversation": 1, "grammar": 2}
    phrases = []

    for level in levels:
        for lesson_index, lesson in enumerate(level["lessons"]):
            for item_index, item in enumerate(lesson["items"]):
                phrases.append({
                    "id": item["id"],
                    "arabic": item["arabic"],
                    "pron": item.get("pron", ""),
                    "de": item.get("de", ""),
                    "tag": item.get("tag", ""),
                    "level": level["id"],
                    "lesson": lesson["title"],
                    "_sort": (
                        priority.get(level["id"], 99),
                        lesson_index,
                        item_index
                    ),
                })

    phrases.sort(key=lambda x: x["_sort"])
    return phrases


def generate_audio(reference_file, phrases, output_dir, limit):
    import librosa
    import soundfile as sf
    from mira.model import MiraTTS

    output_dir.mkdir(parents=True, exist_ok=True)

    print("Loading Sofelia-TTS...")
    tts = MiraTTS("hamdallah/Sofelia-TTS")
    context_tokens = tts.encode_audio(str(reference_file))

    manifest = {}
    completed = 0

    for phrase in phrases[:limit]:
        phrase_id = phrase["id"]
        normal_name = f"{phrase_id}.wav"
        slow_name = f"{phrase_id}_slow.wav"
        normal_path = output_dir / normal_name
        slow_path = output_dir / slow_name

        print(f"[{completed + 1}/{min(limit, len(phrases))}] {phrase_id}: {phrase['arabic']}")

        if normal_path.exists():
            audio, sr = sf.read(normal_path)
            if sr != OUTPUT_SAMPLE_RATE:
                audio = librosa.resample(audio, orig_sr=sr, target_sr=OUTPUT_SAMPLE_RATE)
        else:
            audio = tts.generate(phrase["arabic"], context_tokens)
            sf.write(normal_path, audio, OUTPUT_SAMPLE_RATE)

        if not slow_path.exists():
            slow_audio = librosa.effects.time_stretch(audio.astype("float32"), rate=0.82)
            sf.write(slow_path, slow_audio, OUTPUT_SAMPLE_RATE)

        manifest[phrase_id] = {
            "normal": normal_name,
            "slow": slow_name,
            "source": "Sofelia-TTS",
            "dialect": "Palestinian Arabic",
        }
        completed += 1

        (output_dir / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )

    return manifest


def write_review_sheet(phrases, manifest, output_dir):
    rows = [
        "id\tlevel\tlesson\tarabic\tpronunciation_de\tgerman\taudio_normal\taudio_slow\treview"
    ]
    phrase_by_id = {p["id"]: p for p in phrases}

    for phrase_id, audio in manifest.items():
        p = phrase_by_id[phrase_id]
        rows.append(
            "\t".join([
                phrase_id,
                p["level"],
                p["lesson"].replace("\t", " "),
                p["arabic"].replace("\t", " "),
                p["pron"].replace("\t", " "),
                p["de"].replace("\t", " "),
                audio["normal"],
                audio["slow"],
                "",
            ])
        )

    (output_dir / "REVIEW.tsv").write_text("\n".join(rows), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference", required=True, help="Palestinian Arabic WAV/MP3/OGG/M4A")
    parser.add_argument("--limit", type=int, default=20, help="Number of phrases to generate. Start with 20 for QA.")
    parser.add_argument("--output", default="pal_audio", help="Output directory")
    parser.add_argument("--install", action="store_true", help="Install dependencies first")
    args = parser.parse_args()

    if args.install:
        ensure_packages()

    reference_file = Path(args.reference)
    if not reference_file.exists():
        raise FileNotFoundError(reference_file)

    output_dir = Path(args.output)
    prepared_reference = prepare_reference(reference_file, output_dir.parent / "reference_work")
    print(f"Prepared reference: {prepared_reference} ({REFERENCE_SAMPLE_RATE} Hz mono)")

    levels = download_course()
    phrases = flatten_course(levels)

    print(f"Course phrases found: {len(phrases)}")
    print(f"Generating: {min(args.limit, len(phrases))}")
    print("Priority: beginner -> conversation -> grammar")

    manifest = generate_audio(prepared_reference, phrases, output_dir, args.limit)
    write_review_sheet(phrases, manifest, output_dir)

    archive = shutil.make_archive(str(output_dir), "zip", root_dir=output_dir)
    print()
    print("Done.")
    print(f"Audio files: {output_dir}")
    print(f"Manifest: {output_dir / 'manifest.json'}")
    print(f"Review sheet: {output_dir / 'REVIEW.tsv'}")
    print(f"ZIP: {archive}")
    print()
    print("Upload the WAV files and manifest.json into pal-arabisch/audio/ on GitHub.")


if __name__ == "__main__":
    main()
