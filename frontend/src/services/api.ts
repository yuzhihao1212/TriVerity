import type { DisputeCase, Resolution } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

export function getSamples() {
  return request<DisputeCase[]>("/disputes/samples");
}

export function resolveDispute(payload: DisputeCase) {
  return request<Resolution>("/disputes/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
