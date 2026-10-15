"""Scale test: generate synthetic disputes and run the full pipeline on them, offline.

Rulings, escalations, triage and precedent checks come from code, not the LLM, so they can
be measured at scale without spending tokens. This script forces offline mode (no API key):
the advocates and explanations use their deterministic fallbacks, which don't affect the
ruling. Cost and time per dispute with the LLM come from the live evaluation.

It also checks consistency: the same facts always give the same ruling, and rewording the
rider's claim and the driver's statement never changes it.

Usage (from the repo root, with the backend venv active):
    python scripts/simulate.py                 # 500 disputes, seed 7
    python scripts/simulate.py --n 2000 --seed 1 > docs/simulation.md
"""
import argparse
import logging
import os
import random
import sys
import time
from collections import Counter
from pathlib import Path

os.environ["LLM_API_KEY"] = ""   # offline: never spend tokens, whatever backend/.env says
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.models.dispute import DisputeCase, PartyHistory  # noqa: E402
from app.services.orchestrator import resolve_dispute  # noqa: E402

# Live measurements (docs/evaluation.md, README) and Hy3 prices from the TokenHub console.
TOKENS_PER_DISPUTE = 8_000
INPUT_SHARE = 0.85
PRICE_IN, PRICE_OUT = 0.132 / 1e6, 0.528 / 1e6   # USD per token
SECONDS_PER_DISPUTE = 16
DAILY_VOLUME = 5_000

ROUTE_CLAIMS = ["The driver took a much longer route and I was overcharged.",
                "My fare was higher than quoted because of a detour.",
                "Why did the driver go the long way? I want a refund."]
NO_SHOW_CLAIMS = ["The driver never came but I was charged a no-show fee.",
                  "I waited at the pickup point and the driver didn't show up.",
                  "I was charged a cancellation fee unfairly."]
REWORDED = "Please check this trip; I think the charge is wrong."   # same facts, different words


def history(rng: random.Random) -> dict:
    roll = rng.random()
    if roll < 0.85:      # typical account
        return {"account_age_days": rng.randint(90, 2000), "rating": round(rng.uniform(4.5, 5.0), 1),
                "completed_trips": rng.randint(20, 3000), "disputes_last_90d": rng.choice([0, 0, 0, 1])}
    if roll < 0.95:      # one warning sign
        return {"account_age_days": rng.randint(30, 600), "rating": round(rng.uniform(4.0, 4.3), 1),
                "completed_trips": rng.randint(5, 300), "disputes_last_90d": rng.randint(0, 2)}
    return {"account_age_days": rng.randint(5, 25), "rating": round(rng.uniform(3.5, 4.1), 1),  # risky
            "completed_trips": rng.randint(1, 30), "disputes_last_90d": rng.randint(3, 6)}


def route_case(i: int, rng: random.Random) -> dict:
    expected_km = round(rng.uniform(4, 20), 1)
    excess = rng.uniform(0, 0.15) if rng.random() < 0.45 else rng.uniform(0.15, 0.6)
    slower = rng.uniform(0.05, 0.7) if excess > 0.15 and rng.random() < 0.7 else rng.uniform(-0.3, 0.1)
    expected_min = rng.randint(10, 45)
    fare = round(expected_km * rng.uniform(1.4, 2.0), 2)
    trip = {"expected_distance_km": expected_km, "actual_distance_km": round(expected_km * (1 + excess), 2),
            "expected_duration_min": expected_min, "actual_duration_min": round(expected_min * (1 + slower), 1)}
    if rng.random() < 0.04:          # missing data
        trip.pop("actual_distance_km")
    return {"type": "route_deviation", "rider_claim": rng.choice(ROUTE_CLAIMS),
            "driver_statement": "I followed the road conditions.", "trip": trip,
            "fare": {"expected": fare, "actual": round(fare * (1 + excess * 0.8), 2)},
            "chat_logs": [{"sender": "rider", "message": "Why this way?"}]}


def no_show_case(i: int, rng: random.Random) -> dict:
    pickup = (1.30 + rng.uniform(0, 0.1), 103.80 + rng.uniform(0, 0.1))
    metres = rng.uniform(0, 100) if rng.random() < 0.7 else rng.uniform(100, 600)
    contact = rng.random() < 0.8
    trip = {"pickup_lat": round(pickup[0], 6), "pickup_lng": round(pickup[1], 6),
            "driver_arrival_lat": round(pickup[0] + metres / 111_000, 6), "driver_arrival_lng": round(pickup[1], 6),
            "driver_wait_min": round(rng.uniform(0, 12), 1)}
    if rng.random() < 0.04:          # missing data
        trip.pop("driver_wait_min")
    chat = [{"sender": "driver", "message": "I'm at the pickup point."}] if contact else []
    return {"type": "no_show_charge", "rider_claim": rng.choice(NO_SHOW_CLAIMS),
            "driver_statement": "I waited at the pickup point.", "trip": trip,
            "fare": {"cancellation_fee": round(rng.uniform(3, 6), 2)}, "chat_logs": chat}


def generate(n: int, seed: int) -> list[DisputeCase]:
    rng = random.Random(seed)
    cases = []
    for i in range(n):
        data = route_case(i, rng) if rng.random() < 0.5 else no_show_case(i, rng)
        if rng.random() < 0.03:      # a threat in the chat
            data["chat_logs"].append({"sender": "driver", "message": "Watch yourself or else."})
        cases.append(DisputeCase(dispute_id=f"SIM-{i:04d}", rider_history=history(rng),
                                 driver_history=history(rng), **data))
    return cases


def key(result) -> tuple:
    return result.decision, result.refund_amount, tuple(sorted(result.policy_refs))


def without_fraud(result) -> tuple:
    """The ruling with any FRAUD-1 escalation set aside."""
    return tuple(sorted(ref.split(":", 1)[0] for ref in result.policy_refs if not ref.startswith("FRAUD-1")))


def run(n: int, seed: int) -> dict:
    cases = generate(n, seed)
    start = time.perf_counter()
    results = [resolve_dispute(c) for c in cases]
    elapsed = time.perf_counter() - start
    sample = cases[: min(100, n)]
    repeat_same = sum(key(resolve_dispute(c)) == key(r) for c, r in zip(sample, results))
    reworded = [c.model_copy(update={"rider_claim": REWORDED, "driver_statement": REWORDED}) for c in sample]
    again = [resolve_dispute(c) for c in reworded]
    wording_same = sum(key(a) == key(r) for a, r in zip(again, results))
    # A ruling may change with wording only through FRAUD-1: a claim the facts contradict ("the driver
    # never came" when the GPS shows them at the pickup) is a bad-faith signal by design.
    fraud_only = sum(key(a) != key(r) and without_fraud(a) == without_fraud(r) for a, r in zip(again, results))
    # Fairness: who the parties are (history) may only ever escalate, through FRAUD-1; the policy
    # decision itself must come from the trip facts alone.
    blank = [resolve_dispute(c.model_copy(update={"rider_history": PartyHistory(), "driver_history": PartyHistory()}))
             for c in cases]
    swapped = [resolve_dispute(c.model_copy(update={"rider_history": c.driver_history, "driver_history": c.rider_history}))
               for c in cases]
    return {"cases": cases, "results": results, "elapsed": elapsed, "checked": len(sample),
            "repeat_same": repeat_same, "wording_same": wording_same, "fraud_only": fraud_only,
            "history_blind_same": sum(without_fraud(b) == without_fraud(r) for b, r in zip(blank, results)),
            "history_swap_same": sum(without_fraud(s) == without_fraud(r) for s, r in zip(swapped, results))}


def report(data: dict, seed: int) -> str:
    cases, results = data["cases"], data["results"]
    n = len(results)
    pct = lambda k: f"{k / n:.0%}"   # noqa: E731
    rules = Counter(ref.split(":", 1)[0] for r in results for ref in r.policy_refs)
    review = [r for r in results if r.decision == "needs_review"]
    reasons = Counter(rule for r in review for rule in ("SAFE-1", "FRAUD-1", "RD-4", "NS-4", "ESC-1", "PREC-1")
                      if any(ref.startswith(rule) for ref in r.policy_refs))
    tiers = Counter(r.triage.tier for r in review)
    by_type = {t: Counter(r.decision for c, r in zip(cases, results) if c.type == t)
               for t in ("route_deviation", "no_show_charge")}
    refunds = [r.refund_amount for r in results if r.decision in ("partial_refund", "full_refund") and r.refund_amount]
    consistency = Counter(r.precedents.consistency for r in results)
    cost = TOKENS_PER_DISPUTE * (INPUT_SHARE * PRICE_IN + (1 - INPUT_SHARE) * PRICE_OUT)
    lines = [
        f"# Scale test: {n} synthetic disputes (seed {seed})",
        "",
        "Generated by `scripts/simulate.py` and resolved by the full pipeline **offline**: rulings, escalations,",
        "triage and precedent checks come from code, so no tokens are spent. Synthetic data; these show how the",
        "rules behave across many cases, not production results.",
        "",
        "Generated mix: half route deviations (45% within the 15% tolerance; detours mostly slower), half",
        "no-shows (70% of drivers within 100 m, 80% contacted the rider); 4% with missing data; 3% with a threat",
        "in chat; party histories 85% typical, 10% with one warning sign, 5% risky. The escalation rate depends",
        "on this mix.",
        "",
        "| Measure | Result |",
        "|---|---|",
        f"| Resolved automatically (no human needed) | **{n - len(review)} of {n} ({pct(n - len(review))})** |",
        f"| Escalated to a human reviewer | {len(review)} ({pct(len(review))}) |",
        f"| Same facts, same ruling (re-run) | {data['repeat_same']} / {data['checked']} |",
        f"| Reworded claim and statement, same ruling | {data['wording_same']} / {data['checked']}"
        + (f"; the other {data['fraud_only']} differ only by a FRAUD-1 escalation: the original claim was "
           "contradicted by the GPS facts, a bad-faith signal by design" if data["fraud_only"] else "")
        + (f"; {data['checked'] - data['wording_same'] - data['fraud_only']} changed for another reason"
           if data["checked"] - data["wording_same"] - data["fraud_only"] else "") + " |",
        f"| Consistent with the closest past rulings | {consistency['consistent']} of {n} "
        f"({pct(consistency['consistent'])}); mixed {consistency['mixed']}, no close precedent "
        f"{consistency['no_precedent']}, reviewers disagreed {consistency['overridden']} |",
        f"| Refunds | {len(refunds)} disputes, average ${sum(refunds) / max(len(refunds), 1):.2f} |",
        f"| Pipeline time without the LLM | {data['elapsed'] / n * 1000:.1f} ms per dispute |",
        "",
        "**Decisions by dispute type**",
        "",
        "| Type | " + " | ".join(("partial_refund", "full_refund", "no_action", "needs_review")) + " |",
        "|---|---|---|---|---|",
    ]
    for t, counts in by_type.items():
        lines.append(f"| {t} ({sum(counts.values())}) | "
                     + " | ".join(str(counts[d]) for d in ("partial_refund", "full_refund", "no_action", "needs_review")) + " |")
    lines += ["", "**Fairness: does who the parties are change the decision?**", "",
              "Party history (account age, rating, past disputes) feeds only the fraud detector, which can escalate a",
              "dispute to a human (FRAUD-1) but never decide it. The policy decision should depend on the trip facts alone:",
              "", "| Check | Policy decision unchanged |", "|---|---|",
              f"| Both parties' history removed | {data['history_blind_same']} / {n} |",
              f"| Rider's and driver's history swapped | {data['history_swap_same']} / {n} |", ""]
    groups = {"Rider account under 90 days": lambda c: (c.rider_history.account_age_days or 0) < 90,
              "Rider account 90 days or more": lambda c: (c.rider_history.account_age_days or 0) >= 90,
              "Rider rating below 4.5": lambda c: (c.rider_history.rating or 5) < 4.5,
              "Rider rating 4.5 or above": lambda c: (c.rider_history.rating or 5) >= 4.5}
    lines += ["Refund rate by rider group, counting only disputes the rules decided (escalations aside). Differences",
              "come from the trip facts each group happened to get, since history never enters the decision; small groups",
              "are noisy (new accounts are mostly risky in this mix, so most were escalated):", "",
              "| Rider group | Decided automatically | Refunded |", "|---|---|---|"]
    for name, member in groups.items():
        decided = [r for c, r in zip(cases, results) if member(c) and r.decision != "needs_review"]
        refunded = sum(r.decision in ("partial_refund", "full_refund") for r in decided)
        lines.append(f"| {name} | {len(decided)} | {refunded / max(len(decided), 1):.0%} |")
    lines += ["", "**Why disputes were escalated** (a dispute can have several reasons)", "",
              "| Reason | Disputes |", "|---|---|"]
    names = {"SAFE-1": "Threat in chat (SAFE-1)", "FRAUD-1": "High bad-faith risk (FRAUD-1)",
             "RD-4": "Route data missing (RD-4)", "NS-4": "Arrival or wait data missing (NS-4)",
             "ESC-1": "Confidence below 60% (ESC-1)", "PREC-1": "Reviewers decided similar cases differently (PREC-1)"}
    lines += [f"| {names[rule]} | {count} |" for rule, count in reasons.most_common()]
    lines += ["", "**Review queue by triage tier**", "", "| Tier | Disputes |", "|---|---|"]
    lines += [f"| {tier} | {tiers[tier]} |" for tier in ("safety", "high", "standard", "low") if tiers[tier]]
    lines += ["", "**Rules applied**", "", "| Rule | Disputes |", "|---|---|"]
    lines += [f"| {rule} | {count} |" for rule, count in sorted(rules.items())]
    daily_cost = cost * DAILY_VOLUME
    auto = (n - len(review)) / n
    lines += [
        "",
        f"## At Ryde's scale (illustrative: {DAILY_VOLUME:,} disputes a day)",
        "",
        f"Live measurements: about {TOKENS_PER_DISPUTE:,} tokens and {SECONDS_PER_DISPUTE} s per dispute with Hy3 "
        f"(${PRICE_IN * 1e6:.3f} / ${PRICE_OUT * 1e6:.3f} per million input/output tokens).",
        "",
        "| | Today (brief) | TriVerity |",
        "|---|---|---|",
        f"| Time to a ruling | 24–72 hours | about {SECONDS_PER_DISPUTE} seconds |",
        f"| Disputes needing a human | all {DAILY_VOLUME:,} | about {round(DAILY_VOLUME * (1 - auto)):,} ({1 - auto:.0%}), "
        "ordered by triage tier |",
        f"| AI cost | — | about ${cost:.4f} per dispute, ${daily_cost:,.2f} a day |",
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--n", type=int, default=500, help="number of disputes (default 500)")
    parser.add_argument("--seed", type=int, default=7, help="random seed (default 7)")
    args = parser.parse_args()
    if args.n < 1:
        parser.error("--n must be at least 1")
    logging.disable(logging.WARNING)   # every offline step logs its fallback; not useful here
    print(report(run(args.n, args.seed), args.seed))


if __name__ == "__main__":
    main()
