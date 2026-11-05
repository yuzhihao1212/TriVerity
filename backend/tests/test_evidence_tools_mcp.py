"""Phase 2 of the MCP plan: the Evidence agent calls its tools through the evidence MCP server.

The point of these tests: EVIDENCE_TOOLS=mcp gives the same evidence and the same rulings as
the default in-process tools, and every way the MCP path can fail falls back to local calls
with the same answers.
"""

import asyncio
import json
import re
import socket
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

pytest.importorskip("mcp")

from mcp.server.mcpserver.exceptions import ToolError  # noqa: E402

from app.agents.evidence_agent import collect_evidence, collect_for_both  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.main import app  # noqa: E402
from app.mcp_servers import evidence as mcp_server  # noqa: E402
from app.services import evidence_tools  # noqa: E402
from app.services.data_sources import DataSources  # noqa: E402
from app.services.evidence import compute_facts  # noqa: E402
from app.services.orchestrator import resolve_dispute  # noqa: E402
from app.services.sample_service import load_samples  # noqa: E402

BACKEND = Path(__file__).resolve().parents[1]
DISPUTES = BACKEND.parent / "data" / "disputes"
SAMPLES = load_samples()
BY_ID = {c.dispute_id: c for c in SAMPLES}
MCP_SUFFIX = re.compile(r"; \d+ of \d+ via the evidence MCP server$")


@pytest.fixture(autouse=True)
def fresh(monkeypatch):
    mcp_server._cases.cache_clear()
    evidence_tools._bundled.cache_clear()
    evidence_tools._warned.clear()
    monkeypatch.setattr(settings, "evidence_tools", "local")
    monkeypatch.setattr(settings, "evidence_mcp_url", "")
    yield
    getattr(mcp_server._cases, "cache_clear", lambda: None)()


def use_mcp(monkeypatch, url=""):
    monkeypatch.setattr(settings, "evidence_tools", "mcp")
    monkeypatch.setattr(settings, "evidence_mcp_url", url)


# -- A scripted LLM plan that uses every tool, windows included ------------------

def _window(span, minutes):
    if not span:
        return None
    start, end = span.split("-")
    t0 = datetime.strptime(start, "%H:%M")
    t1 = min(datetime.strptime(end, "%H:%M"), t0 + timedelta(minutes=minutes))
    return None if t1 <= t0 else {"start": f"{t0:%H:%M}", "end": f"{t1:%H:%M}"}


def scripted_plan(system, user, **_):
    """Round 1: the trip, GPS stops, a GPS window and a chat window. Round 2: fare and events."""
    body = json.loads(user)
    if "round" in body:
        return json.dumps({"calls": [{"tool": "fare_lines", "reason": "fare"},
                                     {"tool": "app_events", "reason": "events"}], "done": True})
    have = body["data_available"]
    calls = [{"tool": "trip_record", "reason": "trip"}, {"tool": "gps_stops", "reason": "stops"}]
    for tool, span in (("gps_window", have["gps_time_span"]), ("chat_window", have["chat_time_span"])):
        window = _window(span, 30)
        if window:
            calls.append({"tool": tool, "args": window, "reason": "window"})
    return json.dumps({"calls": calls, "done": False})


def planned(fn, *args):
    with patch("app.agents.evidence_agent.complete", side_effect=scripted_plan):
        return fn(*args)


def comparable(resolution):
    """A resolution without what the transport may change: per-call `via`, timings, the log suffix."""
    data = resolution.model_dump(mode="json")
    for call in data["evidence_collection"]["calls"]:
        call.pop("via")
    for entry in data["agent_log"]:
        entry.pop("started_at", None)
        entry.pop("duration_ms", None)
        entry["message"] = MCP_SUFFIX.sub("", entry["message"])
    return data


def vias(collection):
    return {call.via for call in collection.calls}


# -- Same rulings ----------------------------------------------------------------

def test_local_is_the_default_and_never_touches_mcp():
    assert settings.evidence_tools == "local"
    with patch.object(evidence_tools.McpRunner, "run_batch", side_effect=AssertionError("MCP used")):
        collection, _ = planned(collect_for_both, BY_ID["D001"], compute_facts(BY_ID["D001"]))
    assert collection.calls and vias(collection) == {"local"}


@pytest.mark.parametrize("case", SAMPLES, ids=lambda c: c.dispute_id)
def test_every_sample_gets_the_same_ruling_through_mcp_on_the_default_plan(case, monkeypatch):
    local = resolve_dispute(case)
    use_mcp(monkeypatch)
    remote = resolve_dispute(case)
    assert vias(remote.evidence_collection) == {"mcp"}
    assert comparable(remote) == comparable(local)
    assert (remote.decision, remote.refund_amount, remote.policy_refs) == (local.decision, local.refund_amount,
                                                                           local.policy_refs)


@pytest.mark.parametrize("case", SAMPLES, ids=lambda c: c.dispute_id)
def test_every_sample_gets_the_same_ruling_through_mcp_on_an_llm_plan_with_windows(case, monkeypatch):
    local = planned(resolve_dispute, case)
    use_mcp(monkeypatch)
    remote = planned(resolve_dispute, case)
    assert remote.evidence_collection.source == "llm"
    assert vias(remote.evidence_collection) == {"mcp"}
    assert comparable(remote) == comparable(local)


def test_the_agent_log_says_when_tools_went_through_mcp(monkeypatch):
    use_mcp(monkeypatch)
    entry = next(e for e in resolve_dispute(BY_ID["D001"]).agent_log if e.agent == "evidence_collector")
    assert MCP_SUFFIX.search(entry.message)
    monkeypatch.setattr(settings, "evidence_tools", "local")
    entry = next(e for e in resolve_dispute(BY_ID["D001"]).agent_log if e.agent == "evidence_collector")
    assert "MCP" not in entry.message


def test_a_sample_posted_to_the_api_goes_through_mcp(monkeypatch):
    use_mcp(monkeypatch)
    payload = json.loads((DISPUTES / "route_deviation_001.json").read_text())
    response = TestClient(app).post("/api/disputes/resolve", json=payload)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["decision"] == "partial_refund"
    assert {c["via"] for c in body["evidence_collection"]["calls"]} == {"mcp"}


def test_a_real_http_server_gives_the_same_evidence(monkeypatch):
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    proc = subprocess.Popen(
        [sys.executable, "-m", "app.mcp_servers.evidence", "--transport", "streamable-http", "--port", str(port)],
        cwd=BACKEND, env={"PYTHONPATH": str(BACKEND), "PATH": "/usr/bin:/bin"},
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        deadline = time.monotonic() + 20
        while True:
            try:
                socket.create_connection(("127.0.0.1", port), timeout=0.2).close()
                break
            except OSError:
                assert proc.poll() is None and time.monotonic() < deadline, "MCP server didn't start"
                time.sleep(0.1)
        case = BY_ID["D001"]
        local = planned(collect_for_both, case, compute_facts(case))
        use_mcp(monkeypatch, f"http://127.0.0.1:{port}/mcp")
        remote = planned(collect_for_both, case, compute_facts(case))
    finally:
        proc.terminate()
        proc.wait(timeout=10)
    assert vias(remote[0]) == {"mcp"}
    assert remote[1] == local[1]
    assert [c.model_dump(exclude={"via"}) for c in remote[0].calls] == \
           [c.model_dump(exclude={"via"}) for c in local[0].calls]


def test_works_when_called_from_inside_an_event_loop(monkeypatch):
    case = BY_ID["D005"]
    _, local = collect_evidence(case, compute_facts(case))
    use_mcp(monkeypatch)

    async def inside():
        return collect_evidence(case, compute_facts(case))
    collection, collected = asyncio.run(inside())
    assert vias(collection) == {"mcp"}
    assert collected == local


# -- Every failure falls back to local, with the same answers -------------------

def _same_as_local(case, monkeypatch, expect_via):
    monkeypatch.setattr(settings, "evidence_tools", "local")
    local = planned(collect_evidence, case, compute_facts(case))
    monkeypatch.setattr(settings, "evidence_tools", "mcp")
    remote = planned(collect_evidence, case, compute_facts(case))
    assert vias(remote[0]) == expect_via
    assert remote[1] == local[1]
    return remote


def test_a_case_the_server_does_not_hold_runs_locally(monkeypatch):
    use_mcp(monkeypatch)
    edited = BY_ID["D001"].model_copy(update={"rider_claim": "The driver took a longer route on purpose."})
    with patch.object(evidence_tools.McpRunner, "run_batch", side_effect=AssertionError("MCP used")):
        _same_as_local(edited, monkeypatch, {"local"})


def test_a_server_whose_copy_of_the_case_differs_is_not_trusted(monkeypatch):
    use_mcp(monkeypatch)
    real = BY_ID["D001"]
    stale = real.model_copy(update={"gps_points": real.gps_points[:3]})
    monkeypatch.setattr(mcp_server, "_cases", lambda: {real.dispute_id: stale})
    _same_as_local(real, monkeypatch, {"local"})


def test_an_unreachable_server_runs_locally_after_one_try(monkeypatch):
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]   # closed again: nothing listens here
    use_mcp(monkeypatch, f"http://127.0.0.1:{port}/mcp")
    tries = []
    original = evidence_tools.McpRunner._call_all

    async def counted(self, calls):
        tries.append(len(calls))
        return await original(self, calls)
    monkeypatch.setattr(evidence_tools.McpRunner, "_call_all", counted)
    _same_as_local(BY_ID["D001"], monkeypatch, {"local"})
    assert len(tries) == 1   # round 2 doesn't try a server that already failed


def test_a_tool_error_on_the_server_runs_that_call_locally(monkeypatch):
    use_mcp(monkeypatch)
    original = mcp_server._run

    def flaky(tool_name, case_id, args=None):
        if tool_name == "gps_stops":
            raise ToolError("The tool failed on this case.")
        return original(tool_name, case_id, args)
    monkeypatch.setattr(mcp_server, "_run", flaky)
    collection, _ = _same_as_local(BY_ID["D001"], monkeypatch, {"local", "mcp"})
    by_tool = {c.tool: c.via for c in collection.calls}
    assert by_tool["gps_stops"] == "local" and by_tool["trip_record"] == "mcp"


def test_a_malformed_answer_runs_that_call_locally():
    class Result:
        is_error = False
        structured_content = {"case_id": "D001", "tool": "trip_record", "facts": ["ok", 3]}
    assert evidence_tools._facts(Result(), "trip_record", "D001") is None
    Result.structured_content = {"case_id": "D002", "tool": "trip_record", "facts": ["ok"]}
    assert evidence_tools._facts(Result(), "trip_record", "D001") is None
    Result.structured_content = {"case_id": "D001", "tool": "trip_record", "facts": ["ok"]}
    assert evidence_tools._facts(Result(), "trip_record", "D001") == ["ok"]


@pytest.mark.parametrize("url", ["http://10.0.0.5:8765/mcp", "https://example.com/mcp", "ftp://127.0.0.1/mcp",
                                 "127.0.0.1:8765", "http://127.0.0.1.example.com/mcp"])
def test_a_non_loopback_url_is_refused_without_a_connection(url, monkeypatch):
    use_mcp(monkeypatch, url)
    assert evidence_tools.mcp_target() is None
    with patch.object(evidence_tools.McpRunner, "run_batch", side_effect=AssertionError("MCP used")):
        _same_as_local(BY_ID["D001"], monkeypatch, {"local"})


def test_loopback_urls_are_accepted(monkeypatch):
    for url in ("http://127.0.0.1:8765/mcp", "http://localhost:8765/mcp", "http://[::1]:8765/mcp"):
        use_mcp(monkeypatch, url)
        assert evidence_tools.mcp_target() == url


def test_an_unknown_mode_runs_locally(monkeypatch):
    monkeypatch.setattr(settings, "evidence_tools", "remote")
    case = BY_ID["D001"]
    assert isinstance(evidence_tools.runner_for(case, DataSources.for_case(case)), evidence_tools.LocalRunner)


def test_mcp_mode_without_the_sdk_runs_locally(monkeypatch):
    use_mcp(monkeypatch)
    monkeypatch.setattr(evidence_tools.importlib.util, "find_spec", lambda name: None)
    case = BY_ID["D001"]
    assert isinstance(evidence_tools.runner_for(case, DataSources.for_case(case)), evidence_tools.LocalRunner)

