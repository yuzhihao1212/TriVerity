from concurrent.futures import ThreadPoolExecutor

from app.agents.fraud_agent import assess_risk
from app.agents.rider_agent import build_rider_case
from app.agents.driver_agent import build_driver_case
from app.agents.judge_agent import judge
from app.models.dispute import DisputeCase
from app.models.resolution import AgentLogEntry, Resolution
from app.services.evidence import compute_facts

def resolve_dispute(case: DisputeCase) -> Resolution:
    agent_log = []

    def log(agent: str, message: str) -> None:
        agent_log.append(AgentLogEntry(step=len(agent_log) + 1, agent=agent, status="completed", message=message))

    facts = compute_facts(case)
    log("evidence_loader", f"Computed {len(facts.describe())} facts from case data.")

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

    ruling = judge(case, facts, rider_case, driver_case, risk)
    log("judge", f"[{ruling.explanation_source}] {ruling.decision} ({ruling.confidence:.0%} confidence)")

    return Resolution(
        **ruling.model_dump(),
        rider_case=rider_case,
        driver_case=driver_case,
        risk=risk,
        agent_log=agent_log,
    )
