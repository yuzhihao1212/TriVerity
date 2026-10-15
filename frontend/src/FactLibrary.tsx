import { useEffect, useId, useRef } from "react";

import { SOURCE_LABELS, type EvidenceItem } from "./presentation";

export function FactLibrary({ facts, activeId, request, expanded = false, grouped = false, onSelectFact }: {
  facts: EvidenceItem[]; activeId: string | null; request: number;
  expanded?: boolean; grouped?: boolean; onSelectFact?: (id: string) => void;
}) {
  const id = useId();
  const disclosure = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!activeId) return;
    if (disclosure.current) disclosure.current.open = true;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(`fact-${activeId}`);
      target?.scrollIntoView({ block: "center" });
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeId, request]);

  const list = (items: EvidenceItem[]) => <ul className="fact-library-list">
    {items.map((fact, index) => <li id={fact.id ? `fact-${fact.id}` : undefined} key={fact.id ?? `${fact.source}-${index}`}
      tabIndex={fact.id ? -1 : undefined} className={fact.id && activeId === fact.id ? "highlighted-fact" : ""}>
      <span className="fact-reference">{fact.id ? onSelectFact
        ? <button type="button" className="evidence-link" onClick={() => onSelectFact(fact.id!)} aria-label={`Find evidence ${fact.id}`}>{fact.id}</button>
        : <strong className="evidence-id">{fact.id}</strong> : <span className="muted" aria-label="No unambiguous ID supplied">—</span>}</span>
      <span>{fact.text}</span>
    </li>)}
  </ul>;
  const body = grouped ? ["trip", "gps", "fare", "chat", "history", "case"].map(source => {
    const items = facts.filter(fact => fact.source === source);
    return items.length ? <section className="evidence-source" key={source}><h3>{SOURCE_LABELS[source]} <span className="count">{items.length}</span></h3>{list(items)}</section> : null;
  }) : list(facts);

  return <section className="card fact-library" aria-labelledby={`${id}-title`}>
    <div><p className="eyebrow">Computed facts · internal record</p><h2 id={`${id}-title`}>{grouped ? "Evidence" : "Facts behind the citations"}</h2></div>
    <p className="small muted">{grouped ? "Facts are grouped by source. An ID is shown only when this response supplies an unambiguous ID/text pair." : "Select an evidence ID in either round to find its exact fact here."}</p>
    <p className="sr-only" role="status" aria-live="polite">{activeId ? `Highlighted evidence ${activeId}` : ""}</p>
    {!facts.length ? <p className="muted">No computed facts were returned.</p> : expanded ? body : <details ref={disclosure} className="disclosure"><summary>Browse {facts.length} referenced facts</summary>{body}</details>}
  </section>;
}
