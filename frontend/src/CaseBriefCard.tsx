import { useId } from "react";
import { caseBriefRows } from "./caseBrief";
import type { DisputeCase, Resolution } from "./types";

export function CaseBrief({ dispute, resolution, showProposal, aiOff = false }: { dispute: DisputeCase; resolution?: Resolution; showProposal: boolean; aiOff?: boolean }) {
  const id = useId();
  return <section className="case-brief" aria-labelledby={id}>
    <h3 id={id}>Case Brief</h3>
    <dl>{caseBriefRows(dispute, resolution, { showProposal, aiOff }).map(row => <div className="case-brief-row" key={row.label}>
      <dt>{row.label}</dt>
      <dd className={row.truncate ? "case-brief-claim" : undefined} title={row.truncate ? row.text : undefined}>
        {row.items ? <ul>{row.items.map(item => <li key={item}>{item}</li>)}</ul> : row.text}
      </dd>
    </div>)}</dl>
  </section>;
}
