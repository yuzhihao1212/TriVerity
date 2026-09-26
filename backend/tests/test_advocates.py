"""Tests for the LLM-backed advocate agents.

Each test mocks ``llm_client.complete`` so no network call is made and no
API key is required.
"""

import json
from unittest.mock import patch

import httpx
import pytest
from pydantic import ValidationError

from app.agents.driver_agent import build_driver_case
from app.agents.rider_agent import build_rider_case
from app.models.dispute import DisputeCase
from app.services.evidence import compute_facts
from app.services.policy_service import cite, load_policy

# A simple route-deviation case used across tests.
_CASE_DICT = {
    "dispute_id": "T1",
    "type": "route_deviation",
    "rider_claim": "The driver took a much longer route and I was overcharged.",
    "driver_statement": "I diverted because the normal road was congested.",
    "trip": {
        "expected_distance_km": 10.2,
        "actual_distance_km": 14.7,
        "expected_duration_min": 22,
        "actual_duration_min": 35,
    },
    "fare": {"expected": 18.5, "actual": 24.8},
    "chat_logs": [],
    "rider_history": {},
    "driver_history": {},
}


@pytest.fixture
def case() -> DisputeCase:
    return DisputeCase(**_CASE_DICT)


@pytest.fixture
def facts(case: DisputeCase):
    return compute_facts(case)


@pytest.fixture
def section(case: DisputeCase) -> dict:
    return load_policy()[case.type]


# -- Helpers to build LLM responses -------------------------------------------

def _llm_json(summary: str, evidence: list[str], refs: list[str]) -> str:
    return json.dumps({"summary": summary, "evidence": evidence, "policy_refs": refs})


def _llm_fenced_json(summary: str, evidence: list[str], refs: list[str]) -> str:
    return "```json\n" + _llm_json(summary, evidence, refs) + "\n```"


# -- Rider tests --------------------------------------------------------------

def test_rider_valid_json(case, facts, section):
    """When complete() returns clean JSON, the agent uses it directly."""
    with patch("app.agents._advocate.complete", return_value=_llm_json(
        "Rider was overcharged due to detour.",
        ["Distance was +44% longer"],
        ["RD-3: A route more than 15% longer than expected that also took longer is treated as an unjustified detour; the fare above the expected fare is refunded."],
    )):
        result = build_rider_case(case, facts)

    assert result.agent == "rider_advocate"
    assert result.source == "llm"
    assert result.summary == "Rider was overcharged due to detour."
    assert "Distance was +44% longer" in result.evidence
    assert result.policy_refs == [cite(section, "RD-3")]


def test_rider_fenced_json(case, facts, section):
    """When the model wraps JSON in ```json fences, parsing still works."""
    with patch("app.agents._advocate.complete", return_value=_llm_fenced_json(
        "Fenced response summary.",
        ["Fenced evidence"],
        ["RD-3: some text"],
    )):
        result = build_rider_case(case, facts)

    assert result.source == "llm"
    assert result.summary == "Fenced response summary."
    assert "Fenced evidence" in result.evidence
    assert result.policy_refs == [cite(section, "RD-3")]


def test_rider_invented_rule_id_dropped(case, facts, section):
    """Rule IDs not in the policy section are silently dropped."""
    with patch("app.agents._advocate.complete", return_value=_llm_json(
        "Summary",
        ["Evidence"],
        [
            "RD-3: real text",
            "FAKE-99: invented rule",
            "RD-1: another real rule",
        ],
    )):
        result = build_rider_case(case, facts)

    assert result.source == "llm"
    assert result.policy_refs == [cite(section, "RD-3"), cite(section, "RD-1")]


def test_rider_http_error_falls_back(case, facts):
    """When complete() raises httpx.HTTPError, the deterministic fallback is used."""
    with patch("app.agents._advocate.complete", side_effect=httpx.ConnectError("boom")):
        result = build_rider_case(case, facts)

    assert result.agent == "rider_advocate"
    assert result.source == "fallback"
    assert result.summary.startswith("Rider disputes the charge:")
    assert result.policy_refs == []
    assert any("Rider claim:" in e for e in result.evidence)


def test_rider_offline_placeholder_falls_back(case, facts):
    """When no API key is set, the offline placeholder triggers the fallback."""
    from app.services.llm_client import OFFLINE_PLACEHOLDER
    with patch("app.agents._advocate.complete", return_value=OFFLINE_PLACEHOLDER):
        result = build_rider_case(case, facts)

    assert result.agent == "rider_advocate"
    assert result.source == "fallback"
    assert result.policy_refs == []


def test_rider_bad_json_falls_back(case, facts):
    """Unparseable JSON triggers the deterministic fallback."""
    with patch("app.agents._advocate.complete", return_value="not json at all"):
        result = build_rider_case(case, facts)

    assert result.source == "fallback"
    assert result.policy_refs == []
    assert result.summary.startswith("Rider disputes the charge:")


def test_rider_validation_error_falls_back(case, facts):
    """When the parsed JSON fails pydantic validation (e.g. missing summary), fall back."""
    with patch("app.agents._advocate.complete", return_value=json.dumps({
        "evidence": ["some evidence"],
        "policy_refs": [],
    })):
        result = build_rider_case(case, facts)

    assert result.source == "fallback"
    assert result.summary.startswith("Rider disputes the charge:")
    assert result.policy_refs == []


def test_rider_evidence_is_string_falls_back(case, facts):
    """When evidence is a string instead of a list (AttributeError), fall back."""
    with patch("app.agents._advocate.complete", return_value=json.dumps({
        "summary": "Summary",
        "evidence": "should be a list",
        "policy_refs": [],
    })):
        result = build_rider_case(case, facts)

    assert result.source == "fallback"
    assert result.summary.startswith("Rider disputes the charge:")


def test_rider_non_string_policy_refs_skipped(case, facts, section):
    """Non-string policy refs (dicts, numbers) are skipped, valid ones kept."""
    with patch("app.agents._advocate.complete", return_value=json.dumps({
        "summary": "Summary",
        "evidence": ["Evidence"],
        "policy_refs": [
            "RD-3: real text",
            {"rule": "FAKE-1", "text": "object ref"},
            42,
            "RD-1: another real rule",
            None,
        ],
    })):
        result = build_rider_case(case, facts)

    assert result.source == "llm"
    assert result.policy_refs == [cite(section, "RD-3"), cite(section, "RD-1")]


def test_rider_generic_exception_falls_back(case, facts):
    """When complete() raises an unexpected exception, fall back."""
    with patch("app.agents._advocate.complete", side_effect=RuntimeError("unexpected")):
        result = build_rider_case(case, facts)

    assert result.source == "fallback"
    assert result.summary.startswith("Rider disputes the charge:")
    assert result.policy_refs == []


# -- Driver tests --------------------------------------------------------------

def test_driver_valid_json(case, facts, section):
    with patch("app.agents._advocate.complete", return_value=_llm_json(
        "Driver had a legitimate traffic reason.",
        ["Driver statement provided"],
        ["RD-2: A longer route that did not take longer than expected is consistent with avoiding congestion; no refund is due."],
    )):
        result = build_driver_case(case, facts)

    assert result.agent == "driver_advocate"
    assert result.source == "llm"
    assert result.summary == "Driver had a legitimate traffic reason."
    assert result.policy_refs == [cite(section, "RD-2")]


def test_driver_fenced_json(case, facts, section):
    with patch("app.agents._advocate.complete", return_value=_llm_fenced_json(
        "Driver fenced summary.",
        ["Driver evidence"],
        ["RD-2: text"],
    )):
        result = build_driver_case(case, facts)

    assert result.source == "llm"
    assert result.summary == "Driver fenced summary."
    assert result.policy_refs == [cite(section, "RD-2")]


def test_driver_invented_rule_id_dropped(case, facts, section):
    with patch("app.agents._advocate.complete", return_value=_llm_json(
        "Summary",
        ["Evidence"],
        ["RD-1: real", "NOSHOW-99: fake"],
    )):
        result = build_driver_case(case, facts)

    assert result.source == "llm"
    assert result.policy_refs == [cite(section, "RD-1")]


def test_driver_http_error_falls_back(case, facts):
    with patch("app.agents._advocate.complete", side_effect=httpx.ConnectError("boom")):
        result = build_driver_case(case, facts)

    assert result.agent == "driver_advocate"
    assert result.source == "fallback"
    assert result.summary.startswith("Driver's position:")
    assert result.policy_refs == []
    assert any("Driver statement:" in e for e in result.evidence)


def test_driver_offline_placeholder_falls_back(case, facts):
    from app.services.llm_client import OFFLINE_PLACEHOLDER
    with patch("app.agents._advocate.complete", return_value=OFFLINE_PLACEHOLDER):
        result = build_driver_case(case, facts)

    assert result.agent == "driver_advocate"
    assert result.source == "fallback"
    assert result.policy_refs == []


def test_driver_bad_json_falls_back(case, facts):
    with patch("app.agents._advocate.complete", return_value="{ broken"):
        result = build_driver_case(case, facts)

    assert result.source == "fallback"
    assert result.policy_refs == []
    assert result.summary.startswith("Driver's position:")


def test_driver_validation_error_falls_back(case, facts):
    """When the parsed JSON fails pydantic validation (e.g. missing summary), fall back."""
    with patch("app.agents._advocate.complete", return_value=json.dumps({
        "evidence": ["some evidence"],
        "policy_refs": [],
    })):
        result = build_driver_case(case, facts)

    assert result.source == "fallback"
    assert result.summary.startswith("Driver's position:")


def test_driver_evidence_is_string_falls_back(case, facts):
    """When evidence is a string instead of a list (AttributeError), fall back."""
    with patch("app.agents._advocate.complete", return_value=json.dumps({
        "summary": "Summary",
        "evidence": "should be a list",
        "policy_refs": [],
    })):
        result = build_driver_case(case, facts)

    assert result.source == "fallback"
    assert result.summary.startswith("Driver's position:")


def test_driver_non_string_policy_refs_skipped(case, facts, section):
    """Non-string policy refs (dicts, numbers) are skipped, valid ones kept."""
    with patch("app.agents._advocate.complete", return_value=json.dumps({
        "summary": "Summary",
        "evidence": ["Evidence"],
        "policy_refs": [
            "RD-2: real",
            {"rule": "FAKE"},
            99,
            "RD-1: another real",
        ],
    })):
        result = build_driver_case(case, facts)

    assert result.source == "llm"
    assert result.policy_refs == [cite(section, "RD-2"), cite(section, "RD-1")]


def test_driver_generic_exception_falls_back(case, facts):
    """When complete() raises an unexpected exception, fall back."""
    with patch("app.agents._advocate.complete", side_effect=ValueError("unexpected")):
        result = build_driver_case(case, facts)

    assert result.source == "fallback"
    assert result.summary.startswith("Driver's position:")
    assert result.policy_refs == []


def test_rider_fallback_logs_warning(case, facts, caplog):
    """A warning is logged with the reason when the fallback path is taken."""
    import logging
    with patch("app.agents._advocate.complete", side_effect=httpx.ConnectError("boom")):
        with caplog.at_level(logging.WARNING, logger="app.agents._advocate"):
            build_rider_case(case, facts)

    assert any("fell back" in r.message and "rider_advocate" in r.message for r in caplog.records)


def test_orchestrator_log_includes_source(case):
    """The orchestrator's agent_log messages include the source tag."""
    from app.services.orchestrator import resolve_dispute
    rider_log = resolve_dispute(case).agent_log
    advocate_msgs = [e.message for e in rider_log if e.agent in ("rider_advocate", "driver_advocate")]
    assert all("[fallback]" in m for m in advocate_msgs)
