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

export interface Trip {
  expected_distance_km?: number | null;
  actual_distance_km?: number | null;
  expected_duration_min?: number | null;
  actual_duration_min?: number | null;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  driver_arrival_lat?: number | null;
  driver_arrival_lng?: number | null;
  driver_wait_min?: number | null;
  /** The planned route, when the backend has one (e.g. D001, D004): drawn as a dashed line. */
  planned_route?: { lat: number; lng: number }[];
}

export interface DisputeCase {
  dispute_id: string;
  type: DisputeType;
  label?: string | null; // Display-only navigation text; not evidence for the agents.
  rider_claim: string;
  driver_statement?: string | null;
  trip: Trip;
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
  // Raw telemetry, used only to draw the trip visuals (never shown as raw coordinates).
  gps_points?: { lat: number; lng: number; timestamp?: string | null; speed_kmh?: number | null; status?: string | null }[];
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

export interface Autonomy {
  eligible: boolean;
  audit: boolean;
  reasons: string[];
}

export interface PrecedentMatch {
  id: string;
  similarity: number;
  decision: Decision;
  policy_refs: string[];
  decided_by: "policy" | "human_review";
  summary: string;
  note?: string;   // never sent by the API (reviewer notes stay on the server)
}

export interface RuleCheck {
  rule: string;
  verdict: "supports" | "favours_other_side" | "does_not_apply";
  decisive: boolean;
}

export interface ArgumentReview {
  party: "rider" | "driver";
  rules: RuleCheck[];
  evidence_cited: number;
  summary: string;
}

export interface Counterfactual {
  change: string;
  outcome: string;
  decision: Decision | null;
  rules: string[];
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
  started_at?: string | null;   // ISO time the step started
  duration_ms?: number | null;  // how long it took
}

export interface ToolCallRecord {
  round: number;
  tool: string;
  args: Record<string, string>;
  reason: string;
  source: string;
  results: string[];
  party?: "rider" | "driver" | null;
}

export interface Appeal {
  id: string;
  dispute_id: string;
  party: "rider" | "driver";
  reason: string;
  original_decision: Decision;
  priority: "safety" | "standard";
  status: "queued" | "decided";
  created_at: string;
  reviewer_decision: Exclude<Decision, "needs_review"> | null;
  precedent_id: string | null;
}

export interface RulingCondition {
  rule: string;
  label: string;
  met: boolean;
  value: string;
  fact_ids: string[];
}

export interface Resolution {
  // Optional for compatibility with older saved results.
  evidence_collection?: { source: "llm" | "fallback"; rounds?: number; calls?: ToolCallRecord[] } | null;
  decision: Decision;
  recommended_action: string;
  refund_amount: number | null;
  confidence: number;
  // Recorded rule checks and policy threshold; absent/null on older saved results.
  conditions?: RulingCondition[] | null;
  min_confidence?: number | null;
  explanation: string;
  rider_explanation: string;
  driver_explanation: string;
  explanation_source: "llm" | "fallback";
  judge_evidence: string[];
  // Each judge_evidence line's fact ID, in order; missing from results saved before it existed.
  judge_evidence_ids?: string[];
  policy_refs: string[];
  rider_case: AgentCase;
  driver_case: AgentCase;
  risk: RiskAssessment;
  // Absent from backends without triage (before PR #27).
  triage?: Triage;
  // Absent from backends without auto-resolve.
  autonomy?: Autonomy;
  // Absent from backends without the Policy & Precedent agent (before PR #31).
  precedents?: PrecedentReport;
  // What would have changed the ruling (computed from the policy, never by the AI).
  counterfactuals?: Counterfactual[];
  // How the Judge weighed each advocate's cited rules against the facts.
  argument_review?: ArgumentReview[];
  agent_log: AgentLogEntry[];
}
