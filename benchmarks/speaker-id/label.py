#!/usr/bin/env python3
"""Label speakers in an unsigned Char meeting.

Reads a meeting markdown export, plays a sample turn for each speaker, and
asks who they are. Saves ground-truth labels to ground/<meeting_id>.json.

Label by SPEAKER, not by turn. For a 30-minute meeting with 3 speakers, you
answer 3 questions — not 80.

Works against meetings whose speakers are still unlabeled in the app
(Speaker 1, Speaker 2, ...). If you've already typed human names into the
app, export a fresh meeting before labeling — otherwise the matcher's
guesses leak into ground truth.

Usage:
  python label.py ~/Documents/unsigned\\ char/meeting-abc123.md

Keys:
  <name><enter>     assign this speaker
  ?                 replay a different turn from this speaker
  s                 skip (not labeled — excluded from scoring)
  q                 save and quit
"""

import argparse
import json
import random
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


PREVIEW_SECONDS = 5.0
SPEAKER_TURN_PATTERN = re.compile(
    r"^\s*-\s+(?P<speaker>.+?)\s*:\s+"
    r"(?P<start>\d{1,2}:\d{2})-(?P<end>\d{1,2}:\d{2})\s*$",
    re.MULTILINE,
)


@dataclass
class Turn:
    speaker: str
    start_seconds: float
    end_seconds: float


def parse_clock(value: str) -> float:
    minutes, seconds = value.split(":")
    return int(minutes) * 60 + int(seconds)


def parse_meeting(markdown_path: Path) -> tuple[dict, list[Turn], Path]:
    text = markdown_path.read_text()

    frontmatter = {}
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end > 0:
            for line in text[3:end].splitlines():
                if ":" in line:
                    key, value = line.split(":", 1)
                    frontmatter[key.strip()] = value.strip()
            text = text[end + 4 :]

    audio_path_raw = frontmatter.get("audio_path", "").strip()
    if not audio_path_raw:
        raise SystemExit(f"No audio_path in frontmatter of {markdown_path}")
    audio_path = Path(audio_path_raw).expanduser()
    if not audio_path.is_absolute():
        audio_path = (markdown_path.parent / audio_path).resolve()
    if not audio_path.exists():
        raise SystemExit(f"Audio file not found: {audio_path}")

    turns_section = text.split("## Speaker Turns", 1)
    if len(turns_section) < 2:
        raise SystemExit(f"No Speaker Turns section in {markdown_path}")

    turns = []
    for match in SPEAKER_TURN_PATTERN.finditer(turns_section[1]):
        speaker = match.group("speaker").strip()
        if speaker.lower() == "pipeline":
            continue
        turns.append(
            Turn(
                speaker=speaker,
                start_seconds=parse_clock(match.group("start")),
                end_seconds=parse_clock(match.group("end")),
            )
        )

    if not turns:
        raise SystemExit(f"No diarization turns parsed from {markdown_path}")

    return frontmatter, turns, audio_path


def group_by_speaker(turns: list[Turn]) -> dict[str, list[Turn]]:
    groups: dict[str, list[Turn]] = {}
    for turn in turns:
        groups.setdefault(turn.speaker, []).append(turn)
    for turns_list in groups.values():
        turns_list.sort(key=lambda t: t.end_seconds - t.start_seconds, reverse=True)
    return groups


def play_clip(audio_path: Path, start: float, duration: float) -> None:
    if sys.platform != "darwin":
        print(f"  (auto-play unsupported on {sys.platform}: seek to {start:.1f}s)")
        return
    tmp = Path("/tmp") / f"uchar_label_{start:.0f}.wav"
    try:
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-loglevel",
                "error",
                "-ss",
                str(start),
                "-t",
                str(duration),
                "-i",
                str(audio_path),
                str(tmp),
            ],
            check=True,
        )
    except FileNotFoundError:
        print("  ffmpeg not installed. `brew install ffmpeg` to enable preview.")
        return
    subprocess.run(["afplay", str(tmp)], check=False)
    tmp.unlink(missing_ok=True)


def pick_preview_turn(turns: list[Turn], rng: random.Random) -> Turn:
    long_enough = [t for t in turns if t.end_seconds - t.start_seconds >= 2.0]
    pool = long_enough or turns
    return rng.choice(pool[: max(5, len(pool) // 2)])


def load_existing(path: Path) -> dict:
    if not path.exists():
        return {"speakers": {}}
    data = json.loads(path.read_text())
    data.setdefault("speakers", {})
    return data


def save_labels(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("meeting", type=Path, help="Path to meeting-*.md export")
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).parent / "ground",
        help="Output directory for ground-truth labels",
    )
    parser.add_argument(
        "--preview-seconds",
        type=float,
        default=PREVIEW_SECONDS,
    )
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    frontmatter, turns, audio_path = parse_meeting(args.meeting)
    meeting_id = frontmatter.get("id", args.meeting.stem)
    ground_path = args.out / f"{meeting_id}.json"
    existing = load_existing(ground_path)
    rng = random.Random(args.seed)

    groups = group_by_speaker(turns)
    print(f"meeting: {meeting_id}")
    print(f"audio:   {audio_path}")
    print(f"speakers: {len(groups)}  turns: {len(turns)}")
    print()

    for speaker_id, speaker_turns in groups.items():
        if speaker_id in existing["speakers"]:
            print(f"{speaker_id}: already labeled as '{existing['speakers'][speaker_id]}' — skipping")
            continue

        total = sum(t.end_seconds - t.start_seconds for t in speaker_turns)
        print(f"— {speaker_id} —  {len(speaker_turns)} turns, {total:.0f}s total")

        while True:
            preview = pick_preview_turn(speaker_turns, rng)
            duration = min(args.preview_seconds, preview.end_seconds - preview.start_seconds)
            print(f"  sample: {preview.start_seconds:.0f}s–{preview.end_seconds:.0f}s")
            play_clip(audio_path, preview.start_seconds, duration)

            try:
                response = input("  who is this? > ").strip()
            except EOFError:
                response = "q"

            if response == "?":
                continue
            if response == "s":
                label = None
                break
            if response == "q":
                save_labels(ground_path, existing)
                print(f"saved {ground_path}")
                return 0
            if not response:
                print("  (type a name, '?' to replay, 's' to skip, 'q' to quit)")
                continue

            label = response
            break

        if label is not None:
            existing["speakers"][speaker_id] = label
            save_labels(ground_path, existing)
            print(f"  → {label}")
        else:
            print("  → skipped")

    save_labels(ground_path, existing)
    labeled = sum(1 for v in existing["speakers"].values() if v)
    print(f"\ndone. {labeled}/{len(groups)} speakers labeled → {ground_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
