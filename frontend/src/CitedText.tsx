import { useId, useRef, useState } from "react";

import type { FactLinks } from "./EvidenceList";
import { citationParts } from "./hearingDisplay";
import { tooltipLeft } from "./tooltipPlacement";
import { CLOSED_TRUST_TILE, trustTileState } from "./trustTileState";

/**
 * Argument text with its citation codes drawn as small grey superscript markers (round 4 item 3).
 * Each marker previews the fact on hover and focus and pins it on tap, like the other toggletips;
 * the preview links to the fact in Evidence. Screen readers hear "fact TRIP-1: …".
 */
export function CitedText({ text, facts, availableIds, onSelectFact }: { text: string; facts: Map<string, string> } & FactLinks) {
  return <>{citationParts(text).map((part, index) => "text" in part ? part.text
    : <sup key={index} className="cite-markers">{part.ids.map(id =>
      <CiteMarker key={id} id={id} text={facts.get(id)} availableIds={availableIds} onSelectFact={onSelectFact} />)}</sup>)}</>;
}

function CiteMarker({ id, text, availableIds, onSelectFact }: { id: string; text?: string } & FactLinks) {
  const tipId = useId();
  const [state, setState] = useState(CLOSED_TRUST_TILE);
  const open = state.openId === tipId;
  const canJump = !!availableIds?.has(id) && !!onSelectFact;
  const ref = useRef<HTMLSpanElement>(null);
  const [left, setLeft] = useState(0);
  // Keep the preview inside the viewport whichever side of a card the marker sits on.
  function place() {
    const trigger = ref.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect(), viewport = document.documentElement.clientWidth;
    setLeft(tooltipLeft(rect.left, rect.width, Math.min(280, viewport * .8), viewport));
  }
  return <span ref={ref} className="cite-marker" onMouseEnter={() => { place(); setState(s => trustTileState(s, { type: "hover", id: tipId })); }}
    onMouseLeave={() => setState(s => trustTileState(s, { type: "leave", id: tipId }))}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setState(CLOSED_TRUST_TILE); }}
    onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setState(CLOSED_TRUST_TILE); } }}>
    <button type="button" className="cite-marker-button" aria-label={`Fact ${id}${text ? `: ${text}` : ""}`} aria-expanded={open} aria-controls={tipId}
      onFocus={() => { place(); setState(s => trustTileState(s, { type: "focus", id: tipId })); }}
      onClick={() => { place(); setState(s => trustTileState(s, { type: "toggle", id: tipId })); }}>{id}</button>
    <span role="tooltip" id={tipId} className="cite-marker-tip" hidden={!open} style={{ left }}>
      <span>{text ?? "Fact text unavailable in this result."}</span>
      {canJump && <button type="button" className="text-button" onClick={() => onSelectFact!(id)}>Show {id} In Evidence</button>}
    </span>
  </span>;
}
