import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { AiMode } from "./aiMode";
import { queueGroups, STATUS_ICONS, STATUS_WORDS, type QueueRow } from "./caseQueue";
import { Chip } from "./Chip";
import { useIntroOnce } from "./EvidenceStories";
import { GUIDED_DEMO, greeting, greetingLine, guidedDemoSteps, queueSegments, queueSummary, readFolded, rerunnable, reviewButtonLabel, reviewNote, reviewSummary, reviewTiles, shortDate, writeFolded } from "./homeState";
import { Icon } from "./Icon";
import { Mascot } from "./Mascot";
import { DECISION_LABELS } from "./outcomeTone";
import { disputeTitle } from "./presentation";
import { caseHash } from "./routes";
import type { HoldRecord } from "./decisionState";
import type { DisputeCase } from "./types";

export interface HomeRow extends QueueRow { dispute: DisputeCase }
export interface RunAllProgress { done: number; total: number; running: boolean; ids: string[]; mode: AiMode }

const HOME_SEEN_KEY = "triverity.homeIntroSeen";

// The guided demo is for presenting, so it starts folded; opening it holds for this tab.
const DEMO_OPEN_KEY = "triverity.guidedDemoOpen";
function readDemoOpen() {
  try { return sessionStorage.getItem(DEMO_OPEN_KEY) === "1"; } catch { return false; }
}
function writeDemoOpen(open: boolean) {
  try { sessionStorage.setItem(DEMO_OPEN_KEY, open ? "1" : "0"); } catch { /* Storage may be blocked. */ }
}

/** A status bar over the queue, a folded guided demo (hidden for now: GUIDED_DEMO), and the case list. */
export function Home({ rows, holds = [], appealsWaiting, missing, onDismissMissing, onReview, sampleIds, heldIds, runAllProgress, aiMode, fallbacks, typeIcon }: {
  rows: HomeRow[]; holds?: HoldRecord[]; appealsWaiting: number | null; showStart: boolean;
  missing: string | null; onDismissMissing: () => void;
  onReview: (ids: string[]) => void; sampleIds: ReadonlySet<string>; heldIds: readonly string[]; runAllProgress?: RunAllProgress | null; aiMode: AiMode; fallbacks: number;
  typeIcon: (type: DisputeCase["type"]) => JSX.Element;
}) {
  const summaryParts = queueSummary(rows, appealsWaiting != null);
  const running = !!runAllProgress?.running;
  const all = queueGroups(rows);
  // A case on hold has its own section above: it isn't waiting on this reviewer, so it isn't listed or counted here.
  const groups = { ...all, review: all.review.filter(row => !heldIds.includes(row.id)) };
  // While a review runs the rows hold their places; they rearrange only once it has finished.
  const heldOrder = useRef<string[] | null>(null);
  if (!running) heldOrder.current = null;
  else heldOrder.current ??= [...groups.review, ...groups.fresh, ...groups.resolved].map(row => row.id);
  const held = (heldOrder.current ?? []).flatMap(id => rows.filter(row => row.id === id));
  const tiles = reviewTiles(rows.filter(row => !heldIds.includes(row.id)));
  const reviewed = !running && tiles.attention + tiles.policy + holds.length > 0;
  // Only samples run in a batch: own disputes use Run agents, which sends the access code.
  const newIds = groups.fresh.filter(row => sampleIds.has(row.id)).map(row => row.id);
  const rerunIds = rerunnable(groups.review, []).filter(row => sampleIds.has(row.id)).map(row => row.id);
  // A case on hold is waiting for someone else, so a reviewer can't start there.
  const startWith = groups.review[0] ?? null;
  const [confirming, setConfirming] = useState(false);
  const stay = !running && confirming && newIds.length === 0 && rerunIds.length > 0;
  const segments = queueSegments(rows, appealsWaiting != null);
  const starts = guidedDemoSteps(rows);
  const [demoOpen, setDemoOpen] = useState(readDemoOpen);
  function toggleDemo() {
    setDemoOpen(open => { writeDemoOpen(!open); return !open; });
  }
  const ranSummary = runAllProgress && !running ? reviewSummary(rows, runAllProgress.ids) : null;
  const ranNote = runAllProgress && !running ? reviewNote(runAllProgress.mode, runAllProgress.ids.length, fallbacks) : null;
  const casesBox = useRef<HTMLElement>(null);
  useRearrange(casesBox, running);
  // The page eases in once per tab (greeting, summary, actions, then the queue row by row);
  // coming back to the queue later shows it at once.
  const play = useIntroOnce(HOME_SEEN_KEY, "home");
  const [hello] = useState(() => greeting(new Date().getHours()));
  return <section className={`home${play ? " home-entering" : ""}`} aria-labelledby="home-title">
    {missing && <p className="home-note" role="status">
      <Icon name="info" />Case {missing} not found
      <button type="button" className="icon-button home-note-close" aria-label={`Dismiss: case ${missing} not found`} title="Dismiss" onClick={onDismissMissing}>
        <Icon name="cross" /></button>
    </p>}
    <div className="home-greeting">
      <Mascot size={112}>
        <p className="home-hello">{hello}!</p>
        <p className="home-hello-line">{greetingLine(rows, heldIds)}</p>
      </Mascot>
    </div>
    <div className="home-head">
      <h2 id="home-title">Your Queue</h2>
      {!reviewed && !running && <div className="home-meter" role="img" aria-label={[summaryParts[0].text, ...segments.map(segment => `${segment.count} ${segment.label}`)].join(", ")}>
        <span className="home-meter-bar" aria-hidden="true">{segments.map((segment, index) =>
          <span key={segment.key} className={`tone-${segment.tone}`} style={{ flexGrow: segment.count, "--meter-delay": `${index * 80}ms` } as CSSProperties} />)}</span>
        <span className="home-meter-legend" aria-hidden="true">
          <span className="home-meter-total">{summaryParts[0].text}</span>
          {segments.map(segment => <span key={segment.key}><span className={`home-meter-dot tone-${segment.tone}`} /><strong>{segment.count}</strong> {segment.label}</span>)}
        </span>
      </div>}
      <div className="home-head-actions">
        {reviewed && startWith && <a className="run-button home-start-reviewing" href={caseHash(startWith.id)}>Start Reviewing<Icon name="arrow" /></a>}
        <button type="button" className={`${reviewed && startWith ? "secondary-button" : "run-button"} home-run-all`} disabled={running || (newIds.length === 0 && rerunIds.length === 0)}
          title={!running && newIds.length === 0 && rerunIds.length === 0 ? "Nothing is open to re-run" : undefined}
          onClick={() => newIds.length > 0 ? onReview(newIds) : setConfirming(true)}>
          <Icon name="scales" />{reviewButtonLabel(aiMode, { running, total: runAllProgress?.total ?? 0, fresh: newIds.length, anyRun: reviewed })}
        </button>
      </div>
    </div>
    {stay && <div className="home-confirm" role="group" aria-label="Confirm re-run" onKeyDown={event => { if (event.key === "Escape") setConfirming(false); }}>
      <p>Re-run the {rerunIds.length} open {rerunIds.length === 1 ? "case" : "cases"}? Resolved cases and saved decisions stay as they are.</p>
      <div className="home-confirm-actions">
        <button type="button" className="run-button" autoFocus onClick={() => { setConfirming(false); onReview(rerunIds); }}>Re-run</button>
        <button type="button" className="secondary-button" onClick={() => setConfirming(false)}>Cancel</button>
      </div>
    </div>}
    {running && runAllProgress && <ReviewProgress done={runAllProgress.done} total={runAllProgress.total} />}
    {reviewed && <div className="home-tiles">
      <p className="home-tile"><strong>{tiles.attention}</strong> require attention</p>
      <p className="home-tile"><strong>{tiles.policy}</strong> decided by policy</p>
    </div>}
    {ranSummary && <p className="sr-only" role="status">{ranSummary}</p>}
    {ranNote && <p className="home-run-note"><Icon name="info" />{ranNote}</p>}
    {GUIDED_DEMO && <section className={`home-start${demoOpen ? " open" : ""}`} aria-labelledby="home-start-title">
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
    </section>}
    {holds.length > 0 && <section className="home-holds" aria-labelledby="home-holds-title">
      <h3 id="home-holds-title"><Icon name="pause" />On Hold · Waiting for a Second Reviewer <span className="home-holds-count">{holds.length}</span></h3>
      <p className="home-holds-note small muted">Simulated in this browser: a hold isn't saved or sent anywhere.</p>
      <ul className="home-holds-list">{holds.map(hold => {
        const row = rows.find(r => r.id === hold.disputeId);
        return <li key={hold.disputeId}>
          <a className="home-hold" href={caseHash(hold.disputeId)}>
            <span className="home-hold-icon" aria-hidden="true"><Icon name="magnifier" /></span>
            <span className="home-row-main"><span className="home-row-summary">{hold.disputeId}{row && <> · {disputeTitle(row.dispute)}</>}</span>
              <span className="home-row-id">{hold.why} · held by you · {hold.at}</span></span>
            <span className="home-hold-review">Review<Icon name="chevron" /></span>
          </a>
        </li>;
      })}</ul>
    </section>}
    <section className="home-cases" ref={casesBox}>
      {running
        ? <QueueList title="All Cases" rows={held} kind="fresh" ran={runAllProgress?.ids ?? []} settled={runAllProgress?.done ?? 0} typeIcon={typeIcon} />
        : <>
          {groups.review.length > 0 && <QueueList title="Human Review Required" note="Safety first, then oldest." rows={groups.review} kind="review" typeIcon={typeIcon} />}
          {groups.fresh.length > 0 && <QueueList title={groups.fresh.length === rows.length ? "All Cases" : "New Cases"} rows={groups.fresh} kind="fresh" typeIcon={typeIcon} />}
          {groups.resolved.length > 0 && <QueueList title={groups.resolved.some(row => row.status === "closed") ? "Resolved" : "Resolved Automatically"} rows={groups.resolved} kind="resolved" typeIcon={typeIcon} />}
        </>}
    </section>
  </section>;
}

/** One batch answers all at once: a gliding bar while waiting, then a real count as rows settle. */
function ReviewProgress({ done, total }: { done: number; total: number }) {
  return <div className="home-progress">
    <div className={`live-progress-track home-progress-track${done === 0 ? " is-waiting" : ""}`} role="progressbar" aria-label="AI Review progress"
      aria-valuemin={0} aria-valuemax={total} aria-valuenow={done === 0 ? undefined : done}>
      <span className={`live-progress-fill${done === total ? " complete" : ""}`} style={done === 0 ? undefined : { width: `${done / total * 100}%` }} />
    </div>
    <span className="home-progress-count" role="status">{done === 0 ? "Working…" : `${done} of ${total} ready`}</span>
  </div>;
}

/** Rows slide from where they were to their new list when a review finishes; the headings fade in after. */
function useRearrange(box: React.RefObject<HTMLElement>, running: boolean) {
  const wasRunning = useRef(false);
  const places = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const root = box.current;
    if (!root) return;
    const base = root.getBoundingClientRect().top;
    const rows = [...root.querySelectorAll<HTMLElement>("[data-row]")];
    const now = new Map(rows.map(el => [el.dataset.row!, el.getBoundingClientRect().top - base]));
    if (wasRunning.current && !running && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      rows.forEach((el, index) => {
        const shift = (places.current.get(el.dataset.row!) ?? now.get(el.dataset.row!)!) - now.get(el.dataset.row!)!;
        if (shift) el.animate?.([{ transform: `translateY(${shift}px)` }, { transform: "none" }], { duration: 620, delay: index * 35, easing: "cubic-bezier(.2, .8, .2, 1)", fill: "backwards" });
      });
      root.querySelectorAll(".home-panel-head").forEach(head => head.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 450, delay: 360, fill: "backwards" }));
    }
    wasRunning.current = running;
    places.current = now;
  });
}

/** Up and down move between rows, so a reviewer can work the list from the keyboard. */
function moveAlongList(event: KeyboardEvent<HTMLUListElement>) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  const links = [...event.currentTarget.querySelectorAll<HTMLAnchorElement>("a")];
  const next = links[links.indexOf(document.activeElement as HTMLAnchorElement) + (event.key === "ArrowDown" ? 1 : -1)];
  if (next) { event.preventDefault(); next.focus(); }
}

function foldStore() { try { return window.sessionStorage; } catch { return null; } }

function QueueList({ title, note, rows, kind, ran = [], settled = 0, typeIcon }: {
  title: string; note?: string; rows: HomeRow[]; kind: "review" | "fresh" | "resolved"; ran?: readonly string[]; settled?: number;
  typeIcon: (type: DisputeCase["type"]) => JSX.Element;
}) {
  const foldable = kind === "resolved";
  const [folded, setFolded] = useState(() => foldable && readFolded(foldStore()));
  const list = <ul className="home-queue" onKeyDown={moveAlongList}>{rows.map((row, index) => <li key={row.id} data-row={row.id} style={{ "--row": Math.min(index, 12), "--wave": `${index * 120}ms` } as CSSProperties}>
    <QueueLine row={row} kind={kind} ran={ran} settled={settled} typeIcon={typeIcon} />
  </li>)}</ul>;
  return <section className={`home-panel is-${kind}${folded ? " is-folded" : ""}`} aria-label={title}>
    {foldable
      ? <header className="home-panel-head home-panel-fold"><h3>
        <button type="button" aria-expanded={!folded} onClick={() => { writeFolded(foldStore(), !folded); setFolded(!folded); }}>
          {title}<Icon name="chevron" className="home-fold-chevron" /></button></h3></header>
      : <header className="home-panel-head"><h3>{title}</h3>{note && <p>{note}</p>}</header>}
    {foldable ? <div className="home-fold-body"><div>{list}</div></div> : list}
  </section>;
}

function QueueLine({ row, kind, ran, settled, typeIcon }: { row: HomeRow; kind: "review" | "fresh" | "resolved"; ran: readonly string[]; settled: number; typeIcon: (type: DisputeCase["type"]) => JSX.Element }) {
  const summary = disputeTitle(row.dispute);
  const outcome = row.decision ? DECISION_LABELS[row.decision] : null;
  const date = shortDate(row.raisedAt);
  const inBatch = ran.includes(row.id);
  const working = inBatch && ran.indexOf(row.id) >= settled;
  const finished = row.status === "auto" || row.status === "closed";
  const quiet = row.status === "decide" || row.status === "ready";
  return <a className={`home-row home-line${working ? " is-working" : ""}${inBatch && !working ? " is-landed" : ""}`} href={caseHash(row.id)}
    aria-label={`${row.id}: ${summary}. ${working ? "Working" : STATUS_WORDS[row.status]}${outcome ? `, ${outcome}` : ""}${row.tier === "safety" ? ", safety" : ""}${date ? `, raised ${date}` : ""}`}>
    <span className={`home-line-icon sidebar-category-${row.dispute.type === "route_deviation" ? "route" : "no-show"}`}>{typeIcon(row.dispute.type)}</span>
    <span className="home-row-main"><span className="home-row-summary">{summary}</span></span>
    <span className="home-row-meta">
      {row.tier === "safety" && <Chip size="sm" tone="danger" className="home-safety"><Icon name="warning" />Safety</Chip>}
      {row.audit && row.status === "ready" && <Chip size="sm" tone="outline">Audit sample</Chip>}
      {working
        ? <span className="home-row-status status-working"><span className="home-working-dot" aria-hidden="true" />Working</span>
        : finished
          ? <span className="home-line-done" title={STATUS_WORDS[row.status]}><Icon name="check" /></span>
          : !quiet && <span className={`home-row-status status-${row.status}`}>{row.status !== "not_run" && <Icon name={STATUS_ICONS[row.status]} />}{STATUS_WORDS[row.status]}</span>}
    </span>
    {date && <span className="home-row-date">{date}</span>}
    {kind !== "resolved" && <Icon name="arrow" className="home-row-chevron" />}
  </a>;
}
