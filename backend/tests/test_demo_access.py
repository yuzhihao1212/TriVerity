"""Proposal D (auth tier T2): access codes let invited judges resolve their own disputes.

In public demo mode a request without a code resolves samples only; a valid
X-Demo-Key resolves the caller's own case, rate-limited per code rather than
per IP (judges may share one venue IP); a wrong code gets 401.
"""

import json
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.core import limits
from app.core.config import settings
from app.main import create_app

DISPUTES = Path(__file__).resolve().parents[2] / "data" / "disputes"
RESOLVE = "/api/disputes/resolve"
CODE_A = "judge-a-0123456789abcdef"
CODE_B = "judge-b-fedcba9876543210"


class FakeClock:
    def __init__(self):
        self.now = 1_000_000.0

    def __call__(self):
        return self.now


def custom_case() -> dict:
    """A judge's own dispute: a new ID and their own fare."""
    payload = json.loads((DISPUTES / "route_deviation_001.json").read_text())
    payload["dispute_id"] = "JUDGE-1"
    payload["fare"]["actual"] = 30.0  # expected 18.50
    return payload


@pytest.fixture
def demo(monkeypatch):
    from app.api.routes import disputes
    from app.core import rate_limit
    monkeypatch.setattr(settings, "public_demo", True)
    monkeypatch.setattr(settings, "demo_access_codes", f"{CODE_A}, {CODE_B}")
    monkeypatch.setattr(rate_limit.limiter, "clock", FakeClock())
    disputes._demo_cache.clear()
    yield TestClient(create_app())
    disputes._demo_cache.clear()


def test_valid_code_resolves_the_judges_own_dispute(demo):
    response = demo.post(RESOLVE, json=custom_case(), headers={"X-Demo-Key": CODE_A})
    assert response.status_code == 200
    assert response.json()["refund_amount"] == pytest.approx(11.50)


def test_without_a_code_only_samples_resolve(demo):
    assert demo.post(RESOLVE, json=custom_case()).status_code == 404


def test_wrong_code_rejected(demo):
    response = demo.post(RESOLVE, json=custom_case(), headers={"X-Demo-Key": CODE_A + "x"})
    assert response.status_code == 401
    assert CODE_A not in response.text


def test_code_compared_in_constant_time(demo):
    import secrets
    with patch("app.core.access.secrets.compare_digest", wraps=secrets.compare_digest) as spy:
        demo.post(RESOLVE, json=custom_case(), headers={"X-Demo-Key": CODE_B})
    assert spy.call_count == 2  # every configured code is compared, no early exit


def test_short_codes_are_never_accepted(demo, monkeypatch):
    monkeypatch.setattr(settings, "demo_access_codes", "short")
    assert demo.post(RESOLVE, json=custom_case(), headers={"X-Demo-Key": "short"}).status_code == 401


def test_no_codes_configured_means_no_custom_disputes(demo, monkeypatch):
    monkeypatch.setattr(settings, "demo_access_codes", "")
    assert demo.post(RESOLVE, json=custom_case(), headers={"X-Demo-Key": CODE_A}).status_code == 401


def test_judges_sharing_one_ip_are_limited_per_code(demo):
    for _ in range(limits.PER_CODE_PER_MINUTE):
        assert demo.post(RESOLVE, json=custom_case(), headers={"X-Demo-Key": CODE_A}).status_code == 200
    assert demo.post(RESOLVE, json=custom_case(), headers={"X-Demo-Key": CODE_A}).status_code == 429
    # Same IP, other judge's code: unaffected.
    assert demo.post(RESOLVE, json=custom_case(), headers={"X-Demo-Key": CODE_B}).status_code == 200


def test_per_code_daily_quota(demo):
    from app.core import rate_limit
    clock = rate_limit.limiter.clock
    for _ in range(limits.PER_CODE_PER_DAY):
        assert demo.post(RESOLVE, json=custom_case(), headers={"X-Demo-Key": CODE_A}).status_code == 200
        clock.now += 61
    response = demo.post(RESOLVE, json=custom_case(), headers={"X-Demo-Key": CODE_A})
    assert response.status_code == 429
    assert int(response.headers["Retry-After"]) > 60


def test_custom_disputes_still_validated(demo):
    payload = custom_case()
    payload["fare"]["actual"] = 1e9
    assert demo.post(RESOLVE, json=payload, headers={"X-Demo-Key": CODE_A}).status_code == 422
