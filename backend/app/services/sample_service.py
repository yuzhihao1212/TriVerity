import json
import logging
from pathlib import Path

from app.models.dispute import DisputeCase
from app.services.policy_service import DATA_ROOT
from app.services.ryde_adapter import to_dispute_case

logger = logging.getLogger(__name__)

def load_samples() -> list[DisputeCase]:
    """Sample disputes from data/disputes plus the organisers' cases in data/organiser, by ID."""
    cases = [
        DisputeCase(**json.loads(path.read_text()))
        for path in (DATA_ROOT / "disputes").glob("*.json")
    ]
    for path in (DATA_ROOT / "organiser").glob("*.json"):
        case = _load_organiser_case(path)
        if case is not None:
            cases.append(case)
    return sorted(cases, key=lambda c: c.dispute_id)

def _load_organiser_case(path: Path) -> DisputeCase | None:
    """Convert one organiser file; a file that can't be read or converted is skipped, not fatal.

    Files in data/organiser are dropped in by hand, so one bad file must not take
    down the sample list (and with it the public demo).
    """
    try:
        return to_dispute_case(json.loads(path.read_text()))
    except Exception as exc:  # malformed JSON, missing keys, bad values or timestamps
        logger.warning("Skipping organiser file %s: %s", path.name, type(exc).__name__)
        return None
