export type AiMode = "live" | "offline";
export const AI_MODE_KEY = "triverity.ai";

/** The viewer's saved choice; live (Hy3) unless they chose offline. */
export function readAiMode(storage: Pick<Storage, "getItem">): AiMode {
  try { return storage.getItem(AI_MODE_KEY) === "offline" ? "offline" : "live"; } catch { return "live"; }
}

export function writeAiMode(storage: Pick<Storage, "setItem">, mode: AiMode): void {
  try { storage.setItem(AI_MODE_KEY, mode); } catch { /* Still applies for this session if storage is blocked. */ }
}

/** Query string for the resolve endpoints: offline runs never call the LLM. */
export function aiQuery(mode: AiMode): string {
  return mode === "offline" ? "?ai=off" : "";
}
