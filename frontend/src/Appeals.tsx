import { useEffect, useId, useRef, useState } from "react";

import { Chip, InternalBadge } from "./Chip";
import { Icon } from "./Icon";
import { FINAL_LABELS as FINAL } from "./decisionState";
import { appealFollowUp, appealLine, decidedAppealLine, originalDecisionText } from "./appealState";
import { ButtonLoader } from "./OeroAI";
import { ApiError, decideAppeal, fileAppeal, listAppeals } from "./services/api";
import type { Appeal, Decision, DisputeCase } from "./types";

type FinalDecision = Exclude<Decision, "needs_review">;
/** A party contests the ruling; the appeal joins the human review queue. */
export function AppealForm({ dispute, party, decision, onFiled, available = true, unavailableNote, existing = null, buttonLabel = "Appeal this decision" }: {
  dispute: DisputeCase; party: "rider" | "driver"; decision: Decision; onFiled?: (appeal: Appeal) => void;
  /** This party's appeal on this dispute (waiting or decided): shown instead of the form. One appeal per party. */
  existing?: Appeal | null;
  buttonLabel?: string;
  /** False while the reviewer is still drafting: the button is disabled and cannot open the form. */
  available?: boolean;
  /** Shown under the disabled button and linked to it, e.g. "Available to the rider after sending". */
  unavailableNote?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [filed, setFiled] = useState<Appeal | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (decision === "needs_review") return null;   // already with a human reviewer
  // A decided appeal from the queue wins over the copy filed in this session, which is still "queued".
  const shown = existing?.status === "decided" ? existing : filed ?? existing;
  if (shown) {
    return <div className="appeal-status" role="status">
      <p className="small appeal-quote"><span className="section-label">Your appeal</span>“{shown.reason}”</p>
      {shown.status === "decided" && shown.reviewer_decision
        ? <p className="small">Appeal {shown.id} decided: <strong>{FINAL[shown.reviewer_decision]}</strong>. This decision is final.</p>
        : <p className="small">Appeal {shown.id} sent. A human reviewer will look at it{shown.priority === "safety" ? " first" : ""} and follow up.</p>}
    </div>;
  }
  if (!available) {
    return <div className="appeal-unavailable">
      <button type="button" className="secondary-button" disabled aria-describedby={unavailableNote ? `${id}-note` : undefined}>{buttonLabel}</button>
      {unavailableNote && <p className="small muted appeal-note" id={`${id}-note`}>{unavailableNote}</p>}
    </div>;
  }
  if (!open) {
    return <button type="button" className="secondary-button" onClick={() => setOpen(true)}>{buttonLabel}</button>;
  }
  function submit() {
    setSending(true);
    setError(null);
    fileAppeal({ case: dispute, party, reason: reason.trim(), original_decision: decision })
      .then((appeal) => { setFiled(appeal); onFiled?.(appeal); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setSending(false));
  }
  return (
    <div className="appeal-form">
      <label htmlFor={`${id}-reason`} className="section-label">Why do you disagree?</label>
      <textarea id={`${id}-reason`} rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="appeal-actions">
        <button type="button" className="run-button" disabled={sending || !reason.trim()} onClick={submit}>
          <ButtonLoader busy={sending} />{sending ? "Sending…" : "Send appeal"}
        </button>
        <button type="button" className="secondary-button" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      <div role="alert">{error && <p className="error small">{error}</p>}</div>
    </div>
  );
}

/** Reviewer console: appeals for this dispute; a decision becomes a precedent. */
export function AppealsPanel({ disputeId, version, onChanged, current = null, closed = false, onReopen }: {
  disputeId: string; version: number; onChanged: () => void;
  /** The decision the parties were last sent, and whether the case is still closed on it. */
  current?: { decision: Decision; text: string } | null; closed?: boolean; onReopen?: () => void;
}) {
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    // Off in the public demo without a judge code (403): show nothing rather than an error on every dispute.
    listAppeals(disputeId).then(setAppeals)
      .catch((e: Error) => e instanceof ApiError && e.status === 403 ? setAppeals([]) : setError(e.message));
  }, [disputeId, version]);
  if (!appeals.length && !error) return null;
  return (
    <section className="reviewer-appeals" aria-label="Appeal review">
      <InternalBadge detail="Internal review only · learning feedback loop" />
      <div role="alert">{error && <p className="error small">{error}</p>}</div>
      <ul className="appeal-list">
        {appeals.map((appeal) => <AppealItem key={appeal.id} appeal={appeal} onDecided={onChanged} current={current} closed={closed} onReopen={onReopen} />)}
      </ul>
    </section>
  );
}

function AppealItem({ appeal, onDecided, current, closed, onReopen }: {
  appeal: Appeal; onDecided: () => void; current: { decision: Decision; text: string } | null; closed: boolean; onReopen?: () => void;
}) {
  const followUp = appealFollowUp(appeal, current, closed);
  const correctable = !!current && appeal.reviewer_decision !== current.decision;
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [decision, setDecision] = useState<FinalDecision>(
    appeal.original_decision === "needs_review" ? "no_action" : appeal.original_decision);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  function record() {
    if (saving) return;
    setSaving(true);
    setError(null);
    decideAppeal(appeal.id, { decision, note: note.trim() })
      .then(() => { dialog.current?.close(); onDecided(); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setSaving(false));
  }
  return (
    <li className="reviewer-appeal">
      <p className="reviewer-appeal-head">
        {appeal.status === "queued" && <Icon name="warning" />}
        <strong>{appealLine(appeal)}</strong>
        {appeal.status === "queued" && <Chip size="sm" tone="warn">Pending review</Chip>}
        {appeal.priority === "safety" && <Chip size="sm" tone="danger">Safety · review first</Chip>}
      </p>
      <blockquote className="reviewer-appeal-reason">“{appeal.reason}”</blockquote>
      {appeal.status === "decided" ? (
        <>
          <p className="reviewer-appeal-result">{decidedAppealLine(appeal)}</p>
          {followUp && <p className="small muted">{followUp}</p>}
          {correctable && closed && onReopen && <button type="button" className="secondary-button" onClick={onReopen}>Reopen to send a correction</button>}
        </>
      ) : (
        <>
          <button type="button" ref={trigger} className="secondary-button reviewer-appeal-trigger"
            onClick={() => { setError(null); dialog.current?.showModal(); }}>Decide appeal {appeal.id}</button>
          <dialog className="closed-dialog appeal-dialog" ref={dialog}
            aria-labelledby={`${id}-title`} aria-describedby={`${id}-reason ${id}-original`}
            onClose={() => trigger.current?.focus()}
            onKeyDown={event => {
              if (event.key !== "Tab") return;
              const controls = event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), select:not(:disabled), input:not(:disabled)");
              const first = controls[0], last = controls[controls.length - 1];
              if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
              else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }}>
            <h2 id={`${id}-title`}>Decide appeal {appeal.id}</h2>
            <div id={`${id}-reason`}>
              <p>{appeal.party === "rider" ? "Rider" : "Driver"} appealed:</p>
              <blockquote className="reviewer-appeal-reason">“{appeal.reason}”</blockquote>
            </div>
            <p id={`${id}-original`}>{originalDecisionText(appeal.original_decision)}</p>
            <div className="appeal-dialog-fields">
              <label htmlFor={`${id}-decision`}>Reviewer decision</label>
              <select id={`${id}-decision`} value={decision} disabled={saving} onChange={(e) => setDecision(e.target.value as FinalDecision)}>
                {Object.entries(FINAL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <label htmlFor={`${id}-note`}>Note (optional)</label>
              <input id={`${id}-note`} maxLength={300} value={note} disabled={saving} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div role="alert">{error && <p className="error">{error}</p>}</div>
            <div className="closed-dialog-actions">
              <button type="button" className="secondary-button" autoFocus onClick={() => dialog.current?.close()}>Cancel</button>
              <button type="button" className="run-button" disabled={saving} onClick={record}><ButtonLoader busy={saving} />{saving ? "Recording…" : "Record decision"}</button>
            </div>
          </dialog>
        </>
      )}
    </li>
  );
}
