import json

from app.models.dispute import DisputeCase
from app.models.resolution import AgentCase
from app.services.evidence import CaseFacts
from app.agents._advocate import _policy_section, advocate_system_prompt, build_advocate_case
from app.services.text_safety import sanitise

_SYSTEM = advocate_system_prompt("driver", own_account="statement")


def build_driver_case(case: DisputeCase, facts: CaseFacts) -> AgentCase:
    """Argue the driver's side using the driver's statement and the computed facts.

    Calls ``llm_client.complete`` to generate the summary, evidence and policy
    citations. Falls back to a deterministic case (no policy refs) when the
    LLM is offline, raises an HTTP error, or returns unparseable JSON.
    """
    section = _policy_section(case)
    statement = sanitise(case.driver_statement or "") or "No statement provided."
    user = json.dumps({
        "driver_statement": statement,
        "dispute_type": case.type,
        "facts": facts.describe(),
        "policy_rules": section.get("rules", {}),
    })
    return build_advocate_case(
        agent="driver_advocate",
        system=_SYSTEM,
        user=user,
        claim_line=f"Driver statement: {statement}",
        fallback_summary=f"Driver's position: {statement}",
        facts=facts,
        section=section,
    )
