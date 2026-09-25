from app.models.dispute import DisputeCase

def build_driver_case(case: DisputeCase) -> dict:
    """TODO: Replace deterministic scaffold logic with LLM/tool-assisted analysis."""
    evidence = []
    if case.driver_statement:
        evidence.append(f"Driver statement: {case.driver_statement}")

    return {
        "agent": "driver_advocate",
        "summary": "Initial driver-side case generated from available evidence.",
        "evidence": evidence,
        "policy_refs": [],
    }
