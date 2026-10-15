import type { AiMode } from "./aiMode";

/** Switch between live AI (Hy3, uses tokens) and offline (free; template text, same ruling). */
export function AiToggle({ mode, onToggle }: { mode: AiMode; onToggle: () => void }) {
  const live = mode === "live";
  return (
    <button type="button" role="switch" aria-checked={live} className={`ai-toggle ${mode}`} onClick={onToggle}
      title={live ? "AI is live: agents use Hy3 (about $0.002 per run). Switch to offline to run free."
                  : "Offline: no AI calls, no cost. Rulings are identical; arguments and explanations use template text."}>
      <span className="ai-toggle-track" aria-hidden="true"><span className="ai-toggle-thumb" /></span>
      {/* On phones only "AI" shows; the switch keeps its full name. */}
      <span className="ai-toggle-label">AI <strong>{live ? "Live" : "Offline"}</strong></span>
      <span className="ai-toggle-short" aria-hidden="true">AI</span>
    </button>
  );
}
