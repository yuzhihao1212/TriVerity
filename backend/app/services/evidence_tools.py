"""How the Evidence agent runs its data-source tools: in-process, or through the evidence MCP server.

Phase 2 of the MCP plan (docs/mcp.md). ``EVIDENCE_TOOLS=local`` (the default) calls
``TOOLS[name].run`` directly, as before. ``EVIDENCE_TOOLS=mcp`` sends the same calls to the
evidence MCP server (``app/mcp_servers/evidence.py``) as an MCP client: over streamable HTTP when
``EVIDENCE_MCP_URL`` is set, otherwise to an in-process server over MCP's memory transport.

Rulings don't depend on the transport. The server runs the same ``TOOLS[name].run`` on the
same case, and the MCP path only takes a call when it can show the server holds that case:

* The case must be one of the bundled samples, unchanged, since the server serves those by ID.
  Anything else (a judge's own dispute, an edited sample) runs locally.
* Before the first call, the server's ``case_overview`` for the case must match what this
  process computes from it.
* An error, a timeout, an unreachable server or a malformed answer runs that call locally.
  After a transport failure, the rest of the collection runs locally too, so a down server
  costs one timeout at most, not one per call.

Each call records which way it went (``ToolCallRecord.via``). The MCP SDK is an optional
dependency (``requirements-mcp.txt``); without it, ``mcp`` mode runs locally with a warning.
"""

from __future__ import annotations

import asyncio
import importlib.util
import ipaddress
import logging
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from typing import Literal
from urllib.parse import urlsplit

import anyio

from app.core import limits
from app.core.config import settings
from app.core.safe_log import safe_reason
from app.models.dispute import DisputeCase
from app.services.data_sources import TOOLS, DataSources, data_available, parse_hhmm

logger = logging.getLogger(__name__)

Via = Literal["local", "mcp"]
Call = tuple[str, dict[str, str]]      # tool name, validated HH:MM args
INPROC = "in-process"                  # EVIDENCE_MCP_URL empty: the server runs in this process

_warned: set[str] = set()


def _warn_once(key: str, message: str, *args: object) -> None:
    if key not in _warned:
        _warned.add(key)
        logger.warning(message, *args)


def run_local(sources: DataSources, name: str, args: dict[str, str]) -> list[str]:
    """One tool call in-process. A tool bug returns no lines: it must never break the dispute."""
    try:
        lines = TOOLS[name].run(sources, {k: parse_hhmm(v) for k, v in args.items()})
    except Exception as exc:
        logger.warning("evidence tool %s failed: %s", name, safe_reason(exc))
        return []
    return lines[: limits.EVIDENCE_TOOL_MAX_LINES]


class LocalRunner:
    """Calls the tools directly (``EVIDENCE_TOOLS=local``)."""

    def __init__(self, sources: DataSources):
        self.sources = sources

    def run_batch(self, calls: list[Call]) -> list[tuple[list[str], Via]]:
        return [(run_local(self.sources, name, args), "local") for name, args in calls]


class McpRunner:
    """Calls the tools through the evidence MCP server, one client session per batch."""

    def __init__(self, case: DisputeCase, sources: DataSources, target: str):
        self.case_id = case.dispute_id
        self.sources = sources
        self.target = target
        self._verified = False   # the server's case_overview matched ours
        self._broken = False     # a transport failure: the rest of this collection runs locally

    def run_batch(self, calls: list[Call]) -> list[tuple[list[str], Via]]:
        if not calls:
            return []
        answers: list[list[str] | None] = [None] * len(calls)
        if not self._broken:
            try:
                answers = _run_sync(self._call_all, calls)
            except _NotSameCase:
                self._broken = True
                logger.warning("evidence MCP server's data for %s doesn't match; running its tools locally",
                               self.case_id)
            except Exception as exc:  # unreachable server, timeout, protocol error
                self._broken = True
                logger.warning("evidence MCP server unavailable (%s); running %s's tools locally",
                               safe_reason(exc), self.case_id)
        out: list[tuple[list[str], Via]] = []
        for (name, args), answer in zip(calls, answers):
            if answer is None:
                out.append((run_local(self.sources, name, args), "local"))
            else:
                out.append((answer, "mcp"))
        logger.info("evidence tools for %s: %d via MCP, %d local", self.case_id,
                    sum(via == "mcp" for _, via in out), sum(via == "local" for _, via in out))
        return out

    async def _call_all(self, calls: list[Call]) -> list[list[str] | None]:
        from mcp import Client  # optional dependency, checked in runner_for

        server = _inproc_server() if self.target == INPROC else self.target
        answers: list[list[str] | None] = []
        with anyio.fail_after(limits.EVIDENCE_MCP_TIMEOUT_S):
            async with Client(server, read_timeout_seconds=limits.EVIDENCE_MCP_TIMEOUT_S) as client:
                if not self._verified:
                    overview = await client.call_tool("case_overview", {"case_id": self.case_id})
                    body = overview.structured_content if not overview.is_error else None
                    if not isinstance(body, dict) or body.get("data_available") != data_available(self.sources):
                        raise _NotSameCase
                    self._verified = True
                for name, args in calls:
                    result = await client.call_tool(name, {"case_id": self.case_id, **args})
                    answers.append(_facts(result, name, self.case_id))
        return answers


class _NotSameCase(Exception):
    """The server's copy of the case doesn't match the one being resolved."""


def _facts(result: object, name: str, case_id: str) -> list[str] | None:
    """The fact lines of one MCP tool result, or None if the call should run locally instead."""
    if getattr(result, "is_error", True):
        return None
    body = getattr(result, "structured_content", None)
    if not isinstance(body, dict) or body.get("tool") != name or body.get("case_id") != case_id:
        return None
    facts = body.get("facts")
    if not isinstance(facts, list) or not all(isinstance(line, str) for line in facts):
        return None
    return facts[: limits.EVIDENCE_TOOL_MAX_LINES]


def _inproc_server():
    from app.mcp_servers.evidence import build_server
    return build_server()


def _run_sync(fn, *args):
    """Run an async function from sync code, in a fresh thread if this one already has a loop."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return anyio.run(fn, *args)
    with ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(anyio.run, fn, *args).result()


@lru_cache(maxsize=1)
def _bundled() -> dict[str, DisputeCase]:
    from app.services.sample_service import load_samples
    return {case.dispute_id: case for case in load_samples()}


def _loopback_url(url: str) -> bool:
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        return False
    if parts.hostname == "localhost":
        return True
    try:
        return ipaddress.ip_address(parts.hostname).is_loopback
    except ValueError:
        return False


def mcp_target() -> str | None:
    """Where ``mcp`` mode sends calls: a loopback URL, INPROC, or None when it can't be used."""
    if importlib.util.find_spec("mcp") is None:
        _warn_once("sdk", "EVIDENCE_TOOLS=mcp but the MCP SDK isn't installed "
                          "(pip install -r requirements-mcp.txt); running the evidence tools locally")
        return None
    url = settings.evidence_mcp_url.strip()
    if not url:
        return INPROC
    if not _loopback_url(url):
        # Same rule as the server: no remote access until there's authentication (phase 4).
        _warn_once("url", "EVIDENCE_MCP_URL must be a loopback http(s) URL until the server has "
                          "authentication; running the evidence tools locally")
        return None
    return url


def runner_for(case: DisputeCase, sources: DataSources) -> LocalRunner | McpRunner:
    """The tool runner for one evidence collection, from the EVIDENCE_TOOLS setting."""
    mode = settings.evidence_tools.strip().lower() or "local"
    if mode == "local":
        return LocalRunner(sources)
    if mode != "mcp":
        _warn_once("mode", "EVIDENCE_TOOLS must be 'local' or 'mcp'; running the evidence tools locally")
        return LocalRunner(sources)
    target = mcp_target()
    if target is None:
        return LocalRunner(sources)
    if _bundled().get(case.dispute_id) != case:
        logger.info("evidence tools for %s run locally: the MCP server serves the bundled samples only",
                    case.dispute_id)
        return LocalRunner(sources)
    return McpRunner(case, sources, target)
