from app.models.dispute import DisputeCase
from app.models.resolution import AgentCase
from app.services.evidence import CaseFacts

def build_rider_case(case: DisputeCase, facts: CaseFacts) -> AgentCase:
    """Argue the rider's side using the rider's claim and the computed facts.

    TODO (LLM agent): generate the summary and pick the supporting evidence with
    an LLM. It must cite `facts`, never invent trip data, and keep this signature
    and return type so the orchestrator and tests keep working.
    """
    return AgentCase(
        agent="rider_advocate",
        summary=f"Rider disputes the charge: {case.rider_claim}",
        evidence=[f"Rider claim: {case.rider_claim}", *facts.describe()],
    )
