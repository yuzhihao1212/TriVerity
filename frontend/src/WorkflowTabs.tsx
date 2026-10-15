import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";

import { navigateTab, tabLocked, tabProgress, WORKFLOW_TABS, type WorkflowTab } from "./workflow";
import type { Resolution } from "./types";

export function WorkflowTabs({ active, resolution, busy, onChange, render }: {
  active: WorkflowTab;
  resolution?: Resolution;
  busy: boolean;
  onChange: (tab: WorkflowTab) => void;
  render: (tab: WorkflowTab) => ReactNode;
}) {
  const id = useId();
  const refs = useRef<Partial<Record<WorkflowTab, HTMLButtonElement | null>>>({});
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
      <div className="workflow-tabs" role="tablist" aria-label="Case workflow">
        {WORKFLOW_TABS.map((tab, index) => {
          const locked = tabLocked(tab.id, !!resolution);
          return <button type="button" role="tab" key={tab.id}
            id={`${id}-${tab.id}-tab`} aria-controls={`${id}-${tab.id}-panel`}
            aria-selected={active === tab.id} aria-disabled={locked}
            aria-describedby={locked ? `${id}-locked` : undefined}
            tabIndex={active === tab.id && !locked ? 0 : -1}
            data-workflow-tab={tab.id}
            ref={element => { refs.current[tab.id] = element; }}
            onClick={() => activate(tab.id)} onKeyDown={event => navigate(event, tab.id)}>
            <span className="tab-step" aria-hidden="true">{index + 1}</span>
            <span className="tab-label">{tab.label}</span>
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
