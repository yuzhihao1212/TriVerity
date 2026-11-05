"""Bearer tokens on the MCP servers' HTTP transport (MCP plan, phase 4a)."""

import logging
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

import anyio
import pytest
from fastapi.testclient import TestClient

pytest.importorskip("mcp")

from mcp import Client  # noqa: E402
from mcp.client.streamable_http import streamable_http_client  # noqa: E402
from mcp.shared._httpx_utils import create_mcp_http_client  # noqa: E402

from app.agents.evidence_agent import collect_evidence  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.mcp_servers import _common, evidence, support  # noqa: E402
from app.services import evidence_tools  # noqa: E402
from app.services.evidence import compute_facts  # noqa: E402
from app.services.sample_service import load_samples  # noqa: E402

BACKEND = Path(__file__).resolve().parents[1]
TOKEN = "t" * 20 + "-test-token-0123456789"   # 42 characters, test value only
OTHER = "o" * 40
INIT = {"jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {"protocolVersion": "2025-06-18", "capabilities": {},
                   "clientInfo": {"name": "test", "version": "0"}}}
HEADERS = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}


# -- Tokens ----------------------------------------------------------------------

def test_tokens_are_split_and_trimmed():
    assert _common.load_tokens("") == []
    assert _common.load_tokens(f" {TOKEN} , {OTHER} ,") == [TOKEN, OTHER]


def test_a_short_token_is_refused():
    with pytest.raises(ValueError, match="at least 32"):
        _common.load_tokens(f"{TOKEN},short")


# -- The middleware ----------------------------------------------------------------

@pytest.fixture
def guarded():
    app = _common.http_app(support.build_server(), "127.0.0.1", [TOKEN, OTHER])
    with TestClient(app, base_url="http://127.0.0.1:8766") as client:
        yield client


@pytest.mark.parametrize("auth", [None, "Bearer", "Bearer ", f"Basic {TOKEN}", f"Bearer {TOKEN}x",
                                  f"Bearer {TOKEN[:-1]}", "Bearer " + "x" * 42])
def test_requests_without_a_valid_token_get_401(guarded, auth):
    headers = dict(HEADERS) | ({"Authorization": auth} if auth else {})
    response = guarded.post("/mcp", json=INIT, headers=headers)
    assert response.status_code == 401
    assert response.headers["www-authenticate"].startswith("Bearer")
    assert response.json()["error"] == "invalid_token"


@pytest.mark.parametrize("token", [TOKEN, OTHER])
def test_any_configured_token_gets_through(guarded, token):
    response = guarded.post("/mcp", json=INIT, headers=HEADERS | {"Authorization": f"Bearer {token}"})
    assert response.status_code == 200, response.text


def test_the_scheme_is_case_insensitive(guarded):
    response = guarded.post("/mcp", json=INIT, headers=HEADERS | {"Authorization": f"bearer {TOKEN}"})
    assert response.status_code == 200


def test_two_authorization_headers_are_refused(guarded):
    response = guarded.post("/mcp", json=INIT, headers=[
        *HEADERS.items(), ("Authorization", f"Bearer {TOKEN}"), ("Authorization", "Bearer nope"),
    ])
    assert response.status_code == 401


def test_a_refused_token_is_never_logged(guarded, caplog):
    caplog.set_level(logging.INFO)
    guarded.post("/mcp", json=INIT, headers=HEADERS | {"Authorization": f"Bearer {TOKEN}zz"})
    assert "MCP request refused" in caplog.text
    assert TOKEN not in caplog.text


def test_without_tokens_the_app_is_unwrapped():
    app = _common.http_app(support.build_server(), "127.0.0.1", [])
    assert not isinstance(app, _common.BearerAuth)
    with pytest.raises(ValueError):
        _common.BearerAuth(app, [])


# -- Binding rules -------------------------------------------------------------------

@pytest.fixture
def no_uvicorn(monkeypatch):
    started = {}
    import uvicorn
    monkeypatch.setattr(uvicorn, "run", lambda app, host, port, **kw: started.update(app=app, host=host, port=port))
    return started


@pytest.mark.parametrize("module", [evidence, support])
def test_beyond_loopback_needs_tokens(module, monkeypatch, no_uvicorn):
    monkeypatch.setattr(settings, "mcp_tokens", "")
    with pytest.raises(SystemExit):
        module.main(["--transport", "streamable-http", "--host", "0.0.0.0"])
    assert not no_uvicorn


@pytest.mark.parametrize("module", [evidence, support])
def test_with_tokens_it_binds_beyond_loopback_behind_auth(module, monkeypatch, no_uvicorn):
    monkeypatch.setattr(settings, "mcp_tokens", TOKEN)
    module.main(["--transport", "streamable-http", "--host", "0.0.0.0", "--port", "9999"])
    assert no_uvicorn["host"] == "0.0.0.0" and no_uvicorn["port"] == 9999
    assert isinstance(no_uvicorn["app"], _common.BearerAuth)


def test_tokens_guard_loopback_too(monkeypatch, no_uvicorn):
    monkeypatch.setattr(settings, "mcp_tokens", TOKEN)
    support.main(["--transport", "streamable-http"])
    assert isinstance(no_uvicorn["app"], _common.BearerAuth)


def test_a_weak_token_stops_the_server(monkeypatch, no_uvicorn):
    monkeypatch.setattr(settings, "mcp_tokens", "password123")
    with pytest.raises(SystemExit):
        support.main(["--transport", "streamable-http"])
    assert not no_uvicorn


# -- Real servers over HTTP --------------------------------------------------------

def _free_port():
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


@pytest.fixture
def token_server():
    """Start a server module over HTTP with MCP_TOKENS set; yield its URL."""
    procs = []

    def start(module):
        port = _free_port()
        env = {"PYTHONPATH": str(BACKEND), "PATH": os.environ.get("PATH", "/usr/bin:/bin"), "MCP_TOKENS": TOKEN}
        proc = subprocess.Popen([sys.executable, "-m", module, "--transport", "streamable-http", "--port", str(port)],
                                cwd=BACKEND, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        procs.append(proc)
        deadline = time.monotonic() + 20
        while True:
            try:
                socket.create_connection(("127.0.0.1", port), timeout=0.2).close()
                return f"http://127.0.0.1:{port}/mcp"
            except OSError:
                assert proc.poll() is None and time.monotonic() < deadline, "server didn't start"
                time.sleep(0.1)
    yield start
    for proc in procs:
        proc.terminate()
        proc.wait(timeout=10)


def _list_tools(url, token):
    async def go():
        async with create_mcp_http_client(headers={"Authorization": f"Bearer {token}"} if token else None) as http:
            async with Client(streamable_http_client(url, http_client=http)) as client:
                return {t.name for t in (await client.list_tools()).tools}
    return anyio.run(go)


def test_a_real_support_server_needs_the_token(token_server):
    url = token_server("app.mcp_servers.support")
    assert "get_ruling" in _list_tools(url, TOKEN)
    for token in (None, OTHER):
        with pytest.raises(Exception):
            _list_tools(url, token)


def test_the_evidence_agent_sends_its_token(token_server, monkeypatch):
    url = token_server("app.mcp_servers.evidence")
    case = next(c for c in load_samples() if c.dispute_id == "D001")
    _, local = collect_evidence(case, compute_facts(case))
    monkeypatch.setattr(settings, "evidence_tools", "mcp")
    monkeypatch.setattr(settings, "evidence_mcp_url", url)
    evidence_tools._bundled.cache_clear()

    monkeypatch.setattr(settings, "evidence_mcp_token", TOKEN)
    with_token, collected = collect_evidence(case, compute_facts(case))
    assert {c.via for c in with_token.calls} == {"mcp"} and collected == local

    monkeypatch.setattr(settings, "evidence_mcp_token", "")
    without, collected = collect_evidence(case, compute_facts(case))
    assert {c.via for c in without.calls} == {"local"} and collected == local   # refused, so local
