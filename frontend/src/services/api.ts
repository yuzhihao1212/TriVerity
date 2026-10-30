import { aiQuery, type AiMode } from "../aiMode";
import { readResolveStream, withResolveFallback } from "./sse";
import type { AgentLogEntry, Appeal, Decision, DisputeCase, Resolution } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

/** An API error with a message a judge can act on (see docs/api-contract.md, "Limits and errors"). */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function describe(status: number, retryAfter: number | null): string {
  switch (status) {
    case 401:
      return "Access code not recognised. Check it and try again.";
    case 404:
      return "This demo resolves the sample disputes only. Enter your judge access code (above Run agents) to submit your own.";
    case 413:
      return "That dispute is too large to send.";
    case 422:
      return "Some fields are too long or out of range: claims and statements up to 2,000 characters, up to 50 chat messages of 500 characters, and realistic trip and fare numbers.";
    case 403:
      return "Appeals and reviewer decisions are turned off in the public demo.";
    case 429:
      return `Rate limit reached. Try again in ${retryAfter ?? 60} seconds.`;
    case 503:
      return `The agents are busy with other disputes. Try again in ${retryAfter ?? 5} seconds.`;
    default:
      return `API error: ${status}`;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    const retryAfter = Number(response.headers.get("Retry-After")) || null;
    throw new ApiError(response.status, describe(response.status, retryAfter));
  }
  return response.json();
}

export function getSamples() {
  return request<DisputeCase[]>("/disputes/samples");
}

export interface BatchResolveItem { dispute_id: string; result: Resolution | null; status: number | null; error: string | null }

/** Resolve sample disputes in one request (the queue's Run all): one hit against the rate limit for the whole batch. */
export function resolveBatch(disputeIds: string[], mode: AiMode = "live") {
  return request<BatchResolveItem[]>(`/disputes/resolve/batch${aiQuery(mode)}`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ dispute_ids: disputeIds }),
  });
}

/** Resolve a dispute. Pass the judge's access code only for their own disputes. */
export function resolveDispute(payload: DisputeCase, accessCode?: string, mode: AiMode = "live") {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessCode) headers["X-Demo-Key"] = accessCode;
  return request<Resolution>(`/disputes/resolve${aiQuery(mode)}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
}

/** Stream internal progress; retry the existing JSON transport at most once. */
export function resolveDisputeLive(payload: DisputeCase, onStep: (entry: AgentLogEntry) => void, onFallback: () => void,
                                   accessCode?: string, mode: AiMode = "live") {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "text/event-stream" };
  if (accessCode) headers["X-Demo-Key"] = accessCode;
  return withResolveFallback(async () => {
    const response = await fetch(`${API_BASE}/disputes/resolve/stream${aiQuery(mode)}`, {
      method: "POST", headers, body: JSON.stringify(payload),
    });
    return readResolveStream(response, onStep);
  }, () => resolveDispute(payload, accessCode, mode), onFallback);
}

const JSON_HEADERS = { "Content-Type": "application/json" };

/** A party contests a ruling (off in the public demo). */
export function fileAppeal(body: { case: DisputeCase; party: "rider" | "driver"; reason: string; original_decision: Decision }) {
  return request<Appeal>("/appeals", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });
}

/** The reviewer's queue for one dispute. */
/** The appeals queue, for one dispute or (no ID) all of them. 403 in the public demo. */
export function listAppeals(disputeId?: string) {
  return request<Appeal[]>(disputeId ? `/appeals?dispute_id=${encodeURIComponent(disputeId)}` : "/appeals");
}

/** The reviewer's final decision on an appeal; it becomes a precedent. */
export function decideAppeal(id: string, body: { decision: Exclude<Decision, "needs_review">; note: string }) {
  return request<Appeal>(`/appeals/${encodeURIComponent(id)}/decision`, {
    method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body),
  });
}

/** A reviewer's final decision on a dispute; it becomes a precedent (off in the public demo). */
export function recordReviewerDecision(body: { case: DisputeCase; decision: Exclude<Decision, "needs_review">; note: string }) {
  return request<{ id: string; summary: string; decision: string }>("/precedents/feedback", {
    method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body),
  });
}
