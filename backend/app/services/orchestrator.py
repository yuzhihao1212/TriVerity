import logging
import threading
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from app.agents._advocate import build_rebuttal
from app.agents.evidence_agent import collect_for_both
from app.agents.fraud_agent import assess_risk
from app.agents.rider_agent import build_rider_case
from app.agents.driver_agent import build_driver_case
from app.agents.judge_agent import judge_with_precedents
from app.agents.precedent_agent import consult_precedents
from app.models.dispute import DisputeCase
from app.models.resolution import AgentLogEntry, Resolution
from app.core import limits
from app.services.argument_review import review_arguments
from app.services.counterfactuals import what_would_change
from app.services.evidence import compute_facts
from app.services.llm_client import carry_context
from app.services.triage import triage

# Caps how many resolves run their LLM calls at once, so slow model calls can't
# starve the server's thread pool (and /health with it).
resolve_slots = threading.BoundedSemaphore(limits.MAX_CONCURRENT_RESOLVES)

logger = logging.getLogger(__name__)

class ServiceBusy(Exception):
    """Every resolve slot is taken; the API answers 503."""

def _timed(fn, *args, **kwargs):
    """Run fn and return (result, started_at, duration_ms)."""
    started, start = datetime.now(timezone.utc), time.perf_counter()
    result = fn(*args, **kwargs)
    return result, started, round((time.perf_counter() - start) * 1000)

def resolve_dispute(case: DisputeCase, on_step: Callable[[AgentLogEntry], None] | None = None) -> Resolution:
    """Run every agent on the case.

    ``on_step`` (optional) is called with each agent-log entry the moment that step finishes,
    for live progress. A failing callback is logged and ignored: it can't break a ruling.
    """
    agent_log = []

    def log(agent: str, message: str, started: datetime | None = None, duration_ms: int | None = None) -> None:
        entry = AgentLogEntry(step=len(agent_log) + 1, agent=agent, status="completed", message=message,
                              started_at=started, duration_ms=duration_ms)
        agent_log.append(entry)
        if on_step is not None:
            try:
                on_step(entry)
            except Exception:   # noqa: BLE001 - progress is best-effort
                logger.warning("on_step callback failed for %s", agent)

    facts, started, ms = _timed(compute_facts, case)
    log("evidence_loader", f"Computed {len(facts.describe())} facts from case data.", started, ms)

    if not resolve_slots.acquire(blocking=False):
        raise ServiceBusy
    try:
        # Evidence Collection agent: plans data-source tool calls and adds what they
        # return to the facts (core facts unchanged; fallback runs a default plan).
        # Each advocate gathers its own evidence (one collection per side, in parallel).
        (collection, collected), started, ms = _timed(collect_for_both, case, facts)
        facts = facts.model_copy(update={"collected": collected})

        def tools(party: str) -> str:
            calls = [c for c in collection.calls if c.party == party]
            names = ", ".join(f"{c.tool}({', '.join(c.args.values())})" if c.args else c.tool for c in calls)
            return f"{len(calls)} tool calls ({names or 'none'})"
        log("evidence_collector", f"[{collection.source}] rider's request: {tools('rider')}; "
                                  f"driver's request: {tools('driver')}", started, ms)

        # The advocates and the fraud assessor are all independent of each other,
        # so run them concurrently.
        with ThreadPoolExecutor(max_workers=3) as pool:
            rider_future = pool.submit(carry_context(_timed), build_rider_case, case, facts)
            driver_future = pool.submit(carry_context(_timed), build_driver_case, case, facts)
            risk_future = pool.submit(carry_context(_timed), assess_risk, case, facts)
            # The fraud check is instant; report it as soon as it's done.
            risk, *timing = risk_future.result()
            log("fraud_detector", risk.summary, *timing)
            rider_case, *rider_timing = rider_future.result()
            driver_case, *driver_timing = driver_future.result()
        log("rider_advocate", f"[{rider_case.source}] {rider_case.summary}", *rider_timing)
        log("driver_advocate", f"[{driver_case.source}] {driver_case.summary}", *driver_timing)

        # Rebuttal round: each advocate answers the other side's case once, concurrently.
        with ThreadPoolExecutor(max_workers=2) as pool:
            rider_reply = pool.submit(carry_context(_timed), build_rebuttal, party="rider", own_case=rider_case,
                                      other_case=driver_case, facts=facts, dispute_type=case.type)
            driver_reply = pool.submit(carry_context(_timed), build_rebuttal, party="driver", own_case=driver_case,
                                       other_case=rider_case, facts=facts, dispute_type=case.type)
            (rider_rebuttal, *rider_timing), (driver_rebuttal, *driver_timing) = rider_reply.result(), driver_reply.result()
            rider_case = rider_case.model_copy(update={"rebuttal": rider_rebuttal})
            driver_case = driver_case.model_copy(update={"rebuttal": driver_rebuttal})
        for name, agent_case, timing in (("rider_rebuttal", rider_case, rider_timing),
                                         ("driver_rebuttal", driver_case, driver_timing)):
            reply = agent_case.rebuttal
            log(name, f"[{reply.source}] {reply.text}" if reply.text else "[fallback] no rebuttal", *timing)

        precedents, prec_started, prec_ms = _timed(consult_precedents, case, facts)
        (ruling, precedents), judge_started, judge_ms = _timed(
            judge_with_precedents, case, facts, rider_case, driver_case, risk, precedents)
    finally:
        resolve_slots.release()
    found = ", ".join(f"{m.id} ({m.similarity:.2f}, {m.decision})" for m in precedents.matches)
    log("precedent_agent", f"{precedents.summary} Retrieved: {found or 'none'}.", prec_started, prec_ms)
    log("judge", f"[{ruling.explanation_source}] {ruling.decision} ({ruling.confidence:.0%} confidence)",
        judge_started, judge_ms)

    return Resolution(
        **ruling.model_dump(),
        rider_case=rider_case,
        driver_case=driver_case,
        risk=risk,
        triage=triage(ruling),
        counterfactuals=what_would_change(case, facts, ruling),
        argument_review=review_arguments(case, facts, ruling, rider_case, driver_case),
        precedents=precedents,
        evidence_collection=collection,
        agent_log=agent_log,
    )
