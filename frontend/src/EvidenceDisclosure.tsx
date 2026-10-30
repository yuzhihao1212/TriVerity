import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { CLOSED_TRUST_TILE, trustTileState } from "./trustTileState";

/** The citation jump can open this disclosure before focusing an original fact inside it. */
export function EvidenceDisclosure({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const target = ref.current;
    const reveal = () => setOpen(true);
    target?.addEventListener("reveal-fact", reveal);
    return () => target?.removeEventListener("reveal-fact", reveal);
  }, []);
  return <div className="fact-related evidence-related" ref={ref}>
    <button type="button" className="evidence-related-trigger" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      {label} <span aria-hidden="true">{open ? "▾" : "▸"}</span>
    </button>
    <div id={id} hidden={!open}>{children}</div>
  </div>;
}

/** Same hover/focus preview and tap-to-pin state as the existing source and re-run toggletips. */
export function EvidenceInfo({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const [state, setState] = useState(CLOSED_TRUST_TILE);
  const open = state.openId === id;
  return <span className="evidence-info" onMouseEnter={() => setState(s => trustTileState(s, { type: "hover", id }))}
    onMouseLeave={() => setState(s => trustTileState(s, { type: "leave", id }))}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setState(CLOSED_TRUST_TILE); }}
    onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setState(CLOSED_TRUST_TILE); } }}>
    <button type="button" className="icon-button evidence-info-button" aria-label={label} aria-expanded={open} aria-controls={id}
      aria-describedby={open ? id : undefined} onFocus={() => setState(s => trustTileState(s, { type: "focus", id }))}
      onClick={() => setState(s => trustTileState(s, { type: "toggle", id }))}><Icon name="info" /></button>
    <span role="tooltip" className="evidence-info-tip" id={id} hidden={!open}>{children}</span>
  </span>;
}
