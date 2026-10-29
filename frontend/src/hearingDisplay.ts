import { computedFacts, factIndex } from "./presentation";
import type { AgentCase, Resolution } from "./types";

/** Keep the whole first sentence, including closing quotes and any inline citations. */
export function bottomLine(text: string): { first: string; rest: string } {
  const trimmed = text.trim();
  const end = /[.!?](?:["'”’)]*)(?:\s*\((?:TRIP|GPS|FARE|CHAT|HIST)-[^)]*\))?(?=\s|$)/.exec(trimmed);
  const split = end ? end.index + end[0].length : trimmed.length;
  return { first: trimmed.slice(0, split), rest: trimmed.slice(split).trim() };
}

/** Facts shown per group before "and N more", so the strip stays a glance, not a list. */
export const GROUP_LIMIT = 4;

/** Compare citations across both rounds; never infer IDs from evidence positions. */
export function comparisonGroups(resolution: Resolution) {
  const cited = (item: AgentCase) => new Set([...item.evidence_ids, ...(item.rebuttal?.evidence_ids ?? [])]);
  const rider = cited(resolution.rider_case), driver = cited(resolution.driver_case);
  // Fact text by ID: the Evidence step's facts first (they cover IDs whose text the advocates
  // didn't pair), then the advocates' own pairs. Unknown IDs keep a null text.
  const facts = new Map<string, string>();
  for (const fact of [...factIndex(resolution), ...(resolution.judge_evidence ? computedFacts(resolution) : [])]) {
    if (fact.id && !facts.has(fact.id)) facts.set(fact.id, fact.text);
  }
  return [
    { title: "Both sides cite", ids: [...rider].filter(id => driver.has(id)) },
    { title: "Only the rider", ids: [...rider].filter(id => !driver.has(id)) },
    { title: "Only the driver", ids: [...driver].filter(id => !rider.has(id)) },
  ].map(group => {
    const all = group.ids.map(id => ({ id, text: facts.get(id) ?? null }));
    // Facts with known text first, so the visible ones say something.
    all.sort((a, b) => Number(b.text !== null) - Number(a.text !== null));
    return { title: group.title, facts: all.slice(0, GROUP_LIMIT), more: Math.max(0, all.length - GROUP_LIMIT) };
  }).filter(group => group.facts.length > 0);
}
