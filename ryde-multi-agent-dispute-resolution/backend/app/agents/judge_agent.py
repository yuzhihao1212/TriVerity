from app.models.dispute import DisputeCase

def judge(case: DisputeCase, rider_case: dict, driver_case: dict) -> dict:
    """Temporary deterministic judge.

    Replace with policy-grounded LLM reasoning once the data contracts and
    evaluation rules are stable.
    """
    return {
        "decision": "needs_review",
        "recommended_action": "Escalate to a human reviewer until judge logic is implemented.",
        "confidence": 0.50,
        "explanation": "Project scaffold only. Judge decision logic is not implemented yet.",
        "judge_evidence": [],
    }
