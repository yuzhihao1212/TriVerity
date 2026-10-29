import { useEffect, useId, useRef, useState } from "react";

import { decisionBar, decisionErrors, FINAL_LABELS, REASON_PLACEHOLDER, savedText, type FinalDecision, type SavedDecision } from "./decisionState";
import { ButtonLoader } from "./OeroAI";
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
export function useReviewerDecision({ runKey, dispute, resolution, onDecided, onUnavailable, locked = false }: {
  runKey: string | null; dispute?: DisputeCase | null; resolution?: Resolution | null;
  onDecided?: () => void; onUnavailable?: () => void; locked?: boolean;
}) {
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const inFlight = useRef(new Set<string>());
  const escalated = resolution?.decision === "needs_review";
  const blank: Entry = { mode: "idle", choice: null, reason: "", busy: false, saved: null, error: null };
  const entry = (runKey && entries[runKey]) || blank;
  const patch = (key: string, change: Partial<Entry>) =>
    setEntries(prev => ({ ...prev, [key]: { ...(prev[key] ?? blank), ...change } }));

  function record(decision: FinalDecision, note: string, kind: SavedDecision["kind"]) {
    if (locked || !runKey || !dispute || inFlight.current.has(runKey) || entry.saved) return;
    const key = runKey;
    inFlight.current.add(key);
    patch(key, { busy: true, error: null });
    recordReviewerDecision({ case: dispute, decision, note })
      .then(saved => {
        patch(key, { busy: false, saved: { kind, decision, precedentId: saved.id, reason: note } });
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
    reopen() { if (runKey && !entry.busy) patch(runKey, { ...blank }); },
    escalated,
    /** The saved decision for any ruling (by review key), for the queue and the sidebar. */
    savedFor: (key: string | null): SavedDecision | null => (key && entries[key]?.saved) || null,
    setChoice: (choice: FinalDecision) => runKey && patch(runKey, { choice }),
    setReason: (reason: string) => runKey && patch(runKey, { reason }),
    setMode: (mode: Entry["mode"]) => runKey && patch(runKey, { mode }),
    accept() {
      if (resolution && !escalated) record(resolution.decision as FinalDecision, "Accepted the policy ruling.", "accepted");
    },
    submit(choice: FinalDecision, reason: string) { record(choice, reason, escalated ? "decided" : "overridden"); },
    /** Open the decision dialog ("Make decision" or "Override…"); it focuses the outcome. */
    startOverride() {
      if (!locked && runKey) patch(runKey, { mode: "override" });
    },
  };
}

/**
 * The human in the loop: accept the ruling or override it. Either way it becomes a precedent.
 * The outcome and reason are asked in a modal dialog, opened by "Make decision" (escalated) or
 * "Override…", here or in the decision bar, so the card itself stays a single clear action.
 */
export function ReviewerDecision({ resolution, controller }: { resolution: Resolution; controller: DecisionController }) {
  const id = useId();
  const { escalated, mode, busy, saved, error } = controller;
  // A partial refund can be overridden to another amount, while keeping the outcome type.
  const options = (Object.keys(FINAL_LABELS) as FinalDecision[]).filter(d => escalated || d !== resolution.decision || d === "partial_refund");
  // Nothing preselected: the reviewer picks the outcome themselves (no nudge towards the AI's proposal).
  const choice = controller.choice && options.includes(controller.choice) ? controller.choice : null;
  const dialog = useRef<HTMLDialogElement>(null);
  const first = useRef<HTMLSelectElement>(null);
  const [tried, setTried] = useState(false);
  const errors = decisionErrors(choice, controller.reason);
  const open = mode === "override" && !saved;

  // Open on request (from the card or the bar) with the outcome focused; close once saved.
  useEffect(() => {
    const box = dialog.current;
    if (!box) return;
    if (open && !box.open) {
      setTried(false);
      box.showModal();
      first.current?.focus();
    } else if (!open && box.open) box.close();
  }, [open]);

  return (
    <section className="card reviewer-decision" id="reviewer-decision" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Your decision</h2>
      {saved ? <p className="reviewer-done">{savedText(saved)}. Similar disputes are now checked against it.</p> : <>
        <p className="small muted">
          {escalated ? "The rules sent this dispute to you." : "Accept the policy ruling, or override it with a reason."}{" "}
          Your decision becomes a <Term term="precedent">precedent</Term> for similar disputes.
        </p>
        <div className="reviewer-actions">
          {escalated
            ? <button type="button" className="run-button" disabled={busy} onClick={() => controller.startOverride()}>Make decision</button>
            : <>
              <button type="button" className="secondary-button" disabled={busy} onClick={() => controller.accept()}><ButtonLoader busy={busy && !open} />{busy && !open ? "Recording…" : "Accept ruling"}</button>
              <button type="button" className="secondary-button" disabled={busy} onClick={() => controller.startOverride()}>Override…</button>
            </>}
        </div>
        <div role="alert">{!open && error && <p className="error small">{error}</p>}</div>
      </>}
      <dialog className="closed-dialog decision-dialog" ref={dialog} aria-labelledby={`${id}-dialog-title`} aria-describedby={`${id}-dialog-intro`}
        onClose={() => controller.setMode("idle")}
        onCancel={event => { if (busy) event.preventDefault(); }}
        onKeyDown={event => {
          if (event.key !== "Tab") return;
          const controls = event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), select:not(:disabled), textarea:not(:disabled)");
          const firstControl = controls[0], last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === firstControl) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); firstControl?.focus(); }
        }}>
        <h2 id={`${id}-dialog-title`}>{escalated ? "Make your decision" : "Override the ruling"}</h2>
        <p id={`${id}-dialog-intro`} className="muted">
          {escalated ? "The rules sent this dispute to you. Choose the outcome and give a reason." : "Choose a different outcome and give a reason."}{" "}
          It becomes a precedent for similar disputes.
        </p>
        <div className="reviewer-form">
          <label className="section-label" htmlFor={`${id}-decision`}>{escalated ? "Outcome" : "Change the outcome to"}</label>
          <select id={`${id}-decision`} ref={first} value={choice ?? ""} disabled={busy} onChange={e => controller.setChoice(e.target.value as FinalDecision)}
            aria-invalid={tried && !!errors.outcome} aria-describedby={tried && errors.outcome ? `${id}-decision-error` : undefined}>
            <option value="" disabled>Choose an outcome…</option>
            {options.map(d => <option key={d} value={d}>{FINAL_LABELS[d]}</option>)}
          </select>
          {tried && errors.outcome && <p className="field-error small" id={`${id}-decision-error`}>{errors.outcome}</p>}
          <label className="section-label" htmlFor={`${id}-reason`}>Reason</label>
          <textarea id={`${id}-reason`} rows={3} maxLength={300} value={controller.reason} disabled={busy} onChange={e => controller.setReason(e.target.value)}
            placeholder={REASON_PLACEHOLDER}
            aria-invalid={tried && !!errors.reason} aria-describedby={tried && errors.reason ? `${id}-reason-error` : undefined} />
          {tried && errors.reason && <p className="field-error small" id={`${id}-reason-error`}>{errors.reason}</p>}
        </div>
        <div role="alert">{open && error && <p className="error small">{error}</p>}</div>
        <div className="closed-dialog-actions">
          <button type="button" className="secondary-button" disabled={busy} onClick={() => controller.setMode("idle")}>Cancel</button>
          <button type="button" className="run-button" disabled={busy}
            onClick={() => {
              setTried(true);
              if (!choice || errors.reason) return;
              controller.submit(choice, controller.reason.trim());
            }}>
            <ButtonLoader busy={busy} />{busy ? "Recording…" : escalated ? "Confirm decision" : "Confirm override"}
          </button>
        </div>
      </dialog>
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
      {controller.mode !== "override" && view.actions.length > 0 && <div className="decision-bar-actions">
        {view.actions.includes("accept") && <button type="button" className="run-button" disabled={view.disabled} onClick={() => controller.accept()}>
          <ButtonLoader busy={controller.busy} />{controller.busy ? "Recording…" : "Accept ruling"}</button>}
        {view.actions.includes("override") && <button type="button" className="secondary-button" disabled={view.disabled} onClick={() => controller.startOverride()}>Override</button>}
        {view.actions.includes("decide") && <button type="button" className="run-button" disabled={view.disabled} onClick={() => controller.startOverride()}>Make decision</button>}
      </div>}
    </section>
  );
}
