import { useEffect, useId, useState } from "react";

import { CustomerPhone } from "./CustomerPhone";
import { CUSTOMER_COPY } from "./customerCopy";
import { quickNotes, toggleQuickNote } from "./customerState";
import { listAppeals } from "./services/api";
import { checkPartialAmount, MIN_PARTIAL, type SavedDecision } from "./decisionState";
import { Icon } from "./Icon";
import {
  appealSummary, cleanNote, clockText, closingTitle, createSentStore, finalOutcome, generatedMessage, maxRefund, messageParts, NOTE_LIMIT, sentParts,
  noteCounter, noteWarnings, notifyGate, PARTIES, SEND_TOOLTIP, sendBlock, sentText, sentOutcome,
  type FinalOutcome, type Party, type SentRecord,
} from "./notifyState";
import type { ReviewSummary } from "./reviewProgress";
import type { Appeal, DisputeCase, Resolution } from "./types";

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

/** Shown under each phone: what the party-safety checks keep out of every message. */
export const PRIVACY_NOTE = "The message never includes fraud signals, party history or internal evidence IDs; your note is checked before sending.";
const NO_NOTES: Record<Party, string> = { rider: "", driver: "" };

/**
 * Notify parties: after the ruling is accepted or overridden, each party's generated message is
 * shown read-only, exactly as they will see it, and the reviewer may add a short note under it.
 * Notify stays a locked preview. After "Approve & send", Customer view opens the delivered phones.
 */
export function PartyPreview({ resolution, dispute, reviewKey, saved, unavailable, rulingVisited, progress, onGoToRuling, onSent, onAppealed, next, nextLabel, onNext, onBack, previous = null, appealsAvailable = true, held = false }: {
  resolution: Resolution; dispute: DisputeCase; reviewKey: string;
  /** What was sent before this case was reopened: shown as history, never as today's approval. */
  previous?: SentRecord | null; appealsAvailable?: boolean;
  /** On hold for a second reviewer: nobody is notified until they decide. */
  held?: boolean;
  saved: SavedDecision | null; unavailable: boolean; rulingVisited: boolean;
  /** The reviewer's progress: the closing card says "Review complete" only when every step is reviewed. */
  progress: ReviewSummary | null;
  onGoToRuling: () => void; onSent: () => void; onAppealed?: () => void;
  /** The next case still to do, or null when none is left. */
  next: string | null; nextLabel?: string; onNext: () => void; onBack: () => void;
}) {
  const id = useId();
  const [sent, setSent] = useState<SentRecord | null>(() => sentRecords().get(reviewKey));
  const [notes, setNotes] = useState<Record<Party, string>>(NO_NOTES);
  const [amountText, setAmountText] = useState(previous?.reviewer?.decision === "partial_refund" && previous.reviewer.kind !== "accepted" && previous.amount != null ? previous.amount.toFixed(2) : "");
  const [view, setView] = useState<"notify" | "customer">("notify");
  const [sendAttempted, setSendAttempted] = useState(false);
  const [chipMessage, setChipMessage] = useState<Record<Party, string>>(NO_NOTES);
  // This dispute's appeals (waiting and decided), read from the queue so they survive a step change or reload.
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const waitingAppeals = appeals.filter(appeal => appeal.status === "queued");
  useEffect(() => {
    if (!appealsAvailable) return;
    let current = true;
    // Off in the public demo (403): no appeals to show.
    listAppeals(dispute.dispute_id).then(list => { if (current) setAppeals(list); }).catch(() => {});
    return () => { current = false; };
  }, [dispute.dispute_id, appealsAvailable]);
  // A reopened case opens only on a decision saved in this review, never on the one it carried
  // before it was reopened; a case on hold stays locked until the second reviewer decides.
  const gate = notifyGate({ saved: !!saved, unavailable, rulingVisited, held });
  const max = maxRefund(dispute);
  // The Ruling panel's own check, so an older decision without an amount of its own still gets
  // the $0.50 minimum and the second-approval limit (F03).
  const amountState = checkPartialAmount(amountText, max, resolution.refund_amount ?? null);
  const amountCheck = { ok: amountState.state === "ok", value: amountState.value, message: amountState.message };
  const outcome: FinalOutcome = sent
    ? sentOutcome(sent)
    : finalOutcome(resolution, saved, dispute, amountCheck.ok ? amountCheck.value : null);
  const message = (party: Party) => sent ? sent.messages[party] : generatedMessage(party, resolution, outcome);
  // The More info parts: what was delivered, or what the ruling's own message would say.
  const parts = (party: Party) => sent ? sent.parts?.[party] ?? null : messageParts(party, resolution, outcome);
  const note = (party: Party) => sent ? sent.notes?.[party] ?? "" : notes[party];
  // Only the reviewer's notes are checked: the generated message is never blocked. The
  // dispute's own case ID is shown on the phones, so it is not internal data.
  const warnings = noteWarnings(notes, dispute.dispute_id);
  const amountMissing = outcome.needsAmount && amountCheck.value == null;
  const needsSecondApproval = outcome.needsAmount && amountState.state === "second";
  const blocked = sendBlock({ amountMissing, needsSecondApproval, held, warnings });

  function send() {
    setSendAttempted(true);
    if (blocked || held || sent || sentRecords().get(reviewKey)) return;
    const record: SentRecord = {
      at: clockText(new Date()), timestamp: new Date().toISOString(), disputeId: dispute.dispute_id, reviewer: saved ?? undefined,
      messages: { rider: message("rider"), driver: message("driver") },
      ...(sentParts(parts) ? { parts: sentParts(parts) } : {}),
      notes: { rider: cleanNote(notes.rider), driver: cleanNote(notes.driver) },
      decision: outcome.decision, amount: outcome.amount,
    };
    sentRecords().set(reviewKey, record);
    setSent(sentRecords().get(reviewKey));
    onSent();
  }

  if (gate === "locked" && !sent) return (
    <section className="card party-preview notify-locked" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>Notify parties</h2>
      <p className="notify-gate"><Icon name="lock" /><strong>{held ? "On hold for a second reviewer" : "Accept or override the ruling first"}</strong></p>
      <p className="small muted">{held
        ? "Nobody is notified yet. The case stays with you until the second reviewer decides."
        : "The messages go out with the final decision, so they open once you've decided on the Ruling step."}</p>
      <div><button type="button" className="run-button" onClick={onGoToRuling}>Go to the Ruling step</button></div>
    </section>
  );

  return (
    <section className="card party-preview" aria-labelledby={`${id}-heading`}>
      <div className="notify-view-tabs" role="tablist" aria-label="Message views">
        {(["notify", "customer"] as const).map((item, index) => <button type="button" key={item} role="tab"
          id={`${id}-${item}-tab`} aria-controls={`${id}-view-panel`} aria-selected={view === item} aria-disabled={item === "customer" && !sent}
          tabIndex={view === item ? 0 : -1} onClick={() => { if (item === "notify" || sent) setView(item); }}
          onKeyDown={event => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const target = !sent ? "notify" : event.key === "Home" ? "notify" : event.key === "End" ? "customer" : index === 0 ? "customer" : "notify";
            setView(target); document.getElementById(`${id}-${target}-tab`)?.focus();
          }}>{item === "notify" ? "Notify" : "Customer view"}</button>)}
      </div>
      <div id={`${id}-view-panel`} role="tabpanel" aria-labelledby={`${id}-${view}-tab`}>
      <h2 id={`${id}-heading`}>{view === "customer" ? "Customer view" : "Notify parties"}</h2>
      <p className="small muted">{view === "customer" ? "Try More info, Rate our support and Appeal case. Feedback is simulated for this browser session."
        : sent ? "These are the messages and notes delivered. Reopen the case to make a correction."
        : "Check what each person will see, add a note if you like, then send."}
        {!sent && <> <span className="notify-outcome">{outcome.label}{outcome.amount != null ? ` · $${outcome.amount.toFixed(2)}` : ""} · </span><button type="button" className="text-button notify-change" onClick={onGoToRuling}>Change outcome</button></>}</p>
      {outcome.needsAmount && !sent && <div className="notify-amount">
        <label className="section-label" htmlFor={`${id}-amount`}>Partial refund amount</label>
        <input id={`${id}-amount`} inputMode="decimal" required aria-required="true" aria-invalid={!amountCheck.ok}
          aria-describedby={`${id}-amount-help`} value={amountText} placeholder={max != null && max > 0 ? `${MIN_PARTIAL.toFixed(2)} to ${max.toFixed(2)}` : "0.00"}
          onChange={event => setAmountText(event.target.value)} />
        <p id={`${id}-amount-help`} className={`small ${amountCheck.ok ? "muted" : "error-text"}`}>
          {amountCheck.ok ? `Up to $${(max ?? 0).toFixed(2)}, the fare charged (REF-1).` : amountCheck.message}</p>
      </div>}
      <div className="notify-rows">
        {PARTIES.map(party => <div className="notify-row" key={party}>
          <CustomerPhone key={`${view}-${party}`} party={party} outcome={outcome} message={message(party)} parts={parts(party)} note={cleanNote(note(party))}
            live={view === "customer" && !!sent} deliveredAt={sent?.at} dispute={dispute} appealsAvailable={appealsAvailable}
            existing={appeals.find(appeal => appeal.party === party) ?? null}
            onAppealed={appeal => { setAppeals(previous => [...previous.filter(item => item.id !== appeal.id), appeal]); onAppealed?.(); }} />
          {view === "notify" && <div className="notify-editor">
            {sent
              ? note(party) && <div className="notify-note-sent"><span className="section-label">Your note to the {party}</span><p>“{note(party)}”</p></div>
              : <>
                <label className="section-label" htmlFor={`${id}-${party}-note`}>Add a note to the {party}</label>
                <div className="quick-notes" aria-label={`Quick notes for the ${party}`}>
                  {quickNotes(party, outcome, undefined, dispute.type).map(chip => <span className="quick-note-wrap" key={chip.id}>
                    <button type="button" className="quick-note" aria-pressed={notes[party].includes(chip.text)} aria-describedby={`${id}-${party}-${chip.id}`}
                      onClick={() => {
                        const result = toggleQuickNote(notes[party], chip.text);
                        setChipMessage(previous => ({ ...previous, [party]: result.refused ? "That would go over 280 characters. Shorten the note first." : "" }));
                        if (!result.refused) setNotes(previous => ({ ...previous, [party]: result.note }));
                      }}>{chip.label}</button>
                    <span role="tooltip" className="quick-note-tooltip" id={`${id}-${party}-${chip.id}`}>{chip.text}</span>
                  </span>)}
                </div>
                <p className="small error-text" role="status">{chipMessage[party]}</p>
                <textarea id={`${id}-${party}-note`} rows={3} maxLength={NOTE_LIMIT} value={notes[party]} placeholder={CUSTOMER_COPY.placeholders[party]}
                  aria-describedby={[`${id}-${party}-count`, warnings[party].length ? `${id}-${party}-warn` : ""].filter(Boolean).join(" ")}
                  onChange={event => { setNotes(previous => ({ ...previous, [party]: event.target.value.slice(0, NOTE_LIMIT) })); setChipMessage(previous => ({ ...previous, [party]: "" })); }} />
                <div className="notify-note-meta">
                  <span className={`small ${notes[party].length >= NOTE_LIMIT - 30 ? "note-near-limit" : "muted"}`} id={`${id}-${party}-count`} aria-live="off">{notes[party] ? noteCounter(notes[party]) : ""}</span>
                  {notes[party] && <button type="button" className="agents-toggle notify-reset"
                    onClick={() => setNotes(previous => ({ ...previous, [party]: "" }))}>Clear note</button>}
                </div>
                {warnings[party].length > 0 && <p className="notify-warning" id={`${id}-${party}-warn`} role="status">
                  <Icon name="warning" />Internal wording the {party} must not see: {warnings[party].join(", ")}.</p>}
              </>}
          </div>}
        </div>)}
      </div>
      {view === "notify" && <p className="small muted notify-privacy">{PRIVACY_NOTE}</p>}
      {view === "notify" && (sent ? <div className="notify-done">
        <p className="notify-sent">{sentText(sent)}</p>
        <div><button type="button" className="run-button" onClick={() => { setView("customer"); document.getElementById(`${id}-customer-tab`)?.focus(); }}>Next: Customer view →</button></div>
        {waitingAppeals.map(appeal => <div className="notify-appeal" key={appeal.id} role="status">
          <p><Icon name="warning" /><strong>{appealSummary(appeal)}</strong> · {appeal.id}</p>
          <p className="small">“{appeal.reason}”</p>
          <div><button type="button" className="secondary-button" onClick={onGoToRuling}>Review the appeal on the Ruling step</button></div>
        </div>)}
        <section className="card review-complete" aria-label={closingTitle(dispute.dispute_id, progress)}>
          <p className="review-complete-title"><Icon name="check" />{closingTitle(dispute.dispute_id, progress)}</p>
          <div className="review-complete-actions">
            {next && <button type="button" className="run-button" onClick={onNext}>{nextLabel ?? `Next case: ${next} →`}</button>}
            <button type="button" className="secondary-button" onClick={onBack}>Back to queue</button>
          </div>
        </section>
      </div> : <div className="notify-actions">
        <button type="button" className="run-button" title={SEND_TOOLTIP} aria-describedby={`${id}-send-note`} onClick={send}>
          Approve &amp; send <span className="muted-on-accent">(simulated)</span></button>
        {/* Internal wording blocks with no override: there is no "Send anyway" for an ID. */}
        <p className={`small ${sendAttempted && blocked ? "error-text" : "muted"}`} role={sendAttempted && blocked ? "alert" : undefined} id={`${id}-send-note`}>{blocked === "amount" ? "Enter the refund amount first."
          : blocked === "second" ? "That amount needs a second reviewer: decide it on the Ruling step."
          : blocked === "held" ? "This case is on hold: nobody is notified until the second reviewer decides."
          : blocked === "privacy" ? "Remove the internal wording from the note." : SEND_TOOLTIP}</p>
      </div>)}
      </div>
    </section>
  );
}
