from app.models.dispute import DisputeCase
from app.models.resolution import AgentCase
from app.services.evidence import CaseFacts

def build_driver_case(case: DisputeCase, facts: CaseFacts) -> AgentCase:
    """Argue the driver's side using the driver's statement and the computed facts.

    TODO (LLM agent): generate the summary and pick the supporting evidence with
    an LLM. It must cite `facts`, never invent trip data, and keep this signature
    and return type so the orchestrator and tests keep working.
    """
    statement = case.driver_statement or "No statement provided."
    return AgentCase(
        agent="driver_advocate",
        summary=f"Driver's position: {statement}",
        evidence=[f"Driver statement: {statement}", *facts.describe()],
    )
