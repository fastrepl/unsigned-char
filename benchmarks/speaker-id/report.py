#!/usr/bin/env python3
"""Print metrics from a score.py results file.

Emits four numbers that must move together — optimizing any one alone is
how regressions ship:

  accuracy              enrolled speakers correctly identified
  unknown_rejection     strangers correctly marked "no match"
  false_accept          strangers confidently labeled as someone else
  calibration_error     mean gap between claimed confidence and actual correctness
"""

import argparse
import json
from pathlib import Path
from statistics import mean


def metrics(results: dict) -> dict:
    turns = [t for m in results["meetings"] for t in m["predictions"]]
    enrolled = [t for t in turns if t["enrolled"]]
    strangers = [t for t in turns if not t["enrolled"]]

    if enrolled:
        correct = sum(1 for t in enrolled if t["predicted"] == t["speaker_truth"])
        missed = sum(1 for t in enrolled if t["predicted"] is None)
        wrong = sum(1 for t in enrolled if t["predicted"] and t["predicted"] != t["speaker_truth"])
        accuracy = correct / len(enrolled)
        miss_rate = missed / len(enrolled)
        confusion_rate = wrong / len(enrolled)
    else:
        accuracy = miss_rate = confusion_rate = 0.0

    if strangers:
        rejected = sum(1 for t in strangers if t["predicted"] is None)
        unknown_rejection = rejected / len(strangers)
        false_accept = 1 - unknown_rejection
    else:
        unknown_rejection = false_accept = 0.0

    confidences = [t for t in enrolled if t["confidence"] is not None]
    if confidences:
        bins = [[] for _ in range(10)]
        for t in confidences:
            idx = min(9, int(t["confidence"] * 10))
            bins[idx].append(1 if t["predicted"] == t["speaker_truth"] else 0)
        per_bin = [
            (i / 10 + 0.05, mean(b)) for i, b in enumerate(bins) if b
        ]
        calibration_error = mean(abs(claimed - actual) for claimed, actual in per_bin)
    else:
        calibration_error = 0.0

    return {
        "n_enrolled_turns": len(enrolled),
        "n_stranger_turns": len(strangers),
        "accuracy": round(accuracy, 4),
        "miss_rate": round(miss_rate, 4),
        "confusion_rate": round(confusion_rate, 4),
        "unknown_rejection": round(unknown_rejection, 4),
        "false_accept": round(false_accept, 4),
        "calibration_error": round(calibration_error, 4),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("results", type=Path)
    parser.add_argument("--baseline", type=Path, help="baseline.json to diff against")
    args = parser.parse_args()

    current = metrics(json.loads(args.results.read_text()))
    print(f"{'metric':20}  {'value':>10}", end="")
    if args.baseline and args.baseline.exists():
        baseline = json.loads(args.baseline.read_text())
        print(f"  {'baseline':>10}  {'delta':>10}")
        for key, value in current.items():
            base = baseline.get(key, 0)
            delta = value - base if isinstance(value, (int, float)) else ""
            delta_str = f"{delta:+.4f}" if isinstance(delta, float) else str(delta)
            print(f"{key:20}  {value:>10}  {base:>10}  {delta_str:>10}")
    else:
        print()
        for key, value in current.items():
            print(f"{key:20}  {value:>10}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
