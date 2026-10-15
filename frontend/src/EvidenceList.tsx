import { useId } from "react";

import { evidenceItems, SOURCE_LABELS } from "./presentation";

export function EvidenceList({ texts, ids = [] }: { texts: string[]; ids?: string[] }) {
  const id = useId();
  const items = evidenceItems(texts, ids);
  const render = (start: number, end?: number) => (
    <ul className="small evidence-list">
      {items.slice(start, end).map((item, index) => (
        <li key={start + index}>
          <span className="source-chip">{SOURCE_LABELS[item.source]}</span>{" "}
          {item.id && <span className="evidence-id">{item.id}</span>}
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
