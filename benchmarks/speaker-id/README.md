# Speaker ID Benchmark — dogfood edition

A harness for measuring speaker identification quality against **your own meetings**. No synthetic corpora, no stitching — just label the meetings you already have and optimize against the conditions Char actually ships in.

## Why this shape

Speaker ID in `src/store.ts` uses hand-tuned thresholds with no way to measure impact of changes. Academic corpora (VoxCeleb, AMI) measure different conditions than what Char users hit — read speech, studio mics, celebrity interviews.

Your last 20 Char meetings are the right benchmark. You know who was there. You remember which identifications went wrong. An evening of labeling is faster than a week of synthetic harness plumbing that ends up measuring the wrong thing.

## Pipeline

```
meeting-*.md (your exported meetings)
     ↓  label.py   (play turn, type name, once per speaker)
ground/<meeting_id>.json
     ↓  extract_embeddings.py   (TODO — Swift bridge)
meetings/<meeting_id>/embeddings.json
     ↓  score.py
results/<name>.json
     ↓  report.py
accuracy · unknown_rejection · false_accept · calibration_error
```

## Metrics

Four numbers tracked together. Optimizing only the first is how you ship regressions:

- **Identification accuracy** — enrolled speakers correctly identified
- **Unknown rejection rate** — unseen speakers correctly marked "no match"
- **False-accept rate** — unseen speakers confidently mislabeled as someone else
- **Calibration error** — gap between claimed confidence and actual correctness

For each meeting, half the labeled humans become "enrolled profiles" and the other half are "strangers" the matcher should reject. This keeps the 0.04 margin gate honest.

## Labeling

```
cd benchmarks/speaker-id
brew install ffmpeg  # for auto-preview on macOS
python3 label.py ~/Documents/unsigned\ char/meeting-abc123.md
```

The labeler picks one random long turn per speaker, plays 5 seconds, asks who they are. A 3-speaker meeting takes about a minute. Aim for 20 meetings — that gives you meaningful numbers without losing your evening.

**Important:** only label meetings whose speakers are still unlabeled in the app (`Speaker 1`, `Speaker 2` in the export). If you've already assigned human names inside Char, the matcher's guesses will leak into the markdown and contaminate ground truth. Either export a fresh meeting before labeling, or switch to the upcoming `uchar meetings export --raw` command once it lands.

## Scoring

```
python3 score.py --out results/latest.json
python3 report.py results/latest.json --baseline baseline.json
```

## Directory layout

```
benchmarks/speaker-id/
├── README.md       # this file
├── label.py        # interactive labeler
├── score.py        # runs store.ts matching logic against embeddings + ground
├── report.py       # prints metrics table with baseline delta
├── ground/         # gitignored — your labels, your voices
├── meetings/       # gitignored — per-meeting embeddings.json
├── results/        # gitignored — metric runs
└── baseline.json   # committed — main-branch numbers, no audio in it
```

## What's missing

- **`extract_embeddings.py`** — the Swift speaker-embedding extractor needs a CLI entry point. Until that lands, `embeddings.json` doesn't get generated. Tracked in #3.
- **`baseline.json`** — populated once the pipeline runs end-to-end on real meetings.

## Note on privacy

`ground/` and `meetings/` are gitignored on purpose. These directories hold your voice samples. Never commit them. `baseline.json` contains only aggregate numbers and is safe to share.
