from typing import Literal
from pydantic import BaseModel, Field

Decision = Literal["partial_refund", "full_refund", "compensation", "no_action", "needs_review"]
CaseSource = Literal["llm", "fallback"]
RiskLevel = Literal["low", "medium", "high"]

class AgentCase(BaseModel):
    agent: str
    summary: str
    evidence: list[str] = Field(default_factory=list)
    policy_refs: list[str] = Field(default_factory=list)
    source: CaseSource = "fallback"

class RiskAssessment(BaseModel):
    rider_risk: RiskLevel = "low"
    driver_risk: RiskLevel = "low"
    signals: list[str] = Field(default_factory=list)
    summary: str = ""

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
    # Whether the LLM wrote the three explanations or the rule templates were kept.
    explanation_source: CaseSource = "fallback"

class Resolution(Ruling):
    rider_case: AgentCase
    driver_case: AgentCase
    risk: RiskAssessment = Field(default_factory=RiskAssessment)
    agent_log: list[AgentLogEntry] = Field(default_factory=list)
