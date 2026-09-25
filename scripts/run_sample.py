"""Run every sample dispute through the pipeline and print the rulings.

Usage (from the repo root, with the backend venv active):
    python scripts/run_sample.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.models.dispute import DisputeCase  # noqa: E402
from app.services.orchestrator import resolve_dispute  # noqa: E402

for path in sorted((ROOT / "data" / "disputes").glob("*.json")):
    result = resolve_dispute(DisputeCase(**json.loads(path.read_text())))
    print(f"{path.name}: {result.decision} ({result.confidence:.0%})")
    print(f"  {result.recommended_action}")
    print(f"  {result.explanation}")
