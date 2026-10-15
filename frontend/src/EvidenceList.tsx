import { useId } from "react";

import { Chip } from "./Chip";
import { evidenceItems, SOURCE_LABELS } from "./presentation";

export interface FactLinks { availableIds?: Set<string>; onSelectFact?: (id: string) => void }

export function EvidenceList({ texts, ids = [], availableIds, onSelectFact }: { texts: string[]; ids?: string[] } & FactLinks) {
  const id = useId();
  const items = evidenceItems(texts, ids);
  const render = (start: number, end?: number) => (
    <ul className="small evidence-list">
      {items.slice(start, end).map((item, index) => (
        <li key={start + index}>
          <Chip size="sm" tone="outline">{SOURCE_LABELS[item.source]}</Chip>{" "}
          {item.id && (availableIds?.has(item.id) && onSelectFact
            ? <button type="button" className="evidence-link" aria-label={`Find evidence ${item.id}`} onClick={() => onSelectFact(item.id!)}>{item.id}</button>
            : <span className="evidence-id">{item.id}</span>)}
          <EvidenceText text={item.text} availableIds={availableIds} onSelectFact={onSelectFact} />
        </li>
      ))}
    </ul>
  );
  if (!items.length) return <p className="small muted">No evidence cited.</p>;
  return (
    <div className="evidence-group">
      <p className="chip-row" aria-label="Evidence sources">{[...new Set(items.map(item => item.source))].map(source => <Chip size="sm" tone="outline" key={source}>{SOURCE_LABELS[source]}</Chip>)}</p>
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


export function EvidenceText({ text, availableIds, onSelectFact }: { text: string } & FactLinks) {
  return <>{text.split(/\b((?:TRIP|GPS|FARE|CHAT|HIST)-[1-9]\d*)\b/g).map((part, index) =>
    availableIds?.has(part) && onSelectFact
      ? <button type="button" className="evidence-link" key={index} onClick={() => onSelectFact(part)} aria-label={`Find evidence ${part}`}>{part}</button>
      : part)}</>;
}
