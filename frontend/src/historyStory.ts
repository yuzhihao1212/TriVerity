// The History card: two readable profiles, and attention only when the fraud detector earned it.
// Policy rulings never use party history; it only feeds the bad-faith check. Pure functions.

import { oneDecimal, thousands } from "./numberFormat";
import type { RiskAssessment } from "./types";

export const MISSING = "—";

export interface HistoryFact { party: "rider" | "driver"; days: number; rating: number; trips: number; disputes: number | null }

/** "Rider history: account 820 days old, rating 4.8, 214 trips, 0 disputes in last 90 days". */
export function parseHistory(text: string): HistoryFact | null {
  const match = /^(Rider|Driver) history: account (\d+) days old, rating (\d+(?:\.\d+)?), (\d+) trips(?:, (\d+) disputes in last 90 days)?$/.exec(text);
  if (!match) return null;
  return { party: match[1].toLowerCase() as "rider" | "driver", days: Number(match[2]), rating: Number(match[3]),
    trips: Number(match[4]), disputes: match[5] !== undefined ? Number(match[5]) : null };
}

/** 820 days -> "2.2 yrs on Ryde"; under a year in months ("3 months on Ryde"). */
export function tenureText(days: number | null | undefined): string {
  if (days == null || !Number.isFinite(days)) return MISSING;
  if (days < 365) { const months = Math.max(1, Math.round(days / 30.44)); return `${months} ${months === 1 ? "month" : "months"} on Ryde`; }
  const years = oneDecimal(days / 365.25);
  return `${years} ${years === "1" ? "yr" : "yrs"} on Ryde`;
}

export interface Profile { tenure: string; rating: string; ratingLabel: string; trips: string; disputes: string }

export function profile(history: { days?: number | null; rating?: number | null; trips?: number | null; disputes?: number | null }): Profile {
  const rating = history.rating != null ? trimRating(history.rating) : null;
  return {
    tenure: tenureText(history.days),
    rating: rating ?? MISSING,
    ratingLabel: rating ? `${rating} rating out of 5` : "Rating not recorded",
    trips: history.trips != null ? `${thousands(history.trips)} ${history.trips === 1 ? "trip" : "trips"}` : `${MISSING} trips`,
    disputes: history.disputes != null ? `${thousands(history.disputes)} ${history.disputes === 1 ? "dispute" : "disputes"} (90d)` : `${MISSING} disputes (90d)`,
  };
}
const trimRating = (rating: number) => (Math.round(rating * 10) / 10).toFixed(1);

export interface HistoryRisk { tone: "danger" | "warn" | "neutral"; label: string | null; signals: string[] }

/**
 * Tone from the fraud detector's own assessment only: high -> danger, medium -> warn, else
 * neutral. History counts alone never change the colour.
 */
export function historyRisk(risk: Pick<RiskAssessment, "rider_risk" | "driver_risk" | "signals"> | null | undefined, party: "rider" | "driver"): HistoryRisk {
  const level = risk ? (party === "rider" ? risk.rider_risk : risk.driver_risk) : "low";
  const who = party === "rider" ? "Rider" : "Driver";
  const signals = (risk?.signals ?? []).filter(signal => signal.startsWith(`${who} `) || signal.startsWith(`${who}'s `));
  if (level === "high") return { tone: "danger", label: "High bad-faith risk", signals };
  if (level === "medium") return { tone: "warn", label: "Some bad-faith signals", signals };
  return { tone: "neutral", label: null, signals: [] };
}

export const FAIRNESS_NOTE = "Context only: party history never changes the policy ruling. It's used only to check for bad-faith patterns.";
