"""Proposal A: unknown fields on chat messages and histories are dropped, not kept (F2)."""

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.models.dispute import DisputeCase

client = TestClient(app)
DISPUTES = Path(__file__).resolve().parents[2] / "data" / "disputes"


def test_unknown_chat_and_history_fields_are_dropped():
    payload = json.loads((DISPUTES / "route_deviation_001.json").read_text())
    payload["chat_logs"][0]["junk"] = "x" * 1000
    payload["rider_history"]["cancellation_rate"] = 0.4
    case = DisputeCase(**payload)
    assert not case.chat_logs[0].model_extra
    assert not case.rider_history.model_extra
    assert "junk" not in case.model_dump_json()


def test_external_dataset_with_extra_fields_still_resolves():
    payload = json.loads((DISPUTES / "no_show_001.json").read_text())
    payload["driver_history"]["vehicle"] = "SBA1234A"
    assert client.post("/api/disputes/resolve", json=payload).status_code == 200
