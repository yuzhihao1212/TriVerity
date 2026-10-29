import { useState, type CSSProperties } from "react";
import { sortQueue, STATUS_ICONS, STATUS_WORDS, type QueueRow } from "./caseQueue";
import { Chip } from "./Chip";
import { amountAtStake, guidedDemoSteps, queueSegments, queueSummary } from "./homeState";
import { Icon } from "./Icon";
import { NewDisputeIcon } from "./SidebarToggle";
import { decisionTone, DECISION_LABELS } from "./outcomeTone";
import { disputeLabel } from "./presentation";
import { caseHash } from "./routes";
import type { HoldRecord } from "./decisionState";
import type { DisputeCase } from "./types";

export interface HomeRow extends QueueRow { dispute: DisputeCase }

// The guided demo is for presenting, so it starts folded; opening it holds for this tab.
const DEMO_OPEN_KEY = "triverity.guidedDemoOpen";
function readDemoOpen() {
  try { return sessionStorage.getItem(DEMO_OPEN_KEY) === "1"; } catch { return false; }
}
function writeDemoOpen(open: boolean) {
  try { sessionStorage.setItem(DEMO_OPEN_KEY, open ? "1" : "0"); } catch { /* Storage may be blocked. */ }
}

/** A status bar over the queue, a folded guided demo, and the case list. */
export function Home({ rows, holds = [], appealsWaiting, missing, onDismissMissing, onNew }: {
  rows: HomeRow[]; holds?: HoldRecord[]; appealsWaiting: number | null; showStart: boolean; onNew: () => void;
  missing: string | null; onDismissMissing: () => void;
  typeIcon: (type: DisputeCase["type"]) => JSX.Element;
}) {
  const summaryParts = queueSummary(rows, appealsWaiting != null);
  const queue = sortQueue(rows);
  const segments = queueSegments(rows, appealsWaiting != null);
  const starts = guidedDemoSteps(rows);
  const [demoOpen, setDemoOpen] = useState(readDemoOpen);
  function toggleDemo() {
    setDemoOpen(open => { writeDemoOpen(!open); return !open; });
  }
  return <section className="home" aria-labelledby="home-title">
    {missing && <p className="home-note" role="status">
      <Icon name="info" />Case {missing} not found
      <button type="button" className="icon-button home-note-close" aria-label={`Dismiss: case ${missing} not found`} title="Dismiss" onClick={onDismissMissing}>
        <Icon name="cross" /></button>
    </p>}
    <div className="home-head">
      <h2 id="home-title">Your queue</h2>
      <div className="home-meter" role="img" aria-label={[summaryParts[0].text, ...segments.map(segment => `${segment.count} ${segment.label}`)].join(", ")}>
        <span className="home-meter-bar" aria-hidden="true">{segments.map((segment, index) =>
          <span key={segment.key} className={`tone-${segment.tone}`} style={{ flexGrow: segment.count, "--meter-delay": `${index * 80}ms` } as CSSProperties} />)}</span>
        <span className="home-meter-legend" aria-hidden="true">
          <span className="home-meter-total">{summaryParts[0].text}</span>
          {segments.map(segment => <span key={segment.key}><span className={`home-meter-dot tone-${segment.tone}`} /><strong>{segment.count}</strong> {segment.label}</span>)}
        </span>
      </div>
      <button type="button" className="run-button home-new" onClick={onNew}><NewDisputeIcon />New case</button>
      <p className="home-intro">Ride disputes waiting for review. Agents gather evidence and argue both sides, policy rules decide, and you approve.</p>
    </div>
    <section className={`home-start${demoOpen ? " open" : ""}`} aria-labelledby="home-start-title">
      <h3 id="home-start-title"><button type="button" className="home-start-toggle" aria-expanded={demoOpen} aria-controls="home-start-body" onClick={toggleDemo}>
        <Icon name="chevron" className="home-start-chevron" />Guided demo · 3 cases
        <span className="home-start-path" aria-hidden="true">{starts.map((pick, index) => <span key={pick.id}>
          {index > 0 && " → "}<span className={pick.next ? "is-next" : pick.done ? "is-done" : undefined}>{pick.id}</span></span>)}</span>
      </button></h3>
      <div id="home-start-body" className="home-start-body"><div>
      <ol className="home-start-steps">{starts.map(pick => <li key={pick.id}>
        <a className={`home-start-step${pick.next ? " is-next" : ""}`} href={caseHash(pick.id)} aria-current={pick.next ? "step" : undefined}>
          <span className="home-start-number" aria-hidden="true">{pick.done ? <Icon name="check" /> : pick.number}</span>
          <span className="home-start-copy">
            <strong>{pick.title}</strong>
            <span className="home-start-id">{pick.id}{pick.done && <span className="sr-only"> · Closed</span>}</span>
            <span className="home-start-blurb">{pick.blurb}</span>
          </span>
          {pick.label && <span className="home-start-next">{pick.label}</span>}
        </a>
      </li>)}</ol>
      </div></div>
    </section>
    {holds.length > 0 && <section className="home-holds" aria-labelledby="home-holds-title">
      <h3 id="home-holds-title"><Icon name="pause" />On hold · waiting for a second reviewer <span className="home-holds-count">{holds.length}</span></h3>
      <p className="home-holds-note small muted">Simulated in this browser: a hold isn't saved or sent anywhere.</p>
      <ul className="home-holds-list">{holds.map(hold => {
        const row = rows.find(r => r.id === hold.disputeId);
        return <li key={hold.disputeId}>
          <a className="home-hold" href={caseHash(hold.disputeId)}>
            <span className="home-hold-icon" aria-hidden="true"><Icon name="magnifier" /></span>
            <span className="home-row-main"><span className="home-row-summary">{hold.disputeId}{row && <> · {disputeLabel(row.dispute)}</>}</span>
              <span className="home-row-id">{hold.why} · held by you · {hold.at}</span></span>
            <span className="home-hold-review">Review<Icon name="chevron" /></span>
          </a>
        </li>;
      })}</ul>
    </section>}
    <section className="home-cases" aria-labelledby="home-cases-title">
      <h3 id="home-cases-title">All cases</h3>
      <ul className="home-queue" aria-label="Cases, most urgent first">{queue.map(row => {
        const summary = disputeLabel(row.dispute);
        const outcome = row.decision ? DECISION_LABELS[row.decision] : null;
        const stake = amountAtStake(row.dispute.fare);
        return <li key={row.id}>
          <a className="home-row" href={caseHash(row.id)}
            aria-label={`${row.id}: ${summary}${stake ? `, ${stake}` : ""}. ${STATUS_WORDS[row.status]}${outcome ? `, ${outcome}` : ""}`}>
            <span className={`home-category category-${row.dispute.type === "route_deviation" ? "route" : "no-show"}`}>{row.dispute.type === "route_deviation" ? "Route" : "No-show"}</span>
            <span className="home-row-main"><span className="home-row-summary">{summary}</span><span className="home-row-id">{row.id}{stake && <> · {stake}</>}</span></span>
            <span className="home-row-meta">
              {row.tier === "safety" && <Chip size="sm" tone="danger">Safety</Chip>}
              <span className={`home-row-status status-${row.status}`}>
                {row.decision && <span className={`outcome-dot tone-${decisionTone(row.decision)}`} title={outcome ?? undefined} aria-hidden="true" />}
                <Icon name={STATUS_ICONS[row.status]} />{STATUS_WORDS[row.status]}
              </span>
            </span>
            <Icon name="chevron" className="home-row-chevron" />
          </a>
        </li>;
      })}</ul>
    </section>
  </section>;
}

