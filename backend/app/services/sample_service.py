import json

from app.models.dispute import DisputeCase
from app.services.policy_service import DATA_ROOT

def load_samples() -> list[DisputeCase]:
    """Sample disputes from data/disputes, ordered by dispute ID."""
    cases = [
        DisputeCase(**json.loads(path.read_text()))
        for path in (DATA_ROOT / "disputes").glob("*.json")
    ]
    return sorted(cases, key=lambda c: c.dispute_id)
