"""LLM narration of the Judge's ruling.

The decision, amount and cited policy are fixed by the rules in judge_agent.
The model only explains them, answering both advocates. Any narration that
contradicts the ruling (wrong amount, uncited rule, a promised refund on an
escalated case) is rejected and the template wording is kept.
"""

import json
import logging
import re

from app.models.dispute import DisputeCase
from app.models.resolution import AgentCase, Ruling
from app.services.llm_client import OFFLINE_PLACEHOLDER, _strip_fences, complete

logger = logging.getLogger(__name__)

SYSTEM = (
    "You are the impartial Judge in a ride-hailing dispute resolution system. "
    "The ruling you are given is FINAL: it was decided by company policy rules from "
    "verified trip data. Do not change the decision, the amount, or the policy applied. "
    "Your job is to explain it.\n"
    "Write a JSON object with three strings:\n"
    '- "explanation": 3-5 sentences for the case record, neutral in tone. State the '
    "decision and the policy rule(s) applied by rule ID, the decisive facts, and respond "
    "to each advocate's main argument: say which argument the facts support and why the "
    "other was not decisive.\n"
    '- "rider_explanation": 2-3 plain, respectful sentences addressed to the rider as "you": '
    "the outcome, the main reason, and what happens next.\n"
    '- "driver_explanation": the same, addressed to the driver. The rider filed this dispute, '
    'so call it "the rider\'s dispute", never "your dispute".\n'
    "Rules: use only the facts given. Describe decisions in plain words (e.g. \"the fare stands\", "
    "\"a partial refund\"), never internal codes such as no_action or needs_review. Write money exactly as given, with $ and two decimals. "
    "Only mention rule IDs listed in the ruling. Do not state consequences the ruling "
    "does not give, such as who pays, penalties or account actions. If the decision is needs_review, say a human "
    "reviewer will decide and do not promise any refund or outcome.\n"
    "Never mention bad-faith or fraud risk, or either party's account or dispute history, in the "
    "rider_explanation or driver_explanation. These are internal signals only.\n"
    "Respond with the JSON object only."
)

_AMOUNT_RE = re.compile(r"\$\s?(\d+(?:\.\d{1,2})?)")
_RULE_ID_RE = re.compile(r"\b([A-Z]{2,5}-\d+)\b")
_PROMISE_RE = re.compile(r"\b(will|shall) (be refunded|receive a refund|get a refund)\b", re.I)


def narrate(case: DisputeCase, ruling: Ruling, rider_case: AgentCase, driver_case: AgentCase) -> Ruling:
    """Return ``ruling`` with LLM-written explanations, or unchanged on any failure."""
    try:
        raw = complete(SYSTEM, _user_prompt(case, ruling, rider_case, driver_case))
    except Exception as exc:
        return _keep_templates(ruling, f"complete() raised {type(exc).__name__}: {exc}")
    if raw == OFFLINE_PLACEHOLDER:
        return ruling

    try:
        parsed = json.loads(_strip_fences(raw))
        texts = {k: parsed[k] for k in ("explanation", "rider_explanation", "driver_explanation")}
    except (json.JSONDecodeError, KeyError, TypeError) as exc:
        return _keep_templates(ruling, f"unparseable reply: {type(exc).__name__}")

    problem = _check(texts, case, ruling)
    if problem:
        return _keep_templates(ruling, problem)
    return ruling.model_copy(update={**texts, "explanation_source": "llm"})


def _user_prompt(case: DisputeCase, ruling: Ruling, rider_case: AgentCase, driver_case: AgentCase) -> str:
    return json.dumps({
        "dispute_type": case.type,
        "rider_claim": case.rider_claim,
        "driver_statement": case.driver_statement,
        "facts": ruling.judge_evidence,
        "ruling": {
            "decision": ruling.decision,
            "recommended_action": ruling.recommended_action,
            "refund_amount": ruling.refund_amount,
            "confidence": ruling.confidence,
            "rule_based_reasoning": ruling.explanation,
            "policy_applied": ruling.policy_refs,
        },
        "rider_advocate": {"argument": rider_case.summary, "policy_cited": rider_case.policy_refs},
        "driver_advocate": {"argument": driver_case.summary, "policy_cited": driver_case.policy_refs},
    })


def _check(texts: dict, case: DisputeCase, ruling: Ruling) -> str | None:
    """Return why the narration contradicts the ruling, or None if it is consistent."""
    if not all(isinstance(t, str) and t.strip() for t in texts.values()):
        return "empty or non-string explanation"
    joined = " ".join(texts.values())

    fare = case.fare
    known = [ruling.refund_amount, fare.expected, fare.actual, fare.cancellation_fee, fare.promo_discount]
    if fare.expected is not None and fare.actual is not None:
        known.append(abs(fare.actual - fare.expected))
    allowed = {round(a, 2) for a in known if a is not None}
    for amount in _AMOUNT_RE.findall(joined):
        if round(float(amount), 2) not in allowed:
            return f"mentions amount ${amount} not in the case"

    cited = {ref.split(":")[0] for ref in ruling.policy_refs}
    uncited = set(_RULE_ID_RE.findall(joined)) - cited
    if uncited:
        return f"mentions rules not applied: {sorted(uncited)}"

    if ruling.decision in ("partial_refund", "full_refund") and ruling.refund_amount is not None:
        if f"${ruling.refund_amount:.2f}" not in texts["rider_explanation"]:
            return "rider explanation omits the refund amount"
    if ruling.decision == "needs_review" and _PROMISE_RE.search(joined):
        return "promises a refund on an escalated case"

    # Fraud/bad-faith signals and party history must never appear in the
    # messages to either party — they are internal evidence only.
    _FORBIDDEN_PARTY_RE = re.compile(
        r"\b(fraud|bad[-\s]?faith|bad faith|history|disputes?\s+in)\b", re.I
    )
    for key in ("rider_explanation", "driver_explanation"):
        if _FORBIDDEN_PARTY_RE.search(texts[key]):
            return f"{key} mentions fraud, bad-faith or party history"
    return None


def _keep_templates(ruling: Ruling, reason: str) -> Ruling:
    logger.warning("Judge narration fell back to templates: %s", reason)
    return ruling
