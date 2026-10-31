import { useId, useRef } from "react";

import { fullPolicy, type CaseRule, type RuleStatus, rulesForCase } from "./casePolicy";
import { Icon } from "./Icon";
import { Term } from "./Term";
import type { Resolution } from "./types";

const STATUS_ICON: Record<RuleStatus, string> = { met: "check", not_met: "cross", applied: "warning", triggered: "warning", unchecked: "pause" };

function RuleList({ rows }: { rows: CaseRule[] }) {
  return <ul className="case-rules">{rows.map(row => <li key={row.rule} className={`is-${row.status}`}>
    <Icon name={STATUS_ICON[row.status]} />
    <div>
      <p><span className="case-rule-id"><Term rule={row.rule} /></span> {row.text}</p>
      <p className="case-rule-result">{row.result}</p>
    </div>
  </li>)}</ul>;
}

/** Every rule's full wording, opened from the panel or the row. */
function FullPolicy() {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  return <>
    <button type="button" ref={trigger} className="text-button case-rules-policy" onClick={() => { dialog.current?.showModal(); heading.current?.focus(); }}>See Full Policy<Icon name="chevron" /></button>
    <dialog className="closed-dialog policy-dialog" ref={dialog} aria-labelledby={`${id}-title`} onClose={() => trigger.current?.focus()}>
      {/* Takes focus on opening, so the dialog starts at the top rather than scrolled to Close. */}
      <h2 id={`${id}-title`} ref={heading} tabIndex={-1}>Full Policy</h2>
      {fullPolicy().map(group => <section key={group.title}>
        <h3>{group.title}</h3>
        <dl>{group.rules.map(({ rule, text }) => <div key={rule}><dt>{rule}</dt><dd>{text}</dd></div>)}</dl>
      </section>)}
      <div className="closed-dialog-actions">
        <button type="button" className="secondary-button" onClick={() => dialog.current?.close()}>Close</button>
      </div>
    </dialog>
  </>;
}

function RulesBody({ model }: { model: NonNullable<ReturnType<typeof rulesForCase>> }) {
  return <>
    <RuleList rows={model.rows} />
    {model.note && <p className="case-rules-note">{model.note}</p>}
    {model.otherChecks && <p className="case-rules-note">{model.otherChecks}</p>}
    <FullPolicy />
  </>;
}

/** Beside the page where the margin has room. CSS shows this or the row, never both. */
export function RulesPanel({ resolution }: { resolution: Pick<Resolution, "conditions" | "policy_refs" | "decision"> }) {
  const id = useId();
  const model = rulesForCase(resolution);
  if (!model) return null;
  return <aside className="rules-rail" aria-labelledby={`${id}-title`}>
    <div className="rules-rail-card">
      <h2 id={`${id}-title`}>Rules for This Case</h2>
      <p className="case-rules-policy-name">{model.policy}</p>
      <RulesBody model={model} />
    </div>
  </aside>;
}

/** The same content as one more row of "Check Before You Decide", for narrower screens. */
export function RulesRow({ resolution }: { resolution: Pick<Resolution, "conditions" | "policy_refs" | "decision"> }) {
  const model = rulesForCase(resolution);
  if (!model) return null;
  return <details className="ruling-check-row rules-row">
    <summary className="ruling-check-trigger">
      <span className="ruling-check-marker" aria-hidden="true">▸</span>
      <span className="ruling-check-status tone-neutral"><Icon name="books" /></span>
      <span className="ruling-check-label">
        <span className="ruling-check-title">Which Rules Apply?</span>
        <span className="ruling-check-answer">{model.summary}</span>
      </span>
    </summary>
    <div className="rules-row-body"><RulesBody model={model} /></div>
  </details>;
}
