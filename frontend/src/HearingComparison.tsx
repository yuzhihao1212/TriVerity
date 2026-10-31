import { useId, useState, type CSSProperties } from "react";

import { Chip } from "./Chip";
import { useIntroOnce } from "./EvidenceStories";
import type { FactLinks } from "./EvidenceList";
import { GROUP_LIMIT, HEARING_CITATIONS_SEEN_KEY, hearingComparison, hearingFact } from "./hearingDisplay";
import { Icon } from "./Icon";
import type { Resolution } from "./types";

/** Layout distinguishes the parties; only the equally weighted avatars carry a party tint. */
export function HearingComparison({ resolution, disputeId, availableIds, onSelectFact }: {
  resolution: Resolution; disputeId?: string;
} & FactLinks) {
  const id = useId();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const play = useIntroOnce(HEARING_CITATIONS_SEEN_KEY, disputeId);
  const { columns, counts, overlapEmpty, hasCitations } = hearingComparison(resolution);
  const card = (fact: { id: string; text: string | null }, side: string, index: number) => {
    const shown = hearingFact(fact.text, fact.id);
    return <li key={fact.id} className={`hearing-citation hearing-citation-${side}${play ? " intro" : ""}`} style={{ "--citation-index": Math.min(index, 10) } as CSSProperties}>
      <Icon name={shown.icon} />
      <span className="hearing-citation-text">{shown.text}</span>
      {availableIds?.has(fact.id) && onSelectFact
        ? <button type="button" className="hearing-fact-id" onClick={() => onSelectFact(fact.id)} aria-label={`Find evidence ${fact.id}`}>{fact.id}</button>
        : <span className="hearing-fact-id">{fact.id}</span>}
    </li>;
  };
  return <section className="hearing-comparison" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>Who Cited What</h3>
    <figure className="hearing-venn">
      <svg viewBox="0 0 130 78" width="130" height="78" role="img" aria-label={`Citation counts: ${counts.rider} only the rider, ${counts.both} both cited, ${counts.driver} only the driver`}>
        <circle cx="48" cy="39" r="34" /><circle cx="82" cy="39" r="34" />
        <text x="30" y="44">{counts.rider}</text><text x="65" y="44">{counts.both}</text><text x="100" y="44">{counts.driver}</text>
      </svg>
      <figcaption>Only the rider · Both cited · Only the driver</figcaption>
    </figure>
    <div className="hearing-citation-columns">
      {columns.map((column, columnIndex) => <section key={column.key} className={`hearing-citation-column hearing-column-${column.key}`} aria-labelledby={`${id}-${column.key}-title`}>
        <h4 id={`${id}-${column.key}-title`} className="hearing-column-heading">
          {column.key !== "both" && <span className={`hearing-party-avatar hearing-avatar-${column.key}`} aria-hidden="true"><Icon name={column.key === "rider" ? "person" : "wheel"} /></span>}
          <span>{column.title}</span><Chip tone="neutral" size="sm">{column.count}<span className="sr-only"> {column.count === 1 ? "fact" : "facts"}</span></Chip>
        </h4>
        {column.count > 0 ? <>
          <ul>{column.facts.slice(0, GROUP_LIMIT).map((fact, index) => card(fact, column.key, columnIndex * GROUP_LIMIT + index))}</ul>
          {column.count > GROUP_LIMIT && <>
            <ul id={`${id}-${column.key}-more`} hidden={!expanded.has(column.key)}>
              {column.facts.slice(GROUP_LIMIT).map((fact, index) => card(fact, column.key, columnIndex * GROUP_LIMIT + index + GROUP_LIMIT))}
            </ul>
            <button type="button" className="hearing-more-facts" aria-expanded={expanded.has(column.key)} aria-controls={`${id}-${column.key}-more`}
              onClick={() => setExpanded(previous => { const next = new Set(previous); if (next.has(column.key)) next.delete(column.key); else next.add(column.key); return next; })}>
              {expanded.has(column.key) ? "Show Fewer" : `Show ${column.count - GROUP_LIMIT} More Facts`}
            </button>
          </>}
        </> : <p className="hearing-citation-empty">{column.key === "both" ? overlapEmpty : hasCitations ? `No facts cited only by the ${column.key}.` : "No citation IDs supplied in this result."}</p>}
      </section>)}
    </div>
  </section>;
}
