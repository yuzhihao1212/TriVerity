import { useId } from "react";
import { focusSection } from "./routes";

import { Chip } from "./Chip";
import { sourceTone } from "./chipStyle";
import { EvidenceList, EvidenceText, type FactLinks } from "./EvidenceList";
import { riskTone } from "./outcomeTone";
import { checkSummary, checksFor, VERDICT } from "./ruleChecks";
import { FALLBACK_TOOLTIP } from "./stepVisuals";
import { Term } from "./Term";
import type { AgentCase, DisputeCase, Resolution } from "./types";

/** AI (accent, sparkle), Fallback (amber, explained in its tooltip) or Code (neutral). */
export function SourceBadge({ source, explain = false }: { source: "llm" | "fallback" | "code"; explain?: boolean }) {
  if (source === "llm") return <Chip size="sm" tone={sourceTone(source)} icon="sparkle">AI</Chip>;
  if (source === "code") return <Chip size="sm" tone={sourceTone(source)}>Code</Chip>;
  return <Chip size="sm" tone={sourceTone(source)} className="has-tooltip" title={FALLBACK_TOOLTIP}>Fallback{explain && <span className="sr-only">: {FALLBACK_TOOLTIP}</span>}</Chip>;
}

export function Debate({ resolution, dispute, availableIds, onSelectFact }: { resolution: Resolution; dispute?: DisputeCase } & FactLinks) {
  const id = useId();
  const otherCase = (side: "rider" | "driver") => side === "rider" ? resolution.driver_case : resolution.rider_case;
  const checks = (side: "rider" | "driver") => checksFor(resolution.argument_review, side);
  const argument = (side: "rider" | "driver", item: AgentCase) => (
    <article className={`advocate ${side}`} id={`${id}-${side}-argument`} tabIndex={-1}>
      <h4>{side === "rider" ? "Rider advocate" : "Driver advocate"} <SourceBadge source={item.source} /></h4>
      <p><EvidenceText text={item.summary || "No opening argument returned."} availableIds={availableIds} onSelectFact={onSelectFact} /></p>
      <h5 className="section-label">Policy cited</h5>
      {item.policy_refs.length ? <ul className="small policy-checks">{item.policy_refs.map(ref => {
        const check = checks(side).get(ref);
        return <li key={ref}><Term rule={ref} />{check && <>{" "}<Chip size="sm" tone={riskTone(VERDICT[check.verdict].level)}>{VERDICT[check.verdict].label}</Chip></>}</li>;
      })}</ul>
        : <p className="small muted">No policy rules cited.</p>}
      {checkSummary(checks(side)) && <p className="small muted check-summary">{checkSummary(checks(side))}</p>}
      <h5 className="section-label">Evidence</h5>
      <EvidenceList texts={item.evidence} ids={item.evidence_ids} mention={item.summary} dispute={dispute}
        compare={{ party: side, otherTexts: otherCase(side).evidence, otherIds: otherCase(side).evidence_ids }}
        availableIds={availableIds} onSelectFact={onSelectFact} />
    </article>
  );
  const reply = (side: "rider" | "driver", item: AgentCase) => {
    const other = side === "rider" ? "driver" : "rider";
    return (
      <article className={`advocate reply ${side}`}>
        <a className="reply-to small" href={`#${id}-${other}-argument`} onClick={event => { event.preventDefault(); focusSection(`${id}-${other}-argument`, { flash: true }); }}>↑ Answers the {other}'s argument</a>
        <h4>{side === "rider" ? "Rider reply" : "Driver reply"} <SourceBadge source={item.rebuttal?.source ?? "fallback"} /></h4>
        {item.rebuttal?.text ? <>
          <p><EvidenceText text={item.rebuttal.text} availableIds={availableIds} onSelectFact={onSelectFact} /></p>
          <h5 className="section-label">Evidence cited in reply</h5>
          <EvidenceList texts={item.rebuttal.evidence} ids={item.rebuttal.evidence_ids} mention={item.rebuttal.text} dispute={dispute}
            compare={otherCase(side).rebuttal?.text ? { party: side, otherTexts: otherCase(side).rebuttal!.evidence, otherIds: otherCase(side).rebuttal!.evidence_ids } : undefined}
            availableIds={availableIds} onSelectFact={onSelectFact} />
        </> : <p className="small muted">No reply generated. The rebuttal round runs only when both opening arguments use AI.</p>}
      </article>
    );
  };
  return (
    <section className="card debate" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Two sides. One set of facts.</h2>
      <h3 className="round-title">Round 1 <span>Opening arguments</span></h3>
      <div className="debate-grid">{argument("rider", resolution.rider_case)}{argument("driver", resolution.driver_case)}</div>
      <h3 className="round-title">Round 2 <span>Each advocate answers the other</span></h3>
      <div className="debate-grid replies">{reply("driver", resolution.driver_case)}{reply("rider", resolution.rider_case)}</div>
    </section>
  );
}
