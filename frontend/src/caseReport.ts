import { rulesForCase } from "./casePolicy";
import type { HoldRecord, SavedDecision } from "./decisionState";
import { factTexts } from "./hearingDisplay";
import { finalOutcome, sentOutcomeText, type SentRecord } from "./notifyState";
import { DECISION_LABELS } from "./outcomeTone";
import { evidenceItems, money, outputSources, SOURCE_LABELS, titleCase } from "./presentation";
import { confidenceDisplay, rulingBrief } from "./verdictDisplay";
import type { Decision, DisputeCase, Resolution } from "./types";

interface ReportState {
  resolution: Resolution;
  saved: SavedDecision | null;
  hold: HoldRecord | null;
  sent: SentRecord | null;
  latest: SentRecord | null;
}

export interface CaseReportInput extends ReportState { dispute: DisputeCase; reviewNumber: number }

const refundAmount = (decision: Decision, amount: number | null | undefined) =>
  decision !== "no_action" && decision !== "needs_review" && amount != null && Number.isFinite(amount) ? amount : null;

function outcomeText(decision: Decision, amount?: number | null) {
  const value = refundAmount(decision, amount);
  return `${DECISION_LABELS[decision]}${value != null ? ` ${money(value)}` : ""}`;
}

/** A recorded decision is still a draft outcome until this review's messages were sent. */
export function reportStatus({ resolution, saved, hold, sent, latest }: ReportState) {
  if (sent?.reviewer?.kind === "auto") return { final: true, label: "Final: Closed Automatically",
    note: `The rules closed this case with no person involved. Sent to the rider and driver: ${sentOutcomeText(sent)}.` };
  if (sent) return { final: true, label: sent.correction ? "Final: Correction Sent" : "Final",
    note: `Sent to the rider and driver: ${sentOutcomeText(sent)}.` };
  if (latest) return { final: false, label: "Not Final: Reopened",
    note: `Earlier outcome sent to the rider and driver${latest.reviewer?.kind === "auto" ? ", with no person involved" : ""}: ${sentOutcomeText(latest)}. Nothing has been sent in this review.` };
  if (hold) return { final: false, label: "Not Final: On Hold", note: "Waiting for a second reviewer. Nothing has been sent." };
  if (saved) return { final: false, label: "Not Final: Not Yet Sent",
    note: `Decided: ${outcomeText(saved.decision, saved.amount ?? (saved.kind === "accepted" ? resolution.refund_amount : null))}. Nothing has been sent.` };
  if (resolution.decision === "needs_review") return { final: false, label: "Not Final: Awaiting Reviewer",
    note: "A human reviewer must decide this case. Nothing has been sent." };
  return { final: false, label: "Not Final: Proposed Ruling", note: "This is the rules' proposed outcome. Nothing has been sent." };
}

const sourceWords = (source: string | null | undefined) => source === "llm" ? "Hy3" : source === "fallback" ? "Fallback text" : "Not run";

/** A snapshot assembled solely from the current case, ruling and review records. */
export function caseReport(input: CaseReportInput) {
  const { dispute, resolution, saved, hold, sent, reviewNumber } = input;
  const sources = outputSources(resolution);
  const authored = (text: string | null | undefined, source: string | null | undefined) => ({
    text: text?.trim() || null, author: sourceWords(text?.trim() ? source : null),
  });
  // A sent report uses the reviewer and outcome attached to that immutable delivery.
  const person = sent ? sent.reviewer : saved;
  const outcome = person ? (sent ? { decision: sent.decision, amount: sent.amount } : finalOutcome(resolution, person, dispute)) : null;
  const actions: Record<SavedDecision["kind"], string> = {
    accepted: "Accepted the policy ruling", overridden: "Overrode the policy ruling",
    decided: "Decided after escalation", auto: "Closed automatically by policy",
  };
  return {
    id: dispute.dispute_id,
    title: `Case Report ${dispute.dispute_id}`,
    reviewNumber,
    raised: dispute.raised_at ?? null,
    status: reportStatus(input),
    ruling: {
      outcome: outcomeText(resolution.decision, resolution.refund_amount),
      amount: refundAmount(resolution.decision, resolution.refund_amount),
      action: resolution.recommended_action,
      brief: rulingBrief(resolution),
      confidence: confidenceDisplay(resolution),
    },
    reviewer: person && person.kind !== "auto" && outcome ? {
      action: actions[person.kind], decision: outcome.decision,
      outcome: sent ? sentOutcomeText(sent) : outcomeText(outcome.decision, outcome.amount),
      amount: refundAmount(outcome.decision, outcome.amount),
      reason: person.reason?.trim() || null, at: person.at || sent?.at || null,
      precedentId: person.precedentId || null,
    } : null,
    hold: hold ? { ...hold } : null,
    claims: { rider: dispute.rider_claim, driver: dispute.driver_statement?.trim() || "No statement recorded." },
    rules: rulesForCase(resolution),
    facts: [...factTexts(resolution)].sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true })).map(([id, text]) => ({
      id, text, source: SOURCE_LABELS[evidenceItems([text], [id])[0].source],
    })),
    arguments: (["rider", "driver"] as const).map(party => {
      const item = party === "rider" ? resolution.rider_case : resolution.driver_case;
      return { party: titleCase(party), argument: authored(item.summary, item.source), reply: authored(item.rebuttal?.text, item.rebuttal?.source) };
    }),
    explanation: authored(resolution.explanation, resolution.explanation_source),
    signals: [...resolution.risk.signals],
    precedents: (resolution.precedents?.matches ?? []).map(match => ({
      id: match.id, summary: match.summary, outcome: DECISION_LABELS[match.decision],
      similarity: `${Math.round(match.similarity * 100)}%`,
      decidedBy: match.decided_by === "human_review" ? "Reviewer" : "Policy rules",
    })),
    messages: sent ? { at: sent.at, messages: { ...sent.messages }, notes: { ...sent.notes } } : null,
    sources: [{ label: "Evidence collection", source: resolution.evidence_collection?.source }, ...sources]
      .map(item => ({ step: titleCase(item.label), author: sourceWords(item.source) })),
  };
}

export function reportFileTitle(id: string): string { return `TriVerity Case Report ${id}`; }

export interface ReportMenuEntry { id: string; status: ReturnType<typeof reportStatus> | null }

/** The open case first, then final records, then drafts. A case with no result has no report. */
export function reportMenuGroups(entries: ReportMenuEntry[], currentId: string | null) {
  const ready = entries.filter(entry => entry.status);
  const others = ready.filter(entry => entry.id !== currentId);
  return {
    current: ready.find(entry => entry.id === currentId) ?? null,
    final: others.filter(entry => entry.status!.final),
    notFinal: others.filter(entry => !entry.status!.final),
    noResult: entries.length - ready.length,
  };
}
