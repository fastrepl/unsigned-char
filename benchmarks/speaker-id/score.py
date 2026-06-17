#!/usr/bin/env python3
"""Score unsigned Char's speaker matching against labeled meetings.

Expects ground truth from label.py — a per-meeting JSON with:

  {"speakers": {"Speaker 1": "John", "Speaker 2": "Yujong", ...}}

And an embeddings.json per meeting produced by the Swift pipeline:

  {
    "speakers": {
      "Speaker 1": [[...], [...]],   // one embedding per turn
      "Speaker 2": [[...]]
    }
  }

Runs store.ts matching logic in Python. For each meeting, half the *labeled*
human identities become enrolled profiles, the other half are strangers the
matcher should reject.

Emits results/<name>.json with per-turn predictions.
"""

import argparse
import json
import random
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
        "profile_name": best["profile_name"],
        "confidence": best["score"],
        "alternate_confidence": alternate_score,
    }


def split_people(people: list[str], seed: int) -> tuple[set[str], set[str]]:
    rng = random.Random(seed)
    shuffled = sorted(people)
    rng.shuffle(shuffled)
    half = max(1, len(shuffled) // 2)
    return set(shuffled[:half]), set(shuffled[half:])


def score_meeting(meeting_dir: Path, seed: int) -> dict:
    ground = json.loads((meeting_dir / "ground.json").read_text())
    embeddings = json.loads((meeting_dir / "embeddings.json").read_text())

    speaker_to_person = {
        speaker: person
        for speaker, person in ground["speakers"].items()
        if person and not person.startswith("__")
    }
    if not speaker_to_person:
        return {"meeting": meeting_dir.name, "predictions": [], "skipped": "no labels"}

    people = sorted(set(speaker_to_person.values()))
    enrolled, strangers = split_people(people, seed)

    profiles = []
    for speaker, person in speaker_to_person.items():
        if person not in enrolled:
            continue
        samples = embeddings["speakers"].get(speaker, [])
        if len(samples) < 2:
            continue
        profiles.append(
            {
                "id": f"profile_{person}",
                "name": person,
                "centroid": normalized_centroid(samples),
                "samples": samples,
            }
        )

    predictions = []
    for speaker, person in speaker_to_person.items():
        turn_embeddings = embeddings["speakers"].get(speaker, [])
        for turn_embedding in turn_embeddings:
            suggestion = recommend(turn_embedding, profiles)
            predictions.append(
                {
                    "speaker_id": speaker,
                    "truth": person,
                    "enrolled": person in enrolled,
                    "predicted": suggestion["profile_name"] if suggestion else None,
                    "confidence": suggestion["confidence"] if suggestion else None,
                }
            )

    return {
        "meeting": meeting_dir.name,
        "enrolled": sorted(enrolled),
        "strangers": sorted(strangers),
        "predictions": predictions,
    }


def collect_meetings(root: Path, ground_dir: Path) -> list[Path]:
    """Pair every ground/<id>.json with meetings/<id>/embeddings.json."""
    pairs = []
    for ground_file in sorted(ground_dir.glob("*.json")):
        meeting_dir = root / ground_file.stem
        if (meeting_dir / "embeddings.json").exists():
            ground_target = meeting_dir / "ground.json"
            if not ground_target.exists() or ground_target.read_text() != ground_file.read_text():
                meeting_dir.mkdir(parents=True, exist_ok=True)
                ground_target.write_text(ground_file.read_text())
            pairs.append(meeting_dir)
    return pairs


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--meetings",
        type=Path,
        default=Path(__file__).parent / "meetings",
    )
    parser.add_argument(
        "--ground",
        type=Path,
        default=Path(__file__).parent / "ground",
    )
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    meetings = collect_meetings(args.meetings, args.ground)
    if not meetings:
        raise SystemExit(
            f"No meetings with both ground/*.json and {args.meetings}/*/embeddings.json"
        )

    results = [score_meeting(meeting_dir, args.seed) for meeting_dir in meetings]
    for result in results:
        print(f"scored {result['meeting']}  turns={len(result.get('predictions', []))}")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps({"meetings": results}, indent=2))
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
