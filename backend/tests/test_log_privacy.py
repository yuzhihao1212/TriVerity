"""Logs never carry personal data or model output (finding F9).

A dispute is filled with canary values (phone number, address, coordinates).
Every LLM failure mode is then forced, and the captured log must contain none of
the canaries, while still recording that a fallback happened.
"""

import json
import logging
from pathlib import Path
from unittest.mock import MagicMock, patch

import httpx
import pytest

from app.core.safe_log import safe_reason
from app.models.dispute import DisputeCase
from app.services.orchestrator import resolve_dispute

DISPUTES = Path(__file__).resolve().parents[2] / "data" / "disputes"
PHONE = "CANARY-PHONE-91234567"
ADDRESS = "CANARY-ADDR-ORCHARD"
LATITUDE = "1.2345678"
CANARIES = (PHONE, ADDRESS, LATITUDE, "91234567")


def canary_case() -> DisputeCase:
    payload = json.loads((DISPUTES / "route_deviation_001.json").read_text())
    payload["rider_claim"] = f"Call me on {PHONE}, I live at {ADDRESS}. The driver took a much longer route."
    payload["chat_logs"].append({"sender": "rider", "message": f"okay, I'm at {ADDRESS}, call {PHONE}"})
    payload["trip"]["pickup_lat"] = float(LATITUDE)
    payload["trip"]["pickup_lng"] = 103.8198
    return DisputeCase(**payload)


def http_error(status: int) -> httpx.HTTPStatusError:
    request = httpx.Request("POST", f"https://llm.example/v1/chat/completions?note={PHONE}")
    response = httpx.Response(status, request=request, text=f"error about {ADDRESS}")
    return httpx.HTTPStatusError(f"{status} for {request.url} {ADDRESS}", request=request, response=response)


def raises(exc):
    def fake(*args, **kwargs):
        raise exc
    return fake


def replies(text: str):
    return lambda *args, **kwargs: text


FAILURE_MODES = {
    "unparseable JSON": replies(f"not json {PHONE} {ADDRESS}"),
    "valid JSON, wrong type": replies(json.dumps({
        "summary": [PHONE], "evidence": f"{ADDRESS}", "policy_refs": PHONE,
        "explanation": [ADDRESS], "rider_explanation": {"x": PHONE}, "driver_explanation": 1})),
    "missing keys": replies(json.dumps({"note": f"{PHONE} {ADDRESS}"})),
    "rejected narration": replies(json.dumps({
        "summary": f"Rider at {ADDRESS}", "evidence": [], "policy_refs": [],
        "explanation": f"RD-3 applies. Call ${PHONE[-8:]}",
        "rider_explanation": f"You will be refunded $91234567 at {ADDRESS}.",
        "driver_explanation": f"Rider phone {PHONE}."})),
    "HTTP 401": raises(http_error(401)),
    "HTTP 500": raises(http_error(500)),
    "timeout": raises(httpx.ReadTimeout(f"timed out sending {PHONE}")),
    "unexpected error": raises(RuntimeError(f"boom {ADDRESS} {PHONE}")),
}


@pytest.mark.parametrize("mode", FAILURE_MODES, ids=list(FAILURE_MODES))
def test_failure_logs_carry_no_personal_data(mode, caplog):
    fake = FAILURE_MODES[mode]
    with caplog.at_level(logging.DEBUG), \
         patch("app.agents._advocate.complete", side_effect=fake), \
         patch("app.agents.judge_narration.complete", side_effect=fake):
        result = resolve_dispute(canary_case())
    assert result.explanation_source == "fallback"
    assert "fell back" in caplog.text  # the failure is still visible in the log
    for canary in CANARIES:
        assert canary not in caplog.text, f"{mode}: {canary} leaked into the log"


def test_offline_path_logs_no_personal_data(caplog):
    with caplog.at_level(logging.DEBUG):
        resolve_dispute(canary_case())
    for canary in CANARIES:
        assert canary not in caplog.text


@pytest.mark.parametrize(("exc", "expected"), [
    (http_error(401), "HTTPStatusError (HTTP 401)"),
    (http_error(500), "HTTPStatusError (HTTP 500)"),
    (httpx.ReadTimeout(f"timed out {PHONE}"), "ReadTimeout"),
    (ValueError(f"bad {ADDRESS}"), "ValueError"),
])
def test_safe_reason_keeps_only_class_and_status(exc, expected):
    assert safe_reason(exc) == expected


def test_real_client_error_logged_safely(monkeypatch, caplog):
    """Through the real llm_client: a 401 from the provider is logged as class and status only."""
    from app.services import llm_client
    monkeypatch.setattr(llm_client.settings, "llm_api_key", "test-key-not-logged-0123456789")
    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.post.return_value.raise_for_status.side_effect = http_error(401)
    with caplog.at_level(logging.DEBUG), patch("app.services.llm_client.httpx.Client", return_value=mock_client):
        resolve_dispute(canary_case())
    assert "HTTPStatusError (HTTP 401)" in caplog.text
    assert "test-key-not-logged" not in caplog.text
    for canary in CANARIES:
        assert canary not in caplog.text
