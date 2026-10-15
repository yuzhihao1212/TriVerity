// Mirrors docs/api-contract.md and backend/app/models.

export type DisputeType = "route_deviation" | "no_show_charge";
export type Decision = "partial_refund" | "full_refund" | "compensation" | "no_action" | "needs_review";

export interface ChatMessage {
  sender: "rider" | "driver" | "system";
  message: string;
  timestamp?: string | null;
}

export interface PartyHistory {
  account_age_days?: number | null;
  rating?: number | null;
  completed_trips?: number | null;
  disputes_last_90d?: number | null;
}

export interface DisputeCase {
  dispute_id: string;
  type: DisputeType;
  rider_claim: string;
  driver_statement?: string | null;
  trip: Record<string, number | null>;
  fare: {
    expected?: number | null;
    actual?: number | null;
    cancellation_fee?: number | null;
    surge_multiplier?: number | null;
    promo_code?: string | null;
    promo_discount?: number | null;
    breakdown: { label: string; amount: number }[];
  };
  chat_logs: ChatMessage[];
  rider_history: PartyHistory;
  driver_history: PartyHistory;
}

export interface Rebuttal {
  text: string;
  evidence: string[];
  evidence_ids: string[];
  source: "llm" | "fallback";
}

export interface AgentCase {
  agent: string;
  summary: string;
  evidence: string[];
  evidence_ids: string[];
  sources: string[];
  policy_refs: string[];
  source: "llm" | "fallback";
  rebuttal: Rebuttal | null;
}

export type RiskLevel = "low" | "medium" | "high";

export interface RiskAssessment {
  rider_risk: RiskLevel;
  driver_risk: RiskLevel;
  signals: string[];
  summary: string;
}

export type TriageTier = "safety" | "high" | "standard" | "low";

export interface Triage {
  tier: TriageTier | null;
  score: number;
  reasons: string[];
}

export interface PrecedentMatch {
  id: string;
  similarity: number;
  decision: Decision;
  policy_refs: string[];
  decided_by: "policy" | "human_review";
  summary: string;
  note: string;
}

export interface PrecedentReport {
  matches: PrecedentMatch[];
  recommended_decision: Decision | null;
  consistency: "consistent" | "mixed" | "overridden" | "no_precedent";
  summary: string;
}

export interface AgentLogEntry {
  step: number;
  agent: string;
  status: string;
  message: string;
}

export interface Resolution {
  // Optional until the separate evidence-collector backend PR is deployed.
  evidence_collection?: { source: "llm" | "fallback" } | null;
  decision: Decision;
  recommended_action: string;
  refund_amount: number | null;
  confidence: number;
  explanation: string;
  rider_explanation: string;
  driver_explanation: string;
  explanation_source: "llm" | "fallback";
  judge_evidence: string[];
  policy_refs: string[];
  rider_case: AgentCase;
  driver_case: AgentCase;
  risk: RiskAssessment;
  // Absent from backends without triage (before PR #27).
  triage?: Triage;
  // Absent from backends without the Policy & Precedent agent (before PR #31).
  precedents?: PrecedentReport;
  agent_log: AgentLogEntry[];
}
