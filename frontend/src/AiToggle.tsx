import type { AiMode } from "./aiMode";

/** Switch between live AI (Hy3, uses tokens) and offline (free; template text, same ruling). */
export function AiToggle({ mode, onToggle }: { mode: AiMode; onToggle: () => void }) {
  const live = mode === "live";
  return (
    <button type="button" role="switch" aria-checked={live} className={`ai-toggle ${mode}`} onClick={onToggle}
      title={live ? "AI is live: agents use Hy3 (about $0.002 per run). Switch to offline to run free."
                  : "Offline: no AI calls, no cost. Rulings are identical; arguments and explanations use template text."}>
      <span className="ai-toggle-track" aria-hidden="true"><span className="ai-toggle-thumb" /></span>
      <span>AI <strong>{live ? "Live" : "Offline"}</strong></span>
    </button>
  );
}
