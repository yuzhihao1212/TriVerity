"""The orchestrator's progress hook and step timings (for live progress in the UI)."""

from app.services.orchestrator import resolve_dispute
from app.services.sample_service import load_samples

D001 = next(c for c in load_samples() if c.dispute_id == "D001")


def test_on_step_receives_every_step_in_order_as_it_finishes():
    seen = []
    result = resolve_dispute(D001, on_step=seen.append)
    assert [e.agent for e in seen] == [e.agent for e in result.agent_log]
    assert [e.step for e in seen] == list(range(1, len(seen) + 1))


def test_every_step_has_a_start_time_and_duration():
    for entry in resolve_dispute(D001).agent_log:
        assert entry.started_at is not None and entry.started_at.tzinfo is not None
        assert entry.duration_ms is not None and entry.duration_ms >= 0


def test_a_failing_callback_never_breaks_the_ruling():
    def broken(entry):
        raise RuntimeError("UI went away")
    assert resolve_dispute(D001, on_step=broken).decision == "partial_refund"
