import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";

import { Icon } from "./Icon";
import { SHORT_TAB_LABELS, stepStates, stepStatusText } from "./stepVisuals";
import { navigateTab, tabLocked, tabProgress, WORKFLOW_TABS, type WorkflowTab } from "./workflow";
import type { AgentLogEntry, Resolution } from "./types";

const STEP_ICONS: Record<WorkflowTab, string> = {
  intake: "folder", evidence: "magnifier", hearing: "bubbles", ruling: "scales", notify: "phone",
};

export function WorkflowTabs({ active, resolution, busy, liveSteps, onChange, render }: {
  active: WorkflowTab;
  resolution?: Resolution;
  busy: boolean;
  /** Steps reported so far by a run in progress; fills the stepper as they arrive. */
  liveSteps?: AgentLogEntry[];
  onChange: (tab: WorkflowTab) => void;
  render: (tab: WorkflowTab) => ReactNode;
}) {
  const id = useId();
  const refs = useRef<Partial<Record<WorkflowTab, HTMLButtonElement | null>>>({});
  const states = stepStates({ active, hasResult: !!resolution, busy, liveSteps });
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
      <div className="workflow-tabs stepper" role="tablist" aria-label="Case workflow">
        {WORKFLOW_TABS.map((tab, index) => {
          const state = states[index];
          const locked = state.locked;
          // The connector into this step fills once the previous step is complete.
          const joined = index > 0 && states[index - 1].done;
          const classes = ["step", state.done && "done", state.current && "current", locked && "locked",
            state.inProgress && "in-progress", joined && "joined"].filter(Boolean).join(" ");
          return <button type="button" role="tab" key={tab.id} className={classes}
            id={`${id}-${tab.id}-tab`} aria-controls={`${id}-${tab.id}-panel`}
            aria-selected={active === tab.id} aria-disabled={locked}
            aria-describedby={locked ? `${id}-locked` : undefined}
            tabIndex={active === tab.id && !locked ? 0 : -1}
            data-workflow-tab={tab.id}
            ref={element => { refs.current[tab.id] = element; }}
            onClick={() => activate(tab.id)} onKeyDown={event => navigate(event, tab.id)}>
            <span className="step-circle" aria-hidden="true">
              {state.done ? <Icon name="check" /> : locked && !state.inProgress ? <Icon name="lock" /> : index + 1}
            </span>
            <span className="step-name">
              <Icon name={STEP_ICONS[tab.id]} className="step-icon" />
              <span className="tab-label"><span className="label-full">{tab.label}</span><span className="label-short" aria-hidden="true">{SHORT_TAB_LABELS[tab.id]}</span></span>
            </span>
            {/* A locked step already says "Locked" in its progress text. */}
            <span className="sr-only">, step {index + 1} of {WORKFLOW_TABS.length}{locked && !state.done && !state.inProgress ? "" : `, ${stepStatusText(state)}`}. </span>
            <span className="tab-progress">{tabProgress(tab.id, resolution)}</span>
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
        {!busy && index < WORKFLOW_TABS.length - 1 && <div className="next-step">
          <button type="button" className="secondary-button"
            aria-disabled={tabLocked(WORKFLOW_TABS[index + 1].id, !!resolution)}
            disabled={tabLocked(WORKFLOW_TABS[index + 1].id, !!resolution)}
            onClick={() => { const next = WORKFLOW_TABS[index + 1].id; activate(next); refs.current[next]?.focus(); }}>
            Next: {WORKFLOW_TABS[index + 1].label} →
          </button>
        </div>}
      </>}
    </div>)}
  </>;
}
