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

export interface AgentCase {
  agent: string;
  summary: string;
  evidence: string[];
  policy_refs: string[];
  source: "llm" | "fallback";
}

export interface AgentLogEntry {
  step: number;
  agent: string;
  status: string;
  message: string;
}

export interface Resolution {
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
  agent_log: AgentLogEntry[];
}
