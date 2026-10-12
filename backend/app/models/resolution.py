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

class PartyResolution(BaseModel):
    """What the rider or the driver may see (finding F8).

    No fraud signals, evidence, history, advocate cases or internal reasoning.
    ``refund_amount`` is set only when a refund is actually given, never for a
    proposal that a human reviewer still has to decide.
    """
    dispute_id: str
    decision: Decision
    refund_amount: float | None = None
    message: str
    explanation_source: CaseSource

    @classmethod
    def of(cls, resolution: Resolution, dispute_id: str, party: Literal["rider", "driver"]) -> "PartyResolution":
        refund_given = resolution.decision in ("partial_refund", "full_refund", "compensation")
        return cls(
            dispute_id=dispute_id,
            decision=resolution.decision,
            refund_amount=resolution.refund_amount if refund_given else None,
            message=resolution.rider_explanation if party == "rider" else resolution.driver_explanation,
            explanation_source=resolution.explanation_source,
        )
