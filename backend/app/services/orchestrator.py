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

    rider_case = build_rider_case(case, facts)
    log("rider_advocate", rider_case.summary)

    driver_case = build_driver_case(case, facts)
    log("driver_advocate", driver_case.summary)

    ruling = judge(case, facts, rider_case, driver_case)
    log("judge", f"{ruling.decision} ({ruling.confidence:.0%} confidence)")

    return Resolution(
        **ruling.model_dump(),
        rider_case=rider_case,
        driver_case=driver_case,
        agent_log=agent_log,
    )
