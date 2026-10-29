import type { AiMode } from "./aiMode";
import hunyuanMark from "./assets/logos/hunyuan-mark.webp";

/**
 * Switch between live AI (Hy3, uses tokens) and offline (free; template text, same ruling).
 * A pill: blue with the Hunyuan mark while Hy3 is live; a plain grey outline when off. The mark
 * only ever shows for real Hy3 work, so switching off shrinks it away rather than greying it.
 */
export function AiToggle({ mode, onToggle }: { mode: AiMode; onToggle: () => void }) {
  const live = mode === "live";
  return (
    <button type="button" role="switch" aria-checked={live} className={`ai-toggle ${mode}`} onClick={onToggle}
      aria-label={`Hy3 ${live ? "live" : "off"}`}
      title={live ? "Hy3 is live: agents use Tencent Hy3 (about $0.002 per run). Switch off to run free."
                  : "Hy3 off: no AI calls, no cost. Rulings are identical; arguments and explanations use template text."}>
      <span className="ai-toggle-mark" aria-hidden="true"><img src={hunyuanMark} alt="" /></span>
      {/* Keyed so the new word slides in on each switch. */}
      <span className="ai-toggle-label" key={mode} aria-hidden="true">Hy3 {live ? "live" : "off"}</span>
    </button>
  );
}
