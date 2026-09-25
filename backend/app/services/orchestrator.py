from app.agents.rider_agent import build_rider_case
from app.agents.driver_agent import build_driver_case
from app.agents.judge_agent import judge
from app.models.dispute import DisputeCase

def resolve_dispute(case: DisputeCase) -> dict:
    agent_log = []

    rider_case = build_rider_case(case)
    agent_log.append({"step": 1, "agent": "rider_advocate", "status": "completed"})

    driver_case = build_driver_case(case)
    agent_log.append({"step": 2, "agent": "driver_advocate", "status": "completed"})

    ruling = judge(case, rider_case, driver_case)
    agent_log.append({"step": 3, "agent": "judge", "status": "completed"})

    return {
        **ruling,
        "rider_case": rider_case,
        "driver_case": driver_case,
        "agent_log": agent_log,
    }
