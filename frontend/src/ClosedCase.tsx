import { useId, useRef } from "react";
import { Chip } from "./Chip";
import { Icon } from "./Icon";
import { reviewedIn } from "./reviewProgress";
import { hasNote, reviewAction, sentOutcomeText, type ReviewEvent, type SentRecord } from "./notifyState";

/** The immutable decision that accompanied a send; no reviewer action controls. */
export function ClosedSummary({ record }: { record: SentRecord }) {
  return <section className="card closed-summary" aria-label="Closed decision">
    <h2>Final decision</h2>
    <p><strong>{sentOutcomeText(record)}</strong> · {reviewAction(record)}</p>
    {record.reviewer?.kind !== "accepted" && record.reviewer?.reason && <p className="small"><strong>Reviewer reason:</strong> {record.reviewer.reason}</p>}
  </section>;
}

export function ClosedCase({ disputeId, sent, latest, events, earlier, appealWaiting, openedAt = null, nextLabel, onNext, nextPrimary = true, onReopen }: {
  disputeId: string; sent: SentRecord | null; latest: SentRecord | null; events: ReviewEvent[];
  earlier: { key: string; events: ReviewEvent[] }[]; appealWaiting: boolean;
  openedAt?: number | null; nextLabel?: string; onNext?: () => void; nextPrimary?: boolean; onReopen: () => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const history = useRef<HTMLDetailsElement>(null);
  const duration = latest ? reviewedIn(openedAt, latest.timestamp) : null;
  if (!latest && !earlier.length) return null;
  return <section className={`closed-case${sent ? " is-closed" : ""}`} aria-labelledby={`${id}-title`}>
    <div className="closed-case-head">
      <div className="closed-case-text">
        <h2 id={`${id}-title`}><Icon name={sent ? "check" : latest ? "folder" : "info"} />{sent ? "Case closed" : latest ? "Case reopened" : "Earlier review"}
          {appealWaiting && <Chip tone="warn" size="sm">Appeal waiting</Chip>}</h2>
        {latest && <p><strong>{sentOutcomeText(latest)}</strong> · {reviewAction(latest)} · {latest.correction ? "Correction sent" : "Sent to rider and driver"} {latest.at}{duration && ` · ${duration}`}{hasNote(latest) && " · with a reviewer note"}</p>}
        {!latest && earlier.length > 0 && <p className="small muted">Earlier review: closed {earlier.at(-1)!.events.filter(e => e.type === "sent").at(-1)?.at} · <button type="button" className="text-button" onClick={() => { if (history.current) { history.current.open = true; history.current.querySelector("summary")?.focus(); } }}>show history</button></p>}
        {latest && !sent && <p className="small muted">The earlier messages remain below. Send a correction when this review is ready.</p>}
      </div>
      <div className="closed-case-actions">
        {sent && nextLabel && onNext && <button type="button" className={nextPrimary ? "run-button" : "secondary-button"} onClick={onNext}>{nextLabel}</button>}
        {sent && <button type="button" ref={trigger} className="secondary-button closed-reopen" onClick={() => dialog.current?.showModal()}>Reopen case</button>}
      </div>
    </div>
    <details className="closed-history" ref={history}><summary>History</summary>
      {earlier.map((review, i) => <div className="closed-earlier" key={review.key}><h3>Earlier review {i + 1}</h3><EventList events={review.events} /></div>)}
      {events.length > 0 && <EventList events={events} />}
    </details>
    <dialog className="closed-dialog" ref={dialog} aria-labelledby={`${id}-dialog-title`} aria-describedby={`${id}-dialog-note`}
      onClose={() => trigger.current?.focus()}
      onKeyDown={event => {
        if (event.key !== "Tab") return;
        const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <h2 id={`${id}-dialog-title`}>Reopen {disputeId}?</h2>
      <p id={`${id}-dialog-note`}>The rider and driver already received the earlier message. Changing the decision means sending a correction.</p>
      <div className="closed-dialog-actions">
        <button type="button" className="secondary-button" autoFocus onClick={() => dialog.current?.close()}>Cancel</button>
        <button type="button" className="run-button" onClick={() => { dialog.current?.close(); onReopen(); }}>Reopen case</button>
      </div>
    </dialog>
  </section>;
}

function EventList({ events }: { events: ReviewEvent[] }) {
  return <ol className="closed-events">{events.map((event, index) => <li key={index}>
    {event.type === "reopened" ? <p>Reopened {event.at}</p> : <details>
      <summary>{event.correction ? "Correction sent" : "Sent"} {event.at} · {sentOutcomeText(event)} · {hasNote(event) ? "with a reviewer note" : "as generated"}</summary>
      <div className="closed-snapshot"><p className="small muted">{reviewAction(event)}{event.reviewer?.reason && ` · ${event.reviewer.reason}`}</p>
        {(["rider", "driver"] as const).map(party => <div key={party}><h3>Message to the {party}</h3><p>{event.messages[party]}</p>
          {event.notes?.[party] && <p><strong>Reviewer note:</strong> {event.notes[party]}</p>}</div>)}
      </div>
    </details>}
  </li>)}</ol>;
}
