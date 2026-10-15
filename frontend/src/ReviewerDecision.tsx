import { useId, useState } from "react";

import { Term } from "./Term";
import { ApiError, recordReviewerDecision } from "./services/api";
import type { Decision, DisputeCase, Resolution } from "./types";

type Final = Exclude<Decision, "needs_review">;
const LABELS: Record<Final, string> = {
  partial_refund: "Partial refund", full_refund: "Full refund", compensation: "Compensation", no_action: "No change to the charge",
};

/**
 * The human in the loop: accept the ruling or override it. Either way it becomes a precedent.
 * `onDecided` fires once the decision is saved; `onUnavailable` when recording is turned off
 * (403, as in the public demo), so the stepper can still count the Ruling step as reviewed.
 */
export function ReviewerDecision({ dispute, resolution, onDecided, onUnavailable }: {
  dispute: DisputeCase; resolution: Resolution; onDecided?: () => void; onUnavailable?: () => void;
}) {
  const id = useId();
  const escalated = resolution.decision === "needs_review";
  const [mode, setMode] = useState<"idle" | "override">(escalated ? "override" : "idle");
  const options = (Object.keys(LABELS) as Final[]).filter(d => d !== resolution.decision);
  const [choice, setChoice] = useState<Final>(options[0]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function record(decision: Final, note: string, verb: string) {
    setBusy(true);
    setError(null);
    recordReviewerDecision({ case: dispute, decision, note })
      .then(saved => {
        setDone(`${verb}: ${LABELS[decision].toLowerCase()}. Saved as precedent ${saved.id}; similar disputes are now checked against it.`);
        onDecided?.();
      })
      .catch((e: Error) => {
        setError(e.message);
        if (e instanceof ApiError && e.status === 403) onUnavailable?.();
      })
      .finally(() => setBusy(false));
  }

  return (
    <section className="card reviewer-decision" aria-labelledby={`${id}-title`}>
      <div><p className="eyebrow">Human in the loop</p><h2 id={`${id}-title`}>Your decision</h2></div>
      {done ? <p className="reviewer-done" role="status">{done}</p> : <>
        <p className="small muted">
          {escalated
            ? "The rules sent this dispute to you. Choose the outcome and give a reason."
            : "Accept the policy ruling, or override it with a reason."}{" "}
          Your decision becomes a <Term term="precedent">precedent</Term> for similar disputes.
        </p>
        {mode === "idle" && <div className="reviewer-actions">
          <button type="button" className="run-button" disabled={busy}
            onClick={() => record(resolution.decision as Final, "Accepted the policy ruling.", "Accepted")}>Accept ruling</button>
          <button type="button" className="secondary-button" onClick={() => setMode("override")}>Override…</button>
        </div>}
        {mode === "override" && <div className="reviewer-form">
          <label className="section-label" htmlFor={`${id}-decision`}>{escalated ? "Outcome" : "Change the outcome to"}</label>
          <select id={`${id}-decision`} value={choice} onChange={e => setChoice(e.target.value as Final)}>
            {(escalated ? (Object.keys(LABELS) as Final[]) : options).map(d => <option key={d} value={d}>{LABELS[d]}</option>)}
          </select>
          <label className="section-label" htmlFor={`${id}-reason`}>Reason</label>
          <textarea id={`${id}-reason`} rows={2} maxLength={300} value={reason} onChange={e => setReason(e.target.value)}
            placeholder="The main road was closed; the detour was the only open route." />
          <div className="reviewer-actions">
            <button type="button" className="run-button" disabled={busy || !reason.trim()}
              onClick={() => record(choice, reason.trim(), escalated ? "Decided" : "Overridden")}>
              {escalated ? "Record decision" : "Record override"}
            </button>
            {!escalated && <button type="button" className="secondary-button" onClick={() => setMode("idle")}>Cancel</button>}
          </div>
        </div>}
        <div role="alert">{error && <p className="error small">{error}</p>}</div>
      </>}
    </section>
  );
}
