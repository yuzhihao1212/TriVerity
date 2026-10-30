import { useId, useMemo, useState } from "react";
import { focusSection } from "./routes";

import { Chip } from "./Chip";
import { CitedText } from "./CitedText";
import type { FactLinks } from "./EvidenceList";
import { Icon } from "./Icon";
import { HearingComparison } from "./HearingComparison";
import {
  bottomLine, cardFacts, factTexts, HEARING_INTRO, HEARING_ROUNDS, HEARING_STEPS, NO_RULE_CITED, partyHeading,
  replyQuote, RULE_CHECK_LABELS, WHY_LIMIT, type CardFact,
} from "./hearingDisplay";
import { riskTone } from "./outcomeTone";
import { policyIds } from "./presentation";
import { checksFor, missingReplyText, VERDICT } from "./ruleChecks";
import { ruleSummary } from "./ruleSummaries";
import { SourceBadge } from "./SourceBadge";
import { Term } from "./Term";
import type { AgentCase, DisputeCase, Resolution } from "./types";

type Side = "rider" | "driver";

/** Everything the other side cited in either round, so "Only the rider cites this" agrees with "Who cited what". */
function bothRounds(item: AgentCase) {
  return { texts: [...item.evidence, ...(item.rebuttal?.evidence ?? [])], ids: [...item.evidence_ids, ...(item.rebuttal?.evidence_ids ?? [])] };
}
type Links = FactLinks & { facts: Map<string, string> };

/** "Their point": the bold bottom line, then the rest of the AI's text one click away. */
function TheirPoint({ text, reply = false, ...links }: { text: string; reply?: boolean } & Links) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const { first, rest } = bottomLine(text);
  const what = reply ? "reply" : "argument";
  return <div className="hearing-argument">
    <p><strong><CitedText text={first} {...links} /></strong></p>
    {rest && <>
      <button type="button" className="hearing-read-more" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)}>
        {expanded ? `Hide their full ${what}` : `Read their full ${what}`}<Icon name="chevron" />
      </button>
      <div id={id} hidden={!expanded}><p><CitedText text={rest} {...links} /></p></div>
    </>}
  </div>;
}

/** "Why": each cited fact once, as a short line with its ID; past the first few they fold away. */
function WhyFacts({ facts, party, availableIds, onSelectFact }: { facts: CardFact[]; party: Side } & FactLinks) {
  const id = useId();
  const [open, setOpen] = useState(false);
  if (!facts.length) return <p className="small muted">No evidence cited.</p>;
  const row = (fact: CardFact, index: number) => <li key={fact.id ?? `${fact.text}-${index}`}>
    <Icon name={fact.icon} />
    <span className="hearing-why-text">{fact.text}{fact.only && <span className="hearing-only"> · Only the {party} cites this</span>}</span>
    {fact.id && (availableIds?.has(fact.id) && onSelectFact
      ? <button type="button" className="hearing-fact-id" onClick={() => onSelectFact(fact.id!)} aria-label={`Find evidence ${fact.id}`}>{fact.id}</button>
      : <span className="hearing-fact-id">{fact.id}</span>)}
  </li>;
  const more = facts.length - WHY_LIMIT;
  return <>
    <ul className="hearing-why">{facts.slice(0, WHY_LIMIT).map(row)}</ul>
    {more > 0 && <>
      <ul id={id} className="hearing-why" hidden={!open}>{facts.slice(WHY_LIMIT).map((fact, index) => row(fact, index + WHY_LIMIT))}</ul>
      <button type="button" className="hearing-more-facts" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
        {open ? "Show fewer facts" : `Evidence cited (${facts.length}): show ${more} more`}
      </button>
    </>}
  </>;
}

export function Debate({ resolution, dispute, availableIds, onSelectFact }: { resolution: Resolution; dispute?: DisputeCase } & FactLinks) {
  const id = useId();
  const facts = useMemo(() => factTexts(resolution), [resolution]);
  const links: Links = { facts, availableIds, onSelectFact };
  const own = (side: Side) => side === "rider" ? resolution.rider_case : resolution.driver_case;
  const otherSide = (side: Side): Side => side === "rider" ? "driver" : "rider";
  const heading = (side: Side, source: AgentCase["source"], reply = false) => <h4>
    <span className={`hearing-party-avatar hearing-avatar-${side}`} aria-hidden="true"><Icon name={side === "rider" ? "person" : "wheel"} /></span>
    {partyHeading(side, reply)} <SourceBadge source={source} />
  </h4>;

  const argument = (side: Side) => {
    const item = own(side), other = own(otherSide(side));
    const checks = checksFor(resolution.argument_review, side);
    const rules = policyIds(item.policy_refs);
    return <article className={`advocate ${side}`} id={`${id}-${side}-argument`} tabIndex={-1}>
      {heading(side, item.source)}
      <h5 className="section-label">Their point</h5>
      <TheirPoint text={item.summary || "No opening argument returned."} {...links} />
      <h5 className="section-label">Why</h5>
      <WhyFacts facts={cardFacts(item.evidence, item.evidence_ids, item.summary, bothRounds(other))}
        party={side} availableIds={availableIds} onSelectFact={onSelectFact} />
      <h5 className="section-label">Rule they rely on</h5>
      {rules.length ? <ul className="hearing-rules">{rules.map(rule => {
        const check = checks.get(rule);
        return <li key={rule}>
          <span className="hearing-rule-line"><Chip size="sm"><Term rule={rule} /></Chip> <span>{ruleSummary(rule) ?? "See the rule text."}</span></span>
          {check && <Chip size="sm" tone={riskTone(VERDICT[check.verdict].level)}>{RULE_CHECK_LABELS[check.verdict]}</Chip>}
        </li>;
      })}</ul> : <p className="small muted">{NO_RULE_CITED}</p>}
    </article>;
  };

  const reply = (side: Side) => {
    const item = own(side), other = otherSide(side), otherCase = own(other);
    const quote = replyQuote(other, otherCase.summary);
    return <article className={`advocate reply ${side}`}>
      {heading(side, item.rebuttal?.source ?? "fallback", true)}
      {item.rebuttal?.text ? <>
        {quote && <a className="reply-quote small" href={`#${id}-${other}-argument`}
          onClick={event => { event.preventDefault(); focusSection(`${id}-${other}-argument`, { flash: true }); }}>{quote}</a>}
        <h5 className="section-label">Their point</h5>
        <TheirPoint text={item.rebuttal.text} reply {...links} />
        <h5 className="section-label">Why</h5>
        <WhyFacts facts={cardFacts(item.rebuttal.evidence, item.rebuttal.evidence_ids, item.rebuttal.text, bothRounds(otherCase))}
          party={side} availableIds={availableIds} onSelectFact={onSelectFact} />
      </> : <p className="small muted">{missingReplyText(item, otherCase)}</p>}
    </article>;
  };

  return (
    <section className="card debate" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Hearing</h2>
      <p className="hearing-intro">{HEARING_INTRO}</p>
      <ol className="hearing-steps" aria-label="How the hearing works">
        {HEARING_STEPS.map((step, index) => <li key={step.number} className={step.done ? "is-done" : "is-next"}>
          {index > 0 && <span className="hearing-step-arrow" aria-hidden="true">→</span>}
          <span className="hearing-step-pill">{step.number} · {step.label}</span>
        </li>)}
      </ol>
      <HearingComparison key={dispute?.dispute_id} resolution={resolution} disputeId={dispute?.dispute_id} availableIds={availableIds} onSelectFact={onSelectFact} />
      <div className="round-head"><h3 className="round-title">{HEARING_ROUNDS.opening.title}</h3><p className="small muted">{HEARING_ROUNDS.opening.sub}</p></div>
      <div className="debate-grid">{argument("rider")}{argument("driver")}</div>
      <div className="round-head"><h3 className="round-title">{HEARING_ROUNDS.replies.title}</h3><p className="small muted">{HEARING_ROUNDS.replies.sub}</p></div>
      <div className="debate-grid replies">{reply("rider")}{reply("driver")}</div>
    </section>
  );
}
