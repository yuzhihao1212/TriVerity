"""The scale-test script: offline, deterministic, and consistent rulings."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

import simulate  # noqa: E402


def test_small_run_is_consistent_and_reports_every_section():
    data = simulate.run(40, seed=3)
    assert data["repeat_same"] == data["checked"] == 40
    # Wording only ever changes a ruling through a FRAUD-1 escalation (a contradicted claim).
    assert data["wording_same"] + data["fraud_only"] == data["checked"]
    text = simulate.report(data, seed=3)
    for heading in ("Resolved automatically", "Why disputes were escalated", "Review queue by triage tier",
                    "At Ryde's scale"):
        assert heading in text


def test_generation_is_deterministic():
    first = [c.model_dump() for c in simulate.generate(20, seed=5)]
    assert first == [c.model_dump() for c in simulate.generate(20, seed=5)]
    assert first != [c.model_dump() for c in simulate.generate(20, seed=6)]
