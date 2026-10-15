from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field

Decision = Literal["partial_refund", "full_refund", "compensation", "no_action", "needs_review"]
CaseSource = Literal["llm", "fallback"]
RiskLevel = Literal["low", "medium", "high"]
TriageTier = Literal["safety", "high", "standard", "low"]

class Rebuttal(BaseModel):
    """An advocate's reply to the other side's case (second round)."""
    text: str = ""
    # Verified fact texts and their IDs (e.g. "GPS-2"), resolved by the server.
    evidence: list[str] = Field(default_factory=list)
    evidence_ids: list[str] = Field(default_factory=list)
    source: CaseSource = "fallback"

class AgentCase(BaseModel):
    agent: str
    summary: str
    evidence: list[str] = Field(default_factory=list)
    # IDs of the cited facts (e.g. "TRIP-1", "GPS-2") and the evidence sources they come
    # from ("trip", "gps", "fare", "chat", "history"), when the advocate cited by ID.
    evidence_ids: list[str] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)
    policy_refs: list[str] = Field(default_factory=list)
    source: CaseSource = "fallback"
    rebuttal: Rebuttal | None = None

class RiskAssessment(BaseModel):
    rider_risk: RiskLevel = "low"
    driver_risk: RiskLevel = "low"
    signals: list[str] = Field(default_factory=list)
    summary: str = ""

class Triage(BaseModel):
    """Review priority for an escalated dispute (internal only; see services/triage.py).

    ``tier`` is None when no human review is needed. ``score`` (0-100) orders
    cases within a tier; the tier itself always wins.
    """
    tier: TriageTier | None = None
    score: int = Field(default=0, ge=0, le=100)
    reasons: list[str] = Field(default_factory=list)
class PrecedentMatch(BaseModel):
    """A similar past ruling from the precedent knowledge base."""
    id: str
    similarity: float = Field(ge=0.0, le=1.0)
    decision: Decision
    policy_refs: list[str] = Field(default_factory=list)   # rule IDs only
    # "policy": the rules' decision, accepted; "human_review": a reviewer's decision.
    decided_by: Literal["policy", "human_review"] = "policy"
    summary: str = ""
    # Reviewer note: internal only. Never sent to the LLM, and excluded from every API
    # response, so one reviewer's free text never reaches another user.
    note: str = Field(default="", exclude=True)

class PrecedentReport(BaseModel):
    """The Policy & Precedent agent's findings for one dispute (internal only)."""
    matches: list[PrecedentMatch] = Field(default_factory=list)
    # Majority decision among close matches, None when there are none or no majority.
    recommended_decision: Decision | None = None
    # "consistent": every close match agrees with the rules; "mixed": some don't;
    # "overridden": reviewers decided close cases differently (PREC-1 escalates);
    # "no_precedent": nothing close enough.
    consistency: Literal["consistent", "mixed", "overridden", "no_precedent"] = "no_precedent"
    summary: str = ""

class ToolCallRecord(BaseModel):
    """One data-source tool call made by the Evidence Collection agent."""
    round: int
    tool: str
    args: dict[str, str] = Field(default_factory=dict)
    reason: str = ""
    source: str                     # evidence group: trip, gps, fare or chat
    results: list[str] = Field(default_factory=list)

class EvidenceCollection(BaseModel):
    """What the Evidence Collection agent gathered, and whether the LLM planned it."""
    source: CaseSource = "fallback"
    rounds: int = 0
    calls: list[ToolCallRecord] = Field(default_factory=list)

class Counterfactual(BaseModel):
    """What would have changed the ruling (computed from the policy thresholds, never by the LLM)."""
    change: str                       # e.g. "the route had been at most 15% longer than expected (it was 44% longer)"
    outcome: str                      # the result in plain words
    decision: Decision | None = None  # None: the case would be decided automatically instead of escalated
    rules: list[str] = Field(default_factory=list)

class RuleCheck(BaseModel):
    rule: str
    # Whether the rule's condition, on these facts, favours the advocate who cited it.
    verdict: Literal["supports", "favours_other_side", "does_not_apply"]
    decisive: bool = False   # applied by the ruling, in this advocate's favour

class ArgumentReview(BaseModel):
    """How the Judge weighed one advocate's case (computed in code, internal only)."""
    party: Literal["rider", "driver"]
    rules: list[RuleCheck] = Field(default_factory=list)
    evidence_cited: int = 0
    summary: str = ""

class AgentLogEntry(BaseModel):
    step: int
    agent: str
    status: str
    message: str = ""
    # When the step started and how long it took (steps that ran in parallel overlap).
    started_at: datetime | None = None
    duration_ms: int | None = None

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
    triage: Triage = Field(default_factory=Triage)
    precedents: PrecedentReport = Field(default_factory=PrecedentReport)
    # What would have changed the ruling; internal only, like the rest of the reasoning.
    counterfactuals: list[Counterfactual] = Field(default_factory=list)
    # How the Judge weighed each advocate's cited rules against the facts; internal only.
    argument_review: list[ArgumentReview] = Field(default_factory=list)
    evidence_collection: EvidenceCollection = Field(default_factory=EvidenceCollection)
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
