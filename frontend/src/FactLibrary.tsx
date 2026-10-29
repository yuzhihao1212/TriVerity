import { useEffect, useId, useRef, type ReactNode } from "react";

import {
  centsToMoney, factParts, fareReceipt, groupFacts, parseStop, parseTile,
  SOURCE_ORDER, type FactGroup, type Tone,
} from "./factVisuals";
import { Chip, InternalBadge } from "./Chip";
import { valueChipTone } from "./chipStyle";
import { GpsTimeline, RouteSketch } from "./EvidenceStories";
import { fareChecks, fareHeadline, fareTotalLine } from "./fareStory";
import { coverageSummary, gpsHeadline, parseOffRoute } from "./gpsStory";
import { parseHistory, profile } from "./historyStory";
import { Icon } from "./Icon";
import { SOURCE_LABELS, type EvidenceItem } from "./presentation";
import { reveal } from "./routes";
import {
  chatExchange, chatFactsForMessages, chatTakeaway, chatTime, gpsFactLine, gpsReadingsSentence, isChatAnalysis,
  relatedFactsLabel, tripFactLine, tripTakeaway,
} from "./evidenceDisplay";
import type { DisputeCase, Resolution } from "./types";

export const EVIDENCE_FACTS_ID = "evidence-facts";

type Select = ((id: string) => void) | undefined;
interface RowContext { activeId: string | null; onSelectFact: Select; dispute?: DisputeCase; resolution?: Resolution; neutral: boolean }

export function FactLibrary({ facts, activeId, request, expanded = false, grouped = false, onSelectFact, dispute, resolution }: {
  facts: EvidenceItem[]; activeId: string | null; request: number;
  expanded?: boolean; grouped?: boolean; onSelectFact?: (id: string) => void;
  dispute?: DisputeCase; resolution?: Resolution;
}) {
  const id = useId();
  const disclosure = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!activeId) return;
    if (disclosure.current) disclosure.current.open = true;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(`fact-${activeId}`);
      // A merged fact sits inside its row's related-facts disclosure: open it first.
      const related = target?.closest<HTMLDetailsElement>("details.fact-related");
      if (related) related.open = true;
      reveal(target, "center", { flash: grouped });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeId, request, grouped]);

  const context: RowContext = { activeId, onSelectFact, dispute, resolution, neutral: grouped };
  const body = grouped ? <SourceGrid facts={facts} context={context} />
    : <ul className="fact-library-list">{facts.map((fact, index) => <FactRow key={fact.id ?? `${fact.source}-${index}`} fact={fact} context={context} />)}</ul>;

  return <section className={`card fact-library${grouped ? " evidence-display" : ""}`} id={grouped ? EVIDENCE_FACTS_ID : undefined} tabIndex={-1} aria-labelledby={`${id}-title`}>
    <div className="panel-head"><h2 id={`${id}-title`}>{grouped ? "Evidence" : "Facts behind the citations"}</h2><InternalBadge detail="Computed facts · internal record" /></div>
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
  // A stable id, so "How the evidence was gathered" can link to this card.
  return <section className={`fact-card${wide ? " wide" : ""}`} aria-labelledby={headingId} id={`evidence-source-${source}`} tabIndex={-1}>
    <div className="fact-card-head">
      <span className="fact-icon" aria-hidden="true"><SourceIcon source={source} /></span>
      <h3 id={headingId}>{SOURCE_LABELS[source] ?? source}</h3>
      <span className="count">{count} {count === 1 ? "fact" : "facts"}</span>
    </div>
    {source === "trip" ? <TripBody groups={groups} context={context} />
      : source === "gps" ? <GpsBody groups={groups} context={context} />
      : source === "fare" ? <FareBody groups={groups} context={context} />
      : source === "chat" ? <ChatBody groups={groups} context={context} />
      : source === "history" ? <HistoryBody groups={groups} context={context} />
      : <><p className="story-headline">The recorded case details are shown below.</p>
        {context.dispute && texts(groups).some(text => /^(Rider claim|Driver statement):/.test(text)) && <dl className="evidence-statements">
          <div><dt>Rider says</dt><dd>{context.dispute.rider_claim || "Rider statement not recorded."}</dd></div>
          <div><dt>Driver says</dt><dd>{context.dispute.driver_statement || "Driver statement not recorded."}</dd></div>
        </dl>}
        <Rows groups={groups} context={context} /></>}
  </section>;
}

function TripBody({ groups, context }: { groups: FactGroup[]; context: RowContext }) {
  const tiles = groups.filter(group => parseTile(group.primary.text));
  const rest = groups.filter(group => !tiles.includes(group));
  return <>
    <p className="story-headline"><PlainSentence text={tripTakeaway(context.dispute?.trip)} /></p>
    {!!tiles.length && <ul className="fact-library-list evidence-trip-comparison" aria-label="Recorded trip compared with expected trip">{tiles.map(group =>
      <FactShell key={key(group.primary)} fact={group.primary} related={group.related} context={context} className="fact-plain">
        <PlainSentence text={tripFactLine(group.primary.text, context.dispute?.trip)} />
      </FactShell>)}
    </ul>}
    {!!rest.length && <Rows groups={rest} context={context} />}
  </>;
}

const texts = (groups: FactGroup[]) => groups.flatMap(group => [group.primary.text, ...group.related.map(fact => fact.text)]);

function GpsBody({ groups, context }: { groups: FactGroup[]; context: RowContext }) {
  const all = texts(groups);
  const headline = gpsHeadline(all);
  const offRoute = groups.filter(group => parseOffRoute(group.primary.text));
  const coverage = groups.filter(group => coverageSummary(group.primary.text));
  const stops = groups.filter(group => parseStop(group.primary.text));
  const rest = groups.filter(group => !offRoute.includes(group) && !coverage.includes(group) && !stops.includes(group));
  const { dispute } = context;
  const points = dispute?.gps_points ?? [];
  const planned = dispute?.trip.planned_route ?? [];
  return <>
    <p className="story-headline"><PlainSentence text={headline ?? "The GPS records for this trip are shown below."} /></p>
    {dispute && <RouteSketch caseId={dispute.dispute_id} points={points} planned={planned} facts={all} />}
    {dispute && <GpsTimeline points={points} planned={planned} facts={all} />}
    {!!(offRoute.length || coverage.length || stops.length) && <ul className="fact-library-list story-details">
      {offRoute.map(group => {
        return <FactShell key={key(group.primary)} fact={group.primary} related={group.related} context={context} className="fact-plain">
          <PlainSentence text={gpsFactLine(group.primary.text)} />
        </FactShell>;
      })}
      {coverage.map(group => {
        return <FactShell key={key(group.primary)} fact={group.primary} related={group.related} context={context} className="fact-plain">
          <PlainSentence text={gpsReadingsSentence(group.primary.text) ?? group.primary.text} />
        </FactShell>;
      })}
      {stops.map(group => {
        const stop = parseStop(group.primary.text)!;
        return <FactShell key={key(group.primary)} fact={group.primary} related={group.related} context={context} className="fact-plain">
          <span>Stopped <strong>{stop.minutes} min</strong> at <strong>{stop.time}</strong>{stop.where && <span className="muted">, {stop.where}</span>}.</span>
        </FactShell>;
      })}
    </ul>}
    {!!rest.length && <Rows groups={rest} context={context} />}
  </>;
}

function FareBody({ groups, context }: { groups: FactGroup[]; context: RowContext }) {
  const all = texts(groups);
  const receipt = fareReceipt(groups.map(group => group.primary));
  // Each receipt row keeps its group's related facts (e.g. the surge or promo echo).
  const relatedOf = (fact: EvidenceItem) => groups.find(group => group.primary === fact)?.related ?? [];
  const headline = context.dispute ? fareHeadline(context.dispute, all) : null;
  const checks = context.dispute ? fareChecks(context.dispute, all) : [];
  // The facts behind the checks stay reachable (and linkable) in one disclosure under them.
  const checkTexts = new Set(checks.flatMap(check => check.sources));
  const behindChecks = groups.filter(group => receipt.others.includes(group.primary)
    && (checkTexts.has(group.primary.text) || group.related.some(fact => checkTexts.has(fact.text))));
  const others = groups.filter(group => receipt.others.includes(group.primary) && !behindChecks.includes(group));
  const noteGroup = receipt.note ? { primary: receipt.note.fact, related: relatedOf(receipt.note.fact), source: "fare" } : null;
  const sources = [...(noteGroup ? [noteGroup] : []), ...behindChecks];
  const chargedMatches = !!receipt.charged && receipt.charged.cents === receipt.totalCents;
  const expected = receipt.charged?.expectedCents;
  // The difference fact joins the total row when there is one; on its own it keeps its row.
  const differenceGroup = receipt.difference ? [receipt.difference.fact, ...relatedOf(receipt.difference.fact)] : [];
  const totalRow = (cents: number) => {
    const line = fareTotalLine(cents / 100, expected !== undefined ? expected / 100 : null);
    return <><span><strong>{line.charged}</strong> charged{line.expected && <span className="muted"> · expected {line.expected}</span>}
      {line.difference && <> · <strong className="receipt-difference-value">{line.difference}</strong></>}</span></>;
  };
  const shell = (fact: EvidenceItem, className: string, children: ReactNode, extra: EvidenceItem[] = []) =>
    <FactShell key={key(fact)} fact={fact} related={[...relatedOf(fact), ...extra]} context={context} className={className}>{children}</FactShell>;
  const hasTotal = receipt.totalCents !== null || !!receipt.charged;
  return <>
    <p className="story-headline">{headline ? <PlainSentence text={`${headline.lead}${headline.rest}`} />
      : context.dispute?.fare.cancellation_fee != null ? <PlainSentence text={`The recorded no-show fee was $${context.dispute.fare.cancellation_fee.toFixed(2)}.`} /> : "The recorded fare items and checks are shown below."}</p>
    {(receipt.lines.length || hasTotal || receipt.difference) && <ul className="fact-receipt">
      {receipt.lines.map(line => shell(line.fact, "receipt-line", <><span><PlainSentence text={line.label} /></span><strong className="receipt-amount">{centsToMoney(line.cents)}</strong></>))}
      {receipt.discount && shell(receipt.discount.fact, "receipt-line",
        <><span>Promo {receipt.discount.code}</span><strong className="receipt-amount">−{centsToMoney(receipt.discount.cents)}</strong></>)}
      {receipt.charged && (chargedMatches || receipt.totalCents === null)
        ? shell(receipt.charged.fact, "receipt-total", totalRow(receipt.charged.cents), differenceGroup)
        : receipt.totalCents !== null && <li className="fact-row receipt-total"><div className="fact-row-main"><div className="fact-row-body">{totalRow(receipt.totalCents)}</div></div></li>}
      {receipt.charged && !chargedMatches && receipt.totalCents !== null && shell(receipt.charged.fact, "receipt-line",
        <><span>Charged (trip record)</span><strong className="receipt-amount">{centsToMoney(receipt.charged.cents)}</strong></>, differenceGroup)}
      {receipt.difference && !receipt.charged && shell(receipt.difference.fact, "receipt-difference",
        <><span>Difference</span><strong className="receipt-amount">{receipt.difference.text}</strong></>)}
    </ul>}
    {!!checks.length && <ul className="chip-row fare-checks" aria-label="Fare checks">{checks.map(check =>
      <Chip as="li" key={check.key} tone={check.tone} icon={check.icon ?? undefined} title={check.title}>
        {check.label}<span className="sr-only"> ({check.title})</span>
      </Chip>)}</ul>}
    {!!sources.length && <details className="fact-related fare-check-sources">
      <summary>See how these were checked</summary>
      <ul className="fact-library-list">{sources.map(group => <FactRow key={key(group.primary)} fact={group.primary} related={group.related} context={context} />)}</ul>
    </details>}
    {!!others.length && <Rows groups={others} context={context} />}
  </>;
}

function HistoryBody({ groups, context }: { groups: FactGroup[]; context: RowContext }) {
  const profiles = groups.filter(group => parseHistory(group.primary.text));
  const rest = groups.filter(group => !profiles.includes(group));
  return <>
    <p className="story-headline">The account records provide context for both parties.</p>
    <ul className="history-profiles">{profiles.map(group => {
      const fact = parseHistory(group.primary.text)!;
      const shown = profile({ days: fact.days, rating: fact.rating, trips: fact.trips, disputes: fact.disputes });
      return <FactShell key={key(group.primary)} fact={group.primary} related={group.related} context={context} className="history-profile">
        <span className="history-who">{fact.party === "rider" ? "Rider" : "Driver"}</span>
        <span className="history-line">{shown.tenure}</span>
        <span className="history-line"><span className="rating-star" aria-hidden="true">★</span> <span aria-hidden="true">{shown.rating}</span>
          <span className="sr-only">{shown.ratingLabel}</span> / {shown.trips}</span>
        <span className="history-line">{shown.disputes}</span>
      </FactShell>;
    })}</ul>
    <p className="fairness-note"><Icon name="info" />{"Context only: account history does not establish what happened on this trip."}</p>
    {!!rest.length && <Rows groups={rest} context={context} />}
  </>;
}

function ChatBody({ groups, context }: { groups: FactGroup[]; context: RowContext }) {
  const messages = chatExchange(context.dispute?.chat_logs, groups);
  const analyses = groups.filter(group => isChatAnalysis(group.primary.text) || /^Chat \d{2}:/.test(group.primary.text));
  const rest = groups.filter(group => !analyses.includes(group));
  const audit = analyses.flatMap(group => [group.primary, ...group.related]);
  const messageFacts = chatFactsForMessages(messages, audit);
  const originals = audit.filter(fact => !messageFacts.includes(fact));
  const topic = originals.every(fact => isChatAnalysis(fact.text)) ? "automated tone checks"
    : originals.some(fact => isChatAnalysis(fact.text)) ? "chat and automated tone checks" : "chat records";
  return <>
    <p className="story-headline">{chatTakeaway(messages)}</p>
    {!!messages.length && <div className="chat evidence-chat" aria-label="Recorded chat exchange">{messages.map((message, i) =>
      <div className={`bubble ${message.sender}`} key={i} title={messageFacts[i]?.text}
        id={messageFacts[i]?.id ? `fact-${messageFacts[i]!.id}` : undefined} tabIndex={messageFacts[i]?.id ? -1 : undefined}>
        <span className="who"><Icon name={message.sender === "rider" ? "person" : message.sender === "driver" ? "wheel" : "info"} />
          {message.sender === "rider" ? "Rider" : message.sender === "driver" ? "Driver" : "System"}
          {chatTime(message.timestamp) && <time dateTime={message.timestamp ?? undefined}>{chatTime(message.timestamp)}</time>}
        </span>{message.message}
        {messageFacts[i]?.id && <IdBadge id={messageFacts[i]!.id!} onSelectFact={context.onSelectFact} />}
      </div>)}
    </div>}
    {messages.length > 0 && (["rider", "driver"] as const).filter(party => !messages.some(message => message.sender === party)).map(party =>
      <p className="small muted" key={party}>{party === "rider" ? "Rider" : "Driver"} message not recorded in this exchange.</p>)}
    {!!rest.length && <Rows groups={rest} context={context} />}
    {!!originals.length && <details className="fact-related"><summary>{relatedFactsLabel(originals, topic)}</summary>
      <ul>{originals.map(fact => <li className="fact-original" key={key(fact)} id={fact.id ? `fact-${fact.id}` : undefined} tabIndex={fact.id ? -1 : undefined}>
        <span>{isChatAnalysis(fact.text) ? "Automated tone check: " : ""}{fact.text}</span>
        {fact.id && <IdBadge id={fact.id} onSelectFact={context.onSelectFact} />}
      </li>)}</ul>
    </details>}
  </>;
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
    className={`fact-row ${className}${active && !context.neutral ? " highlighted-fact" : ""}`}>
    <div className="fact-row-main" title={context.neutral ? fact.text : undefined}>{!context.neutral && fact.id && <IdBadge id={fact.id} onSelectFact={context.onSelectFact} />}<div className="fact-row-body">{children}</div>{context.neutral && fact.id && <IdBadge id={fact.id} onSelectFact={context.onSelectFact} />}</div>
    {!!related.length && <details className="fact-related">
      <summary>{relatedFactsLabel(related)}</summary>
      <ul>
        <li className="fact-original">{fact.text}</li>
        {related.map(item => <li key={key(item)} id={item.id ? `fact-${item.id}` : undefined} tabIndex={item.id ? -1 : undefined}
          className={`fact-original${!context.neutral && item.id && context.activeId === item.id ? " highlighted-fact" : ""}`}>
          <span>{item.text}</span>{item.id && <IdBadge id={item.id} onSelectFact={context.onSelectFact} />}
        </li>)}
      </ul>
    </details>}
  </li>;
}

function FactRow({ fact, related, context }: { fact: EvidenceItem; related?: EvidenceItem[]; context: RowContext }) {
  const { tone, parts } = factParts(fact.text);
  if (context.neutral) return <FactShell fact={fact} related={related} context={context} className="fact-plain">
    <PlainSentence text={gpsFactLine(tripFactLine(fact.text, context.dispute?.trip))} />
  </FactShell>;
  return <FactShell fact={fact} related={related} context={context} className={`fact-plain ${tone}`}>
    <FactText parts={parts} />
  </FactShell>;
}

function PlainSentence({ text }: { text: string }) {
  // Numbers are emphasis, never a verdict colour. Quoted originals stay unchanged in audit details.
  return <span>{text.split(/(\d{2}:\d{2}(?:[–-]\d{2}:\d{2})?|[+−-]?\$?\d[\d,]*(?:\.\d+)?(?:%| km\/h\b| km\b| minutes?\b| min\b| m\b)?)/g).map((part, i) =>
    i % 2 ? <strong key={i}>{part}</strong> : part)}</span>;
}

function FactText({ parts }: { parts: ReturnType<typeof factParts>["parts"] }) {
  return <span>{parts.map((part, index) => part.kind === "text" ? <span key={index}>{part.text}</span>
    : <Chip as="strong" key={index} size="sm" className="value-chip" tone={valueChipTone(part.tone satisfies Tone)}>{part.text}</Chip>)}</span>;
}

function IdBadge({ id, onSelectFact }: { id: string; onSelectFact: Select }) {
  return <span className="fact-reference">{onSelectFact
    ? <button type="button" className="evidence-link" onClick={() => onSelectFact(id)} aria-label={`Find evidence ${id}`}>{id}</button>
    : <a className="evidence-link" href={`#fact-${id}`} onClick={event => { event.preventDefault(); reveal(document.getElementById(`fact-${id}`), "center", { flash: true }); }} aria-label={`Find evidence ${id}`}>{id}</a>}</span>;
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
