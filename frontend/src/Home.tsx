import { sortQueue, STATUS_ICONS, STATUS_WORDS, type QueueRow } from "./caseQueue";
import { Chip } from "./Chip";
import { amountAtStake, guidedDemoSteps, queueSummary } from "./homeState";
import { Icon } from "./Icon";
import { NewDisputeIcon } from "./SidebarToggle";
import { decisionTone, DECISION_LABELS } from "./outcomeTone";
import { disputeLabel } from "./presentation";
import { caseHash } from "./routes";
import type { DisputeCase } from "./types";

export interface HomeRow extends QueueRow { dispute: DisputeCase }

/** A compact queue summary, an always-visible guided demo, and the case list. */
export function Home({ rows, appealsWaiting, missing, onDismissMissing, onNew }: {
  rows: HomeRow[]; appealsWaiting: number | null; showStart: boolean; onNew: () => void;
  missing: string | null; onDismissMissing: () => void;
  typeIcon: (type: DisputeCase["type"]) => JSX.Element;
}) {
  const summaryParts = queueSummary(rows, appealsWaiting != null);
  const queue = sortQueue(rows);
  const starts = guidedDemoSteps(rows);
  return <section className="home" aria-labelledby="home-title">
    {missing && <p className="home-note" role="status">
      <Icon name="info" />Case {missing} not found
      <button type="button" className="icon-button home-note-close" aria-label={`Dismiss: case ${missing} not found`} title="Dismiss" onClick={onDismissMissing}>
        <Icon name="cross" /></button>
    </p>}
    <div className="home-head">
      <h2 id="home-title">Your queue</h2>
      <p className="home-status-line" aria-label="Queue summary">{summaryParts.map((part, index) =>
        <span key={index}>{index > 0 && <span aria-hidden="true"> · </span>}<span className={part.warning ? "home-status-warning" : undefined}>{part.text}</span></span>
      )}</p>
      <button type="button" className="new-button" aria-label="New dispute" title="New dispute" onClick={onNew}><NewDisputeIcon /><span aria-hidden="true">New</span></button>
      <p className="home-intro">Ride disputes waiting for review. Agents gather evidence and argue both sides, policy rules decide, and you approve.</p>
    </div>
    <section className="home-start" aria-labelledby="home-start-title">
      <h3 id="home-start-title">Guided demo · 3 cases</h3>
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
    </section>
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

