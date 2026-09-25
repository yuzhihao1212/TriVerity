from app.models.dispute import DisputeCase

def build_rider_case(case: DisputeCase) -> dict:
    """TODO: Replace deterministic scaffold logic with LLM/tool-assisted analysis."""
    evidence = [f"Rider claim: {case.rider_claim}"]

    if case.trip.actual_distance_km and case.trip.expected_distance_km:
        evidence.append(
            f"Distance: expected {case.trip.expected_distance_km} km, "
            f"actual {case.trip.actual_distance_km} km"
        )

    return {
        "agent": "rider_advocate",
        "summary": "Initial rider-side case generated from structured evidence.",
        "evidence": evidence,
        "policy_refs": [],
    }
