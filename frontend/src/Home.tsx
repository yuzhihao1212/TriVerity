import { sortQueue, START_HERE, STATUS_ICONS, STATUS_WORDS, tileCounts, type QueueRow } from "./caseQueue";
import { Icon } from "./Icon";
import { NewDisputeIcon } from "./SidebarToggle";
import { decisionTone, DECISION_LABELS } from "./outcomeTone";
import { disputeLabel } from "./presentation";
import { caseHash } from "./routes";
import type { DisputeCase } from "./types";

export interface HomeRow extends QueueRow { dispute: DisputeCase }

/** The reviewer's home: four tiles, the queue, and "Start here" until a case has been run. */
export function Home({ rows, appealsWaiting, showStart, missing, onDismissMissing, onNew, typeIcon }: {
  rows: HomeRow[]; appealsWaiting: number | null; showStart: boolean; onNew: () => void;
  missing: string | null; onDismissMissing: () => void;
  typeIcon: (type: DisputeCase["type"]) => JSX.Element;
}) {
  const tiles = tileCounts(rows);
  const queue = sortQueue(rows);
  const starts = START_HERE.filter(pick => rows.some(row => row.id === pick.id));
  return <section className="home" aria-labelledby="home-title">
    {missing && <p className="home-note" role="status">
      <Icon name="info" />Case {missing} not found
      <button type="button" className="icon-button home-note-close" aria-label={`Dismiss: case ${missing} not found`} title="Dismiss" onClick={onDismissMissing}>
        <Icon name="cross" /></button>
    </p>}
    <div className="home-head">
      <h2 id="home-title">Your queue</h2>
      <button type="button" className="new-button" aria-label="New dispute" title="New dispute" onClick={onNew}><NewDisputeIcon /><span aria-hidden="true">New</span></button>
    </div>
    <ul className="home-tiles" aria-label="Queue summary">
      <Tile icon="queue" value={tiles.queue} word="Queue" />
      <Tile icon="scales" value={tiles.ready} word="Ready" />
      <Tile icon="warning" value={tiles.decide} word="Decide" tone="warn" />
      <Tile icon="send" value={tiles.done} word="Done" />
      {appealsWaiting != null && appealsWaiting > 0 && <Tile icon="appeal" value={appealsWaiting} word="Appeals" tone="warn" />}
    </ul>
    {showStart && starts.length > 0 && <section className="home-start" aria-labelledby="home-start-title">
      <h3 id="home-start-title">Start here</h3>
      <ul className="home-start-cards">{starts.map(pick => <li key={pick.id}>
        <a className="home-start-card" href={caseHash(pick.id)}>
          <span className="home-start-icon" aria-hidden="true"><Icon name={pick.icon} /></span>
          <strong>{pick.title}</strong><span className="muted">{pick.id}</span>
        </a>
      </li>)}</ul>
    </section>}
    <ul className="home-queue" aria-label="Cases, most urgent first">{queue.map(row => {
      const summary = disputeLabel(row.dispute);
      const outcome = row.decision ? DECISION_LABELS[row.decision] : null;
      return <li key={row.id}>
        <a className="home-row" href={caseHash(row.id)}
          aria-label={`${row.id}: ${summary}. ${STATUS_WORDS[row.status]}${outcome ? `, ${outcome}` : ""}`}>
          {typeIcon(row.dispute.type)}
          <span className="home-row-main"><span className="home-row-summary">{summary}</span><span className="home-row-id">{row.id}</span></span>
          <span className={`home-row-status status-${row.status}`}>
            {row.decision && <span className={`outcome-dot tone-${decisionTone(row.decision)}`} title={outcome ?? undefined} aria-hidden="true" />}
            <Icon name={STATUS_ICONS[row.status]} />{STATUS_WORDS[row.status]}
          </span>
        </a>
      </li>;
    })}</ul>
  </section>;
}

function Tile({ icon, value, word, tone }: { icon: string; value: number; word: string; tone?: "warn" }) {
  return <li className={`home-tile${tone && value > 0 ? ` tone-${tone}` : ""}`}>
    <span className="home-tile-icon" aria-hidden="true"><Icon name={icon} /></span>
    <span className="home-tile-value">{value}</span>
    <span className="home-tile-word">{word}</span>
  </li>;
}

