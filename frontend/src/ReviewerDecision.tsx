import { useEffect, useId, useRef, useState } from "react";

import { decisionBar, FINAL_LABELS, savedText, type FinalDecision, type SavedDecision } from "./decisionState";
import { reveal } from "./routes";
import { Term } from "./Term";
import { ApiError, recordReviewerDecision } from "./services/api";
import type { DisputeCase, Resolution } from "./types";

interface Entry { mode: "idle" | "override"; choice: FinalDecision | null; reason: string; busy: boolean; saved: SavedDecision | null; error: string | null }

export type DecisionController = ReturnType<typeof useReviewerDecision>;

/**
 * The reviewer's decision for one ruling, shared by the sticky decision bar and the
 * "Your decision" card. State is kept per ruling (`runKey`), so it survives tab switches
 * and resets with a new run. `onDecided` fires exactly once per saved decision; a second
 * submit is ignored while one is in flight or after one is saved.
 */
export function useReviewerDecision({ runKey, dispute, resolution, onDecided, onUnavailable }: {
  runKey: string | null; dispute?: DisputeCase | null; resolution?: Resolution | null;
  onDecided?: () => void; onUnavailable?: () => void;
}) {
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const inFlight = useRef(new Set<string>());
  const [overrideRequest, setOverrideRequest] = useState(0);
  const escalated = resolution?.decision === "needs_review";
  const blank: Entry = { mode: escalated ? "override" : "idle", choice: null, reason: "", busy: false, saved: null, error: null };
  const entry = (runKey && entries[runKey]) || blank;
  const patch = (key: string, change: Partial<Entry>) =>
    setEntries(prev => ({ ...prev, [key]: { ...(prev[key] ?? blank), ...change } }));

  function record(decision: FinalDecision, note: string, kind: SavedDecision["kind"]) {
    if (!runKey || !dispute || inFlight.current.has(runKey) || entry.saved) return;
    const key = runKey;
    inFlight.current.add(key);
    patch(key, { busy: true, error: null });
    recordReviewerDecision({ case: dispute, decision, note })
      .then(saved => {
        patch(key, { busy: false, saved: { kind, decision, precedentId: saved.id } });
        onDecided?.();
      })
      .catch((e: Error) => {
        patch(key, { busy: false, error: e.message });
        if (e instanceof ApiError && e.status === 403) onUnavailable?.();
      })
      .finally(() => inFlight.current.delete(key));
  }

  return {
    ...entry,
    escalated,
    overrideRequest,
    /** The saved decision for any ruling (by review key), for the queue and the sidebar. */
    savedFor: (key: string | null): SavedDecision | null => (key && entries[key]?.saved) || null,
    setChoice: (choice: FinalDecision) => runKey && patch(runKey, { choice }),
    setReason: (reason: string) => runKey && patch(runKey, { reason }),
    setMode: (mode: Entry["mode"]) => runKey && patch(runKey, { mode }),
    accept() {
      if (resolution && !escalated) record(resolution.decision as FinalDecision, "Accepted the policy ruling.", "accepted");
    },
    submit(choice: FinalDecision, reason: string) { record(choice, reason, escalated ? "decided" : "overridden"); },
    /** Open the override form; the card scrolls to it and focuses its first field. */
    startOverride() {
      if (runKey) patch(runKey, { mode: "override" });
      setOverrideRequest(n => n + 1);
    },
  };
}

/** The human in the loop: accept the ruling or override it. Either way it becomes a precedent. */
export function ReviewerDecision({ resolution, controller }: { resolution: Resolution; controller: DecisionController }) {
  const id = useId();
  const { escalated, mode, busy, saved, error } = controller;
  const options = (Object.keys(FINAL_LABELS) as FinalDecision[]).filter(d => escalated || d !== resolution.decision);
  const choice = controller.choice ?? options[0];
  const first = useRef<HTMLSelectElement>(null);

  // "Override" / "Decide" in the decision bar: bring the form into view and focus it.
  useEffect(() => {
    if (controller.overrideRequest) reveal(first.current, "center");
  }, [controller.overrideRequest]);

  return (
    <section className="card reviewer-decision" id="reviewer-decision" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Your decision</h2>
      {saved ? <p className="reviewer-done">{savedText(saved)}. Similar disputes are now checked against it.</p> : <>
        <p className="small muted">
          {escalated
            ? "The rules sent this dispute to you. Choose the outcome and give a reason."
            : "Accept the policy ruling, or override it with a reason."}{" "}
          Your decision becomes a <Term term="precedent">precedent</Term> for similar disputes.
        </p>
        {mode === "idle" && <div className="reviewer-actions">
          <button type="button" className="run-button" disabled={busy} onClick={() => controller.accept()}>Accept ruling</button>
          <button type="button" className="secondary-button" disabled={busy} onClick={() => controller.startOverride()}>Override…</button>
        </div>}
        {mode === "override" && <div className="reviewer-form">
          <label className="section-label" htmlFor={`${id}-decision`}>{escalated ? "Outcome" : "Change the outcome to"}</label>
          <select id={`${id}-decision`} ref={first} value={choice} onChange={e => controller.setChoice(e.target.value as FinalDecision)}>
            {options.map(d => <option key={d} value={d}>{FINAL_LABELS[d]}</option>)}
          </select>
          <label className="section-label" htmlFor={`${id}-reason`}>Reason</label>
          <textarea id={`${id}-reason`} rows={2} maxLength={300} value={controller.reason} onChange={e => controller.setReason(e.target.value)}
            placeholder="The main road was closed; the detour was the only open route." />
          <div className="reviewer-actions">
            <button type="button" className="run-button" disabled={busy || !controller.reason.trim()}
              onClick={() => controller.submit(choice, controller.reason.trim())}>
              {escalated ? "Record decision" : "Record override"}
            </button>
            {!escalated && <button type="button" className="secondary-button" disabled={busy} onClick={() => controller.setMode("idle")}>Cancel</button>}
          </div>
        </div>}
        <div role="alert">{error && <p className="error small">{error}</p>}</div>
      </>}
    </section>
  );
}

/** Pinned to the bottom of the Ruling step: the outcome, and the same accept/override actions. */
export function DecisionBar({ resolution, controller, unavailable }: { resolution: Resolution; controller: DecisionController; unavailable: boolean }) {
  const view = decisionBar({ decision: resolution.decision, refund: resolution.refund_amount, busy: controller.busy, saved: controller.saved, unavailable });
  return (
    <section className={`decision-bar tone-${view.tone}`} aria-label="Your decision on this ruling">
      <p className="decision-bar-outcome">
        {view.note ?? <><span className="decision-bar-dot" aria-hidden="true" />{view.label}{view.amount && <> · <strong>{view.amount}</strong></>}</>}
      </p>
      {view.actions.length > 0 && <div className="decision-bar-actions">
        {view.actions.includes("accept") && <button type="button" className="run-button" disabled={view.disabled} onClick={() => controller.accept()}>Accept ruling</button>}
        {view.actions.includes("override") && <button type="button" className="secondary-button" disabled={view.disabled} onClick={() => controller.startOverride()}>Override</button>}
        {view.actions.includes("decide") && <button type="button" className="run-button" disabled={view.disabled} onClick={() => controller.startOverride()}>Decide</button>}
      </div>}
    </section>
  );
}
