"""Deterministic Fraud & Bad-Faith Detection agent.

Scoring is purely from ``PartyHistory`` and the computed ``CaseFacts`` — no LLM,
no heuristics that invent data. The assessment is passed to the Judge, which
may escalate via FRAUD-1. This agent never changes a refund amount or penalises
anyone; it only raises signals.
"""

from __future__ import annotations

from app.models.dispute import DisputeCase, PartyHistory
from app.models.resolution import RiskAssessment
from app.services.evidence import CaseFacts


def _party_signals(
    party: str,
    history: PartyHistory,
    case: DisputeCase,
    facts: CaseFacts,
) -> list[str]:
    """Return human-readable bad-faith signals for one party."""
    signals: list[str] = []

    disputes_90d = history.disputes_last_90d
    account_age = history.account_age_days
    rating = history.rating

    many_disputes_fired = False
    if disputes_90d is not None and disputes_90d >= 3:
        many_disputes_fired = True
        signals.append(
            f"{party} has {disputes_90d} disputes in the last 90 days"
        )

    # Only count the new-account signal when the 3+ disputes signal did not
    # already fire — a high-volume account already explains the risk.
    if (
        not many_disputes_fired
        and account_age is not None
        and account_age < 30
        and disputes_90d is not None
        and disputes_90d >= 1
    ):
        signals.append(
            f"{party}'s account is only {account_age} days old with {disputes_90d} disputes"
        )

    if rating is not None and rating < 4.3:
        signals.append(f"{party}'s rating is {rating:g}, below 4.3")

    # Claims contradicted by facts.
    claim_lower = case.rider_claim.lower() if party == "Rider" else ""
    statement_lower = (case.driver_statement or "").lower() if party == "Driver" else ""

    if party == "Rider":
        # Rider says the driver never arrived / didn't show up, but facts show
        # the driver was within 100 m and messaged the rider.
        if (
            ("never arrived" in claim_lower or "didn't show" in claim_lower or "never came" in claim_lower)
            and facts.driver_distance_from_pickup_m is not None
            and facts.driver_distance_from_pickup_m <= 100
            and facts.driver_contact_attempted
        ):
            signals.append(
                "Rider claims the driver never arrived, but the driver stopped "
                f"within {facts.driver_distance_from_pickup_m:.0f} m and messaged the rider"
            )
    else:
        # Driver says they waited, but facts show wait < 5 min.
        if (
            "waited" in statement_lower
            and facts.driver_wait_min is not None
            and facts.driver_wait_min < 5
        ):
            signals.append(
                f"Driver claims to have waited, but only waited {facts.driver_wait_min:g} min"
            )

    return signals


def _risk_level(n: int) -> str:
    if n >= 2:
        return "high"
    if n == 1:
        return "medium"
    return "low"


def assess_risk(case: DisputeCase, facts: CaseFacts) -> RiskAssessment:
    """Assess bad-faith risk for both parties from history and facts.

    Signals:
    - 3+ disputes in the last 90 days
    - Account under 30 days old with any disputes
    - Rating below 4.3
    - Claims contradicted by computed facts

    Two or more signals for a party = high, one = medium, none = low.
    """
    rider_signals = _party_signals("Rider", case.rider_history, case, facts)
    driver_signals = _party_signals("Driver", case.driver_history, case, facts)

    rider_risk = _risk_level(len(rider_signals))
    driver_risk = _risk_level(len(driver_signals))
    all_signals = rider_signals + driver_signals

    summary_parts = []
    for party, risk, count in (
        ("Rider", rider_risk, len(rider_signals)),
        ("Driver", driver_risk, len(driver_signals)),
    ):
        if count:
            summary_parts.append(f"{party}: {risk} risk ({count} signal{'s' if count > 1 else ''})")
        else:
            summary_parts.append(f"{party}: low risk")
    summary = "; ".join(summary_parts)

    return RiskAssessment(
        rider_risk=rider_risk,  # type: ignore[arg-type]
        driver_risk=driver_risk,  # type: ignore[arg-type]
        signals=all_signals,
        summary=summary,
    )
