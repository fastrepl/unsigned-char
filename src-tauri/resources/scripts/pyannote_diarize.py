#!/usr/bin/env python3

import argparse
import json
import os
import sys


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run local pyannote.audio speaker diarization."
    )
    parser.add_argument("--audio-path", required=True)
    parser.add_argument("--pipeline", required=True)
    parser.add_argument("--speaker-count", type=int)
    return parser.parse_args()


def fail(message: str) -> int:
    print(message, file=sys.stderr)
    return 1


def main() -> int:
    args = parse_args()

    try:
        import torch
    except ModuleNotFoundError:
        return fail("Python package 'torch' is required to run local diarization.")

    try:
        from pyannote.audio import Pipeline
    except ModuleNotFoundError:
        return fail(
            "Python package 'pyannote.audio' is required to run local diarization."
        )

    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN")

    try:
        pipeline = Pipeline.from_pretrained(
            args.pipeline,
            use_auth_token=token or None,
        )
    except Exception as error:  # pragma: no cover - runtime integration path
        return fail(f"Failed to load pyannote pipeline '{args.pipeline}': {error}")

    try:
        if torch.cuda.is_available():
            pipeline.to(torch.device("cuda"))
    except Exception:
        pass

    try:
        diarization_kwargs = {}
        if args.speaker_count is not None:
            if args.speaker_count < 1:
                return fail("Speaker count must be at least 1.")
            diarization_kwargs["num_speakers"] = args.speaker_count

        diarization = pipeline(args.audio_path, **diarization_kwargs)
    except Exception as error:  # pragma: no cover - runtime integration path
        return fail(f"Failed to diarize '{args.audio_path}': {error}")

    segments = []
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        segments.append(
            {
                "speaker": str(speaker),
                "startSeconds": float(turn.start),
                "endSeconds": float(turn.end),
            }
        )

    segments.sort(key=lambda segment: (segment["startSeconds"], segment["endSeconds"]))
    print(json.dumps({"segments": segments}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
