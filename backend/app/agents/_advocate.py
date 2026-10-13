"""Shared logic for LLM-backed advocate agents.

Both ``build_rider_case`` and ``build_driver_case`` delegate to
:func:`build_advocate_case`, which:

1. Calls ``llm_client.complete`` with a tailored system prompt.
2. Strips ``\\`\\`\\`json`` code fences and parses the JSON response.
3. Validates ``policy_refs`` — keeping only rule IDs that exist in the policy
   section and rebuilding each citation via ``cite()`` so the text is exact.
   Non-string refs are skipped instead of crashing.
4. Falls back to a deterministic ``AgentCase`` (with no policy refs) on *any*
   failure: the LLM is offline, raises any exception, returns unparseable JSON,
   or the parsed output fails pydantic validation.

The ``source`` field on ``AgentCase`` records whether the LLM path (``"llm"``)
or the fallback path (``"fallback"``) produced the case, and a warning is
logged with the reason whenever the fallback is taken.
"""

from __future__ import annotations

import json
import logging
import re

from pydantic import ValidationError

from app.core import limits
from app.models.dispute import DisputeCase
from app.models.resolution import AgentCase
from app.services.evidence import CaseFacts
from app.services.llm_client import OFFLINE_PLACEHOLDER, _strip_fences, complete
from app.services.policy_service import cite, load_policy

logger = logging.getLogger(__name__)

# Extracts a leading rule ID like "RD-3" or "SAFE-1" from a citation string.
_RULE_ID_RE = re.compile(r"^([A-Z]+-\d+)")


def advocate_system_prompt(party: str, own_account: str) -> str:
    """System prompt for the advocate representing ``party`` ("rider" or "driver").

    Advocates argue one side only; weighing both sides is the Judge's job.
    Without this framing, models with reasoning disabled tend to argue the
    other side's case or rule on the dispute themselves.
    """
    return (
        f"You are the {party.title()} Advocate in a ride-hailing dispute resolution system. "
        f"You represent the {party} and ONLY the {party}. An impartial Judge will hear "
        f"the other side separately and decide the outcome.\n"
        f"Rules:\n"
        f"1. Argue for the outcome most favourable to the {party}. Never conclude against "
        f"your client, never say the other party should win, and never issue a ruling.\n"
        f"2. Use ONLY the provided case facts and the {party}'s {own_account}. Never invent "
        f"or contradict trip data (distances, durations, fares, locations, wait times, chat).\n"
        f"3. If a fact hurts your client, do not hide it: acknowledge it briefly, then offer "
        f"the most reasonable context or mitigation the facts allow.\n"
        f"4. In policy_refs, cite ONLY rules whose conditions, applied to these facts, "
        f"support your client. Do not cite rules that favour the other party. If no rule "
        f"supports your client, return an empty policy_refs list and argue from the facts.\n"
        f"5. evidence: list the specific facts that support your client, worded as in the case facts.\n"
        f"Respond with a JSON object only: "
        f'{{"summary": str, "evidence": [str], "policy_refs": [str]}}. '
        f'Each policy_ref is the rule ID, then ": ", then the rule text.'
    )


def _policy_section(case: DisputeCase) -> dict:
    """Return the policy section for the dispute type."""
    policy = load_policy()
    return policy.get(case.type, {})


def _validate_refs(refs: object, section: dict) -> list[str]:
    """Keep only refs whose rule ID exists in the section, rebuilt via cite().

    Non-string entries (e.g. dicts or numbers) are silently skipped.
    """
    if not isinstance(refs, list):
        return []
    valid_ids = set(section.get("rules", {}))
    validated: list[str] = []
    for ref in refs:
        if not isinstance(ref, str):
            continue
        match = _RULE_ID_RE.match(ref.strip())
        if match and match.group(1) in valid_ids:
            validated.append(cite(section, match.group(1)))
    return validated


def _fallback(
    agent: str,
    claim_line: str,
    summary: str,
    facts: CaseFacts,
    reason: str,
) -> AgentCase:
    """Deterministic fallback with no policy citations."""
    logger.warning("%s fell back to deterministic case: %s", agent, reason)
    return AgentCase(
        agent=agent,
        summary=summary,
        evidence=[claim_line, *facts.describe()],
        policy_refs=[],
        source="fallback",
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
        raw = complete(system, user, max_tokens=limits.ADVOCATE_MAX_TOKENS)
    except Exception as exc:
        return _fallback(agent, claim_line, fallback_summary, facts, f"complete() raised {type(exc).__name__}: {exc}")

    if raw == OFFLINE_PLACEHOLDER:
        return _fallback(agent, claim_line, fallback_summary, facts, "no API key configured")

    try:
        parsed = json.loads(_strip_fences(raw))
        case = AgentCase(
            agent=agent,
            summary=parsed["summary"],
            evidence=parsed.get("evidence", []),
            policy_refs=_validate_refs(parsed.get("policy_refs"), section),
            source="llm",
        )
    except (json.JSONDecodeError, KeyError, TypeError, ValidationError, AttributeError) as exc:
        return _fallback(agent, claim_line, fallback_summary, facts, f"parse failed: {type(exc).__name__}: {exc}")

    return case
