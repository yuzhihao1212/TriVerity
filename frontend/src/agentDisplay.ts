import { agentSource, type WorkflowTab } from "./workflow";
import type { AgentLogEntry, Resolution } from "./types";

/** The ⓘ toggletip next to each step's agents heading: one line per source badge. */
export const SOURCE_KEY = [
  { label: "Rules", text: "calculated by fixed code, no AI. Same input, same answer." },
  { label: "Hunyuan AI", text: "written by Tencent Hy3, then checked against the records before it's shown." },
] as const;
export function stepHeading(tab: WorkflowTab): string {
  return { intake: "Who recorded this case", evidence: "Who prepared this evidence", hearing: "Who argued each side", ruling: "Who checked and explained the ruling", notify: "Who prepared the party messages" }[tab];
}

/** A folded agent line: the source badge, the action (with how it was done) and the time. */
export interface AgentLineParts {
  action: string;
  source: "llm" | "fallback" | "code" | null;
  how: string | null;
  time: string | null;
}
export function agentLineParts(entry: AgentLogEntry, resolution?: Resolution): AgentLineParts {
  const count = /Computed (\d+) facts?/.exec(entry.message)?.[1];
  let action: string;
  switch (entry.agent) {
    case "evidence_loader": action = count ? `Calculated ${count} facts from the trip, GPS and fare records` : "Calculated facts from the trip, GPS and fare records"; break;
    case "evidence_collector": {
      const requests = [...entry.message.matchAll(/(rider|driver)'s request: (\d+) tool calls?/g)];
      const calls = resolution?.evidence_collection?.calls;
      if (requests.length === 2 && requests[0][2] === requests[1][2]) action = `Looked up ${requests[0][2]} more records for each side`;
      else if (requests.length === 2) action = `Looked up ${Number(requests[0][2]) + Number(requests[1][2])} more records for both sides`;
      else if (calls?.length) action = `Looked up ${calls.length} more records for the review`;
      else action = "Looked up additional records for the review";
      break;
    }
    case "rider_advocate": action = "Argued the rider's side using the recorded evidence"; break;
    case "driver_advocate": action = "Argued the driver's side using the recorded evidence"; break;
    case "rider_rebuttal": action = "Answered the driver's argument for the rider"; break;
    case "driver_rebuttal": action = "Answered the rider's argument for the driver"; break;
    case "fraud_detector": action = "Checked both parties for bad-faith signals"; break;
    case "precedent_agent": action = "Compared similar past cases"; break;
    case "judge": action = "Checked the policy and explained the decision"; break;
    default: action = "Processed the recorded case information";
  }
  // A reply round that produced nothing must not read as if it answered.
  const replyParty = entry.agent === "rider_rebuttal" ? "rider" : entry.agent === "driver_rebuttal" ? "driver" : null;
  if (replyParty && resolution && !resolution[`${replyParty}_case`]?.rebuttal?.text?.trim()) {
    return { action: `No reply was generated for the ${replyParty}`, source: null, how: null, time: null };
  }
  if (!["completed", "complete", "ok"].includes(entry.status)) {
    return { action: entry.status === "skipped" ? "This step was not run." : "This step did not complete.", source: null, how: null, time: null };
  }
  const code = ["evidence_loader", "fraud_detector", "precedent_agent"].includes(entry.agent);
  const source = code ? "code" : resolution ? agentSource(entry.agent, resolution) : /^\[llm\]/.test(entry.message) ? "llm" : /^\[fallback\]/.test(entry.message) ? "fallback" : null;
  const how = source === "code" ? "by rules" : source === "llm" ? "by Tencent Hy3" : source === "fallback" ? "using a fallback template" : "source not supplied";
  const ms = entry.duration_ms;
  const time = typeof ms === "number" && Number.isFinite(ms) && ms >= 0 ? (code && ms < 1000 ? "instant" : `${(ms / 1000).toFixed(1)} s`) : null;
  return { action, source, how, time };
}
