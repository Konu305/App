#!/usr/bin/env python3
"""Generate the curated 20 phrase Palestinian Arabic audio QA set."""

import argparse
import json
import shutil
from pathlib import Path

import requests

import generate_pal_audio as core

QA_URL = "https://raw.githubusercontent.com/Konu305/App/main/pal-arabisch/audio/qa20.json"


def load_qa_order():
    r = requests.get(QA_URL, timeout=30)
    r.raise_for_status()
    return [row["id"] for row in r.json()]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference", required=True, help="iPhone M4A, WAV, MP3 or OGG reference voice")
    parser.add_argument("--output", default="pal_audio_qa20")
    parser.add_argument("--install", action="store_true")
    args = parser.parse_args()

    if args.install:
        core.ensure_packages()

    reference = Path(args.reference)
    if not reference.exists():
        raise FileNotFoundError(reference)

    output = Path(args.output)
    prepared = core.prepare_reference(reference, output.parent / "reference_work")

    levels = core.download_course()
    phrases = core.flatten_course(levels)
    by_id = {p["id"]: p for p in phrases}
    ids = load_qa_order()
    qa_phrases = [by_id[i] for i in ids if i in by_id]

    missing = [i for i in ids if i not in by_id]
    if missing:
        raise RuntimeError(f"QA IDs missing from course: {missing}")

    print(f"Prepared private reference: {prepared}")
    print(f"Generating curated QA set: {len(qa_phrases)} phrases")

    manifest = core.generate_audio(prepared, qa_phrases, output, len(qa_phrases))
    core.write_review_sheet(qa_phrases, manifest, output)

    archive = shutil.make_archive(str(output), "zip", root_dir=output)
    print(f"QA audio ZIP: {archive}")
    print("Review all 20 normal clips before generating the full course.")


if __name__ == "__main__":
    main()
