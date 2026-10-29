/** Details are opt-in; a session remembers an explicit choice for each panel. */
export const AGENT_OPEN_KEY = "triverity.agentDetails";
export function readDetailOpen(key: string, storage?: Pick<Storage, "getItem">): boolean {
  try { return (storage ?? window.sessionStorage).getItem(key) === "open"; }
  catch { return false; }
}
export function writeDetailOpen(key: string, open: boolean, storage?: Pick<Storage, "setItem">): void {
  try { (storage ?? window.sessionStorage).setItem(key, open ? "open" : "closed"); }
  catch { /* Keep the current component state if storage is unavailable. */ }
}
