import { useEffect, useId, useState } from "react";

import { AppealForm } from "./Appeals";
import type { SavedDecision } from "./decisionState";
import { Icon } from "./Icon";
import {
  cleanNote, clockText, closingTitle, createSentStore, finalOutcome, generatedMessage, maxRefund, NOTE_LIMIT, NOTE_PLACEHOLDER,
  noteCounter, noteWarnings, notifyGate, PARTIES, phoneState, SEND_TOOLTIP, sendBlock, sentText, validateAmount,
  type FinalOutcome, type Party, type SentRecord,
} from "./notifyState";
import type { ReviewSummary } from "./reviewProgress";
import type { DisputeCase, Resolution } from "./types";

// "Approve & send" per review key, for this browser session (shared with the queue).
let store: ReturnType<typeof createSentStore> | null = null;
export function sentRecords() {
  if (!store) {
    let storage: Storage | null = null;
    try { storage = window.sessionStorage; } catch { /* Blocked: memory only. */ }
    store = createSentStore(storage);
  }
  return store;
}

const WHO: Record<Party, string> = { rider: "Rider", driver: "Driver" };
const NO_NOTES: Record<Party, string> = { rider: "", driver: "" };

/**
 * Notify parties: after the ruling is accepted or overridden, each party's generated message is
 * shown read-only, exactly as they will see it, and the reviewer may add a short note under it.
 * The phones are a preview until "Approve & send"; then they are delivered and can be appealed.
 */
export function PartyPreview({ resolution, dispute, reviewKey, saved, unavailable, rulingVisited, progress, onGoToRuling, onSent, onAppealed, next, onNext, onBack }: {
  resolution: Resolution; dispute: DisputeCase; reviewKey: string;
  saved: SavedDecision | null; unavailable: boolean; rulingVisited: boolean;
  /** The reviewer's progress: the closing card says "Review complete" only when every step is reviewed. */
  progress: ReviewSummary | null;
  onGoToRuling: () => void; onSent: () => void; onAppealed?: () => void;
  /** The next case still to do, or null when none is left. */
  next: string | null; onNext: () => void; onBack: () => void;
}) {
  const id = useId();
  const [sent, setSent] = useState<SentRecord | null>(() => sentRecords().get(reviewKey));
  const [notes, setNotes] = useState<Record<Party, string>>(NO_NOTES);
  const [amountText, setAmountText] = useState("");
  const [sendAnyway, setSendAnyway] = useState(false);
  const gate = notifyGate({ saved: !!saved, unavailable, rulingVisited });
  const max = maxRefund(dispute);
  const amountCheck = validateAmount(amountText, max);
  const outcome: FinalOutcome = sent
    ? { ...finalOutcome(resolution, saved, dispute), decision: sent.decision, amount: sent.amount, needsAmount: false }
    : finalOutcome(resolution, saved, dispute, amountCheck.ok ? amountCheck.value : null);
  const message = (party: Party) => sent ? sent.messages[party] : generatedMessage(party, resolution, outcome);
  const note = (party: Party) => sent ? sent.notes?.[party] ?? "" : notes[party];
  // Only the reviewer's notes are checked: the generated message is never blocked.
  const warnings = noteWarnings(notes);
  const flagged = PARTIES.some(party => warnings[party].length);
  useEffect(() => { if (!flagged) setSendAnyway(false); }, [flagged]);
  const amountMissing = outcome.needsAmount && !amountCheck.ok;
  const blocked = sendBlock({ amountMissing, warnings, sendAnyway });

  function send() {
    if (blocked || sent) return;
    const record: SentRecord = {
      at: clockText(new Date()),
      messages: { rider: message("rider"), driver: message("driver") },
      notes: { rider: cleanNote(notes.rider), driver: cleanNote(notes.driver) },
      decision: outcome.decision, amount: outcome.amount,
    };
    sentRecords().set(reviewKey, record);
    setSent(record);
    onSent();
  }

  if (gate === "locked" && !sent) return (
    <section className="card party-preview notify-locked" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>Notify parties</h2>
      <p className="notify-gate"><Icon name="lock" /><strong>Accept or override the ruling first</strong></p>
      <p className="small muted">The messages go out with the final decision, so they open once you've decided on the Ruling step.</p>
      <div><button type="button" className="run-button" onClick={onGoToRuling}>Go to the Ruling step</button></div>
    </section>
  );

  return (
    <section className="card party-preview" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>Notify parties</h2>
      <p className="small muted">The message comes from the final decision. Add an optional note for each party. To change the outcome or explanation, use Override on the Ruling step. Notes are checked so internal details never reach the parties.</p>
      {outcome.needsAmount && !sent && <div className="notify-amount">
        <label className="section-label" htmlFor={`${id}-amount`}>Partial refund amount</label>
        <input id={`${id}-amount`} inputMode="decimal" required aria-required="true" aria-invalid={!amountCheck.ok}
          aria-describedby={`${id}-amount-help`} value={amountText} placeholder={max != null ? `0.01 to ${max.toFixed(2)}` : "0.00"}
          onChange={event => setAmountText(event.target.value)} />
        <p id={`${id}-amount-help`} className={`small ${amountCheck.ok ? "muted" : "error-text"}`}>
          {amountCheck.ok ? `Up to $${(max ?? 0).toFixed(2)}, the fare charged (REF-1).` : amountCheck.message}</p>
      </div>}
      <div className="notify-rows">
        {PARTIES.map(party => <div className="notify-row" key={party}>
          <div className="notify-editor">
            <h3 className="section-label" id={`${id}-${party}-message-label`}>Message to the {party}</h3>
            <div className="notify-message" aria-labelledby={`${id}-${party}-message-label`}>
              <p className="notify-message-outcome"><strong>{outcome.label}</strong>
                {outcome.amount != null && <> · {outcome.decision === "compensation" ? "Credit" : "Refund"} <strong>${outcome.amount.toFixed(2)}</strong></>}</p>
              <p>{message(party)}</p>
            </div>
            {sent
              ? note(party) && <div className="notify-note-sent"><span className="section-label">Your note to the {party}</span><p>“{note(party)}”</p></div>
              : <>
                <label className="section-label" htmlFor={`${id}-${party}-note`}>Add a note to the {party}</label>
                <textarea id={`${id}-${party}-note`} rows={3} maxLength={NOTE_LIMIT} value={notes[party]} placeholder={NOTE_PLACEHOLDER}
                  aria-describedby={[`${id}-${party}-count`, warnings[party].length ? `${id}-${party}-warn` : ""].filter(Boolean).join(" ")}
                  onChange={event => setNotes(previous => ({ ...previous, [party]: event.target.value.slice(0, NOTE_LIMIT) }))} />
                <div className="notify-note-meta">
                  <span className="small muted" id={`${id}-${party}-count`} aria-live="off">{noteCounter(notes[party])}</span>
                  {notes[party] && <button type="button" className="agents-toggle notify-reset"
                    onClick={() => setNotes(previous => ({ ...previous, [party]: "" }))}>Clear note</button>}
                </div>
                {warnings[party].length > 0 && <p className="notify-warning" id={`${id}-${party}-warn`} role="status">
                  <Icon name="warning" />Internal wording the {party} must not see: {warnings[party].join(", ")}.</p>}
              </>}
          </div>
          <Phone party={party} outcome={outcome} message={message(party)} note={cleanNote(note(party))} sent={sent}
            dispute={dispute} decision={resolution.decision} onAppealed={onAppealed} id={id} />
        </div>)}
      </div>
      {sent ? <div className="notify-done">
        <p className="notify-sent">{sentText(sent)}</p>
        <section className="card review-complete" aria-label={closingTitle(dispute.dispute_id, progress)}>
          <p className="review-complete-title"><Icon name="check" />{closingTitle(dispute.dispute_id, progress)}</p>
          <div className="review-complete-actions">
            {next && <button type="button" className="run-button" onClick={onNext}>Next case: {next} <span aria-hidden="true">→</span></button>}
            <button type="button" className="secondary-button" onClick={onBack}>Back to queue</button>
          </div>
        </section>
      </div> : <div className="notify-actions">
        {flagged && <label className="send-anyway"><input type="checkbox" checked={sendAnyway} onChange={event => setSendAnyway(event.target.checked)} />
          Send anyway: I've checked this note is fine for the parties</label>}
        <button type="button" className="run-button" disabled={!!blocked} title={SEND_TOOLTIP} aria-describedby={`${id}-send-note`} onClick={send}>
          Approve &amp; send <span className="muted-on-accent">(simulated)</span></button>
        <p className="small muted" id={`${id}-send-note`}>{blocked === "amount" ? "Enter the refund amount first."
          : blocked === "privacy" ? "Remove the internal wording from the note, or tick “Send anyway”." : SEND_TOOLTIP}</p>
      </div>}
    </section>
  );
}

function Phone({ party, outcome, message, note, sent, dispute, decision, onAppealed, id }: {
  party: Party; outcome: FinalOutcome; message: string; note: string; sent: SentRecord | null;
  dispute: DisputeCase; decision: Resolution["decision"]; onAppealed?: () => void; id: string;
}) {
  const state = phoneState(party, sent);
  return <figure className={`phone-wrap${state.delivered ? " delivered" : " preview"}`} aria-labelledby={`${id}-${party}`}>
    <figcaption id={`${id}-${party}`} className="section-label">{WHO[party]}’s phone <span className={`phone-tag${state.delivered ? " delivered" : ""}`}>{state.tag}</span></figcaption>
    <div className="phone">
      <div className="phone-bar" aria-hidden="true"><span>9:41</span><span className="phone-notch" /><span>●●●</span></div>
      <div className="phone-screen">
        <p className="phone-app">Ryde · Dispute update</p>
        <div className="phone-message">
          <p className={`phone-decision ${outcome.decision}`}>{outcome.label}</p>
          {outcome.amount != null && <p className="phone-amount">
            {outcome.decision === "compensation" ? "Credit" : "Refund"} <strong>${outcome.amount.toFixed(2)}</strong></p>}
          <p className="phone-text">{message}</p>
        </div>
        {note && <div className="phone-note">
          <p className="phone-note-label">Note from your reviewer</p>
          <p className="phone-note-text">“{note}”</p>
        </div>}
        <AppealForm key={`${dispute.dispute_id}-${party}-${state.delivered ? "delivered" : "preview"}`} dispute={dispute} party={party}
          decision={decision} onFiled={onAppealed} available={state.canAppeal} unavailableNote={state.caption ?? undefined} />
      </div>
    </div>
  </figure>;
}
