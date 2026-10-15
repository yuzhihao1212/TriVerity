import { useEffect, useId, useRef } from "react";

import { SOURCE_LABELS, type EvidenceItem } from "./presentation";

export function FactLibrary({ facts, activeId, request }: { facts: EvidenceItem[]; activeId: string | null; request: number }) {
  const id = useId();
  const disclosure = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!activeId || !disclosure.current) return;
    disclosure.current.open = true;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(`fact-${activeId}`);
      target?.scrollIntoView({ block: "center" });
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeId, request]);
  if (!facts.length) return null;
  return <section className="card fact-library" aria-labelledby={`${id}-title`}>
    <div><p className="eyebrow">Internal evidence references</p><h2 id={`${id}-title`}>Facts behind the citations</h2></div>
    <p className="small muted">Select an evidence ID in either round to find its exact fact here.</p>
    <p className="sr-only" role="status" aria-live="polite">{activeId ? `Highlighted evidence ${activeId}` : ""}</p>
    <details ref={disclosure} className="disclosure">
      <summary>Browse {facts.length} referenced facts</summary>
      <ul className="fact-library-list">
        {facts.map(fact => <li id={`fact-${fact.id}`} key={fact.id} tabIndex={-1} className={activeId === fact.id ? "highlighted-fact" : ""}>
          <span className="source-chip">{SOURCE_LABELS[fact.source]}</span>{" "}<strong className="evidence-id">{fact.id}</strong>{" "}{fact.text}
        </li>)}
      </ul>
    </details>
  </section>;
}
