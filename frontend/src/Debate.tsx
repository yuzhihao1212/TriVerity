import { useId, useState, type CSSProperties } from "react";
import { focusSection } from "./routes";

import { Chip } from "./Chip";
import { EvidenceList, EvidenceText, type FactLinks } from "./EvidenceList";
import { Icon } from "./Icon";
import { bottomLine, comparisonGroups } from "./hearingDisplay";
import { riskTone } from "./outcomeTone";
import { checkSummary, checksFor, missingReplyText, VERDICT } from "./ruleChecks";
import { SourceBadge } from "./SourceBadge";
import { Term } from "./Term";
import type { AgentCase, DisputeCase, Resolution } from "./types";

function ArgumentSummary({ text, prefix, availableIds, onSelectFact }: { text: string; prefix?: string } & FactLinks) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const { first, rest } = bottomLine(text);
  return <div className="hearing-argument">
    <p><strong>{prefix}<EvidenceText text={first} availableIds={availableIds} onSelectFact={onSelectFact} /></strong></p>
    {rest && <>
      <button type="button" className="hearing-read-more" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)}>
        {expanded ? "Hide full argument" : "Read full argument"}<Icon name="chevron" />
      </button>
      <div id={id} hidden={!expanded}><p><EvidenceText text={rest} availableIds={availableIds} onSelectFact={onSelectFact} /></p></div>
    </>}
  </div>;
}

export function Debate({ resolution, dispute, availableIds, onSelectFact }: { resolution: Resolution; dispute?: DisputeCase } & FactLinks) {
  const id = useId();
  const groups = comparisonGroups(resolution);
  const otherCase = (side: "rider" | "driver") => side === "rider" ? resolution.driver_case : resolution.rider_case;
  const checks = (side: "rider" | "driver") => checksFor(resolution.argument_review, side);
  const argument = (side: "rider" | "driver", item: AgentCase) => (
    <article className={`advocate ${side}`} id={`${id}-${side}-argument`} tabIndex={-1}>
      <h4>{side === "rider" ? "Rider advocate" : "Driver advocate"} <SourceBadge source={item.source} /></h4>
      <ArgumentSummary text={item.summary || "No opening argument returned."} availableIds={availableIds} onSelectFact={onSelectFact} />
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
          <ArgumentSummary text={item.rebuttal.text} prefix={side === "driver" ? "Driver's answer: " : "Rider's answer: "} availableIds={availableIds} onSelectFact={onSelectFact} />
          <h5 className="section-label">Evidence cited in reply</h5>
          <EvidenceList texts={item.rebuttal.evidence} ids={item.rebuttal.evidence_ids} mention={item.rebuttal.text} dispute={dispute}
            compare={otherCase(side).rebuttal?.text ? { party: side, otherTexts: otherCase(side).rebuttal!.evidence, otherIds: otherCase(side).rebuttal!.evidence_ids } : undefined}
            availableIds={availableIds} onSelectFact={onSelectFact} />
        </> : <p className="small muted">{missingReplyText(item, otherCase(side))}</p>}
      </article>
    );
  };
  return (
    <section className="card debate" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Hearing</h2>
      <p className="muted">Compare what each side argues and where they disagree.</p>
      {groups.length === 1 && groups[0].title === "Both sides cite"
        ? <p className="small muted hearing-same">Both sides cite the same {groups[0].facts.length + groups[0].more} facts; they disagree on what the facts mean.</p>
        : groups.length > 0 && <div className="hearing-comparison" role="group" aria-label="Evidence cited by each side" style={{ "--groups": groups.length } as CSSProperties}>
        {groups.map(group => <section key={group.title}>
          <h3>{group.title}</h3>
          <ul>{group.facts.map(fact => <li key={fact.id}>
            {fact.text ? <EvidenceText text={fact.text} availableIds={availableIds} onSelectFact={onSelectFact} /> : <span className="muted">See Evidence</span>}{" "}
            {availableIds?.has(fact.id) && onSelectFact
              ? <button type="button" className="hearing-fact-id" onClick={() => onSelectFact(fact.id)} aria-label={`Find evidence ${fact.id}`}>{fact.id}</button>
              : <span className="hearing-fact-id">{fact.id}</span>}
          </li>)}</ul>
          {group.more > 0 && <p className="small muted">and {group.more} more</p>}
        </section>)}
      </div>}
      <h3 className="round-title">Round 1 <span>Opening arguments</span></h3>
      <div className="debate-grid">{argument("rider", resolution.rider_case)}{argument("driver", resolution.driver_case)}</div>
      <h3 className="round-title">Round 2 <span>Each advocate answers the other</span></h3>
      <div className="debate-grid replies">{reply("driver", resolution.driver_case)}{reply("rider", resolution.rider_case)}</div>
    </section>
  );
}
