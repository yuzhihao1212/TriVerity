"""Shared logic for LLM-backed advocate agents.

Both ``build_rider_case`` and ``build_driver_case`` delegate to
:func:`build_advocate_case`, which:

1. Calls ``llm_client.complete`` with a tailored system prompt.
2. Strips ``\\`\\`\\`json`` code fences and parses the JSON response.
3. Validates ``policy_refs`` — keeping only rule IDs that exist in the policy
   section and rebuilding each citation via ``cite()`` so the text is exact.
4. Falls back to a deterministic ``AgentCase`` (with no policy refs) when the
   LLM is offline, raises ``httpx.HTTPError``, or returns unparseable JSON.
"""

from __future__ import annotations

import json
import re

import httpx

from app.models.dispute import DisputeCase
from app.models.resolution import AgentCase
from app.services.evidence import CaseFacts
from app.services.llm_client import OFFLINE_PLACEHOLDER, _strip_fences, complete
from app.services.policy_service import cite, load_policy

# Extracts a leading rule ID like "RD-3" or "SAFE-1" from a citation string.
_RULE_ID_RE = re.compile(r"^([A-Z]+-\d+)")


def _policy_section(case: DisputeCase) -> dict:
    """Return the policy section for the dispute type."""
    policy = load_policy()
    return policy.get(case.type, {})


def _validate_refs(refs: list[str], section: dict) -> list[str]:
    """Keep only refs whose rule ID exists in the section, rebuilt via cite()."""
    valid_ids = set(section.get("rules", {}))
    validated: list[str] = []
    for ref in refs:
        match = _RULE_ID_RE.match(ref.strip())
        if match and match.group(1) in valid_ids:
            validated.append(cite(section, match.group(1)))
    return validated


def _fallback(
    agent: str,
    claim_line: str,
    summary: str,
    facts: CaseFacts,
) -> AgentCase:
    """Deterministic fallback with no policy citations."""
    return AgentCase(
        agent=agent,
        summary=summary,
        evidence=[claim_line, *facts.describe()],
        policy_refs=[],
    )


def build_advocate_case(
    *,
    agent: str,
    system: str,
    user: str,
    claim_line: str,
    fallback_summary: str,
    facts: CaseFacts,
    section: dict,
) -> AgentCase:
    """Build an ``AgentCase`` from an LLM response, with deterministic fallback.

    Parameters
    ----------
    agent
        Value for ``AgentCase.agent`` (e.g. ``"rider_advocate"``).
    system, user
        Prompt parts passed to ``llm_client.complete``.
    claim_line
        First evidence line in the fallback (e.g. ``"Rider claim: ..."``).
    fallback_summary
        Summary text used in the fallback case.
    facts
        The computed case facts; included in the fallback evidence.
    section
        The policy section dict used to validate rule IDs.
    """
    try:
        raw = complete(system, user)
    except httpx.HTTPError:
        return _fallback(agent, claim_line, fallback_summary, facts)

    if raw == OFFLINE_PLACEHOLDER:
        return _fallback(agent, claim_line, fallback_summary, facts)

    try:
        parsed = json.loads(_strip_fences(raw))
        return AgentCase(
            agent=agent,
            summary=parsed["summary"],
            evidence=parsed.get("evidence", []),
            policy_refs=_validate_refs(parsed.get("policy_refs", []), section),
        )
    except (json.JSONDecodeError, KeyError, TypeError):
        return _fallback(agent, claim_line, fallback_summary, facts)
