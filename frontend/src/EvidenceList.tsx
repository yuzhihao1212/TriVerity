import { useId } from "react";

import { evidenceItems, SOURCE_LABELS } from "./presentation";

export interface FactLinks { availableIds?: Set<string>; onSelectFact?: (id: string) => void }

export function EvidenceList({ texts, ids = [], availableIds, onSelectFact }: { texts: string[]; ids?: string[] } & FactLinks) {
  const id = useId();
  const items = evidenceItems(texts, ids);
  const render = (start: number, end?: number) => (
    <ul className="small evidence-list">
      {items.slice(start, end).map((item, index) => (
        <li key={start + index}>
          <span className="source-chip">{SOURCE_LABELS[item.source]}</span>{" "}
          {item.id && (availableIds?.has(item.id) && onSelectFact
            ? <button type="button" className="evidence-link" aria-label={`Find evidence ${item.id}`} onClick={() => onSelectFact(item.id!)}>{item.id}</button>
            : <span className="evidence-id">{item.id}</span>)}
          {item.text}
        </li>
      ))}
    </ul>
  );
  if (!items.length) return <p className="small muted">No evidence cited.</p>;
  return (
    <div className="evidence-group">
      <p className="evidence-sources" aria-label="Evidence sources">{[...new Set(items.map(item => item.source))].map(source => <span className="source-chip" key={source}>{SOURCE_LABELS[source]}</span>)}</p>
      {render(0, 2)}
      {items.length > 2 && (
        <details className="disclosure" id={id}>
          <summary>
            <span className="when-closed">Show all {items.length} facts</span>
            <span className="when-open">Show fewer facts</span>
          </summary>
          {render(2)}
        </details>
      )}
    </div>
  );
}
