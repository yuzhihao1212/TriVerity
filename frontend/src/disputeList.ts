// Pure helpers for the console's dispute sidebar (App.tsx, FilterMenu.tsx).

import { DECISION_LABELS } from "./outcomeTone";
import type { Decision, DisputeCase } from "./types";

export type DisputeFilter = "all" | DisputeCase["type"];
export type Tone = "ok" | "warn" | "neutral";

export type Category = "route" | "no-show" | "other";
export function disputeCategory(type: string): Category {
  return type === "route_deviation" ? "route" : type === "no_show_charge" ? "no-show" : "other";
}

/** Group an already-sorted queue without changing the order inside each category. */
export function groupByCategory<T extends { type: string }>(cases: readonly T[], filter = "all") {
  const categories: { id: Category; label: string }[] = [
    { id: "route", label: "Route" }, { id: "no-show", label: "No-show" }, { id: "other", label: "Other" },
  ];
  return categories.map(category => {
    const items = cases.filter(item => (filter === "all" || item.type === filter) && disputeCategory(item.type) === category.id);
    return { ...category, items, count: items.length };
  }).filter(group => group.count > 0);
}

export const TYPE_LABELS: Record<DisputeCase["type"], string> = {
  route_deviation: "Route deviation",
  no_show_charge: "No-show charge",
};

/** Menu order. `short` labels the removable chip shown while a filter is active. */
export const FILTER_OPTIONS: { value: DisputeFilter; label: string; short: string | null }[] = [
  { value: "all", label: "All disputes", short: null },
  { value: "route_deviation", label: "Route deviation", short: "Route" },
  { value: "no_show_charge", label: "No-show charge", short: "No-show" },
];

const option = (value: string) => FILTER_OPTIONS.find(item => item.value === value) ?? FILTER_OPTIONS[0];

export function isFilter(value: string): value is DisputeFilter {
  return FILTER_OPTIONS.some(item => item.value === value);
}
/** "Route deviation"; "All disputes" for "all" or anything unknown. */
export function filterLabel(value: string): string { return option(value).label; }
/** "Route" / "No-show"; null when no filter is active. */
export function filterShortLabel(value: string): string | null { return option(value).short; }
/** The funnel button's name, carrying the active filter so it is heard without opening the menu. */
export function filterButtonLabel(value: string): string {
  return option(value).short ? `Filter disputes: ${filterLabel(value)}` : "Filter disputes";
}

/** Ruling status for a list item: the same wording as everywhere else. */
export const STATUS_LABELS: Record<Decision, string> = DECISION_LABELS;

/** One source of truth for outcome tones (outcomeTone.ts): the sidebar dots match the ruling, header and bar. */
export { decisionTone } from "./outcomeTone";

/** Keep category and ruling audible on each case, including when navigating by buttons. */
export function disputeItemName(dispute: Pick<DisputeCase, "dispute_id" | "type">, summary: string, decision?: Decision | null): string {
  const type = TYPE_LABELS[dispute.type] ?? dispute.type;
  return `${dispute.dispute_id}, ${type}: ${summary}${decision ? `. Ruling: ${STATUS_LABELS[decision]}` : ""}`;
}

/** Roving focus inside the filter menu: arrows wrap, Home/End jump; other keys keep the index. */
export function menuIndex(current: number, key: string, count: number): number {
  if (count <= 0) return -1;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowDown") return (current + 1 + count) % count;
  if (key === "ArrowUp") return (current - 1 + count) % count;
  return Math.min(Math.max(current, 0), count - 1);
}
