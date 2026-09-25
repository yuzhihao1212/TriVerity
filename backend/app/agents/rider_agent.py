import json

from app.models.dispute import DisputeCase
from app.models.resolution import AgentCase
from app.services.evidence import CaseFacts
from app.agents._advocate import build_advocate_case, _policy_section

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


def build_rider_case(case: DisputeCase, facts: CaseFacts) -> AgentCase:
    """Argue the rider's side using the rider's claim and the computed facts.

    Calls ``llm_client.complete`` to generate the summary, evidence and policy
    citations. Falls back to a deterministic case (no policy refs) when the
    LLM is offline, raises an HTTP error, or returns unparseable JSON.
    """
    section = _policy_section(case)
    user = json.dumps({
        "rider_claim": case.rider_claim,
        "dispute_type": case.type,
        "facts": facts.describe(),
        "policy_rules": section.get("rules", {}),
    })
    return build_advocate_case(
        agent="rider_advocate",
        system=_SYSTEM,
        user=user,
        claim_line=f"Rider claim: {case.rider_claim}",
        fallback_summary=f"Rider disputes the charge: {case.rider_claim}",
        facts=facts,
        section=section,
    )
