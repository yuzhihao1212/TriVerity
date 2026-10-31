import { RULES } from "./glossary";
import { titleCase } from "./presentation";
import { appliedRuleIds, OVERLAY_RULES, suppliedConditions } from "./rulingDetails";
import { RULE_SUMMARIES } from "./ruleSummaries";
import type { Resolution } from "./types";

const POLICIES: Record<string, string> = { NS: "No-show fee policy", RD: "Route and fare policy" };

export type RuleStatus = "met" | "not_met" | "applied" | "triggered" | "unchecked";

export interface CaseRule { rule: string; text: string; status: RuleStatus; result: string }

/** The panel's subtitle names the policy, so each line can drop the words it would repeat. */
function ruleLine(rule: string): string {
  return (RULE_SUMMARIES[rule] ?? RULES[rule] ?? rule).replace(/^No-show fee only if/, "Fee only if").replace(" → ", ": ");
}

const prefixOf = (rule: string) => rule.split("-")[0];
const plural = (count: number, one: string) => count === 1 ? `1 ${one}` : `${count} ${one}s`;

/**
 * The rules for this kind of dispute and what each found on this case, in the order the engine
 * checked them. Rules it never reached say "Not checked": the panel never works out a result itself.
 */
export function rulesForCase(result: Pick<Resolution, "conditions" | "policy_refs" | "decision">) {
  const checks = suppliedConditions(result);
  const base = checks.filter(check => !OVERLAY_RULES.test(check.rule));
  const family = base[0] ? prefixOf(base[0].rule) : null;
  if (!family || !POLICIES[family]) return null;
  const applied = appliedRuleIds(result.policy_refs);
  const review = result.decision === "needs_review";

  const checked = base.filter(check => prefixOf(check.rule) === family).map((check): CaseRule => {
    const gap = review && !check.met && applied.includes(check.rule);
    // These rules only act on missing data, so "Met: Available" on "…missing" would read backwards.
    const dataRule = /-4$/.test(check.rule) && check.met;
    return { rule: check.rule, text: ruleLine(check.rule), status: gap ? "applied" : check.met ? "met" : "not_met",
      result: dataRule ? check.value : `${gap ? "Applied" : check.met ? "Met" : "Not met"}: ${check.value}` };
  });
  const seen = new Set(checked.map(row => row.rule));
  const unchecked = Object.keys(RULE_SUMMARIES).filter(rule => prefixOf(rule) === family && !seen.has(rule))
    .map((rule): CaseRule => ({ rule, text: ruleLine(rule), status: "unchecked", result: "Not checked" }));
  const overlays = checks.filter(check => OVERLAY_RULES.test(check.rule));
  const triggers = overlays.filter(check => check.met && applied.includes(check.rule))
    .map((check): CaseRule => ({ rule: check.rule, text: ruleLine(check.rule), status: "triggered", result: `Triggered: ${check.value}` }));
  const quiet = overlays.length - triggers.length;
  const rows = [...triggers, ...checked, ...unchecked];

  const stoppedAt = checked.find(row => row.status === "applied");
  const count = (status: RuleStatus) => rows.filter(row => row.status === status).length;
  const parts = [
    count("triggered") && `${count("triggered")} triggered`,
    count("met") && `${count("met")} met`,
    count("not_met") && `${count("not_met")} not met`,
    count("applied") && `${count("applied")} applied`,
    count("unchecked") && `${count("unchecked")} not checked`,
  ].filter(Boolean);
  return {
    policy: titleCase(POLICIES[family]),
    rows,
    otherChecks: quiet ? `${plural(quiet, "Other Check")}: None Triggered` : null,
    note: stoppedAt && unchecked.length ? `The rules stopped at ${stoppedAt.rule}, so ${unchecked.length === 1 ? "this one is" : `these ${unchecked.length} are`} yours to weigh.` : null,
    summary: `${POLICIES[family]}: ${parts.join(", ")}`,
  };
}

const GROUPS = [["NS", "No-show fee policy"], ["RD", "Route and fare policy"], ["", "Rules for every case"]] as const;

/** Every rule's full wording, grouped for the "See Full Policy" dialog. */
export function fullPolicy() {
  const known = new Set(["NS", "RD"]);
  return GROUPS.map(([prefix, title]) => ({
    title: titleCase(title),
    rules: Object.keys(RULES).filter(rule => prefix ? prefixOf(rule) === prefix : !known.has(prefixOf(rule))).map(rule => ({ rule, text: RULES[rule] })),
  }));
}
