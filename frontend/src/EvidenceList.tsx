import { useId, useState } from "react";

import { Chip } from "./Chip";
import { categories, categorySummary, compareSides, keyFacts, type Category } from "./citedEvidence";
import { evidenceItems, SOURCE_LABELS, type EvidenceItem } from "./presentation";
import type { DisputeCase } from "./types";

export interface FactLinks { availableIds?: Set<string>; onSelectFact?: (id: string) => void }

/** The other side's citations, to tag "Only the rider cites this" (Hearing only). */
export interface Comparison { party: "rider" | "driver"; otherTexts: string[]; otherIds?: string[] }

/**
 * Cited evidence: up to three key facts, then categories that open on click (several at once).
 * Every cited fact stays reachable: duplicates merge under "+N related", never drop.
 */
export function EvidenceList({ texts, ids = [], mention = "", dispute, compare, availableIds, onSelectFact }: {
  texts: string[]; ids?: string[];
  /** The argument or reply text: facts whose IDs it mentions are its key facts. */
  mention?: string;
  dispute?: Pick<DisputeCase, "type" | "fare" | "trip"> | null;
  compare?: Comparison;
} & FactLinks) {
  const id = useId();
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const items = evidenceItems(texts, ids);
  if (!items.length) return <p className="small muted">No evidence cited.</p>;
  const key = keyFacts(items, mention, dispute?.type ?? "route_deviation");
  const cats = categories(items);
  const comparison = compare ? compareSides(items, evidenceItems(compare.otherTexts, compare.otherIds ?? [])) : null;
  const onlyLabel = compare ? `Only the ${compare.party} cites this` : "";
  const isOnly = (item: EvidenceItem) => !!comparison && !comparison.same && comparison.only.has(item.text);
  const toggle = (source: string) => setOpen(previous => {
    const next = new Set(previous);
    if (next.has(source)) next.delete(source); else next.add(source);
    return next;
  });
  const links = { availableIds, onSelectFact };
  return <div className="evidence-group">
    {comparison?.same && <p className="small evidence-same"><strong>Both sides cite the same {comparison.count} facts.</strong></p>}
    {!!key.length && <>
      <p className="section-label">Key facts</p>
      <ul className="small evidence-list key-facts">{key.map((item, index) =>
        <EvidenceRow key={`${item.text}-${index}`} item={item} only={isOnly(item) ? onlyLabel : ""} {...links} />)}</ul>
    </>}
    <div className="evidence-categories" role="group" aria-label="Cited evidence by category">
      {cats.map(category => <button type="button" key={category.source} className="category-toggle"
        aria-expanded={open.has(category.source)} aria-controls={`${id}-${category.source}`} onClick={() => toggle(category.source)}>
        {category.label} <span className="category-count">({category.count})</span>
      </button>)}
    </div>
    {cats.filter(category => open.has(category.source)).map(category =>
      <CategoryPanel key={category.source} id={`${id}-${category.source}`} category={category} dispute={dispute}
        isOnly={isOnly} onlyLabel={onlyLabel} {...links} />)}
  </div>;
}

function CategoryPanel({ id, category, dispute, isOnly, onlyLabel, availableIds, onSelectFact }: {
  id: string; category: Category; dispute?: Pick<DisputeCase, "fare" | "trip"> | null;
  isOnly: (item: EvidenceItem) => boolean; onlyLabel: string;
} & FactLinks) {
  return <section className="evidence-category" id={id} aria-label={`${SOURCE_LABELS[category.source] ?? category.source} evidence`}>
    <p className="small category-summary"><strong>{category.label}</strong> · {categorySummary(category, dispute)}</p>
    <ul className="small evidence-list">{category.groups.map((group, index) =>
      <EvidenceRow key={`${group.primary.text}-${index}`} item={group.primary} related={group.related}
        only={isOnly(group.primary) ? onlyLabel : ""} isOnly={isOnly} onlyLabel={onlyLabel}
        availableIds={availableIds} onSelectFact={onSelectFact} />)}</ul>
  </section>;
}

function EvidenceRow({ item, related = [], only, isOnly, onlyLabel = "", availableIds, onSelectFact }: {
  item: EvidenceItem; related?: EvidenceItem[]; only: string; isOnly?: (item: EvidenceItem) => boolean; onlyLabel?: string;
} & FactLinks) {
  return <li>
    {item.id && <EvidenceId id={item.id} availableIds={availableIds} onSelectFact={onSelectFact} />}
    <EvidenceText text={item.text} availableIds={availableIds} onSelectFact={onSelectFact} />
    {only && <>{" "}<Chip size="sm" tone="brand">{only}</Chip></>}
    {!!related.length && <details className="fact-related">
      <summary>+{related.length} Related<span className="sr-only"> {related.length === 1 ? "fact" : "facts"}</span></summary>
      <ul>{related.map((fact, index) => <li key={`${fact.text}-${index}`} className="fact-original">
        {fact.id && <EvidenceId id={fact.id} availableIds={availableIds} onSelectFact={onSelectFact} />}
        <EvidenceText text={fact.text} availableIds={availableIds} onSelectFact={onSelectFact} />
        {isOnly?.(fact) && <>{" "}<Chip size="sm" tone="brand">{onlyLabel}</Chip></>}
      </li>)}</ul>
    </details>}
  </li>;
}

function EvidenceId({ id, availableIds, onSelectFact }: { id: string } & FactLinks) {
  return <>{availableIds?.has(id) && onSelectFact
    ? <button type="button" className="evidence-link" aria-label={`Find evidence ${id}`} onClick={() => onSelectFact(id)}>{id}</button>
    : <span className="evidence-id">{id}</span>}{" "}</>;
}

export function EvidenceText({ text, availableIds, onSelectFact }: { text: string } & FactLinks) {
  return <>{text.split(/\b((?:TRIP|GPS|FARE|CHAT|HIST)-[1-9]\d*)\b/g).map((part, index) =>
    availableIds?.has(part) && onSelectFact
      ? <button type="button" className="evidence-link" key={index} onClick={() => onSelectFact(part)} aria-label={`Find evidence ${part}`}>{part}</button>
      : part)}</>;
}
