// Pure helpers for the console's dispute sidebar (App.tsx, FilterMenu.tsx).

import { DECISION_LABELS } from "./outcomeTone";
import type { Decision, DisputeCase } from "./types";

/** "on_hold": the cases waiting for a second reviewer, whatever their kind. */
export type DisputeFilter = "all" | DisputeCase["type"] | "on_hold";
export type Tone = "ok" | "warn" | "neutral";

/** "held" is a status, not a kind: a case on hold sits there instead of under its kind until the hold ends. */
export type Category = "held" | "route" | "no-show" | "other";
export function disputeCategory(type: string): Category {
  return type === "route_deviation" ? "route" : type === "no_show_charge" ? "no-show" : "other";
}

/** Whether a case shows under `filter`: all, one kind, or the cases on hold. */
export function matchesFilter(item: { type: string; dispute_id: string }, filter: string, heldIds: readonly string[] = []): boolean {
  if (filter === "on_hold") return heldIds.includes(item.dispute_id);
  return filter === "all" || item.type === filter;
}

/** The sidebar group a case sits in: On Hold while it waits for a second reviewer, else its kind. */
export function caseCategory(item: { type: string; dispute_id: string }, heldIds: readonly string[] = []): Category {
  return heldIds.includes(item.dispute_id) ? "held" : disputeCategory(item.type);
}

/** Group an already-sorted queue without changing the order inside each category. On Hold comes first. */
export function groupByCategory<T extends { type: string; dispute_id: string }>(cases: readonly T[], filter = "all", heldIds: readonly string[] = []) {
  const categories: { id: Category; label: string }[] = [
    { id: "held", label: "On Hold" }, { id: "route", label: "Route" }, { id: "no-show", label: "No-show" }, { id: "other", label: "Other" },
  ];
  return categories.map(category => {
    const items = cases.filter(item => matchesFilter(item, filter, heldIds) && caseCategory(item, heldIds) === category.id);
    return { ...category, items, count: items.length };
  }).filter(group => group.count > 0);
}

/** The collapsed rail: one icon per kind of case in the queue, with the open case's kind marked. */
export function railShortcuts<T extends { type: string; dispute_id: string }>(cases: readonly T[], current: { id: string; summary: string; type: string }) {
  return groupByCategory(cases).map(group => {
    const isCurrent = group.id === disputeCategory(current.type);
    return {
      category: group.id,
      type: group.items[0].type,
      current: isCurrent,
      label: `${group.label} cases: ${group.count}${isCurrent ? `. Current case: ${current.id} · ${current.summary}` : ""}`,
    };
  });
}

export const TYPE_LABELS: Record<DisputeCase["type"], string> = {
  route_deviation: "Route Deviation",
  no_show_charge: "No-show Charge",
};

/** Menu order. `short` labels the removable chip shown while a filter is active. */
export const FILTER_OPTIONS: { value: DisputeFilter; label: string; short: string | null }[] = [
  { value: "all", label: "All Disputes", short: null },
  { value: "route_deviation", label: "Route Deviation", short: "Route" },
  { value: "no_show_charge", label: "No-show Charge", short: "No-show" },
  { value: "on_hold", label: "On Hold", short: "On hold" },
];
/** The menu's options: On Hold only while some case is on hold. */
export function filterOptions(anyHeld: boolean) {
  return FILTER_OPTIONS.filter(item => item.value !== "on_hold" || anyHeld);
}

const option = (value: string) => FILTER_OPTIONS.find(item => item.value === value) ?? FILTER_OPTIONS[0];

export function isFilter(value: string): value is DisputeFilter {
  return FILTER_OPTIONS.some(item => item.value === value);
}
/** "Route Deviation"; "All Disputes" for "all" or anything unknown. */
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
