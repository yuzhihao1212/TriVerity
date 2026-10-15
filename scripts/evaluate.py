"""Score every sample dispute against its expected ruling in data/expected_rulings.json.

Measures, per sample and overall:
- ruling: decision, refund, policy rules and triage tier match the expected label
- citations: advocate rules that support the other side ("wrong side") or neither side
- AI rate: how often each agent's output came from the LLM rather than the fallback
- precedents: whether the ruling agreed with the closest past rulings (Policy & Precedent agent)

Resolves in-process, so the API rate limits don't apply, but every run spends real
LLM tokens (about 5,400 per resolve when both rebuttals run) against DAILY_TOKEN_BUDGET. Use preset 1 in
backend/.env.example for eval runs. With no API key everything is Fallback.

Usage (from the repo root, with the backend venv active):
    python scripts/evaluate.py                     # every sample once
    python scripts/evaluate.py --runs 5 --ids D007,D008
    python scripts/evaluate.py --runs 3 > docs/evaluation-run.md
"""
import argparse
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.models.resolution import Resolution  # noqa: E402
from app.services.budget import budget  # noqa: E402
from app.services.orchestrator import resolve_dispute  # noqa: E402
from app.services.sample_service import load_samples  # noqa: E402

EXPECTED_PATH = ROOT / "data" / "expected_rulings.json"
AGENTS = ("rider", "driver", "rider_rebuttal", "driver_rebuttal", "judge")


def load_expected() -> dict[str, dict]:
    labels = json.loads(EXPECTED_PATH.read_text())
    labels.pop("_note", None)
    return labels


def rule_ids(refs: list[str]) -> list[str]:
    """'NS-1: A no-show fee…' -> 'NS-1'."""
    return [ref.split(":", 1)[0].strip() for ref in refs]


def score(result: Resolution, expected: dict) -> dict:
    """Compare one resolution with its label. Pure, so tests can check it offline."""
    refund = result.refund_amount
    refund_ok = (refund is None) == (expected["refund"] is None) and (
        refund is None or abs(refund - expected["refund"]) < 0.005
    )
    row = {
        "decision_ok": result.decision == expected["decision"],
        "refund_ok": refund_ok,
        "rules_ok": set(rule_ids(result.policy_refs)) == set(expected["policy_refs"]),
        "tier_ok": result.triage.tier == expected.get("tier"),
        "source": {
            "rider": result.rider_case.source,
            "driver": result.driver_case.source,
            "rider_rebuttal": result.rider_case.rebuttal.source if result.rider_case.rebuttal else None,
            "driver_rebuttal": result.driver_case.rebuttal.source if result.driver_case.rebuttal else None,
            "judge": result.explanation_source,
        },
        "wrong_side": [],
        "neither_side": [],
        "precedents": result.precedents.consistency,
    }
    row["ruling_ok"] = row["decision_ok"] and row["refund_ok"] and row["rules_ok"] and row["tier_ok"]
    supports = expected["supports"]
    for party, other, case in (
        ("rider", "driver", result.rider_case),
        ("driver", "rider", result.driver_case),
    ):
        for rule in rule_ids(case.policy_refs):
            if rule in supports[other]:
                row["wrong_side"].append(f"{party} cited {rule}")
            elif rule not in supports[party]:
                row["neither_side"].append(f"{party} cited {rule}")
    return row


def evaluate(ids: list[str] | None, runs: int) -> dict[str, list[dict]]:
    labels = load_expected()
    samples = load_samples()
    if ids is not None:
        ids = [dispute_id.strip() for dispute_id in ids]
        unknown = set(ids) - {case.dispute_id for case in samples}
        if unknown:
            names = ", ".join(repr(name) for name in sorted(unknown))
            raise SystemExit(f"Unknown dispute ID(s): {names}. Use IDs from the sample disputes.")
        samples = [case for case in samples if case.dispute_id in ids]
    results: dict[str, list[dict]] = {}
    for case in samples:
        if case.dispute_id not in labels:
            raise SystemExit(f"No expected ruling for {case.dispute_id} in {EXPECTED_PATH.name}")
        results[case.dispute_id] = []
        for _ in range(runs):
            try:
                row = score(resolve_dispute(case), labels[case.dispute_id])
            except Exception as exc:  # one failed run shouldn't hide the rest
                row = {"error": f"{type(exc).__name__}: {exc}"}
            results[case.dispute_id].append(row)
            print(f"  {case.dispute_id} run {len(results[case.dispute_id])}/{runs}", file=sys.stderr)
    return results


def report(results: dict[str, list[dict]], runs: int) -> str:
    lines = [
        f"# Evaluation: {len(results)} samples x {runs} run(s)",
        "",
        "| Sample | Ruling correct | Rider AI | Driver AI | Rider rebuttal AI | Driver rebuttal AI | Judge AI | Wrong-side citations | Other off-target citations | Precedents |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    totals = Counter()
    for dispute_id, rows in results.items():
        ok = [r for r in rows if "error" not in r]
        errors = len(rows) - len(ok)
        ai = {a: sum(r["source"].get(a) == "llm" for r in ok) for a in AGENTS}
        wrong = [c for r in ok for c in r["wrong_side"]]
        neither = [c for r in ok for c in r["neither_side"]]
        correct = sum(r["ruling_ok"] for r in ok)
        totals.update(consistent=sum(r.get("precedents") == "consistent" for r in ok))
        totals.update(runs=len(rows), errors=errors, correct=correct, wrong=len(wrong),
                      neither=len(neither), **{f"ai_{a}": ai[a] for a in AGENTS})
        ruling_cell = f"{correct}/{len(rows)}" + (f" ({errors} errored)" if errors else "")
        lines.append(
            f"| {dispute_id} | {ruling_cell} | "
            + " | ".join(f"{ai[a]}/{len(rows)}" for a in AGENTS)
            + f" | {', '.join(sorted(set(wrong))) or 0} | {', '.join(sorted(set(neither))) or 0}"
            + f" | {', '.join(sorted({r.get('precedents') or '-' for r in ok})) or '-'} |"
        )
    n = totals["runs"] or 1
    lines += [
        "",
        f"- Rulings correct: {totals['correct']}/{totals['runs']}",
        f"- AI rate: rider {totals['ai_rider'] / n:.0%}, driver {totals['ai_driver'] / n:.0%}, "
        f"rider rebuttal {totals['ai_rider_rebuttal'] / n:.0%}, "
        f"driver rebuttal {totals['ai_driver_rebuttal'] / n:.0%}, "
        f"judge {totals['ai_judge'] / n:.0%}",
        f"- Wrong-side citations: {totals['wrong']} across {2 * totals['runs']} advocate cases",
        f"- Other off-target citations (rule supports neither side): {totals['neither']}",
        f"- Consistent with the closest precedents: {totals['consistent']}/{totals['runs']}",
    ]
    if totals["errors"]:
        lines.append(f"- Errored runs: {totals['errors']}")
    if budget.exhausted():
        lines.append("- WARNING: the daily token budget ran out during this run; later results are Fallback.")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--runs", type=int, default=1, help="runs per sample (default 1)")
    parser.add_argument("--ids", help="comma-separated dispute IDs (default: all samples)")
    args = parser.parse_args()
    if args.runs < 1:
        parser.error("--runs must be at least 1")
    results = evaluate(args.ids.split(",") if args.ids is not None else None, args.runs)
    print(report(results, args.runs))
    # Rulings are rule-based, so any miss is a regression worth failing on.
    if any(not r.get("ruling_ok") for rows in results.values() for r in rows):
        sys.exit(1)


if __name__ == "__main__":
    main()
