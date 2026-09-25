from typing import Any
from pydantic import BaseModel, Field

class AgentCase(BaseModel):
    agent: str
    summary: str
    evidence: list[str] = Field(default_factory=list)
    policy_refs: list[str] = Field(default_factory=list)

class Resolution(BaseModel):
    decision: str
    recommended_action: str
    confidence: float
    explanation: str
    rider_case: AgentCase
    driver_case: AgentCase
    judge_evidence: list[str] = Field(default_factory=list)
    agent_log: list[dict[str, Any]] = Field(default_factory=list)
