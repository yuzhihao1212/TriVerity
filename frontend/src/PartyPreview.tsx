import { useEffect, useId, useState } from "react";

import { AppealForm } from "./Appeals";
import type { SavedDecision } from "./decisionState";
import { Icon } from "./Icon";
import {
  clockText, createSentStore, finalOutcome, maxRefund, notifyGate, PARTIES, privacyWarnings, SEND_TOOLTIP, sentText,
  suggestedMessage, validateAmount, type FinalOutcome, type Party, type SentRecord,
} from "./notifyState";
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

/**
 * Notify parties: after the ruling is accepted or overridden, the reviewer edits each party's
 * message beside its phone and approves both. The outcome and amount are locked to the final
 * decision; only the wording is editable. The phones never show internal data.
 */
export function PartyPreview({ resolution, dispute, reviewKey, saved, unavailable, rulingVisited, onGoToRuling, onSent, onAppealed, next, onNext, onBack }: {
  resolution: Resolution; dispute: DisputeCase; reviewKey: string;
  saved: SavedDecision | null; unavailable: boolean; rulingVisited: boolean;
  onGoToRuling: () => void; onSent: () => void; onAppealed?: () => void;
  /** The next case still to do, or null when none is left. */
  next: string | null; onNext: () => void; onBack: () => void;
}) {
  const id = useId();
  const [sent, setSent] = useState<SentRecord | null>(() => sentRecords().get(reviewKey));
  const [drafts, setDrafts] = useState<Record<Party, string | null>>({ rider: null, driver: null });
  const [amountText, setAmountText] = useState("");
  const [sendAnyway, setSendAnyway] = useState(false);
  const gate = notifyGate({ saved: !!saved, unavailable, rulingVisited });
  const max = maxRefund(dispute);
  const amountCheck = validateAmount(amountText, max);
  const outcome: FinalOutcome = sent
    ? { ...finalOutcome(resolution, saved, dispute), decision: sent.decision, amount: sent.amount, needsAmount: false }
    : finalOutcome(resolution, saved, dispute, amountCheck.ok ? amountCheck.value : null);
  const suggested = (party: Party) => suggestedMessage(party, resolution, outcome);
  const text = (party: Party) => sent ? sent.messages[party] : drafts[party] ?? suggested(party);
  const warnings = Object.fromEntries(PARTIES.map(party => [party, privacyWarnings(text(party))])) as Record<Party, string[]>;
  const flagged = PARTIES.some(party => warnings[party].length);
  useEffect(() => { if (!flagged) setSendAnyway(false); }, [flagged]);
  const amountMissing = outcome.needsAmount && !amountCheck.ok;
  const empty = PARTIES.some(party => !text(party).trim());
  const blocked = amountMissing || empty || (flagged && !sendAnyway);

  function send() {
    if (blocked || sent) return;
    const messages = { rider: text("rider").trim(), driver: text("driver").trim() };
    const edited = PARTIES.some(party => messages[party] !== suggested(party).trim());
    const record: SentRecord = { at: clockText(new Date()), edited, messages, decision: outcome.decision, amount: outcome.amount };
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
      <p className="small muted">Edit the wording if needed, then approve both. The outcome and amount come from the final decision; to change them, use Override on the Ruling step. The phones show only the outcome and a plain explanation: never fraud signals, party history or internal evidence.</p>
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
            <label className="section-label" htmlFor={`${id}-${party}-text`}>Message to the {party}</label>
            {sent
              ? <p className="notify-sent-text" id={`${id}-${party}-text`}>{text(party)}</p>
              : <textarea id={`${id}-${party}-text`} rows={6} maxLength={600} value={text(party)}
                  aria-describedby={warnings[party].length ? `${id}-${party}-warn` : undefined}
                  onChange={event => setDrafts(previous => ({ ...previous, [party]: event.target.value }))} />}
            {!sent && warnings[party].length > 0 && <p className="notify-warning" id={`${id}-${party}-warn`} role="status">
              <Icon name="warning" />Internal wording the {party} must not see: {warnings[party].join(", ")}.</p>}
            {!sent && drafts[party] !== null && drafts[party] !== suggested(party) && <button type="button" className="agents-toggle notify-reset"
              onClick={() => setDrafts(previous => ({ ...previous, [party]: null }))}>Reset to suggested</button>}
          </div>
          <Phone party={party} outcome={outcome} message={text(party)} dispute={dispute} decision={resolution.decision} onAppealed={onAppealed} id={id} />
        </div>)}
      </div>
      {sent ? <div className="notify-done">
        <p className="notify-sent" role="status">{sentText(sent)}</p>
        <section className="card review-complete" aria-label="Review complete">
          <p className="review-complete-title"><Icon name="check" />Review complete for {dispute.dispute_id}</p>
          <div className="review-complete-actions">
            {next && <button type="button" className="run-button" onClick={onNext}>Next case: {next} <span aria-hidden="true">→</span></button>}
            <button type="button" className="secondary-button" onClick={onBack}>Back to queue</button>
          </div>
        </section>
      </div> : <div className="notify-actions">
        {flagged && <label className="send-anyway"><input type="checkbox" checked={sendAnyway} onChange={event => setSendAnyway(event.target.checked)} />
          Send anyway: I've checked this wording is fine for the parties</label>}
        <button type="button" className="run-button" disabled={blocked} title={SEND_TOOLTIP} aria-describedby={`${id}-send-note`} onClick={send}>
          Approve &amp; send <span className="muted-on-accent">(simulated)</span></button>
        <p className="small muted" id={`${id}-send-note`}>{blocked
          ? amountMissing ? "Enter the refund amount first." : empty ? "Both messages need some text." : "Remove the internal wording, or tick “Send anyway”."
          : SEND_TOOLTIP}</p>
      </div>}
    </section>
  );
}

function Phone({ party, outcome, message, dispute, decision, onAppealed, id }: {
  party: Party; outcome: FinalOutcome; message: string; dispute: DisputeCase; decision: Resolution["decision"]; onAppealed?: () => void; id: string;
}) {
  return <figure className="phone-wrap" aria-labelledby={`${id}-${party}`}>
    <figcaption id={`${id}-${party}`} className="section-label">{WHO[party]}’s phone</figcaption>
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
        <AppealForm key={`${dispute.dispute_id}-${party}`} dispute={dispute} party={party} decision={decision} onFiled={onAppealed} />
      </div>
    </div>
  </figure>;
}
