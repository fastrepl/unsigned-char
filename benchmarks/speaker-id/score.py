#!/usr/bin/env python3
"""Score unsigned Char's speaker matching against stitched fixtures.

For each fixture meeting:
  1. Pick half the speakers as "enrolled" — their clips become stored profiles
  2. The other half are "strangers" — the matcher should reject them
  3. Run diarization + embedding on the meeting audio
  4. Feed each turn's embedding to scoreSpeakerProfile via the TS bridge
  5. Record the top suggestion (or "no match") per turn

Emits results/<name>.json with per-turn predictions and ground-truth labels.

This script assumes embeddings are produced by the same Swift pipeline used
in-app. For the harness we accept a pre-computed embeddings file per meeting
(embeddings.json) so we can iterate on scoring logic without rebuilding the
Swift layer on every run. See `extract_embeddings.py` to generate those.
"""

import argparse
import json
from pathlib import Path


def cosine(a: list[float], b: list[float]) -> float:
    if not a or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(x * x for x in b) ** 0.5
    return dot / (na * nb) if na and nb else 0.0


def normalized_centroid(embeddings: list[list[float]]) -> list[float]:
    if not embeddings or not embeddings[0]:
        return []
    dim = len(embeddings[0])
    acc = [0.0] * dim
    for emb in embeddings:
        if len(emb) == dim:
            for i, v in enumerate(emb):
                acc[i] += v
    norm = sum(v * v for v in acc) ** 0.5
    return [v / norm for v in acc] if norm else acc


def score_profile(embedding: list[float], profile: dict) -> dict:
    """Mirror of store.ts scoreSpeakerProfile."""
    centroid_score = cosine(embedding, profile["centroid"])
    sample_scores = sorted(
        (cosine(embedding, s) for s in profile["samples"]),
        reverse=True,
    )
    best_sample_score = sample_scores[0] if sample_scores else 0.0
    return {
        "profile_id": profile["id"],
        "profile_name": profile["name"],
        "score": max(best_sample_score, centroid_score),
        "centroid_score": centroid_score,
        "best_sample_score": best_sample_score,
        "sample_count": len(profile["samples"]),
    }


def recommend(embedding: list[float], profiles: list[dict]) -> dict | None:
    """Mirror of store.ts recommendSpeakerProfile."""
    ranked = sorted(
        (score_profile(embedding, p) for p in profiles),
        key=lambda r: r["score"],
        reverse=True,
    )
    ranked = [r for r in ranked if r["score"] > 0]
    if not ranked:
        return None
    best = ranked[0]
    alternate_score = ranked[1]["score"] if len(ranked) > 1 else 0.0

    threshold = 0.7 if best["sample_count"] >= 3 else 0.74
    if best["score"] < threshold:
        return None
    if best["score"] < 0.82 and best["score"] - alternate_score < 0.04:
        return None

    return {
        "profile_id": best["profile_id"],
        "profile_name": best["profile_name"],
        "confidence": best["score"],
        "alternate_confidence": alternate_score,
    }


def split_speakers(speakers: list[str], rng_seed: int) -> tuple[list[str], list[str]]:
    import random

    rng = random.Random(rng_seed)
    shuffled = sorted(speakers)
    rng.shuffle(shuffled)
    half = len(shuffled) // 2
    return shuffled[:half], shuffled[half:]


def load_embeddings(meeting_dir: Path) -> dict:
    path = meeting_dir / "embeddings.json"
    if not path.exists():
        raise SystemExit(
            f"Missing {path}. Run extract_embeddings.py first (or wire up the Swift bridge)."
        )
    return json.loads(path.read_text())


def build_profiles(
    speakers_to_enroll: list[str],
    enrollment_embeddings: dict[str, list[list[float]]],
) -> list[dict]:
    profiles = []
    for speaker in speakers_to_enroll:
        samples = enrollment_embeddings.get(speaker, [])
        if len(samples) < 2:
            continue
        profiles.append(
            {
                "id": f"profile_{speaker}",
                "name": speaker,
                "centroid": normalized_centroid(samples),
                "samples": samples,
            }
        )
    return profiles


def score_meeting(meeting_dir: Path, seed: int) -> dict:
    ground = json.loads((meeting_dir / "ground.json").read_text())
    data = load_embeddings(meeting_dir)
    enrollment = data["enrollment"]
    per_turn = data["turns"]

    enrolled, strangers = split_speakers(ground["speakers"], seed)
    profiles = build_profiles(enrolled, enrollment)

    predictions = []
    for turn, turn_embedding in zip(ground["turns"], per_turn):
        suggestion = recommend(turn_embedding, profiles)
        is_enrolled = turn["speaker"] in enrolled
        predictions.append(
            {
                "speaker_truth": turn["speaker"],
                "enrolled": is_enrolled,
                "predicted": suggestion["profile_name"] if suggestion else None,
                "confidence": suggestion["confidence"] if suggestion else None,
                "start": turn["start_seconds"],
                "end": turn["end_seconds"],
            }
        )

    return {
        "meeting": meeting_dir.name,
        "enrolled_speakers": enrolled,
        "stranger_speakers": strangers,
        "predictions": predictions,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixtures", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    meetings = []
    for meeting_dir in sorted(args.fixtures.iterdir()):
        if not (meeting_dir / "ground.json").exists():
            continue
        meetings.append(score_meeting(meeting_dir, args.seed))
        print(f"scored {meeting_dir.name}")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps({"meetings": meetings}, indent=2))
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
