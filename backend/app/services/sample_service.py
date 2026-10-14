import json

from app.models.dispute import DisputeCase
from app.services.policy_service import DATA_ROOT
from app.services.ryde_adapter import to_dispute_case

def load_samples() -> list[DisputeCase]:
    """Sample disputes from data/disputes plus the organisers' cases in data/organiser, by ID."""
    cases = [
        DisputeCase(**json.loads(path.read_text()))
        for path in (DATA_ROOT / "disputes").glob("*.json")
    ]
    cases += [
        to_dispute_case(json.loads(path.read_text()))
        for path in (DATA_ROOT / "organiser").glob("*.json")
    ]
    return sorted(cases, key=lambda c: c.dispute_id)
