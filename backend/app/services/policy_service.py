from functools import cache
from pathlib import Path
import json

DATA_ROOT = Path(__file__).resolve().parents[3] / "data"

@cache
def load_policy(filename: str = "ryde_mock_policy.json") -> dict:
    path = DATA_ROOT / "policies" / filename
    return json.loads(path.read_text())

def cite(section: dict, rule_id: str) -> str:
    """Format a policy rule as a citation, e.g. 'RD-3: A route more than ...'."""
    return f"{rule_id}: {section['rules'][rule_id]}"
