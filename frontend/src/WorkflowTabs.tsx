import { useId, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

import { Icon } from "./Icon";
import { DECIDE_FIRST, nextStepMode, SHORT_TAB_LABELS, stepStates, stepStatusText } from "./stepVisuals";
import { navigateTab, tabLocked, tabProgress, WORKFLOW_TABS, type WorkflowTab } from "./workflow";
import type { AgentLogEntry, Resolution } from "./types";

const STEP_ICONS: Record<WorkflowTab, string> = {
  intake: "folder", evidence: "magnifier", hearing: "bubbles", ruling: "scales", notify: "phone",
};

export function WorkflowTabs({ active, resolution, busy, liveSteps, reviewed, decisionRecorded = false, closed = false, unlocking = false, onChange, render }: {
  active: WorkflowTab;
  resolution?: Resolution;
  busy: boolean;
  /** Steps reported so far by a run in progress; the working ring follows them. */
  liveSteps?: AgentLogEntry[];
  /** Steps the reviewer has completed for this ruling. */
  reviewed?: Iterable<WorkflowTab>;
  /** A run just finished: steps 2-5 unlock one after another. */
  unlocking?: boolean;
  decisionRecorded?: boolean;
  closed?: boolean;
  onChange: (tab: WorkflowTab) => void;
  render: (tab: WorkflowTab) => ReactNode;
}) {
  const id = useId();
  const refs = useRef<Partial<Record<WorkflowTab, HTMLButtonElement | null>>>({});
  // Notify waits for a decision: point the reader to Ruling, as the locked Notify panel does.
  const nextTab = active === "notify" && resolution && !closed && !decisionRecorded ? "ruling" as const : undefined;
  const states = stepStates({ active, hasResult: !!resolution, busy, liveSteps, reviewed, nextTab });
  function activate(tab: WorkflowTab) {
    if (tabLocked(tab, !!resolution)) return;
    onChange(tab);
  }
  function navigate(event: KeyboardEvent<HTMLButtonElement>, tab: WorkflowTab) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = navigateTab(tab, event.key, !!resolution);
    activate(next);
    refs.current[next]?.focus();
  }
  return <>
    <div className="workflow-bar">
      <div className={`workflow-tabs stepper${unlocking ? " unlocking" : ""}`} role="tablist" aria-label="Case workflow">
        {WORKFLOW_TABS.map((tab, index) => {
          const state = states[index];
          const locked = state.locked;
          // The connector into this step fills only within the furthest reviewed step.
          const classes = ["step", state.phase, state.current && "current", locked && "locked",
            state.next && "next", state.joined && "joined"].filter(Boolean).join(" ");
          return <button type="button" role="tab" key={tab.id} className={classes}
            id={`${id}-${tab.id}-tab`} aria-controls={`${id}-${tab.id}-panel`}
            aria-selected={active === tab.id} aria-disabled={locked} aria-current={state.current ? "step" : undefined}
            style={{ "--step-index": index } as CSSProperties}
            aria-describedby={locked ? `${id}-locked` : undefined}
            tabIndex={active === tab.id && !locked ? 0 : -1}
            data-workflow-tab={tab.id}
            ref={element => { refs.current[tab.id] = element; }}
            onClick={() => activate(tab.id)} onKeyDown={event => navigate(event, tab.id)}>
            <span className="step-circle" aria-hidden="true">
              {state.reviewed ? <Icon name="check" /> : locked && !state.working ? <Icon name="lock" /> : index + 1}
              {/* Mounted when the reviewer arrives, so it draws once; a re-render never replays it. */}
              {state.current && !state.working && <StepRing kind="current" />}
              {state.working && <StepRing kind="working" />}
            </span>
            <span className="step-name">
              <Icon name={STEP_ICONS[tab.id]} className="step-icon" />
              <span className="tab-label"><span className="label-full">{tab.label}</span><span className="label-short" aria-hidden="true">{SHORT_TAB_LABELS[tab.id]}</span></span>
            </span>
            {/* A locked step already says "Locked" in its progress text. */}
            <span className="sr-only">, step {index + 1} of {WORKFLOW_TABS.length}{locked && !state.working ? "" : `, ${stepStatusText(state)}`}{state.next ? ", next to review" : ""}. </span>
            <span className="tab-progress">{tabProgress(tab.id, resolution)}</span>
            {state.next && <span className="step-next" aria-hidden="true">Next</span>}
          </button>;
        })}
      </div>
      {!resolution && <p className="small muted" id={`${id}-locked`}>{busy ? "Waiting for the complete result to unlock steps 2–5." : "Run agents in Intake to unlock steps 2–5."}</p>}
      {busy && <p className="small muted">Completed steps appear live below. Workflow tabs unlock when the ruling is ready.</p>}
    </div>
    {WORKFLOW_TABS.map((tab, index) => <div role="tabpanel" key={tab.id}
      id={`${id}-${tab.id}-panel`} aria-labelledby={`${id}-${tab.id}-tab`}
      hidden={active !== tab.id} tabIndex={0} className="workflow-panel">
      {active === tab.id && <>
        {render(tab.id)}
        {!busy && !unlocking && index < WORKFLOW_TABS.length - 1 && <div className="next-step">
          {nextStepMode({ tab: tab.id, hasResult: !!resolution, closed, decisionRecorded }) === "hint"
            ? <p className="small muted next-step-hint">{DECIDE_FIRST}</p>
            : <button type="button" className={nextStepMode({ tab: tab.id, hasResult: !!resolution, closed, decisionRecorded }) === "primary" ? "run-button" : "secondary-button"}
            aria-disabled={tabLocked(WORKFLOW_TABS[index + 1].id, !!resolution)}
            disabled={tabLocked(WORKFLOW_TABS[index + 1].id, !!resolution)}
            onClick={() => { const next = WORKFLOW_TABS[index + 1].id; activate(next); refs.current[next]?.focus(); }}>
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
function StepRing({ kind }: { kind: "current" | "working" }) {
  return <svg className={`step-ring ${kind}`} viewBox="0 0 44 44" aria-hidden="true" focusable="false">
    <circle cx="22" cy="22" r="20" pathLength={100} />
  </svg>;
}
