import { useEffect, useId, useRef, type ReactNode } from "react";

import {
  centsToMoney, factParts, factTone, fareReceipt, groupFacts, parseChat, parseRouteCoverage, parseStop, parseTile, parseTripRecord,
  SOURCE_ORDER, type FactGroup, type Tone,
} from "./factVisuals";
import { SOURCE_LABELS, type EvidenceItem } from "./presentation";
import { reveal } from "./routes";

type Select = ((id: string) => void) | undefined;
interface RowContext { activeId: string | null; onSelectFact: Select }

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
      // A merged fact sits inside its row's "+N related" disclosure: open it first.
      const related = target?.closest<HTMLDetailsElement>("details.fact-related");
      if (related) related.open = true;
      reveal(target, "center");
    });
    return () => cancelAnimationFrame(frame);
  }, [activeId, request]);

  const context: RowContext = { activeId, onSelectFact };
  const body = grouped ? <SourceGrid facts={facts} context={context} />
    : <ul className="fact-library-list">{facts.map((fact, index) => <FactRow key={fact.id ?? `${fact.source}-${index}`} fact={fact} context={context} />)}</ul>;

  return <section className="card fact-library" aria-labelledby={`${id}-title`}>
    <div><p className="eyebrow">Computed facts · internal record</p><h2 id={`${id}-title`}>{grouped ? "Evidence" : "Facts behind the citations"}</h2></div>
    <p className="small muted">{grouped
      ? "Facts are grouped by source. An ID is shown only when this response supplies an unambiguous ID/text pair. Facts that repeat the same value are shown once; open “related” to read each original sentence."
      : "Select an evidence ID in either round to find its exact fact here."}</p>
    <p className="sr-only" role="status" aria-live="polite">{activeId ? `Highlighted evidence ${activeId}` : ""}</p>
    {!facts.length ? <p className="muted">No computed facts were returned.</p> : expanded ? body : <details ref={disclosure} className="disclosure"><summary>Browse {facts.length} referenced facts</summary>{body}</details>}
  </section>;
}

// ---- Cards --------------------------------------------------------------

function SourceGrid({ facts, context }: { facts: EvidenceItem[]; context: RowContext }) {
  const groups = groupFacts(facts);
  const cards = SOURCE_ORDER.map(source => ({ source, groups: groups.filter(group => group.source === source) }))
    .filter(card => card.groups.length);
  // GPS always spans the grid; any half-width card left alone on its row spans too.
  let column = 0;
  const wide = cards.map((card, index) => {
    const isWide = card.source === "gps" || (column === 0 && (index === cards.length - 1 || cards[index + 1].source === "gps"));
    column = isWide ? 0 : (column + 1) % 2;
    return isWide;
  });
  return <div className="fact-grid">{cards.map((card, index) =>
    <SourceCard key={card.source} source={card.source} groups={card.groups} wide={wide[index]} context={context} />)}</div>;
}

function SourceCard({ source, groups, wide, context }: { source: string; groups: FactGroup[]; wide: boolean; context: RowContext }) {
  const headingId = useId();
  const count = groups.reduce((sum, group) => sum + 1 + group.related.length, 0);
  return <section className={`fact-card${wide ? " wide" : ""}`} aria-labelledby={headingId}>
    <div className="fact-card-head">
      <span className="fact-icon" aria-hidden="true"><SourceIcon source={source} /></span>
      <h3 id={headingId}>{SOURCE_LABELS[source] ?? source}</h3>
      <span className="count">{count} {count === 1 ? "fact" : "facts"}</span>
    </div>
    {source === "trip" ? <TripBody groups={groups} context={context} />
      : source === "gps" ? <GpsBody groups={groups} context={context} />
      : source === "fare" ? <FareBody groups={groups} context={context} />
      : source === "chat" ? <ChatBody groups={groups} context={context} />
      : <Rows groups={groups} context={context} />}
  </section>;
}

function TripBody({ groups, context }: { groups: FactGroup[]; context: RowContext }) {
  const tiles = groups.filter(group => parseTile(group.primary.text));
  const rest = groups.filter(group => !tiles.includes(group));
  return <>
    {!!tiles.length && <ul className="fact-tiles">{tiles.map(group => {
      const tile = parseTile(group.primary.text)!;
      const record = group.related.map(fact => parseTripRecord(fact.text)).find(Boolean);
      return <FactShell key={key(group.primary)} fact={group.primary} related={group.related} context={context} className={`fact-tile ${tile.tone}`}>
        <span className="fact-tile-label">{tile.label}</span>
        <strong className="fact-tile-value">{tile.value}</strong>
        <span className="fact-tile-detail">{record ? record.detail : tile.detail}</span>
      </FactShell>;
    })}</ul>}
    {!!rest.length && <Rows groups={rest} context={context} />}
  </>;
}

function GpsBody({ groups, context }: { groups: FactGroup[]; context: RowContext }) {
  const coverage = groups.filter(group => parseRouteCoverage(group.primary.text));
  const stops = groups.filter(group => parseStop(group.primary.text));
  const rest = groups.filter(group => !coverage.includes(group) && !stops.includes(group));
  return <>
    {!!coverage.length && <ul className="fact-library-list">{coverage.map(group => {
      const route = parseRouteCoverage(group.primary.text)!;
      const label = `On planned route: ${route.onRoute} of ${route.total} points (${route.percent}%)`;
      return <FactShell key={key(group.primary)} fact={group.primary} related={group.related} context={context} className="fact-coverage">
        <span className="fact-coverage-label">{label}<span className="muted"> · within {route.meters} m</span></span>
        <span className="fact-bar" role="img" aria-label={label}><span style={{ width: `${route.percent}%` }} /></span>
      </FactShell>;
    })}</ul>}
    {!!stops.length && <ul className="fact-timeline">{stops.map(group => {
      const stop = parseStop(group.primary.text)!;
      return <FactShell key={key(group.primary)} fact={group.primary} related={group.related} context={context} className="fact-stop">
        <span className="fact-stop-dot" aria-hidden="true" />
        <span><strong className="fact-chip neutral">{stop.time}</strong> · <strong className={`fact-chip ${factTone(group.primary.text) === "warn" ? "warn" : "neutral"}`}>{stop.minutes} min</strong> stop{stop.where && <span className="muted"> · {stop.where}</span>}</span>
      </FactShell>;
    })}</ul>}
    {!!rest.length && <Rows groups={rest} context={context} />}
  </>;
}

function FareBody({ groups, context }: { groups: FactGroup[]; context: RowContext }) {
  const receipt = fareReceipt(groups.map(group => group.primary));
  // Each receipt row keeps its group's related facts (e.g. the surge or promo echo).
  const relatedOf = (fact: EvidenceItem) => groups.find(group => group.primary === fact)?.related ?? [];
  const others = groups.filter(group => receipt.others.includes(group.primary));
  const hasReceipt = receipt.lines.length || receipt.charged || receipt.difference;
  // The recorded charge anchors the total row when it agrees with lines less discount.
  const chargedMatches = !!receipt.charged && receipt.charged.cents === receipt.totalCents;
  const expected = receipt.charged?.expectedCents;
  const chargedRow = (label: string, cents: number, withExpected = true) => <>
    <span>{label}{withExpected && expected !== undefined && <span className="muted"> · expected {centsToMoney(expected)}</span>}</span>
    <span className="receipt-amount">{centsToMoney(cents)}</span>
  </>;
  const shell = (fact: EvidenceItem, className: string, children: ReactNode) =>
    <FactShell key={key(fact)} fact={fact} related={relatedOf(fact)} context={context} className={className}>{children}</FactShell>;
  return <>
    {hasReceipt && <ul className="fact-receipt">
      {receipt.lines.map(line => shell(line.fact, "receipt-line", <><span>{line.label}</span><span className="receipt-amount">{centsToMoney(line.cents)}</span></>))}
      {receipt.discount && shell(receipt.discount.fact, "receipt-line",
        <><span>Promo {receipt.discount.code}</span><span className="receipt-amount">−{centsToMoney(receipt.discount.cents)}</span></>)}
      {receipt.totalCents !== null && (chargedMatches
        ? shell(receipt.charged!.fact, "receipt-total", chargedRow("Charged", receipt.totalCents))
        : <li className="fact-row receipt-total"><div className="fact-row-main"><div className="fact-row-body">{chargedRow("Charged", receipt.totalCents, false)}</div></div></li>)}
      {receipt.charged && !chargedMatches && shell(receipt.charged.fact, receipt.totalCents === null ? "receipt-total" : "receipt-line",
        chargedRow(receipt.totalCents === null ? "Charged" : "Charged (trip record)", receipt.charged.cents))}
      {receipt.difference && shell(receipt.difference.fact, `receipt-difference ${receipt.difference.tone}`,
        <><span>Difference</span><strong className="receipt-amount">{receipt.difference.text}</strong></>)}
    </ul>}
    {receipt.note && <ul className="fact-library-list">{shell(receipt.note.fact, `receipt-note ${receipt.note.ok ? "ok" : "warn"}`, <>
      <span aria-hidden="true">{receipt.note.ok ? "✓" : "⚠"}</span>
      <span>{receipt.note.ok ? "Breakdown matches the charged fare" : receipt.note.fact.text}</span>
    </>)}</ul>}
    {!!others.length && <Rows groups={others} context={context} />}
  </>;
}

function ChatBody({ groups, context }: { groups: FactGroup[]; context: RowContext }) {
  return <ul className="fact-library-list">{groups.map(group => {
    const bubble = parseChat(group.primary.text);
    if (!bubble) return <FactRow key={key(group.primary)} fact={group.primary} related={group.related} context={context} />;
    return <FactShell key={key(group.primary)} fact={group.primary} related={group.related} context={context} className={`fact-bubble-row ${bubble.tone}`}>
      <span className="fact-bubble">
        <span className="fact-bubble-meta">{bubble.label} · {bubble.sender}</span>
        <q>{bubble.message}</q>
      </span>
    </FactShell>;
  })}</ul>;
}

function Rows({ groups, context }: { groups: FactGroup[]; context: RowContext }) {
  return <ul className="fact-library-list">{groups.map(group =>
    <FactRow key={key(group.primary)} fact={group.primary} related={group.related} context={context} />)}</ul>;
}

// ---- Rows ---------------------------------------------------------------

const key = (fact: EvidenceItem) => fact.id ?? `${fact.source}:${fact.text}`;

/** A list item carrying the fact's anchor (`fact-<ID>`), its ID badge and its related facts. */
function FactShell({ fact, related = [], context, className = "", children }: {
  fact: EvidenceItem; related?: EvidenceItem[]; context: RowContext; className?: string; children: ReactNode;
}) {
  const active = !!fact.id && context.activeId === fact.id;
  return <li id={fact.id ? `fact-${fact.id}` : undefined} tabIndex={fact.id ? -1 : undefined}
    className={`fact-row ${className}${active ? " highlighted-fact" : ""}`}>
    <div className="fact-row-main">{fact.id && <IdBadge id={fact.id} onSelectFact={context.onSelectFact} />}<div className="fact-row-body">{children}</div></div>
    {!!related.length && <details className="fact-related">
      <summary>+{related.length} related<span className="sr-only"> {related.length === 1 ? "fact" : "facts"}</span></summary>
      <ul>
        <li className="fact-original">{fact.text}</li>
        {related.map(item => <li key={key(item)} id={item.id ? `fact-${item.id}` : undefined} tabIndex={item.id ? -1 : undefined}
          className={`fact-original${item.id && context.activeId === item.id ? " highlighted-fact" : ""}`}>
          {item.id && <IdBadge id={item.id} onSelectFact={context.onSelectFact} />}{item.text}
        </li>)}
      </ul>
    </details>}
  </li>;
}

function FactRow({ fact, related, context }: { fact: EvidenceItem; related?: EvidenceItem[]; context: RowContext }) {
  const { tone, parts } = factParts(fact.text);
  return <FactShell fact={fact} related={related} context={context} className={`fact-plain ${tone}`}>
    <FactText parts={parts} />
  </FactShell>;
}

function FactText({ parts }: { parts: ReturnType<typeof factParts>["parts"] }) {
  return <span>{parts.map((part, index) => part.kind === "text" ? <span key={index}>{part.text}</span>
    : <strong key={index} className={`fact-chip ${part.tone satisfies Tone}`}>{part.text}</strong>)}</span>;
}

function IdBadge({ id, onSelectFact }: { id: string; onSelectFact: Select }) {
  return <span className="fact-reference">{onSelectFact
    ? <button type="button" className="evidence-link" onClick={() => onSelectFact(id)} aria-label={`Find evidence ${id}`}>{id}</button>
    : <strong className="evidence-id">{id}</strong>}</span>;
}

// ---- Icons (stroke, 1.75, like the select chevron) ------------------------

function SourceIcon({ source }: { source: string }) {
  const paths: Record<string, ReactNode> = {
    trip: <><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7" /></>,
    gps: <><path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11Z" /><circle cx="12" cy="10" r="2.2" /></>,
    fare: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
    chat: <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3v-3H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />,
    history: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
    case: <path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" focusable="false">
    {paths[source] ?? paths.case}</svg>;
}
