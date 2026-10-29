import { useEffect, useRef, useState } from "react";

import { readDetailOpen, writeDetailOpen } from "./detailDisclosure";
import { Chip } from "./Chip";
import { sourceTone } from "./chipStyle";
import {
  AUDIT_OPEN_KEY, collectionSummary, FALLBACK_EXPLANATION, lookupName, lookupReason, lookupTarget, mergeLookups, roundLabel,
  type LookupRow,
} from "./collectionStory";
import { Icon } from "./Icon";
import { reveal } from "./routes";
import { toolIcon } from "./stepVisuals";
import type { Resolution } from "./types";

export const AUDIT_TITLE_ID = "collector-calls-title";
export const AUDIT_BODY_ID = "collector-calls-body";
const OPEN_EVENT = "triverity:open-audit";

/**
 * Opens the audit trail if it is collapsed (the "Full lookup details ↑" link). The component
 * listens for this, so the link and the toggle share one state.
 */
export function openAuditTrail(): void {
  writeDetailOpen(AUDIT_OPEN_KEY, true);
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/** Open the audit trail, then scroll to its heading and flash it once it has rendered open. */
function useRevealAfterOpen() {
  const [request, setRequest] = useState(0);
  useEffect(() => {
    if (!request) return;
    reveal(document.getElementById(AUDIT_TITLE_ID), "start", { flash: true });
  }, [request]);
  return () => setRequest(n => n + 1);
}

/** "How the evidence was gathered": a plain summary, then the lookups on demand. */
export function CollectorCalls({ collection }: { collection?: Resolution["evidence_collection"] }) {
  const [open, setOpen] = useState(() => readDetailOpen(AUDIT_OPEN_KEY));
  const revealHeading = useRevealAfterOpen();
  // The "Full lookup details" link in "How this step was decided" opens it first, then scrolls.
  useOpenEvent(() => { setOpen(true); revealHeading(); });
  if (!collection) return null;
  const calls = collection.calls ?? [];
  const summary = collectionSummary(collection);
  const rounds = mergeLookups(calls);
  const toggle = () => setOpen(previous => {
    writeDetailOpen(AUDIT_OPEN_KEY, !previous);
    return !previous;
  });
  return <section className="card collector-calls" aria-labelledby={AUDIT_TITLE_ID}>
    <div className="card-head">
      <div className="panel-head"><h2 id={AUDIT_TITLE_ID} tabIndex={-1}>How the evidence was gathered</h2><Chip size="sm" tone="outline">Audit trail</Chip></div>
      <span className="collector-source">
        <Chip size="sm" tone={sourceTone(collection.source)} icon={collection.source === "llm" ? "sparkle" : undefined}
          title={collection.source === "fallback" ? FALLBACK_EXPLANATION : undefined}>{collection.source === "llm" ? "AI" : "Fallback"}</Chip>
      </span>
    </div>
    <p className="collector-summary"><strong>{summary.lead}</strong>{summary.rest}</p>
    {collection.source === "fallback" && <p className="small muted">{FALLBACK_EXPLANATION}</p>}
    {!!calls.length && <button type="button" className="agents-toggle collector-toggle" aria-expanded={open} aria-controls={AUDIT_BODY_ID} onClick={toggle}>
      {open ? "Hide the lookups" : `Show the ${calls.length} lookups`}<Icon name="arrow" className="agents-toggle-icon" />
    </button>}
    <div id={AUDIT_BODY_ID} hidden={!open}>
      {rounds.map((round, index) => {
        // Group headings sit one level under the round heading, or directly under the card's h2.
        const Group = roundLabel(index, rounds.length) ? "h4" : "h3";
        return <section className="collector-round" key={round.round} aria-label={roundLabel(index, rounds.length) ?? "Lookups"}>
        {roundLabel(index, rounds.length) && <h3>{roundLabel(index, rounds.length)}</h3>}
        {!!round.both.length && <div className="lookup-group">
          <Group className="section-label">Both sides</Group>
          <ul className="lookup-list">{round.both.map(row => <LookupItem key={row.key} row={row} />)}</ul>
        </div>}
        {!!(round.rider.length || round.driver.length) && <div className="lookup-columns">
          {(["rider", "driver"] as const).map(party => round[party].length > 0 && <div className="lookup-group" key={party}>
            <Group className="section-label">{party === "rider" ? "Rider's side" : "Driver's side"}</Group>
            <ul className="lookup-list">{round[party].map(row => <LookupItem key={row.key} row={row} only />)}</ul>
          </div>)}
        </div>}
      </section>;
      })}
    </div>
  </section>;
}

function LookupItem({ row, only = false }: { row: LookupRow; only?: boolean }) {
  const call = row.calls[0];
  const reasons = [...new Set(row.calls.map(item => lookupReason(item.reason)).filter((reason): reason is string => !!reason))];
  const target = lookupTarget(call);
  const results = [...new Set(row.calls.flatMap(item => item.results))];
  return <li className={`lookup-item${only ? " only" : ""}`}>
    <div className="lookup-head">
      <span className="lookup-icon" aria-hidden="true"><Icon name={toolIcon(call.tool)} /></span>
      <strong>{lookupName(call)}</strong>
      {only && <Chip size="sm" tone="brand">Only this side</Chip>}
    </div>
    {reasons.map(reason => <p className="small muted lookup-reason" key={reason}>{reason}</p>)}
    {target && <p className="small lookup-target">{target.count} <span aria-hidden="true">→</span>{" "}
      <a href={`#${target.id}`} onClick={event => { event.preventDefault(); reveal(document.getElementById(target.id), "start", { flash: true }); }}>
        <strong>{target.card}</strong></a></p>}
    {!!results.length && <details className="disclosure lookup-raw">
      <summary>Show the raw results</summary>
      <ul className="small">{results.map((line, index) => <li key={index}><code>{line}</code></li>)}</ul>
    </details>}
  </li>;
}

function useOpenEvent(onOpen: () => void) {
  const latest = useRef(onOpen);
  latest.current = onOpen;
  useEffect(() => {
    const listener = () => latest.current();
    window.addEventListener(OPEN_EVENT, listener);
    return () => window.removeEventListener(OPEN_EVENT, listener);
  }, []);
}
