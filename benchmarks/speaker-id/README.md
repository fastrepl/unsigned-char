# Speaker ID Benchmark Harness

A reproducible harness for measuring speaker identification quality in unsigned Char.

## Why

Speaker ID in `src/store.ts` uses hand-tuned thresholds with no way to measure impact of changes. This harness builds labeled "meetings" from public speaker-verification corpora and scores unsigned Char's matching logic against ground truth — so you can tell whether a tweak actually helps.

## Pipeline

```
labeled clips (VoxCeleb / LibriSpeech / your own)
     ↓  stitch.py
synthetic meetings with ground-truth turn labels
     ↓  score.py  (runs TS scoring via bun)
predictions vs ground truth
     ↓  report.py
accuracy, precision/recall, unknown-speaker rejection, calibration
```

## Metrics

Four numbers we track together — optimizing only the first is how you ship regressions:

- **Identification accuracy** — % of enrolled speakers correctly identified
- **Unknown rejection rate** — % of unseen speakers correctly marked as "no match"
- **False-accept rate** — unseen speakers confidently labeled as someone else
- **Calibration error** — gap between claimed confidence and actual accuracy

## Tiers

| Tier | Source | Purpose | Runtime |
|------|--------|---------|---------|
| unit | Synthetic (VCTK/LibriSpeech) | Fast iteration | seconds |
| integration | AMI Meeting Corpus | Real meeting dynamics | minutes |
| reality | Dogfood meetings | Actual Char conditions | minutes |

## Usage

```
cd benchmarks/speaker-id
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

python stitch.py --corpus vctk --out fixtures/unit --num-meetings 50
python score.py --fixtures fixtures/unit --out results/unit.json
python report.py results/unit.json
```

Baseline numbers go in `baseline.json`. Any PR that changes speaker ID logic must report deltas against baseline.

## Directory layout

```
benchmarks/speaker-id/
├── README.md            # this file
├── requirements.txt     # pinned deps
├── stitch.py            # build synthetic meetings from labeled clips
├── score.py             # run matching logic against fixtures
├── report.py            # print metrics table
├── fixtures/            # generated meetings (gitignored)
├── results/             # metric runs (gitignored)
└── baseline.json        # reference numbers, committed
```

## Notes

Fixtures and results are gitignored — they're large and reproducible from the seed. `baseline.json` is the only tracked output and represents current main's performance.
