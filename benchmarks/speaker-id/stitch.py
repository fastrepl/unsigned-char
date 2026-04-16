#!/usr/bin/env python3
"""Stitch labeled speaker clips into synthetic meetings with ground truth.

Input: a corpus directory where each subdirectory is a speaker id
       containing that speaker's audio clips.

    corpus/
      speaker_001/
        clip_a.wav
        clip_b.wav
      speaker_002/
        ...

Output: a fixtures directory with one meeting per subdir — audio.wav plus
        ground.json listing the ordered turns (speaker, start, end).
"""

import argparse
import json
import random
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
import soundfile as sf


TARGET_SR = 16000
MIN_TURN_S = 2.0
MAX_TURN_S = 8.0
PAUSE_MIN_S = 0.2
PAUSE_MAX_S = 1.2


@dataclass
class Turn:
    speaker: str
    start_seconds: float
    end_seconds: float
    source_clip: str


def load_clip(path: Path) -> np.ndarray:
    audio, sr = sf.read(path, dtype="float32", always_2d=False)
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    if sr != TARGET_SR:
        ratio = TARGET_SR / sr
        new_len = int(round(len(audio) * ratio))
        audio = np.interp(
            np.linspace(0, len(audio) - 1, new_len),
            np.arange(len(audio)),
            audio,
        ).astype(np.float32)
    return audio


def trim_to_duration(audio: np.ndarray, rng: random.Random) -> np.ndarray:
    target_s = rng.uniform(MIN_TURN_S, MAX_TURN_S)
    target_samples = int(target_s * TARGET_SR)
    if len(audio) <= target_samples:
        return audio
    start = rng.randint(0, len(audio) - target_samples)
    return audio[start : start + target_samples]


def load_corpus(root: Path, min_clips: int) -> dict[str, list[Path]]:
    speakers = {}
    for speaker_dir in sorted(root.iterdir()):
        if not speaker_dir.is_dir():
            continue
        clips = sorted(
            p for p in speaker_dir.rglob("*") if p.suffix.lower() in {".wav", ".flac", ".mp3"}
        )
        if len(clips) >= min_clips:
            speakers[speaker_dir.name] = clips
    if not speakers:
        raise SystemExit(f"No speakers with >={min_clips} clips found in {root}")
    return speakers


def build_meeting(
    meeting_dir: Path,
    speakers: dict[str, list[Path]],
    speaker_ids: list[str],
    rng: random.Random,
    turns_per_meeting: int,
) -> None:
    meeting_dir.mkdir(parents=True, exist_ok=True)
    audio_chunks: list[np.ndarray] = []
    turns: list[Turn] = []
    cursor_s = 0.0
    last_speaker: str | None = None

    for _ in range(turns_per_meeting):
        # avoid same speaker twice in a row when more than one is in the meeting
        candidates = [s for s in speaker_ids if s != last_speaker] or speaker_ids
        speaker = rng.choice(candidates)
        clip_path = rng.choice(speakers[speaker])
        clip = trim_to_duration(load_clip(clip_path), rng)
        if len(clip) == 0:
            continue

        duration_s = len(clip) / TARGET_SR
        turns.append(
            Turn(
                speaker=speaker,
                start_seconds=round(cursor_s, 3),
                end_seconds=round(cursor_s + duration_s, 3),
                source_clip=str(clip_path),
            )
        )
        audio_chunks.append(clip)
        cursor_s += duration_s

        pause_s = rng.uniform(PAUSE_MIN_S, PAUSE_MAX_S)
        audio_chunks.append(np.zeros(int(pause_s * TARGET_SR), dtype=np.float32))
        cursor_s += pause_s
        last_speaker = speaker

    audio = np.concatenate(audio_chunks)
    sf.write(meeting_dir / "audio.wav", audio, TARGET_SR, subtype="PCM_16")

    ground = {
        "sample_rate": TARGET_SR,
        "duration_seconds": round(cursor_s, 3),
        "speakers": sorted(set(speaker_ids)),
        "turns": [asdict(turn) for turn in turns],
    }
    (meeting_dir / "ground.json").write_text(json.dumps(ground, indent=2))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus", type=Path, required=True, help="Directory of speaker subdirs")
    parser.add_argument("--out", type=Path, required=True, help="Output fixtures directory")
    parser.add_argument("--num-meetings", type=int, default=50)
    parser.add_argument("--speakers-per-meeting", type=int, default=3)
    parser.add_argument("--turns-per-meeting", type=int, default=20)
    parser.add_argument("--min-clips-per-speaker", type=int, default=8)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    rng = random.Random(args.seed)
    speakers = load_corpus(args.corpus, args.min_clips_per_speaker)
    speaker_pool = list(speakers.keys())
    if len(speaker_pool) < args.speakers_per_meeting:
        raise SystemExit(
            f"Need >={args.speakers_per_meeting} speakers, corpus has {len(speaker_pool)}"
        )

    args.out.mkdir(parents=True, exist_ok=True)

    for index in range(args.num_meetings):
        chosen = rng.sample(speaker_pool, args.speakers_per_meeting)
        meeting_dir = args.out / f"meeting_{index:04d}"
        build_meeting(meeting_dir, speakers, chosen, rng, args.turns_per_meeting)
        print(f"built {meeting_dir.name}: speakers={chosen}")

    manifest = {
        "seed": args.seed,
        "num_meetings": args.num_meetings,
        "speakers_per_meeting": args.speakers_per_meeting,
        "turns_per_meeting": args.turns_per_meeting,
        "corpus": str(args.corpus),
    }
    (args.out / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"wrote {args.num_meetings} meetings to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
