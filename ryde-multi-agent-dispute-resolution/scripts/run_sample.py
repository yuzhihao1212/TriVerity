import json
from pathlib import Path

# Placeholder helper script.
# Recommended next step: import backend orchestrator and execute a sample JSON case.

ROOT = Path(__file__).resolve().parents[1]
sample = ROOT / "data" / "disputes" / "route_deviation_001.json"

print(json.loads(sample.read_text()))
