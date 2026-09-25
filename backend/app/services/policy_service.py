from pathlib import Path
import json

DATA_ROOT = Path(__file__).resolve().parents[3] / "data"

def load_policy(filename: str = "ryde_mock_policy.json") -> dict:
    path = DATA_ROOT / "policies" / filename
    return json.loads(path.read_text())
