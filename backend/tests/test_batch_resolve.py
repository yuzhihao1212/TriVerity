"""The queue's "Run all": several sample disputes in one request.

Samples only, the same per-case path as a single resolve, one hit against the
per-minute rate limit for the whole batch, and one per case against the daily limit.
"""

from fastapi.testclient import TestClient

from app.core import limits
from app.main import app
from app.services.sample_service import load_samples

client = TestClient(app)
SAMPLE_IDS = [c.dispute_id for c in load_samples()]


def batch(ids, ai="off"):
    return client.post(f"/api/disputes/resolve/batch?ai={ai}", json={"dispute_ids": ids})


def test_resolves_every_sample_with_autonomy():
    response = batch(SAMPLE_IDS)
    assert response.status_code == 200
    items = response.json()
    assert [item["dispute_id"] for item in items] == SAMPLE_IDS
    for item in items:
        assert item["error"] is None
        assert "autonomy" in item["result"]
        assert "triage" in item["result"]


def test_safety_case_is_never_auto_resolved():
    items = {item["dispute_id"]: item for item in batch(SAMPLE_IDS).json()}
    assert items["D007"]["result"]["autonomy"]["eligible"] is False


def test_whole_batch_counts_once_against_the_rate_limit():
    assert batch(SAMPLE_IDS).status_code == 200
    # The batch used one; PER_IP_PER_MINUTE - 1 more single requests still pass, then the next 429s.
    sample = load_samples()[0].model_dump(mode="json")
    for _ in range(limits.PER_IP_PER_MINUTE - 1):
        assert client.post("/api/disputes/resolve?ai=off", json=sample).status_code == 200
    assert client.post("/api/disputes/resolve?ai=off", json=sample).status_code == 429


def test_unknown_id_is_refused():
    response = batch(["D001", "NOT-A-SAMPLE"])
    assert response.status_code == 404


def test_empty_or_oversized_batch_is_refused():
    assert batch([]).status_code == 422
    assert batch(["D001"] * (limits.MAX_BATCH_RESOLVE + 1)).status_code == 422


def test_duplicate_ids_resolve_once():
    items = batch(["D001", "D001"]).json()
    assert [item["dispute_id"] for item in items] == ["D001"]


def test_each_case_counts_against_the_daily_limit(monkeypatch):
    # A batch can't do more in a day than the same cases run one by one.
    monkeypatch.setattr(limits, "PER_IP_PER_MINUTE", 100)
    monkeypatch.setattr(limits, "PER_IP_PER_DAY", 12)
    assert batch(SAMPLE_IDS).status_code == 200            # 9 of 12 used
    refused = batch(SAMPLE_IDS[:4])                         # 9 + 4 > 12
    assert refused.status_code == 429
    assert int(refused.headers["Retry-After"]) >= 1
    assert batch(SAMPLE_IDS[:3]).status_code == 200        # exactly 12: still allowed
    assert batch(SAMPLE_IDS[:1]).status_code == 429


def test_a_refused_batch_does_not_count(monkeypatch):
    monkeypatch.setattr(limits, "PER_IP_PER_MINUTE", 100)
    monkeypatch.setattr(limits, "PER_IP_PER_DAY", 5)
    assert batch(SAMPLE_IDS).status_code == 429             # 9 > 5: nothing recorded
    assert batch(SAMPLE_IDS[:5]).status_code == 200
