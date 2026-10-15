import threading
from concurrent.futures import ThreadPoolExecutor

from app.agents._advocate import build_rebuttal
from app.agents.evidence_agent import collect_evidence
from app.agents.fraud_agent import assess_risk
from app.agents.rider_agent import build_rider_case
from app.agents.driver_agent import build_driver_case
from app.agents.judge_agent import judge_with_precedents
from app.agents.precedent_agent import consult_precedents
from app.models.dispute import DisputeCase
from app.models.resolution import AgentLogEntry, Resolution
from app.core import limits
from app.services.evidence import compute_facts
from app.services.triage import triage

# Caps how many resolves run their LLM calls at once, so slow model calls can't
# starve the server's thread pool (and /health with it).
resolve_slots = threading.BoundedSemaphore(limits.MAX_CONCURRENT_RESOLVES)

class ServiceBusy(Exception):
    """Every resolve slot is taken; the API answers 503."""

def resolve_dispute(case: DisputeCase) -> Resolution:
    agent_log = []

    def log(agent: str, message: str) -> None:
        agent_log.append(AgentLogEntry(step=len(agent_log) + 1, agent=agent, status="completed", message=message))

    facts = compute_facts(case)
    log("evidence_loader", f"Computed {len(facts.describe())} facts from case data.")

    if not resolve_slots.acquire(blocking=False):
        raise ServiceBusy
    try:
        # Evidence Collection agent: plans data-source tool calls and adds what they
        # return to the facts (core facts unchanged; fallback runs a default plan).
        collection, collected = collect_evidence(case, facts)
        facts = facts.model_copy(update={"collected": collected})
        tools = ", ".join(f"{c.tool}({', '.join(c.args.values())})" if c.args else c.tool for c in collection.calls)
        log("evidence_collector", f"[{collection.source}] {len(collection.calls)} tool calls in "
                                  f"{collection.rounds} round(s): {tools or 'none'}")

        # The advocates and the fraud assessor are all independent of each other,
        # so run them concurrently.
        with ThreadPoolExecutor(max_workers=3) as pool:
            rider_future = pool.submit(build_rider_case, case, facts)
            driver_future = pool.submit(build_driver_case, case, facts)
            risk_future = pool.submit(assess_risk, case, facts)
            rider_case, driver_case, risk = (
                rider_future.result(),
                driver_future.result(),
                risk_future.result(),
            )
        log("rider_advocate", f"[{rider_case.source}] {rider_case.summary}")
        log("driver_advocate", f"[{driver_case.source}] {driver_case.summary}")
        log("fraud_detector", risk.summary)

        # Rebuttal round: each advocate answers the other side's case once, concurrently.
        with ThreadPoolExecutor(max_workers=2) as pool:
            rider_reply = pool.submit(build_rebuttal, party="rider", own_case=rider_case,
                                      other_case=driver_case, facts=facts, dispute_type=case.type)
            driver_reply = pool.submit(build_rebuttal, party="driver", own_case=driver_case,
                                       other_case=rider_case, facts=facts, dispute_type=case.type)
            rider_case = rider_case.model_copy(update={"rebuttal": rider_reply.result()})
            driver_case = driver_case.model_copy(update={"rebuttal": driver_reply.result()})
        for name, agent_case in (("rider_rebuttal", rider_case), ("driver_rebuttal", driver_case)):
            reply = agent_case.rebuttal
            log(name, f"[{reply.source}] {reply.text}" if reply.text else "[fallback] no rebuttal")

        precedents = consult_precedents(case, facts)
        ruling, precedents = judge_with_precedents(case, facts, rider_case, driver_case, risk, precedents)
    finally:
        resolve_slots.release()
    found = ", ".join(f"{m.id} ({m.similarity:.2f}, {m.decision})" for m in precedents.matches)
    log("precedent_agent", f"{precedents.summary} Retrieved: {found or 'none'}.")
    log("judge", f"[{ruling.explanation_source}] {ruling.decision} ({ruling.confidence:.0%} confidence)")

    return Resolution(
        **ruling.model_dump(),
        rider_case=rider_case,
        driver_case=driver_case,
        risk=risk,
        triage=triage(ruling),
        precedents=precedents,
        evidence_collection=collection,
        agent_log=agent_log,
    )
