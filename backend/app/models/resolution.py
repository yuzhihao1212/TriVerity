from typing import Literal
from pydantic import BaseModel, Field

Decision = Literal["partial_refund", "full_refund", "compensation", "no_action", "needs_review"]
CaseSource = Literal["llm", "fallback"]

class AgentCase(BaseModel):
    agent: str
    summary: str
    evidence: list[str] = Field(default_factory=list)
    policy_refs: list[str] = Field(default_factory=list)
    source: CaseSource = "fallback"

class AgentLogEntry(BaseModel):
    step: int
    agent: str
    status: str
    message: str = ""

class Ruling(BaseModel):
    decision: Decision
    recommended_action: str
    refund_amount: float | None = None
    confidence: float = Field(ge=0.0, le=1.0)
    explanation: str
    # The ruling explained to each party; filled in by the judge from `explanation`.
    rider_explanation: str = ""
    driver_explanation: str = ""
    judge_evidence: list[str] = Field(default_factory=list)
    policy_refs: list[str] = Field(default_factory=list)

class Resolution(Ruling):
    rider_case: AgentCase
    driver_case: AgentCase
    agent_log: list[AgentLogEntry] = Field(default_factory=list)
