import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

import { Icon } from "./Icon";
import { glideTo } from "./routes";
import { DECIDE_FIRST, HOLD_NOTE, nextStepMode, SHORT_TAB_LABELS, stepStates, stepStatusText } from "./stepVisuals";
import { ARRIVE_MS, LINE_MS, lineFraction, nextMove, positionText, unlockSchedule, type Move } from "./stepperMotion";
import { navigateTab, presentationStep, tabLocked, tabProgress, WORKFLOW_TABS, type WorkflowTab } from "./workflow";
import type { AgentLogEntry, Resolution } from "./types";

const STEP_ICONS: Record<WorkflowTab, string> = {
  intake: "folder", evidence: "magnifier", hearing: "bubbles", ruling: "scales", notify: "phone",
};

const prefersReducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function WorkflowTabs({ active, resolution, busy, liveSteps, reviewed, auto = false, held = false, decisionRecorded = false, closed = false, unlocking = false, presenting = false, onChange, render }: {
  active: WorkflowTab;
  resolution?: Resolution;
  busy: boolean;
  /** Steps reported so far by a run in progress; the working ring follows them. */
  liveSteps?: AgentLogEntry[];
  /** Steps the reviewer has completed for this ruling. */
  reviewed?: Iterable<WorkflowTab>;
  /** Closed by the policy: the steps ran, but no person reviewed them. */
  auto?: boolean;
  /** On hold for a second reviewer: there is nothing to accept or override here. */
  held?: boolean;
  /** A run just finished: steps 2-5 unlock one after another. */
  unlocking?: boolean;
  decisionRecorded?: boolean;
  closed?: boolean;
  /** Presentation mode: the arrow keys step through the case, and each step slides in from its side. */
  presenting?: boolean;
  onChange: (tab: WorkflowTab) => void;
  render: (tab: WorkflowTab) => ReactNode;
}) {
  const id = useId();
  const refs = useRef<Partial<Record<WorkflowTab, HTMLButtonElement | null>>>({});
  // Notify waits for a decision: point the reader to Ruling, as the locked Notify panel does.
  const nextTab = active === "notify" && resolution && !closed && !decisionRecorded ? "ruling" as const : undefined;
  const states = stepStates({ active, hasResult: !!resolution, busy, liveSteps, reviewed, nextTab });
  const activeIndex = WORKFLOW_TABS.findIndex(tab => tab.id === active);

  // The position line and the move between steps (stepperMotion.ts).
  const line = useRef<HTMLSpanElement>(null);
  const shown = useRef(activeIndex);
  const moveId = useRef(0);
  const settleTimer = useRef(0);
  const [move, setMove] = useState<Move | null>(null);
  useLayoutEffect(() => {
    const element = line.current;
    const reduce = prefersReducedMotion();
    const { settle, move: next } = nextMove(move, shown.current, activeIndex, moveId.current + 1);
    if (element) {
      // A move still running finishes at once (no transition), then the new one starts from there.
      if (settle || reduce || !next) {
        element.style.transition = "none";
        element.style.transform = `scaleX(${lineFraction(shown.current, WORKFLOW_TABS.length)})`;
        void element.offsetWidth;
        element.style.transition = "";
      }
      if (reduce) element.style.transition = "none";
      element.style.transform = `scaleX(${lineFraction(activeIndex, WORKFLOW_TABS.length)})`;
    }
    shown.current = activeIndex;
    if (!next || reduce) return;
    moveId.current = next.id;
    setMove(next);
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => setMove(null), LINE_MS + ARRIVE_MS + 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);
  useEffect(() => () => window.clearTimeout(settleTimer.current), []);

  // After a live run, steps 2-5 unlock one by one once the completion card has landed; the
  // line stays put. Leaving the run (or reduced motion) unlocks whatever is left at once.
  const [pending, setPending] = useState<Set<WorkflowTab>>(() => new Set());
  // Layout effect: the waiting steps are locked before the first paint, so they never flash unlocked.
  useLayoutEffect(() => {
    if (!unlocking || prefersReducedMotion()) { setPending(new Set()); return; }
    const schedule = unlockSchedule(WORKFLOW_TABS);
    setPending(new Set(schedule.map(item => item.tab)));
    const timers = schedule.map(item => window.setTimeout(() => setPending(previous => {
      const next = new Set(previous); next.delete(item.tab); return next;
    }), item.at));
    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [unlocking]);

  function activate(tab: WorkflowTab) {
    if (tabLocked(tab, !!resolution) || pending.has(tab)) return;
    onChange(tab);
  }
  // Glide up to the stepper first, with the old step still in place, then switch. Switching first
  // shortened the page under the reader, which snapped it up before the scroll even began.
  const going = useRef(false);
  function goTo(next: WorkflowTab, { focus = true } = {}) {
    if (going.current) return;
    going.current = true;
    void glideTo(refs.current[next]).then(() => {
      going.current = false;
      activate(next);
      if (focus) refs.current[next]?.focus({ preventScroll: true });
    });
  }
  // Which side the step came from, for the slide (presentation mode only, in CSS).
  // Kept until the step changes again, so a re-render mid-slide doesn't cut it short.
  const entered = useRef<{ index: number; enter?: "next" | "prev" }>({ index: activeIndex });
  if (entered.current.index !== activeIndex) entered.current = { index: activeIndex, enter: activeIndex > entered.current.index ? "next" : "prev" };
  const enter = entered.current.enter;
  // Not in a field, a menu or the tab list (which has its own arrows), and not mid-run.
  const step = useRef<(event: globalThis.KeyboardEvent) => void>(() => {});
  step.current = event => {
    if (busy || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.defaultPrevented) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable], [role=tablist], [role=menu], dialog")) return;
    const next = presentationStep(active, event.key, !!resolution);
    if (!next || pending.has(next)) return;
    event.preventDefault();
    goTo(next, { focus: false });
  };
  useEffect(() => {
    if (!presenting) return;
    const onKey = (event: globalThis.KeyboardEvent) => step.current(event);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presenting]);
  function navigate(event: KeyboardEvent<HTMLButtonElement>, tab: WorkflowTab) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = navigateTab(tab, event.key, !!resolution);
    activate(next);
    refs.current[next]?.focus();
  }
  return <>
    <div className="workflow-bar">
      <p className="stepper-position" aria-live="polite">{positionText(activeIndex, WORKFLOW_TABS.length, WORKFLOW_TABS[activeIndex].label)}</p>
      <div className="stepper-wrap">
      {/* The pink line: position only, from step 1 to the current step. */}
      <span className="stepper-track" aria-hidden="true"><span className="stepper-line" ref={line} /></span>
      <div className={`workflow-tabs stepper${move ? ` moving-${move.kind}` : ""}`} role="tablist" aria-label="Case workflow">
        {WORKFLOW_TABS.map((tab, index) => {
          const state = states[index];
          // Still waiting for its turn in the unlock sequence: shown locked a moment longer.
          const waiting = pending.has(tab.id);
          const locked = state.locked || waiting;
          const arriving = move?.kind === "forward" && move.to === index;
          const left = move?.kind === "forward" && move.from === index;
          const classes = ["step", waiting ? "locked" : state.phase, state.current && "current", locked && "locked",
            state.next && "next", arriving && "arriving", left && "left", unlocking && !waiting && index > 0 && "unlocked"].filter(Boolean).join(" ");
          return <button type="button" role="tab" key={tab.id} className={classes}
            id={`${id}-${tab.id}-tab`} aria-controls={`${id}-${tab.id}-panel`}
            aria-selected={active === tab.id} aria-disabled={locked} aria-current={state.current ? "step" : undefined}
            style={{ "--step-index": index } as CSSProperties}
            aria-describedby={locked ? `${id}-locked` : undefined}
            tabIndex={active === tab.id && !locked ? 0 : -1}
            data-workflow-tab={tab.id}
            ref={element => { refs.current[tab.id] = element; }}
            onClick={() => activate(tab.id)} onKeyDown={event => navigate(event, tab.id)}>
            <span className="step-circle" aria-hidden="true" key={arriving ? `arrive-${move!.id}` : "circle"}>
              {state.reviewed && !waiting ? <Icon name="check" /> : index + 1}
              {/* Mounted when the reviewer arrives, so it draws once; a re-render never replays it.
                  Going back, the earlier step is current at once: no draw. */}
              {state.current && !state.working && <StepRing kind="current" instant={move?.kind === "back"} />}
              {state.working && <StepRing kind="working" />}
            </span>
            <span className="step-name">
              <Icon name={STEP_ICONS[tab.id]} className="step-icon" />
              <span className="tab-label"><span className="label-full">{tab.label}</span><span className="label-short" aria-hidden="true">{SHORT_TAB_LABELS[tab.id]}</span></span>
            </span>
            <span className="sr-only">, Step {index + 1} Of {WORKFLOW_TABS.length}{locked && !state.working ? ", locked" : `, ${auto && state.reviewed ? "completed automatically" : stepStatusText(state)}`}{state.next ? ", next to review" : ""}. </span>
            {/* Only when it says something: "12 facts", "2 arguments"; locked steps stay quiet. */}
            {tabProgress(tab.id, resolution) && <span className="tab-progress">{tabProgress(tab.id, resolution)}</span>}
            {state.next && <span className="step-next" aria-hidden="true">Next</span>}
          </button>;
        })}
      </div>
      </div>
      {!resolution && <p className="small muted stepper-hint" id={`${id}-locked`}><Icon name="lock" />{busy ? "Steps 2–5 open when the complete result is ready." : "Steps 2–5 open once you run the agents."}</p>}
      {busy && <p className="small muted">Completed steps appear live below. Workflow tabs unlock when the ruling is ready.</p>}
    </div>
    {WORKFLOW_TABS.map((tab, index) => <div role="tabpanel" key={tab.id}
      id={`${id}-${tab.id}-panel`} aria-labelledby={`${id}-${tab.id}-tab`}
      hidden={active !== tab.id} tabIndex={0} className="workflow-panel" data-enter={active === tab.id ? enter : undefined}>
      {active === tab.id && <>
        {render(tab.id)}
        {!busy && !unlocking && index < WORKFLOW_TABS.length - 1 && <div className="next-step">
          {nextStepMode({ tab: tab.id, hasResult: !!resolution, closed, decisionRecorded }) === "hint"
            ? <p className="small muted next-step-hint">{held ? HOLD_NOTE : DECIDE_FIRST}</p>
            : <button type="button" className={nextStepMode({ tab: tab.id, hasResult: !!resolution, closed, decisionRecorded }) === "primary" ? "run-button" : "secondary-button"}
            aria-disabled={tabLocked(WORKFLOW_TABS[index + 1].id, !!resolution)}
            disabled={tabLocked(WORKFLOW_TABS[index + 1].id, !!resolution)}
            // Glide back up to the stepper (instant under reduced motion), then open the next step there.
            onClick={() => goTo(WORKFLOW_TABS[index + 1].id)}>
            Next: {WORKFLOW_TABS[index + 1].label} →
          </button>}
        </div>}
      </>}
    </div>)}
  </>;
}

/**
 * A ring just outside a step circle. "current" draws once (stroke-dashoffset) when it
 * mounts; "working" is dashed and turns slowly while the agents are on that step.
 */
function StepRing({ kind, instant = false }: { kind: "current" | "working"; instant?: boolean }) {
  return <svg className={`step-ring ${kind}${instant ? " instant" : ""}`} viewBox="0 0 44 44" aria-hidden="true" focusable="false">
    <circle cx="22" cy="22" r="20" pathLength={100} />
  </svg>;
}
