import { useId } from "react";
import { focusSection } from "./routes";

import { EvidenceList, EvidenceText, type FactLinks } from "./EvidenceList";
import type { AgentCase, Resolution } from "./types";

export function SourceBadge({ source }: { source: "llm" | "fallback" }) {
  return <span className={`source-badge ${source}`}>{source === "llm" ? "AI" : "Fallback"}</span>;
}

export function Debate({ resolution, availableIds, onSelectFact }: { resolution: Resolution } & FactLinks) {
  const id = useId();
  const argument = (side: "rider" | "driver", item: AgentCase) => (
    <article className={`advocate ${side}`} id={`${id}-${side}-argument`} tabIndex={-1}>
      <h4>{side === "rider" ? "Rider advocate" : "Driver advocate"} <SourceBadge source={item.source} /></h4>
      <p><EvidenceText text={item.summary || "No opening argument returned."} availableIds={availableIds} onSelectFact={onSelectFact} /></p>
      <h5 className="section-label">Policy cited</h5>
      {item.policy_refs.length ? <ul className="small">{item.policy_refs.map(ref => <li key={ref}>{ref}</li>)}</ul>
        : <p className="small muted">No policy rules cited.</p>}
      <h5 className="section-label">Evidence by source</h5>
      <EvidenceList texts={item.evidence} ids={item.evidence_ids} availableIds={availableIds} onSelectFact={onSelectFact} />
    </article>
  );
  const reply = (side: "rider" | "driver", item: AgentCase) => {
    const other = side === "rider" ? "driver" : "rider";
    return (
      <article className={`advocate reply ${side}`}>
        <a className="reply-to small" href={`#${id}-${other}-argument`} onClick={event => { event.preventDefault(); focusSection(`${id}-${other}-argument`); }}>↑ Answers the {other}'s argument</a>
        <h4>{side === "rider" ? "Rider reply" : "Driver reply"} <SourceBadge source={item.rebuttal?.source ?? "fallback"} /></h4>
        {item.rebuttal?.text ? <>
          <p><EvidenceText text={item.rebuttal.text} availableIds={availableIds} onSelectFact={onSelectFact} /></p>
          <h5 className="section-label">Evidence cited in reply</h5>
          <EvidenceList texts={item.rebuttal.evidence} ids={item.rebuttal.evidence_ids} availableIds={availableIds} onSelectFact={onSelectFact} />
        </> : <p className="small muted">No reply generated. The rebuttal round runs only when both opening arguments use AI.</p>}
      </article>
    );
  };
  return (
    <section className="card debate" aria-labelledby={`${id}-title`}>
      <div><p className="eyebrow">The advocates argue</p><h2 id={`${id}-title`}>Two sides. One set of facts.</h2></div>
      <h3 className="round-title">Round 1 <span>Opening arguments</span></h3>
      <div className="debate-grid">{argument("rider", resolution.rider_case)}{argument("driver", resolution.driver_case)}</div>
      <h3 className="round-title">Round 2 <span>Each advocate answers the other</span></h3>
      <div className="debate-grid replies">{reply("driver", resolution.driver_case)}{reply("rider", resolution.rider_case)}</div>
    </section>
  );
}
