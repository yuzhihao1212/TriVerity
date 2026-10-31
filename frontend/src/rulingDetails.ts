import type { Counterfactual, PrecedentReport, Resolution, Decision } from "./types";

export type CheckRowId = "why" | "risk" | "precedents" | "changes";

export function appliedRuleIds(refs: readonly string[]): string[] {
  return [...new Set(refs.map(ref => ref.split(":", 1)[0].trim()).filter(Boolean))];
}

/** Never reconstruct engine conditions from advocate verdicts or policy references. */
export function suppliedConditions(resolution: Pick<Resolution, "conditions">) {
  return resolution.conditions ?? [];
}

/** Overlays run after the base rule; "not met" there means nothing was triggered. */
export const OVERLAY_RULES = /^(SAFE|FRAUD|PREC|ESC)-/;

/**
 * Splits the engine's checks into those that decided this outcome (their rule is in
 * policy_refs) and the rest. An escalated case is decided by what escalated it, not by
 * a base rule that would otherwise have refunded.
 */
export function conditionGroups(resolution: Pick<Resolution, "conditions" | "policy_refs" | "decision">) {
  const checks = suppliedConditions(resolution);
  const applied = appliedRuleIds(resolution.policy_refs);
  const deciding = checks.filter(check => applied.includes(check.rule)
    && (resolution.decision !== "needs_review" || OVERLAY_RULES.test(check.rule) || !check.met));
  return { deciding, others: checks.filter(check => !deciding.includes(check)) };
}

export function precedentSummary(report: PrecedentReport | undefined): string {
  const matches = report?.matches ?? [];
  if (!matches.length) return "No similar cases in this result";
  const nouns: Record<Decision, [string, string]> = {
    partial_refund: ["partial refund", "partial refunds"], full_refund: ["full refund", "full refunds"],
    compensation: ["compensation award", "compensation awards"], no_action: ["unchanged charge", "unchanged charges"],
    needs_review: ["case sent to a human reviewer", "cases sent to a human reviewer"],
  };
  const counts = new Map<string, { decision: Decision; reviewer: boolean; count: number }>();
  for (const match of matches) {
    // A human decision alone does not prove it overrode the rules.
    const key = `${match.decision}:${match.decided_by}`;
    const entry = counts.get(key) ?? { decision: match.decision, reviewer: match.decided_by === "human_review", count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  const outcomes = [...counts.values()].map(item => `${item.count} ${nouns[item.decision][item.count === 1 ? 0 : 1]}${item.reviewer ? " (reviewer decision)" : ""}`);
  return `${matches.length} similar ${matches.length === 1 ? "case" : "cases"}: ${outcomes.join(", ")}`;
}

export function counterfactualLine(item: Counterfactual): string { return `If ${item.change} → ${item.outcome}`; }

/** "RD-3 applied: Refund $6.30, the fare charged above the expected fare." */
export function reviewRows(resolution: Pick<Resolution, "risk" | "precedents" | "counterfactuals">) {
  const signals = resolution.risk.signals;
  // The card above shows the outcome and the checks, so "why" here is only the Judge's own words.
  const rows: { id: CheckRowId; question: string; answer: string; tone: "ok" | "warn" | "neutral"; icon: string }[] = [
    { id: "why", question: "In Plain Words", answer: "How the Judge explains the rules and each side’s argument.", tone: "neutral", icon: "scales" },
    { id: "risk", question: "Anything Suspicious?", answer: signals.length ? `${signals.length} ${signals.length === 1 ? "signal" : "signals"}: ${signals.join("; ")}` : "No risk signals", tone: signals.length ? "warn" : "ok", icon: signals.length ? "warning" : "shield" },
    { id: "precedents", question: "Has This Happened Before?", answer: precedentSummary(resolution.precedents), tone: "neutral", icon: "history" },
    { id: "changes", question: "What Would Change the Outcome?", answer: resolution.counterfactuals?.length ? "Explore alternative facts and their outcomes." : "No alternative conditions supplied in this result", tone: "neutral", icon: "arrow" },
  ];
  return signals.length ? [rows[1], rows[0], ...rows.slice(2)] : rows;
}

export function priorityChip(resolution: Pick<Resolution, "risk" | "triage">): { text: string; tone: "warn" | "neutral" } {
  const signal = resolution.risk.signals.length > 0;
  const tier = resolution.triage?.tier;
  const label = tier === "standard" || tier == null ? "normal" : tier;
  return { text: `Priority: ${label}${signal ? " · risk signal" : ""}`, tone: signal || tier === "safety" || tier === "high" ? "warn" : "neutral" };
}

/** Only the URL query enables debug; a hash, lookalike value or text substring cannot. */
export function debugEnabled(search: string): boolean { return new URLSearchParams(search).get("debug") === "1"; }
