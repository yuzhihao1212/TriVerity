import { useId, useState } from "react";
import { Icon } from "./Icon";
import { runCostText } from "./caseBrief";
import { CLOSED_TRUST_TILE, trustTileState } from "./trustTileState";

/** Hover/focus previews the explanation; a click pins it until dismissed. */
export function RunCost({ offline, hasResult }: { offline: boolean; hasResult: boolean }) {
  const id = useId();
  const [state, setState] = useState(CLOSED_TRUST_TILE);
  const open = state.openId === id;
  const copy = runCostText(offline, hasResult);
  const dismiss = () => setState(CLOSED_TRUST_TILE);
  return <span className="run-cost" onMouseEnter={() => setState(s => trustTileState(s, { type: "hover", id }))}
    onMouseLeave={() => setState(s => trustTileState(s, { type: "leave", id }))}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) dismiss(); }}
    onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); dismiss(); } }}>
    <span className="run-cost-note">{copy.note}</span>
    <button type="button" className="icon-button run-cost-info" aria-label="About re-running"
      aria-expanded={open} aria-describedby={open ? id : undefined} aria-controls={id}
      onFocus={() => setState(s => trustTileState(s, { type: "focus", id }))}
      onClick={() => setState(s => trustTileState(s, { type: "toggle", id }))}>
      <Icon name="info" />
    </button>
    <span id={id} role="tooltip" className="run-cost-popover" hidden={!open}>{copy.detail}</span>
  </span>;
}
