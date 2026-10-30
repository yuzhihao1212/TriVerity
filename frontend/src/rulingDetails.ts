import type { Counterfactual, PrecedentReport, Resolution, Decision } from "./types";

export type CheckRowId = "why" | "risk" | "precedents" | "changes";

/** Count only supplied condition results. Advocate-relative verdicts are not condition results. */
export function conditionCountText(counts: { met: number; total: number; main?: string } | null): string {
  if (!counts || counts.total < 1) return "Condition counts unavailable in this result";
  return `${counts.met} of ${counts.total} rule ${counts.total === 1 ? "condition" : "conditions"} met${counts.main ? `: ${counts.main}` : ""}`;
}

export function appliedRuleIds(refs: readonly string[]): string[] {
  return [...new Set(refs.map(ref => ref.split(":", 1)[0].trim()).filter(Boolean))];
}

/** Never reconstruct engine conditions from advocate verdicts or policy references. */
export function suppliedConditions(resolution: Pick<Resolution, "conditions">) {
  return resolution.conditions ?? [];
}

/** Overlays run after the base rule; "not met" there means nothing was triggered. */
const OVERLAY_RULES = /^(SAFE|FRAUD|PREC|ESC)-/;

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

/** Ask the check as a question so "No" reads right whichever way the rule points. */
export function conditionAnswer(check: { label: string; met: boolean; value: string }): string {
  return `${check.label}? ${check.met ? "Yes" : "No"}${check.value ? ` (${check.value})` : ""}`;
}

/** The closed "Why this outcome?" line: the deciding rules and the first deciding check. */
export function decidingAnswer(resolution: Pick<Resolution, "conditions" | "policy_refs" | "decision">): string | null {
  const { deciding } = conditionGroups(resolution);
  if (!deciding.length) return null;
  const rules = [...new Set(deciding.map(check => check.rule))];
  const list = rules.length === 1 ? rules[0] : `${rules.slice(0, -1).join(", ")} and ${rules[rules.length - 1]}`;
  return `Decided by ${list} · ${conditionAnswer(deciding[0])}`;
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
export function whyAnswer(applied: string[], action: string): string {
  const rules = applied.length ? `${applied.join(" and ")} applied` : "";
  return rules && action ? `${rules}: ${action}` : rules || action || conditionCountText(null);
}

export function reviewRows(resolution: Pick<Resolution, "risk" | "policy_refs" | "precedents" | "counterfactuals" | "recommended_action" | "conditions" | "decision">) {
  const signals = resolution.risk.signals;
  const applied = appliedRuleIds(resolution.policy_refs);
  const rows: { id: CheckRowId; question: string; answer: string; tone: "ok" | "warn" | "neutral"; icon: string }[] = [
    { id: "why", question: "Why this outcome?", answer: decidingAnswer(resolution) ?? whyAnswer(applied, resolution.recommended_action), tone: "neutral", icon: "scales" },
    { id: "risk", question: "Anything suspicious?", answer: signals.length ? `${signals.length} ${signals.length === 1 ? "signal" : "signals"}: ${signals[0]}` : "No risk signals", tone: signals.length ? "warn" : "ok", icon: signals.length ? "warning" : "shield" },
    { id: "precedents", question: "Has this happened before?", answer: precedentSummary(resolution.precedents), tone: "neutral", icon: "history" },
    { id: "changes", question: "What would change the outcome?", answer: resolution.counterfactuals?.[0] ? counterfactualLine(resolution.counterfactuals[0]) : "No alternative conditions supplied in this result", tone: "neutral", icon: "arrow" },
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
