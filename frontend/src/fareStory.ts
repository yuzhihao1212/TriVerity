// The Fare card's story: a verdict, three checks and the link to the ruling. Only the expected
// TOTAL exists, so the difference is never split into distance and time costs; the reasons
// named are the ones the trip data supports (longer, slower, surge). Pure functions.

import { dollars, minutesText, oneDecimal } from "./numberFormat";
import { decisionLabel } from "./outcomeTone";
import { policyIds } from "./presentation";
import type { DisputeCase, Resolution } from "./types";

const num = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const cents = (value: number) => Math.round(value * 100);

/** Charged and expected fare: the case data first, else the "Fare: charged $X, expected $Y" fact. */
export function fareTotals(dispute: Pick<DisputeCase, "fare">, facts: string[]): { charged: number; expected: number } | null {
  let charged = num(dispute.fare?.actual), expected = num(dispute.fare?.expected);
  if (charged === null || expected === null) {
    for (const text of facts) {
      const match = /^Fare: charged \$(\d[\d,]*\.\d{2}), expected \$(\d[\d,]*\.\d{2})$/.exec(text);
      if (match) { charged ??= Number(match[1].replace(/,/g, "")); expected ??= Number(match[2].replace(/,/g, "")); break; }
    }
  }
  return charged !== null && expected !== null ? { charged, expected } : null;
}

function surgeOf(dispute: Pick<DisputeCase, "fare">, facts: string[]): number | null {
  for (const text of facts) {
    const match = /^(?:Surge pricing applied: x|Fare: surge multiplier x)(\d+(?:\.\d+)?)$/.exec(text);
    if (match) return Number(match[1]);
  }
  return num(dispute.fare?.surge_multiplier);
}

export interface FareHeadline { lead: string; rest: string; differenceCents: number }

/**
 * "Charged $6.30 more than expected (+34%)" + ", because the trip was 4.5 km and 13 minutes
 * longer than planned." / "Charged $18.50, as expected." / "Charged $2.00 less than expected."
 */
export function fareHeadline(dispute: Pick<DisputeCase, "fare" | "trip">, facts: string[]): FareHeadline | null {
  const totals = fareTotals(dispute, facts);
  if (!totals) return null;
  const difference = cents(totals.charged) - cents(totals.expected);
  if (difference === 0) return { lead: `Charged ${dollars(totals.charged)}, as expected.`, rest: "", differenceCents: 0 };
  if (difference < 0) return { lead: `Charged ${dollars(difference / 100)} less than expected.`, rest: "", differenceCents: difference };
  const percent = totals.expected > 0 ? Math.round((difference / cents(totals.expected)) * 100) : null;
  const lead = `Charged ${dollars(difference / 100)} more than expected${percent !== null ? ` (+${percent}%)` : ""}`;
  const trip = dispute.trip ?? {};
  const extraKm = (num(trip.actual_distance_km) ?? 0) - (num(trip.expected_distance_km) ?? Infinity);
  const extraMin = (num(trip.actual_duration_min) ?? 0) - (num(trip.expected_duration_min) ?? Infinity);
  const longer = [extraKm >= 0.05 ? `${oneDecimal(extraKm)} km` : null, extraMin >= 0.5 ? minutesText(extraMin) : null].filter(Boolean);
  const reasons: string[] = [];
  if (longer.length) reasons.push(`the trip was ${longer.join(" and ")} longer than planned`);
  const surge = surgeOf(dispute, facts);
  if (surge !== null && surge > 1) reasons.push(`surge pricing (x${surge}) applied`);
  return { lead, rest: reasons.length ? `, because ${reasons.join(", and ")}.` : ".", differenceCents: difference };
}

export interface FareCheck {
  key: "lines" | "surge" | "promo"; label: string; tone: "ok" | "warn" | "danger" | "neutral"; icon: "check" | "warning" | null;
  /** The original sentence. */
  title: string;
  /** Every fact sentence the check stands for (shown under the checks, never dropped). */
  sources: string[];
}

/** Lines add up? Surge? Promo? One check each, with the original sentence as its title. */
export function fareChecks(dispute: Pick<DisputeCase, "fare">, facts: string[]): FareCheck[] {
  const checks: FareCheck[] = [];
  const find = (re: RegExp) => facts.find(text => re.test(text));
  const matches = find(/^Fare breakdown matches the charged fare$/);
  const mismatch = find(/^Charged fare is [+-]\d+\.\d{2} vs the itemised breakdown$/);
  if (mismatch) {
    const amount = /([+-])(\d+\.\d{2})/.exec(mismatch)!;
    checks.push({ key: "lines", label: `Lines don't add up: $${amount[2]} unexplained`, tone: "danger", icon: "warning", title: mismatch, sources: [mismatch] });
  } else if (matches) checks.push({ key: "lines", label: "Lines add up", tone: "ok", icon: "check", title: matches, sources: [matches] });

  const surgeFact = find(/^(Surge pricing applied: x|Fare: surge multiplier x)/);
  const surge = surgeOf(dispute, facts);
  const inconsistent = find(/^Surge breakdown inconsistent with the multiplier$/);
  const consistent = find(/^Surge breakdown consistent with the multiplier$/);
  const surgeSources = [surgeFact, inconsistent ?? consistent].filter((text): text is string => !!text);
  if (surge !== null && surge > 1) {
    checks.push(inconsistent
      ? { key: "surge", label: `Surge x${surge} doesn't match the breakdown`, tone: "warn", icon: "warning", title: inconsistent, sources: surgeSources }
      : { key: "surge", label: `Surge x${surge}`, tone: "neutral", icon: null, title: surgeFact ?? `Surge multiplier x${surge}`, sources: surgeSources });
  } else if (surgeFact || surge !== null) checks.push({ key: "surge", label: "No surge pricing", tone: "ok", icon: "check", title: surgeFact ?? "Surge multiplier x1", sources: surgeSources });

  const reflected = find(/^Promo \S+ discount reflected in the charge$/);
  const missing = find(/^Promo \S+ discount not reflected in the charge$/);
  const applied = find(/^(Promo code \S+ applied|Fare: promo \S+ \()/);
  const code = /Promo(?: code)? (\S+)|promo (\S+)/.exec(missing ?? reflected ?? applied ?? "");
  const name = code?.[1] ?? code?.[2];
  const promoSources = [applied, reflected ?? missing].filter((text): text is string => !!text);
  if (missing && name) checks.push({ key: "promo", label: `Promo ${name} not applied to the charge`, tone: "warn", icon: "warning", title: missing, sources: promoSources });
  else if ((reflected || applied) && name) checks.push({ key: "promo", label: `Promo ${name} applied`, tone: "ok", icon: "check", title: (reflected ?? applied)!, sources: promoSources });
  return checks;
}

/** "$24.80 charged · expected $18.50 · +$6.30". */
export function fareTotalLine(charged: number, expected?: number | null): { charged: string; expected: string | null; difference: string | null } {
  if (expected == null) return { charged: dollars(charged), expected: null, difference: null };
  const difference = cents(charged) - cents(expected);
  return { charged: dollars(charged), expected: dollars(expected), difference: difference ? `${difference > 0 ? "+" : "−"}${dollars(difference / 100)}` : null };
}

export interface RulingLink { kind: "refund" | "allowed" | "review" | "other"; before: string; strong?: string; after?: string; rule?: string }

/** How the fare difference relates to the ruling. Null without a ruling or an overcharge. */
export function fareRulingLink(resolution: Pick<Resolution, "decision" | "refund_amount" | "policy_refs"> | null | undefined, differenceCents: number): RulingLink | null {
  if (!resolution || differenceCents <= 0) return null;
  const rule = policyIds(resolution.policy_refs ?? [])[0];
  const refund = num(resolution.refund_amount);
  if (resolution.decision === "needs_review") return { kind: "review", before: "A reviewer decides; the difference is shown for context." };
  if (resolution.decision === "no_action") return { kind: "allowed", before: "No refund: the policy allows this difference", rule };
  if (refund !== null && cents(refund) === differenceCents) return { kind: "refund", before: "This difference is the ", strong: `${dollars(refund)} refund`, after: " the ruling approved", rule };
  return { kind: "other", before: "The ruling: ", strong: `${decisionLabel(resolution.decision)}${refund !== null ? ` ${dollars(refund)}` : ""}`, rule };
}
