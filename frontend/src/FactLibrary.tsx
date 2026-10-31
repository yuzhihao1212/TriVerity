import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";

import {
  centsToMoney, factParts, fareReceipt, groupFacts, parseTile,
  SOURCE_ORDER, type FactGroup, type Tone,
} from "./factVisuals";
import { alignedFact, gpsRow, rawWindowLabel, relatedLinkLabel } from "./evidenceRows";
import { EvidenceDisclosure, EvidenceInfo } from "./EvidenceDisclosure";
import { Chip, InternalBadge } from "./Chip";
import { valueChipTone } from "./chipStyle";
import { GpsTimeline, RouteSketch } from "./EvidenceStories";
import { caseFindings, nextFinding } from "./evidenceFindings";
import { fareChecks, fareHeadline, fareTotalLine } from "./fareStory";
import { gpsHeadline } from "./gpsStory";
import { Icon } from "./Icon";
import { historyLine, historySentence, parseHistory } from "./historyStory";
import { SOURCE_LABELS, type EvidenceItem } from "./presentation";
import { reveal } from "./routes";
import {
  chatExchange, chatFactsForMessages, chatTakeaway, chatTime, gpsFactLine, isChatAnalysis,
  relatedFactsLabel, tripFactLine, tripTakeaway,
} from "./evidenceDisplay";
import { CHAT_CHECKS_NOTE, chatFactRows, chatSummary, foldOpenAfter, showFactsLabel, toneChips } from "./chatThread";
import type { ChatMessage, DisputeCase, Resolution } from "./types";

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
    let followup = 0;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(`fact-${activeId}`);
      // A merged fact sits inside its row's related-facts disclosure: open it first.
      let parent = target?.parentElement;
      while (parent) {
        if (parent.matches("details.fact-related")) (parent as HTMLDetailsElement).open = true;
        else if (parent.matches(".evidence-related, .chat-facts, .finding-panel")) parent.dispatchEvent(new CustomEvent("reveal-fact", { detail: activeId }));
        parent = parent.parentElement;
      }
      // Let controlled disclosures render before measuring and scrolling the selected fact.
      followup = requestAnimationFrame(() => reveal(target, "center", { flash: grouped }));
    });
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(followup); };
  }, [activeId, request, grouped]);

  const context: RowContext = { activeId, onSelectFact, dispute, resolution, neutral: grouped };
  const body = grouped ? <Findings key={dispute?.dispute_id} facts={facts} context={context} />
    : <ul className="fact-library-list">{facts.map((fact, index) => <FactRow key={fact.id ?? `${fact.source}-${index}`} fact={fact} context={context} />)}</ul>;

  return <section className={`card fact-library${grouped ? " evidence-display" : ""}`} id={grouped ? EVIDENCE_FACTS_ID : undefined} tabIndex={-1} aria-labelledby={`${id}-title`}>
    <div className="panel-head"><h2 id={`${id}-title`}>{grouped ? "Evidence" : "Facts behind the citations"}</h2><InternalBadge detail="Computed facts · internal record" /></div>
    <p className="small muted evidence-intro">{grouped
      ? <>Pick a finding to see the facts behind it. <EvidenceInfo label="How evidence facts are matched">An ID is shown only when this response supplies an unambiguous ID/text pair. Facts that repeat the same value are shown once; open a related-facts link to read each original sentence.</EvidenceInfo></>
      : "Select an evidence ID in either round to find its exact fact here."}</p>
    <p className="sr-only" role="status" aria-live="polite">{activeId ? `Highlighted evidence ${activeId}` : ""}</p>
    {!facts.length ? <p className="muted">No computed facts were returned.</p> : expanded ? body : <details ref={disclosure} className="disclosure"><summary>Browse {facts.length} referenced facts</summary>{body}</details>}
  </section>;
}

// ---- Cards --------------------------------------------------------------

/**
 * One line per source, and the facts behind the selected one. The other panels stay in the page,
 * hidden, so a citation can find its fact by ID and open the finding it belongs to.
 */
function Findings({ facts, context }: { facts: EvidenceItem[]; context: RowContext }) {
  const id = useId();
  const groups = groupFacts(facts);
  const cards = SOURCE_ORDER.map(source => ({ source, groups: groups.filter(group => group.source === source) }))
    .filter(card => card.groups.length);
  const findings = caseFindings(cards.map(card => ({ source: card.source, facts: texts(card.groups) })), context.dispute);
  const [picked, setPicked] = useState<string | null>(null);
  const selected = picked && findings.some(finding => finding.source === picked) ? picked : findings[0]?.source;
  const list = useRef<HTMLDivElement>(null);
  const panels = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = panels.current;
    const open = (event: Event) => {
      const source = (event.currentTarget as HTMLElement).dataset.source;
      if (source) flushSync(() => setPicked(source));
    };
    const each = root ? [...root.querySelectorAll<HTMLElement>(".finding-panel")] : [];
    each.forEach(panel => panel.addEventListener("reveal-fact", open));
    return () => each.forEach(panel => panel.removeEventListener("reveal-fact", open));
  }, [facts]);
  /** The facts appear beside the list, or under it on a phone: bring them into view when they're off screen. */
  function pick(source: string) {
    flushSync(() => setPicked(source));
    const top = panels.current?.getBoundingClientRect().top ?? 0;
    if (top < 0 || top > window.innerHeight * 0.6) panels.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = nextFinding(index, findings.length, event.key);
    if (next === null) return;
    event.preventDefault();
    setPicked(findings[next].source);
    list.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
  }
  return <div className="findings">
    <div className="findings-list" ref={list} role="tablist" aria-orientation="vertical" aria-label="Findings">
      {findings.map((finding, index) => {
        const on = finding.source === selected;
        return <button type="button" key={finding.source} role="tab" id={`${id}-${finding.source}-tab`} aria-controls={`${id}-${finding.source}`} aria-selected={on} tabIndex={on ? 0 : -1}
          className={`finding${on ? " is-selected" : ""}`} onClick={() => pick(finding.source)} onKeyDown={event => onKeyDown(event, index)}>
          <span className="finding-icon" aria-hidden="true"><SourceIcon source={finding.source} /></span>
          <span className="finding-name">{finding.label}{finding.flagged && <Chip size="sm" tone="danger" className="finding-flag">Flagged</Chip>}</span>
          <span className="finding-line">{finding.line}</span>
        </button>;
      })}
    </div>
    <div className="findings-panels" ref={panels}>{cards.map(card =>
      <div key={card.source} className="finding-panel" data-source={card.source} id={`${id}-${card.source}`} role="tabpanel" aria-labelledby={`${id}-${card.source}-tab`} hidden={card.source !== selected}>
        <SourceCard source={card.source} groups={card.groups} wide context={context} />
      </div>)}</div>
  </div>;
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
    {!!tiles.length && <ul className="fact-library-list aligned-grid evidence-trip-comparison" aria-label="Recorded trip compared with expected trip">{tiles.map(group =>
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
  const visual = (["off", "coverage", "stop"] as const).flatMap(kind => groups.filter(group => gpsRow(group.primary.text, all, context.dispute)?.kind === kind));
  const raw = groups.filter(group => rawWindowLabel(group.primary.text, all));
  const rest = groups.filter(group => !visual.includes(group) && !raw.includes(group));
  const { dispute } = context;
  const points = dispute?.gps_points ?? [];
  const planned = dispute?.trip.planned_route ?? [];
  return <>
    <p className="story-headline"><PlainSentence text={headline ?? "The GPS records for this trip are shown below."} /></p>
    {dispute && <RouteSketch caseId={dispute.dispute_id} points={points} planned={planned} facts={all} />}
    {dispute && <GpsTimeline points={points} planned={planned} facts={all} />}
    {!!visual.length && <ul className="fact-library-list gps-fact-grid">
      {visual.map(group => <FactShell key={key(group.primary)} fact={group.primary} related={group.related} context={context} className="gps-number-row">
        <GpsFactContent row={gpsRow(group.primary.text, all, dispute)!} />
      </FactShell>)}
    </ul>}
    {raw.map(group => <EvidenceDisclosure key={key(group.primary)} label={rawWindowLabel(group.primary.text, all)!}>
      <ul><OriginalFact fact={group.primary} context={context} />{group.related.map(fact => <OriginalFact key={key(fact)} fact={fact} context={context} />)}</ul>
    </EvidenceDisclosure>)}
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
    {(receipt.lines.length || hasTotal || receipt.difference) && <ul className="fact-receipt aligned-grid">
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
    {!!sources.length && <EvidenceDisclosure label="↳ Fare checks: how these were checked">
      <ul className="fact-library-list aligned-grid">{sources.map(group => <FactRow key={key(group.primary)} fact={group.primary} related={group.related} context={context} />)}</ul>
    </EvidenceDisclosure>}
    {!!others.length && <Rows groups={others} context={context} />}
  </>;
}

function HistoryBody({ groups, context }: { groups: FactGroup[]; context: RowContext }) {
  const histories = groups.filter(group => /^(Rider|Driver) history:/.test(group.primary.text));
  const rest = groups.filter(group => !histories.includes(group));
  return <>
    <ul className="history-evidence-lines">{histories.map(group => {
      const fact = group.primary;
      const history = parseHistory(fact.text);
      const who = fact.text.startsWith("Rider") ? "Rider" : "Driver";
      return <li key={key(fact)} id={fact.id ? `fact-${fact.id}` : undefined} tabIndex={fact.id ? -1 : undefined} className="history-evidence-line" title={fact.text}>
        <strong>{who}</strong>
        <span className="history-evidence-summary">{history ? <>
          <span aria-hidden="true">{historyLine(history).split("★").map((part, index) => <span key={index}>{index > 0 && <span className="history-star">★</span>}{part}</span>)}</span><span className="sr-only">{historySentence(history)}</span>
        </> : fact.text.replace(/^(Rider|Driver) history:\s*/, "")}</span>
        {fact.id && <IdBadge id={fact.id} onSelectFact={context.onSelectFact} />}
        {!!group.related.length && <EvidenceDisclosure label={relatedLinkLabel(group.related, fact)}>
          <ul><li className="fact-original">{fact.text}</li>{group.related.map(item => <OriginalFact key={key(item)} fact={item} context={context} />)}</ul>
        </EvidenceDisclosure>}
      </li>;
    })}</ul>
    {!!rest.length && <Rows groups={rest} context={context} />}
    <p className="fairness-note"><Icon name="info" />{"Context only: account history does not establish what happened on this trip."}</p>
  </>;
}

/** A message the keyword check flagged: the fact quotes it, so the thread can mark the same one. */
const flaggedMessage = (message: ChatMessage, facts: EvidenceItem[]) => !!message.message && facts.some(fact => /^Threatening message:/i.test(fact.text) && fact.text.includes(message.message));

function ChatBody({ groups, context }: { groups: FactGroup[]; context: RowContext }) {
  const threadId = useId();
  const messages = chatExchange(context.dispute?.chat_logs, groups);
  const analyses = groups.filter(group => isChatAnalysis(group.primary.text) || /^Chat \d{2}:/.test(group.primary.text));
  const rest = groups.filter(group => !analyses.includes(group));
  const audit = analyses.flatMap(group => [group.primary, ...group.related]);
  const messageFacts = chatFactsForMessages(messages, audit);
  const originals = context.neutral ? audit : audit.filter(fact => !messageFacts.includes(fact));
  // No messages: today's view (a headline and the facts as rows).
  if (!messages.length) return <>
    <p className="story-headline">{chatTakeaway(messages)}</p>
    {!!rest.length && <Rows groups={rest} context={context} />}
    {!!originals.length && <EvidenceDisclosure label={relatedLinkLabel(originals)}>
      <ul className="fact-library-list aligned-grid">{originals.map(fact => <FactRow key={key(fact)} fact={fact} context={context} />)}</ul>
    </EvidenceDisclosure>}
  </>;
  const folded = [...rest.flatMap(group => [group.primary, ...group.related]), ...originals];
  const all = groups.flatMap(group => [group.primary, ...group.related]);
  const messageId = (index: number) => `${threadId}-message-${index}`;
  return <>
    <p className="story-headline">{chatSummary(messages, all) ?? chatTakeaway(messages)}</p>
    <div className="chat evidence-chat" aria-label="Recorded chat exchange">{messages.map((message, i) =>
      <div className={`bubble ${message.sender}${flaggedMessage(message, all) ? " is-flagged" : ""}`} key={i} title={messageFacts[i]?.text}
        id={!context.neutral && messageFacts[i]?.id ? `fact-${messageFacts[i]!.id}` : messageId(i)} tabIndex={-1}>
        <span className="who">
          {message.sender === "system" ? <Icon name="info" />
            : <span className={`hearing-party-avatar chat-avatar hearing-avatar-${message.sender}`} aria-hidden="true"><Icon name={message.sender === "rider" ? "person" : "wheel"} /></span>}
          {message.sender === "rider" ? "Rider" : message.sender === "driver" ? "Driver" : "System"}
          {flaggedMessage(message, all) && <Chip size="sm" tone="danger">Flagged</Chip>}
          {chatTime(message.timestamp) && <time dateTime={message.timestamp ?? undefined}>{chatTime(message.timestamp)}</time>}
        </span>{message.message}
        {!context.neutral && messageFacts[i]?.id && <IdBadge id={messageFacts[i]!.id!} onSelectFact={context.onSelectFact} />}
      </div>)}
    </div>
    {(["rider", "driver"] as const).filter(party => !messages.some(message => message.sender === party)).map(party =>
      <p className="small muted" key={party}>{party === "rider" ? "Rider" : "Driver"} message not recorded in this exchange.</p>)}
    {!!folded.length && <ChatFactsFold facts={folded} messages={messages} messageId={messageId} context={context} />}
  </>;
}

/**
 * The chat facts, folded behind one quiet line with the tone chips beside it. Opens on a click,
 * or when a CHAT citation elsewhere asks for one of its facts ("reveal-fact", like the
 * related-facts disclosures), so the jump can highlight it.
 */
function ChatFactsFold({ facts, messages, messageId, context }: {
  facts: EvidenceItem[]; messages: ChatMessage[]; messageId: (index: number) => string; context: RowContext;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const ids = facts.map(fact => fact.id);
  const idsKey = ids.join(" ");
  useEffect(() => {
    const target = ref.current;
    const show = (event: Event) => setOpen(value => foldOpenAfter(value, { type: "reveal", id: (event as CustomEvent<string | null>).detail ?? null }, idsKey.split(" ")));
    target?.addEventListener("reveal-fact", show);
    return () => target?.removeEventListener("reveal-fact", show);
  }, [idsKey]);
  const rows = chatFactRows(facts, messages);
  const chips = toneChips(facts);
  return <div className="chat-facts" ref={ref}>
    <div className="chat-facts-bar">
      <button type="button" className="chat-facts-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => foldOpenAfter(value, { type: "toggle" }, ids))}>
        <Icon name="chevron" />{showFactsLabel(facts.length, open)}
      </button>
      {!!chips.length && <span className="chat-tone-chips" aria-label="Tone checks">{chips.map(chip =>
        <Chip key={chip.party} size="sm" tone="neutral">{chip.label}</Chip>)}</span>}
    </div>
    <div id={id} className="chat-facts-body" hidden={!open}>
      <ul className="chat-fact-rows">{rows.map(row => <li key={key(row.fact)} id={row.fact.id ? `fact-${row.fact.id}` : undefined} tabIndex={row.fact.id ? -1 : undefined}
        className={`chat-fact-row${!context.neutral && row.fact.id && context.activeId === row.fact.id ? " highlighted-fact" : ""}`} title={row.fact.text}>
        <span className="chat-fact-label">{row.label}</span>
        <span className="chat-fact-value">
          {row.messageIndex != null ? <button type="button" className="text-button chat-fact-pointer"
            onClick={() => reveal(document.getElementById(messageId(row.messageIndex!)), "center", { flash: true })}>{row.messageLabel} <span aria-hidden="true">↑</span></button>
            : row.tone ? <><Chip size="sm" tone="neutral">{row.tone.value}</Chip>{row.tone.detail && <span className="muted"> {row.tone.detail}</span>}</>
            : row.text}
        </span>
        {row.fact.id && <IdBadge id={row.fact.id} onSelectFact={context.onSelectFact} />}
      </li>)}</ul>
      <p className="small muted chat-facts-note">{CHAT_CHECKS_NOTE}</p>
    </div>
  </div>;
}

function Rows({ groups, context }: { groups: FactGroup[]; context: RowContext }) {
  return <ul className={`fact-library-list${context.neutral ? " aligned-grid" : ""}`}>{groups.map(group =>
    <FactRow key={key(group.primary)} fact={group.primary} related={group.related} context={context} />)}</ul>;
}

// ---- Rows ---------------------------------------------------------------

const key = (fact: EvidenceItem) => fact.id ?? `${fact.source}:${fact.text}`;

/** A fact anchor and its originals. Grouped Evidence uses the structured values; citation
 * libraries retain their existing text rendering, and GPS rows supply their own small picture. */
function FactShell({ fact, related = [], context, className = "", children }: {
  fact: EvidenceItem; related?: EvidenceItem[]; context: RowContext; className?: string; children: ReactNode;
}) {
  const active = !!fact.id && context.activeId === fact.id;
  if (context.neutral) {
    const row = alignedFact(fact, context.dispute, related);
    const gps = className === "gps-number-row";
    return <li id={fact.id ? `fact-${fact.id}` : undefined} tabIndex={fact.id ? -1 : undefined}
      className={`fact-row aligned-fact-row${gps ? " gps-number-row" : ""}`}>
      <div className="aligned-fact-main" title={fact.text}>
        {gps ? children : <>
          <span className="aligned-fact-label">{row.label}</span>
          <span className={`aligned-fact-value${row.comparison ? " fact-comparison-values" : " fact-prose"}`}>{row.comparison
            ? <><span className="expected"><span className="sr-only">Expected </span>{row.comparison.expected}</span><span className="comparison-arrow" aria-hidden="true">→</span><span><span className="sr-only">Actual </span>{row.comparison.actual}</span></>
            : row.text}</span>
          {row.comparison && <Chip size="sm" tone={row.comparison.change.tone} className="fact-change">{row.comparison.change.text}</Chip>}
        </>}
        {fact.id && <IdBadge id={fact.id} onSelectFact={context.onSelectFact} />}
      </div>
      {!!related.length && <EvidenceDisclosure label={relatedLinkLabel(related, fact)}>
        <ul><li className="fact-original">{fact.text}</li>{related.map(item => <OriginalFact key={key(item)} fact={item} context={context} />)}</ul>
      </EvidenceDisclosure>}
    </li>;
  }
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

function OriginalFact({ fact, context }: { fact: EvidenceItem; context: RowContext }) {
  return <li className="fact-original" id={fact.id ? `fact-${fact.id}` : undefined} tabIndex={fact.id ? -1 : undefined}>
    <span>{fact.text}</span>{fact.id && <IdBadge id={fact.id} onSelectFact={context.onSelectFact} />}
  </li>;
}

function GpsFactContent({ row }: { row: NonNullable<ReturnType<typeof gpsRow>> }) {
  const timeline = row.timeline;
  return <>
    <span className="aligned-fact-label">{row.label}</span>
    <span className="gps-fact-number">{row.value}<small>{row.small}{row.kind === "coverage" && <EvidenceInfo label="About off-plan GPS readings">{row.threshold}</EvidenceInfo>}</small></span>
    <div className="gps-fact-story">
      {row.kind === "coverage" ? <div className="gps-reading-dots" aria-hidden="true">{row.dots?.map((off, index) => <i key={index} className={off ? "off" : ""} style={{ "--dot-index": index } as CSSProperties} />)}</div>
        : timeline && <div className="gps-mini-picture" aria-hidden="true">
          <div className="gps-mini-track">{row.kind === "off" ? timeline.segments.filter(segment => segment.off).map((segment, i) => <span key={i} style={{ left: `${segment.from * 100}%`, width: `${(segment.to - segment.from) * 100}%` }} />)
            : timeline.stops.filter(stop => stop.clock === row.stop?.time && stop.minutes === row.stop.minutes).map((stop, i) => <span key={i} style={{ left: `${stop.at * 100}%`, width: `${Math.min(stop.width, 1 - stop.at) * 100}%` }} />)}</div>
          <div className="gps-mini-axis"><span>Pickup {timeline.start}</span><span>Drop-off {timeline.end}</span></div>
        </div>}
      <p>{row.sentence}</p>{row.detail && <p className="gps-fact-detail">{row.detail}</p>}
    </div>
  </>;
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
