import { FINAL_LABELS, type SavedDecision } from "./decisionState";
import { finalOutcome, type SentRecord } from "./notifyState";
import { DECISION_LABELS, decisionTone } from "./outcomeTone";
import type { FinalHeaderOutcome } from "./stepVisuals";
import type { Decision, DisputeCase, Resolution } from "./types";

const number = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const money = (value: number) => `$${value.toFixed(2)}`;

/** Explicit wording shared by the headline and the saved proposal in the brief. */
export function caseOutcome(_type: DisputeCase["type"], decision: Decision, amount: number | null): string {
  // The shared outcome wording (DECISION_LABELS), lower-cased to sit inside a sentence.
  const label = DECISION_LABELS[decision];
  const text = label.charAt(0).toLowerCase() + label.slice(1);
  if (decision === "no_action" || decision === "needs_review") return text;
  const value = number(amount);
  return `${text}${value == null ? "" : ` ${money(value)}`}`;
}

/**
 * Facts first. The AI's proposal is never shown here (it would anchor the reviewer before
 * they read the evidence); an outcome appears only once the reviewer has decided.
 */
export function caseHeadline(dispute: DisputeCase, _resolution?: Resolution, final?: FinalHeaderOutcome | null) {
  const facts: string[] = [];
  const noShow = dispute.type === "no_show_charge";
  const charged = number(noShow ? dispute.fare.cancellation_fee : dispute.fare.actual);
  // Two sentences that keep the party's claim apart from what the data shows.
  if (charged != null) facts.push(`The rider disputes a ${money(charged)} ${noShow ? "no-show fee" : "fare"}.`);
  if (noShow) {
    const wait = number(dispute.trip.driver_wait_min);
    if (wait != null) facts.push(`The driver waited ${wait} ${wait === 1 ? "minute" : "minutes"} at pickup.`);
  } else {
    const expected = number(dispute.trip.expected_distance_km), actual = number(dispute.trip.actual_distance_km);
    if (expected != null && expected > 0 && actual != null) {
      const percent = Math.round((actual / expected - 1) * 100);
      facts.push(percent === 0 ? "Trip data shows the route matched the expected distance."
        : `Trip data shows the route was ${Math.abs(percent)}% ${percent > 0 ? "longer" : "shorter"} than expected.`);
    }
  }
  const suffix = final?.by === "overridden" ? " (overridden)" : "";
  return {
    facts: facts.join(" "),
    outcome: final ? `Decided: ${caseOutcome(dispute.type, final.decision, final.amount)}${suffix}.` : null,
    tone: final ? decisionTone(final.decision) : "neutral" as const,
  };
}

/** The reviewer's decision (by is null when they accepted the AI ruling); null while undecided. A sent decision survives reloading. */
export function headerFinalOutcome(resolution: Resolution, dispute: DisputeCase, saved: SavedDecision | null | undefined,
  latest: SentRecord | null): FinalHeaderOutcome | null {
  if (saved && saved.kind !== "accepted") {
    const outcome = finalOutcome(resolution, saved, dispute, null);
    const amount = outcome.needsAmount && latest?.decision === saved.decision ? latest.amount : outcome.amount;
    return { decision: saved.decision, amount, by: saved.kind };
  }
  if (saved) return { decision: resolution.decision, amount: resolution.refund_amount, by: null };
  if (latest && (latest.reviewer?.kind === "overridden" || latest.reviewer?.kind === "decided"
    || latest.decision !== resolution.decision || latest.amount !== resolution.refund_amount)) {
    return { decision: latest.decision, amount: latest.amount, by: latest.reviewer?.kind === "decided" ? "decided" : "overridden" };
  }
  if (latest) return { decision: latest.decision, amount: latest.amount, by: null };
  return null;
}

export function whatHappened(dispute: DisputeCase): string | null {
  const parts: string[] = [];
  const { trip, fare } = dispute;
  if (dispute.type === "no_show_charge") {
    const wait = number(trip.driver_wait_min), fee = number(fare.cancellation_fee);
    if (wait != null) parts.push(`Driver waited ${wait} min at pickup`);
    if (fee != null) parts.push(`rider was charged a ${money(fee)} no-show fee`);
  } else {
    const actual = number(trip.actual_distance_km), expected = number(trip.expected_distance_km);
    if (actual != null) parts.push(`Trip was ${actual} km${expected != null ? ` against ${expected} km expected` : ""}`);
    else if (expected != null) parts.push(`Expected trip distance was ${expected} km`);
    const charged = number(fare.actual), expectedFare = number(fare.expected);
    if (charged != null) parts.push(`rider paid ${money(charged)}${expectedFare != null ? ` against ${money(expectedFare)} expected` : ""}`);
    else if (expectedFare != null) parts.push(`expected fare was ${money(expectedFare)}`);
  }
  if (!parts.length) return null;
  const sentence = parts.join("; ");
  return `${sentence[0].toUpperCase()}${sentence.slice(1)}.`;
}

/** At most one item per concern; missing/skipped AI steps are not labelled fallback. */
export function checksBeforeDeciding(resolution?: Resolution): string[] {
  if (!resolution) return [];
  const checks: string[] = [];
  if (resolution.triage?.tier === "safety") checks.push("Safety concern: review first.");
  else if (resolution.decision === "needs_review") checks.push("Escalated: a human reviewer must decide.");
  const highRisk = [resolution.risk?.rider_risk === "high" && "rider", resolution.risk?.driver_risk === "high" && "driver"].filter(Boolean);
  if (highRisk.length) checks.push(`High fraud risk flagged for the ${highRisk.join(" and ")}.`);
  const fallback = [resolution.evidence_collection?.source, resolution.explanation_source,
    resolution.rider_case?.source, resolution.driver_case?.source,
    resolution.rider_case?.rebuttal?.text?.trim() ? resolution.rider_case.rebuttal.source : null,
    resolution.driver_case?.rebuttal?.text?.trim() ? resolution.driver_case.rebuttal.source : null].includes("fallback");
  if (fallback) checks.push("An AI step used fallback template text; check its wording.");
  return checks;
}

export interface BriefRow { label: string; text: string; truncate?: boolean; items?: string[] }

/** The proposed ruling row waits until the reviewer has reviewed the Ruling step (evidence first). */
export function caseBriefRows(dispute: DisputeCase, resolution?: Resolution, { showProposal = false } = {}): BriefRow[] {
  const rows: BriefRow[] = [];
  const happened = whatHappened(dispute);
  if (happened) rows.push({ label: "What happened", text: happened });
  for (const [label, statement] of [["Rider says", dispute.rider_claim], ["Driver says", dispute.driver_statement]] as const) {
    if (statement?.trim()) rows.push({ label, text: statement.trim(), truncate: true });
  }
  if (resolution && showProposal) {
    const parts = [caseOutcome(dispute.type, resolution.decision, resolution.refund_amount)];
    const rule = resolution.policy_refs?.map(ref => /^\s*([A-Z]+-\d+)\b/.exec(ref)?.[1]).find(Boolean);
    if (rule) parts.push(rule);
    const confidence = number(resolution.confidence);
    if (confidence != null && confidence <= 1) parts.push(`${Math.round(confidence * 100)}% confidence`);
    rows.push({ label: "Proposed ruling", text: parts.join(" · ") });
  }
  const checks = checksBeforeDeciding(resolution);
  if (checks.length) rows.push({ label: "Check before deciding", text: checks.join(" "), items: checks });
  return rows;
}

export function runCostText(offline: boolean, hasResult: boolean) {
  return {
    note: offline ? "AI offline · free" : "Uses AI · about $0.002",
    detail: offline ? "AI is offline: the ruling is the same; arguments and explanations use template text. No tokens are used."
      : hasResult ? "This case already has a saved result. Re-running calls the AI agents again and uses real tokens (about $0.002 per run)."
        : "Running calls the AI agents and uses real tokens (about $0.002 per run).",
  };
}
