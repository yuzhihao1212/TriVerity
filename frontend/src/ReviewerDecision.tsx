import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

import {
  decisionBar, overrideAmountCheck, INVESTIGATION_CHECKS, OVERRIDE_LABELS, overrideChoices, overrideError,
  overrideLine, readHeld, REASON_PLACEHOLDER, rulingLine, secondApprovalLimit, writeHeld,
  type FinalDecision, type HoldRecord, type OverrideChoice, type SavedDecision,
} from "./decisionState";
import { Icon } from "./Icon";
import { clockText, maxRefund } from "./notifyState";
import { ButtonLoader } from "./OeroAI";
import { HunyuanMark } from "./SourceBadge";
import { Term } from "./Term";
import { ApiError, recordReviewerDecision } from "./services/api";
import type { DisputeCase, Resolution } from "./types";

interface Entry {
  mode: "idle" | "override"; choice: OverrideChoice | null; amount: string; check: string | null; reason: string;
  busy: boolean; saved: SavedDecision | null; error: string | null;
}

export type DecisionController = ReturnType<typeof useReviewerDecision>;

const heldStorage = () => { try { return window.sessionStorage; } catch { return null; } };

const reduceMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * The reviewer's decision for one ruling, shared by the sticky decision bar and the
 * "Your decision" panel. State is kept per ruling (`runKey`), so it survives tab switches
 * and resets with a new run. `onDecided` fires exactly once per saved decision; a second
 * submit is ignored while one is in flight or after one is saved.
 *
 * A hold for a second reviewer is different: it belongs to the dispute, not to the ruling, so
 * it survives a re-run (which gives the case a new key) or a reload, and the home page shows
 * one hold per case. It is simulated in this browser session: it records nothing and notifies no one.
 */
export function useReviewerDecision({ runKey, dispute, resolution, onDecided, onUnavailable, locked = false }: {
  runKey: string | null; dispute?: DisputeCase | null; resolution?: Resolution | null;
  onDecided?: () => void; onUnavailable?: () => void; locked?: boolean;
}) {
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  /** Holds by dispute ID, so a case stays on hold across runs until a reviewer clears it. */
  const [restored] = useState(() => readHeld(heldStorage()));
  const [holds, setHolds] = useState<Record<string, HoldRecord>>(restored.holds);
  /** Every dispute put on hold this session, even if since cleared: a person has taken it on. */
  const everHeld = useRef(new Set<string>(restored.everHeld));
  useEffect(() => { writeHeld(heldStorage(), { holds, everHeld: [...everHeld.current] }); }, [holds]);
  const inFlight = useRef(new Set<string>());
  const escalated = resolution?.decision === "needs_review";
  const blank: Entry = { mode: "idle", choice: null, amount: "", check: null, reason: "", busy: false, saved: null, error: null };
  const entry = (runKey && entries[runKey]) || blank;
  const caseId = dispute?.dispute_id ?? null;
  const hold = caseId ? holds[caseId] ?? null : null;
  const fare = dispute ? maxRefund(dispute) : null;
  const patch = (key: string, change: Partial<Entry>) =>
    setEntries(prev => ({ ...prev, [key]: { ...(prev[key] ?? blank), ...change } }));
  const putHold = (record: HoldRecord) => {
    everHeld.current.add(record.disputeId);
    setHolds(prev => ({ ...prev, [record.disputeId]: record }));
  };
  const clearHold = (disputeId: string) =>
    setHolds(prev => { if (!prev[disputeId]) return prev; const next = { ...prev }; delete next[disputeId]; return next; });

  function record(decision: FinalDecision, note: string, kind: SavedDecision["kind"], amount?: number) {
    if (locked || !runKey || !dispute || inFlight.current.has(runKey) || entry.saved || hold) return;
    const key = runKey;
    inFlight.current.add(key);
    patch(key, { busy: true, error: null });
    recordReviewerDecision({ case: dispute, decision, note })
      .then(saved => {
        patch(key, { busy: false, mode: "idle", saved: { kind, decision, precedentId: saved.id, reason: note, amount, at: clockText(new Date()) } });
        onDecided?.();
      })
      .catch((e: Error) => {
        patch(key, { busy: false, error: e.message });
        if (e instanceof ApiError && e.status === 403) onUnavailable?.();
      })
      .finally(() => inFlight.current.delete(key));
  }

  const amountCheck = overrideAmountCheck(entry.choice, entry.amount, fare, resolution?.refund_amount ?? null);

  return {
    ...entry,
    escalated,
    hold,
    fare,
    amountCheck,
    /** Back to deciding: after a saved decision (recorded again when decided), or off hold. */
    reopen() {
      if (!runKey || entry.busy) return;
      if (caseId) clearHold(caseId);
      patch(runKey, { ...blank });
    },
    /** The saved decision for any ruling (by review key), for the queue and the sidebar. */
    savedFor: (key: string | null): SavedDecision | null => (key && entries[key]?.saved) || null,
    /** Every case on hold in this session, newest first, at most one row per case. */
    holds: (): HoldRecord[] => Object.values(holds).reverse(),
    /** This dispute went on hold this session, so a later run must not close it automatically. */
    wasHeld: (disputeId: string): boolean => everHeld.current.has(disputeId),
    setChoice: (choice: OverrideChoice) => runKey && patch(runKey, { choice, error: null }),
    setAmount: (amount: string) => runKey && patch(runKey, { amount }),
    setCheck: (check: string) => runKey && patch(runKey, { check }),
    setReason: (reason: string) => runKey && patch(runKey, { reason }),
    setMode: (mode: Entry["mode"]) => runKey && patch(runKey, { mode, error: null }),
    accept() {
      if (resolution && !escalated) record(resolution.decision as FinalDecision, "Accepted the policy ruling.", "accepted");
    },
    /** Confirm the override form: an investigation or a large refund goes on hold instead. */
    submit() {
      if (locked || !runKey || !dispute || !entry.choice || entry.busy) return;
      if (overrideError({ choice: entry.choice, check: entry.check, reason: entry.reason, amount: amountCheck })) return;
      const reason = entry.reason.trim();
      const at = clockText(new Date());
      if (entry.choice === "investigate") {
        putHold({ disputeId: dispute.dispute_id, why: entry.check ?? "Needs further investigation", reason, amount: null, at });
        patch(runKey, { mode: "idle" });
      } else if ((entry.choice === "partial_refund" || entry.choice === "full_refund") && amountCheck?.state === "second") {
        putHold({ disputeId: dispute.dispute_id, why: `$${amountCheck.value!.toFixed(2)} refund needs a second approval`, reason, amount: amountCheck.value, at });
        patch(runKey, { mode: "idle" });
      } else {
        record(entry.choice, reason, escalated ? "decided" : "overridden", entry.choice === "partial_refund" ? amountCheck?.value ?? undefined : undefined);
      }
    },
    /** Open the override form ("Make decision" or "Override…"), here or from the decision bar. */
    startOverride() {
      if (!locked && runKey) patch(runKey, { mode: "override", error: null });
    },
  };
}

/** The box keeps its place and changes size smoothly between deciding, overriding and done. */
function useResize(phase: string) {
  const box = useRef<HTMLElement>(null);
  const last = useRef<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const from = last.current;
    const to = { w: el.offsetWidth, h: el.offsetHeight };
    last.current = to;
    if (!from || reduceMotion() || (from.w === to.w && from.h === to.h)) return;
    el.style.transition = "none";
    el.style.width = `${from.w}px`;
    el.style.height = `${from.h}px`;
    void el.offsetWidth;
    el.style.transition = "";
    el.style.width = `${to.w}px`;
    el.style.height = `${to.h}px`;
    const done = () => { el.style.width = ""; el.style.height = ""; last.current = { w: el.offsetWidth, h: el.offsetHeight }; };
    const timer = window.setTimeout(done, 560);
    return () => window.clearTimeout(timer);
  }, [phase]);
  return box;
}

/**
 * The human in the loop: accept the ruling or override it, in one box that changes with each
 * step. Accepting shrinks it to a drawn tick; overriding turns it into a careful form (the
 * policy ruling struck through, your decision beside it); an investigation or a large refund
 * puts the case on hold for a second reviewer. Any decision can be changed until Notify.
 */
export function ReviewerDecision({ resolution, controller, onContinue }: { resolution: Resolution; controller: DecisionController; onContinue?: () => void }) {
  const id = useId();
  const { escalated, mode, busy, saved, hold, error } = controller;
  const phase = saved ? "done" : hold ? "held" : mode === "override" ? "override" : "decide";
  const box = useResize(phase);
  const focusTarget = useRef<HTMLHeadingElement>(null);
  const firstPhase = useRef(true);
  useEffect(() => {
    if (firstPhase.current) { firstPhase.current = false; return; }
    if (phase !== "decide") focusTarget.current?.focus();
  }, [phase]);

  const ai = resolution.rider_case.source === "llm" || resolution.driver_case.source === "llm";
  const ruling = rulingLine(resolution.decision, resolution.refund_amount);
  const confidence = Math.round(resolution.confidence * 100);
  const acceptLabel = resolution.refund_amount != null && resolution.refund_amount > 0 && resolution.decision !== "no_action"
    ? `Accept $${resolution.refund_amount.toFixed(2)} ${resolution.decision === "compensation" ? "credit" : "refund"}` : "Accept ruling";

  return (
    <section ref={box} className={`card decision-panel phase-${phase}${hold ? " is-held" : ""}`} id="reviewer-decision" aria-labelledby={`${id}-title`}>
      {phase === "decide" && <>
        <header className="decision-head">
          <Icon name="person" />
          <h2 id={`${id}-title`}>Your call</h2>
          <p className="decision-head-sub">{escalated ? "The rules sent this dispute to you. A person makes the decision." : "The agents have finished. A person makes the final decision."}</p>
          <ol className="decision-chain" aria-label="Who did what">
            <li>{ai ? <><HunyuanMark />Hy3 argued</> : "Advocates argued"}</li>
            <li><Icon name="function" />Rules ruled</li>
            <li className="is-you"><Icon name="person" />You decide</li>
          </ol>
        </header>
        <div className="decision-body">
          <p className="decision-ruling"><span className="decision-ruling-label">Ruling</span> <strong>{ruling}</strong> · {confidence}% confidence</p>
          <div className="reviewer-actions">
            {escalated
              ? <button type="button" className="run-button decision-main" disabled={busy} onClick={() => controller.startOverride()}>Make decision</button>
              : <>
                <button type="button" className="run-button decision-main" disabled={busy} onClick={() => controller.accept()}>
                  <ButtonLoader busy={busy} />{busy ? "Recording…" : <><Icon name="check" />{acceptLabel}</>}</button>
                <button type="button" className="secondary-button decision-alt" disabled={busy} onClick={() => controller.startOverride()}>Override…</button>
              </>}
          </div>
          <ul className="decision-next">
            <li><Icon name="send" />Both parties are notified when you continue</li>
            <li><Icon name="books" />Saved as a <Term term="precedent">precedent</Term> for similar disputes</li>
          </ul>
          <div role="alert">{error && <p className="error small">{error}</p>}</div>
        </div>
      </>}

      {phase === "override" && <OverrideForm id={id} resolution={resolution} controller={controller} ruling={ruling} confidence={confidence} heading={focusTarget} />}

      {(phase === "done" || phase === "held") && <div className="decision-result" aria-live="polite">
        {/* The pencil means the rules were overridden; deciding an escalated case is a tick, like accepting. */}
        <DecisionMark kind={saved ? (saved.kind === "overridden" ? "overridden" : "accepted") : "held"} />
        <h2 id={`${id}-title`} ref={focusTarget} tabIndex={-1}>
          {saved ? (saved.kind === "accepted" ? "Ruling accepted" : saved.kind === "overridden" ? "Ruling overridden" : "Decision saved") : "On hold for a second reviewer"}</h2>
        <p className="decision-result-line">{saved ? resultLine(saved, resolution, controller.fare) : `${hold!.why} · nobody is notified yet`}</p>
        <div className="decision-result-actions">
          {saved && onContinue && <button type="button" className="run-button" onClick={onContinue}>Notify both parties<Icon name="arrow" /></button>}
          <button type="button" className="text-button" onClick={() => controller.reopen()}>Change decision</button>
        </div>
      </div>}
    </section>
  );
}

function resultLine(saved: SavedDecision, resolution: Resolution, fare: number | null): string {
  const what = saved.kind === "accepted" ? rulingLine(resolution.decision, resolution.refund_amount)
    : overrideLine(saved.decision as OverrideChoice, saved.amount ?? null, fare);
  return [what, saved.at ? `by you at ${saved.at}` : "by you", `precedent ${saved.precedentId}`].join(" · ");
}

/** The tick (accepted), pencil (overridden) or pause (on hold) that pops in once the box has shrunk. */
function DecisionMark({ kind }: { kind: "accepted" | "overridden" | "held" }) {
  return <svg className={`decision-mark mark-${kind}`} viewBox="0 0 64 64" width="64" height="64" aria-hidden="true" focusable="false">
    <circle className="decision-mark-ring" cx="32" cy="32" r="27" />
    <circle className="decision-mark-disc" cx="32" cy="32" r="27" />
    <path className="decision-mark-path" pathLength={1} d={kind === "accepted" ? "M20 33l8 8 16-17" : kind === "overridden" ? "M24 40l14-14m-4-4 4 4M24 40l-3 1 1-3" : "M27 22v20M37 22v20"} />
  </svg>;
}

function OverrideForm({ id, resolution, controller, ruling, confidence, heading }: {
  id: string; resolution: Resolution; controller: DecisionController; ruling: string; confidence: number;
  heading: RefObject<HTMLHeadingElement>;
}) {
  const { escalated, choice, amount, check, reason, busy, error, fare, amountCheck } = controller;
  const [tried, setTried] = useState(false);
  const choices = overrideChoices(resolution.decision);
  const problem = overrideError({ choice, check, reason, amount: amountCheck });
  const rulingRefund = resolution.refund_amount != null && resolution.refund_amount > 0 ? resolution.refund_amount : null;
  const limit = secondApprovalLimit(rulingRefund);
  const fullCheck = choice === "full_refund" ? amountCheck : null;
  const holds = choice === "investigate" || amountCheck?.state === "second";
  const yours = choice ? overrideLine(choice, amountCheck?.value ?? null, fare) : null;
  const confirm = choice === "investigate" ? "Put on hold" : amountCheck?.state === "second" ? "Send for second approval" : escalated ? "Confirm decision" : "Confirm override";
  const at = (value: number) => fare ? `${Math.min(100, Math.max(0, (value - 0.5) / (fare - 0.5) * 100))}%` : "0%";

  return <>
    <header className="decision-head">
      <Icon name="warning" />
      <h2 id={`${id}-title`} ref={heading} tabIndex={-1}>{escalated ? "Make your decision" : "Overriding the policy ruling"}</h2>
      <p className="decision-head-sub">Check this carefully before you confirm.</p>
    </header>
    <div className="decision-body">
      <p className="override-intro">{escalated
        ? "The rules sent this dispute to you. Your decision is reviewed and becomes a precedent."
        : <>You're going against a ruling the rules made with <strong>{confidence}% confidence</strong>. Overrides are reviewed and become a precedent, so take a moment.</>}</p>
      <div className={`override-compare${escalated ? "" : " is-struck"}`}>
        <div className="override-card is-policy">
          {!escalated && <span className="override-tag">Set aside</span>}
          <span className="override-avatar"><Icon name="function" /></span>
          <span><span className="override-card-label">Policy ruling · by the rules</span>
            <strong className="override-card-value">{ruling}{!escalated && <span className="override-strike" aria-hidden="true" />}</strong>
            {!escalated && <span className="sr-only"> (set aside)</span>}</span>
        </div>
        <Icon name="arrow" className="override-arrow" />
        <div className={`override-card is-yours${choice ? " is-set" : ""}`}>
          <span className="override-avatar"><Icon name="person" /></span>
          <span><span className="override-card-label">Your decision · by you</span>
            <strong className="override-card-value">{yours ?? "Choose below"}</strong></span>
        </div>
      </div>

      <fieldset className="override-step">
        <legend>1 · What should happen instead?</legend>
        <div className="override-chips">{choices.map(option =>
          <button key={option} type="button" className="override-chip" aria-pressed={choice === option} disabled={busy}
            onClick={() => controller.setChoice(option)}>
            {option === "investigate" && <Icon name="magnifier" />}
            {option === "full_refund" && fare != null ? `Full refund $${fare.toFixed(2)}` : OVERRIDE_LABELS[option]}
          </button>)}</div>
        {choice === "partial_refund" && <div className="override-sub">
          <label htmlFor={`${id}-amount`}>Refund amount</label>
          <span className="override-amount">$<input id={`${id}-amount`} inputMode="decimal" value={amount} placeholder="0.00" disabled={busy}
            aria-describedby={`${id}-amount-note`} aria-invalid={tried && amountCheck?.value == null}
            onChange={event => controller.setAmount(event.target.value)} /></span>
          {fare != null && <span className="muted small">of the ${fare.toFixed(2)} fare charged</span>}
          {fare != null && fare > 0.5 && <div className="override-range">
            {rulingRefund != null && <span className="override-mark" style={{ left: at(rulingRefund) } as CSSProperties}>ruling ${rulingRefund.toFixed(2)}</span>}
            {limit != null && limit < fare && <>
              <span className="override-zone" style={{ left: at(limit) } as CSSProperties} aria-hidden="true" />
              <span className="override-mark is-limit" style={{ left: at(limit) } as CSSProperties}>2nd reviewer above ${limit.toFixed(2)}</span></>}
            <input type="range" min={0.5} max={fare} step={0.1} disabled={busy} aria-label="Refund amount slider"
              value={amountCheck?.value ?? (Number(amount) || rulingRefund || 0.5)}
              onChange={event => controller.setAmount(Number(event.target.value).toFixed(2))} />
          </div>}
          <p id={`${id}-amount-note`} className={`override-note${amountCheck && amountCheck.state !== "ok" ? " is-warn" : ""}`}>
            <Icon name={amountCheck?.state === "ok" ? "check" : amountCheck?.state === "second" ? "person" : "info"} />{amountCheck?.message}</p>
        </div>}
        {fullCheck && <div className="override-sub">
          <p className={`override-note${fullCheck.state !== "ok" ? " is-warn" : ""}`}>
            <Icon name={fullCheck.state === "ok" ? "check" : fullCheck.value == null ? "info" : "person"} />{fullCheck.value != null && `The full $${fullCheck.value.toFixed(2)} fare. `}{fullCheck.message}</p>
        </div>}
        {choice === "investigate" && <div className="override-sub">
          <p className="override-sub-title" id={`${id}-check`}>What needs checking?</p>
          <div className="override-chips" role="group" aria-labelledby={`${id}-check`}>{INVESTIGATION_CHECKS.map(item =>
            <button key={item} type="button" className="override-chip is-small" aria-pressed={check === item} disabled={busy}
              onClick={() => controller.setCheck(item)}>{item}</button>)}</div>
          <p className="override-note is-warn"><Icon name="pause" />No one is notified yet. The case goes on hold in the home page list until a second reviewer decides.</p>
        </div>}
      </fieldset>

      <div className="override-step">
        <label className="override-step-label" htmlFor={`${id}-reason`}>2 · Why? <span className="muted">Kept with the case and the precedent</span></label>
        <textarea id={`${id}-reason`} rows={3} maxLength={300} value={reason} disabled={busy} placeholder={REASON_PLACEHOLDER}
          aria-invalid={tried && !!problem} aria-describedby={tried && problem ? `${id}-problem` : undefined}
          onChange={event => controller.setReason(event.target.value)} />
      </div>
      <div role="alert">
        {tried && problem && <p className="override-problem" id={`${id}-problem`}>{problem}</p>}
        {error && <p className="error small">{error}</p>}
      </div>
      <div className="reviewer-actions">
        <button type="button" className="caution-button" disabled={busy} onClick={() => { setTried(true); if (!problem) controller.submit(); }}>
          <ButtonLoader busy={busy} />{busy ? "Recording…" : <><Icon name={holds ? "pause" : "warning"} />{confirm}</>}</button>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => controller.setMode("idle")}>
          {escalated ? "Cancel" : "Keep the policy ruling"}</button>
      </div>
    </div>
  </>;
}

/**
 * Pinned to the bottom of the Ruling step as a shortcut while the "Your decision" panel is out
 * of view; it steps aside while the panel is on screen, so the actions never show twice.
 * After a decision it shows the result instead of buttons.
 */
export function DecisionBar({ resolution, controller, unavailable }: { resolution: Resolution; controller: DecisionController; unavailable: boolean }) {
  const view = decisionBar({ decision: resolution.decision, refund: resolution.refund_amount, busy: controller.busy, saved: controller.saved, unavailable, hold: controller.hold });
  const [panelInView, setPanelInView] = useState(false);
  useEffect(() => {
    const panel = document.getElementById("reviewer-decision");
    if (!panel || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setPanelInView(entry.isIntersecting), { threshold: 0.15 });
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);
  const hidden = panelInView;
  function goToPanel() {
    controller.startOverride();
    document.getElementById("reviewer-decision")?.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
  }
  return (
    <section className={`decision-bar tone-${view.tone}${hidden ? " is-hidden" : ""}`} aria-label="Your decision on this ruling">
      <p className="decision-bar-outcome">
        {view.note ?? <><span className="decision-bar-dot" aria-hidden="true" />{view.label}{view.amount && <> · <strong>{view.amount}</strong></>}</>}
      </p>
      {controller.mode !== "override" && view.actions.length > 0 && <div className="decision-bar-actions">
        {view.actions.includes("accept") && <button type="button" className="run-button" disabled={view.disabled} onClick={() => controller.accept()}>
          <ButtonLoader busy={controller.busy} />{controller.busy ? "Recording…" : "Accept ruling"}</button>}
        {view.actions.includes("override") && <button type="button" className="secondary-button" disabled={view.disabled} onClick={goToPanel}>Override</button>}
        {view.actions.includes("decide") && <button type="button" className="run-button" disabled={view.disabled} onClick={goToPanel}>Make decision</button>}
      </div>}
    </section>
  );
}
