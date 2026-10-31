import { useId } from "react";
import { caseBriefRows } from "./caseBrief";
import { Icon } from "./Icon";
import type { DisputeCase, Resolution } from "./types";

/** `compact` folds it to one line, opened when wanted. */
export function CaseBrief({ dispute, resolution, showProposal, aiOff = false, compact = false }: { dispute: DisputeCase; resolution?: Resolution; showProposal: boolean; aiOff?: boolean; compact?: boolean }) {
  const id = useId();
  const rows = caseBriefRows(dispute, resolution, { showProposal, aiOff });
  const list = <dl>{rows.map(row => <div className="case-brief-row" key={row.label}>
    <dt>{row.label}</dt>
    <dd className={row.truncate ? "case-brief-claim" : undefined} title={row.truncate ? row.text : undefined}>
      {row.items ? <ul>{row.items.map(item => <li key={item}>{item}</li>)}</ul> : row.text}
    </dd>
  </div>)}</dl>;
  if (compact) return <details className="case-brief is-compact">
    <summary>
      <Icon name="chevron" className="case-brief-chevron" />
      <h3>Case Brief</h3>
      <span className="case-brief-line">{rows[0]?.text}</span>
    </summary>
    {list}
  </details>;
  return <section className="case-brief" aria-labelledby={id}>
    <h3 id={id}>Case Brief</h3>
    {list}
  </section>;
}
