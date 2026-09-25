import json

from app.models.dispute import DisputeCase
from app.models.resolution import AgentCase
from app.services.evidence import CaseFacts
from app.services.llm_client import OFFLINE_PLACEHOLDER, complete
from app.services.policy_service import cite, load_policy

_SYSTEM = (
    "You are the Rider Advocate in a ride-hailing dispute resolution system.\n"
    "Your job: argue the rider's side using ONLY the provided case facts and the "
    "rider's own claim. You must NEVER invent or contradict trip data (distances, "
    "durations, fares, locations, wait times). Cite policy rule IDs verbatim from "
    "the provided policy section when they support the rider's position.\n"
    "Respond with a JSON object: {\"summary\": str, \"evidence\": [str], "
    "\"policy_refs\": [str]}. Each policy_ref must start with the rule ID "
    "followed by \": \" and the rule text."
)

def _build_user(case: DisputeCase, facts: CaseFacts, section: dict) -> str:
    return json.dumps({
        "rider_claim": case.rider_claim,
        "dispute_type": case.type,
        "facts": facts.describe(),
        "policy_rules": section.get("rules", {}),
    })

def _fallback(case: DisputeCase, facts: CaseFacts, section: dict) -> AgentCase:
    """Deterministic fallback used when the LLM is offline or returns bad JSON."""
    rule_ids = list(section.get("rules", {}))
    refs = [cite(section, rid) for rid in rule_ids]
    return AgentCase(
        agent="rider_advocate",
        summary=f"Rider disputes the charge: {case.rider_claim}",
        evidence=[f"Rider claim: {case.rider_claim}", *facts.describe()],
        policy_refs=refs,
    )

def build_rider_case(case: DisputeCase, facts: CaseFacts) -> AgentCase:
    """Argue the rider's side using the rider's claim and the computed facts.

    Calls llm_client.complete to generate the summary, evidence and policy
    citations. When the LLM is offline (no API key) or returns unparseable
    output, falls back to a deterministic case so the orchestrator and tests
    keep working.
    """
    policy = load_policy()
    section = policy.get(case.type, policy.get("route_deviation", {}))

    raw = complete(_SYSTEM, _build_user(case, facts, section))
    if raw == OFFLINE_PLACEHOLDER:
        return _fallback(case, facts, section)

    try:
        parsed = json.loads(raw)
        return AgentCase(
            agent="rider_advocate",
            summary=parsed["summary"],
            evidence=parsed.get("evidence", []),
            policy_refs=parsed.get("policy_refs", []),
        )
    except (json.JSONDecodeError, KeyError, TypeError):
        return _fallback(case, facts, section)
