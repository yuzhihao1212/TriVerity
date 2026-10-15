import { useEffect, useId, useState } from "react";

import { ApiError, decideAppeal, fileAppeal, listAppeals } from "./services/api";
import type { Appeal, Decision, DisputeCase } from "./types";

type FinalDecision = Exclude<Decision, "needs_review">;
const FINAL: Record<FinalDecision, string> = {
  partial_refund: "Partial refund", full_refund: "Full refund", compensation: "Compensation", no_action: "No change to the charge",
};

/** A party contests the ruling; the appeal joins the human review queue. */
export function AppealForm({ dispute, party, decision, onFiled }: {
  dispute: DisputeCase; party: "rider" | "driver"; decision: Decision; onFiled?: () => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [filed, setFiled] = useState<Appeal | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (decision === "needs_review") return null;   // already with a human reviewer
  if (filed) {
    return <p className="small appeal-status" role="status">
      Appeal {filed.id} sent. A human reviewer will look at it{filed.priority === "safety" ? " first" : ""} and follow up.
    </p>;
  }
  if (!open) {
    return <button type="button" className="secondary-button" onClick={() => setOpen(true)}>Appeal this decision</button>;
  }
  function submit() {
    setSending(true);
    setError(null);
    fileAppeal({ case: dispute, party, reason: reason.trim(), original_decision: decision })
      .then((appeal) => { setFiled(appeal); onFiled?.(); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setSending(false));
  }
  return (
    <div className="appeal-form">
      <label htmlFor={`${id}-reason`} className="section-label">Why do you disagree?</label>
      <textarea id={`${id}-reason`} rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="appeal-actions">
        <button type="button" className="run-button" disabled={sending || !reason.trim()} onClick={submit}>
          {sending ? "Sending…" : "Send appeal"}
        </button>
        <button type="button" className="secondary-button" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      <div role="alert">{error && <p className="error small">{error}</p>}</div>
    </div>
  );
}

/** Reviewer console: appeals for this dispute; a decision becomes a precedent. */
export function AppealsPanel({ disputeId, version, onChanged }: { disputeId: string; version: number; onChanged: () => void }) {
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    // Off in the public demo (403): show nothing rather than an error on every dispute.
    listAppeals(disputeId).then(setAppeals)
      .catch((e: Error) => e instanceof ApiError && e.status === 403 ? setAppeals([]) : setError(e.message));
  }, [disputeId, version]);
  if (!appeals.length && !error) return null;
  return (
    <section className="card"><div className="risk-panel">
      <div><p className="eyebrow">Internal review only · learning feedback loop</p><h2>Appeals</h2></div>
      <div role="alert">{error && <p className="error small">{error}</p>}</div>
      <ul className="appeal-list">
        {appeals.map((appeal) => <AppealItem key={appeal.id} appeal={appeal} onDecided={onChanged} />)}
      </ul>
    </div></section>
  );
}

function AppealItem({ appeal, onDecided }: { appeal: Appeal; onDecided: () => void }) {
  const id = useId();
  const [decision, setDecision] = useState<FinalDecision>(
    appeal.original_decision === "needs_review" ? "no_action" : appeal.original_decision);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  function record() {
    setError(null);
    decideAppeal(appeal.id, { decision, note: note.trim() }).then(onDecided).catch((e: Error) => setError(e.message));
  }
  return (
    <li>
      <p><strong>{appeal.id}</strong> · {appeal.party === "rider" ? "Rider" : "Driver"} appeal
        {appeal.priority === "safety" && <span className="risk-badge high"> Safety · review first</span>}</p>
      <p className="small muted">“{appeal.reason}”</p>
      {appeal.status === "decided" ? (
        <p className="small">Decided: <strong>{FINAL[appeal.reviewer_decision!]}</strong>. Added to the precedent knowledge base as {appeal.precedent_id}.</p>
      ) : (
        <div className="appeal-actions">
          <label className="small" htmlFor={`${id}-decision`}>Reviewer decision</label>
          <select id={`${id}-decision`} value={decision} onChange={(e) => setDecision(e.target.value as FinalDecision)}>
            {Object.entries(FINAL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input aria-label="Reviewer note" placeholder="Note (optional)" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
          <button type="button" className="run-button" onClick={record}>Record decision</button>
        </div>
      )}
      <div role="alert">{error && <p className="error small">{error}</p>}</div>
    </li>
  );
}
