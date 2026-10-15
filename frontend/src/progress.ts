import type { AgentLogEntry, ToolCallRecord } from "./types";

const CODE_AGENTS = ["evidence_loader", "fraud_detector", "precedent_agent"];
const LANGUAGE_AGENTS = ["evidence_collector", "rider_advocate", "driver_advocate", "rider_rebuttal", "driver_rebuttal", "judge"];

export function stepSource(entry: AgentLogEntry): "llm" | "fallback" | "code" | null {
  if (CODE_AGENTS.includes(entry.agent)) return "code";
  if (!LANGUAGE_AGENTS.includes(entry.agent)) return null;
  const marker = entry.message.match(/^\[(llm|fallback)\]/)?.[1];
  return marker === "llm" || marker === "fallback" ? marker : null;
}

export function stepMessage(entry: AgentLogEntry): string {
  const text = ["llm", "fallback"].includes(stepSource(entry) ?? "")
    ? entry.message.replace(/^\[(llm|fallback)\]\s*/, "") : entry.message;
  return text.split(/\r?\n/, 1)[0] || "Step completed.";
}

export function duration(secondsInMs?: number | null): string | null {
  if (secondsInMs == null || !Number.isFinite(secondsInMs) || secondsInMs < 0) return null;
  return secondsInMs > 0 && secondsInMs < 100 ? "<0.1 s" : `${(secondsInMs / 1000).toFixed(1)} s`;
}

export function callsByRound(calls: ToolCallRecord[]) {
  const rounds = new Map<number, ToolCallRecord[]>();
  for (const call of calls) rounds.set(call.round, [...(rounds.get(call.round) ?? []), call]);
  return [...rounds].sort(([a], [b]) => a - b).map(([round, calls]) => ({ round, calls }));
}
