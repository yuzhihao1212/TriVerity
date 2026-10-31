import { useId, useMemo, useState, type ReactNode } from "react";
import { focusSection } from "./routes";

import { Chip } from "./Chip";
import { CitedText } from "./CitedText";
import type { FactLinks } from "./EvidenceList";
import { Icon } from "./Icon";
import { HearingComparison } from "./HearingComparison";
import {
  bottomLine, cardFacts, cardFlags, cardFoldLabel, factTexts, HEARING_INTRO, HEARING_INTRO_OFF, HEARING_ROUNDS, HEARING_STEPS, NO_RULE_CITED, partyHeading,
  replyLabel, replyQuote, RULE_CHECK_LABELS, type CardFact, type CardFlag,
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

/** "Their point": the bold bottom line, plus anything the reviewer shouldn't have to unfold to see. */
function TheirPoint({ text, flags, ...links }: { text: string; flags: CardFlag[] } & Links) {
  return <div className="hearing-argument">
    <p><strong><CitedText text={bottomLine(text).first} {...links} /></strong></p>
    {flags.length > 0 && <ul className="hearing-flags">{flags.map(flag => flag.kind === "rule"
      ? <li key={flag.rule} className="is-warn"><Icon name="warning" /><span><Chip size="sm"><Term rule={flag.rule} /></Chip> {flag.text}</span></li>
      : <li key={flag.text}><Icon name="info" /><span>{flag.text}</span></li>)}</ul>}
  </div>;
}

/** Everything behind a card's point. The two cards of a round open together, so they stay comparable. */
function CardFold({ label, open, onToggle, children }: { label: string | null; open: boolean; onToggle: () => void; children: ReactNode }) {
  const id = useId();
  if (!label) return null;
  return <div className="hearing-fold">
    <button type="button" className="hearing-read-more" aria-expanded={open} aria-controls={id} onClick={onToggle}>{label}<Icon name="chevron" /></button>
    <div id={id} className="hearing-fold-body" hidden={!open}>{children}</div>
  </div>;
}

/** "Why": each cited fact once, as a short line with its ID. */
function WhyFacts({ facts, party, availableIds, onSelectFact }: { facts: CardFact[]; party: Side } & FactLinks) {
  if (!facts.length) return <p className="small muted">No evidence cited.</p>;
  const row = (fact: CardFact, index: number) => <li key={fact.id ?? `${fact.text}-${index}`}>
    <Icon name={fact.icon} />
    <span className="hearing-why-text">{fact.text}{fact.only && <span className="hearing-only"> · Only the {party} cites this</span>}</span>
    {fact.id && (availableIds?.has(fact.id) && onSelectFact
      ? <button type="button" className="hearing-fact-id" onClick={() => onSelectFact(fact.id!)} aria-label={`Find evidence ${fact.id}`}>{fact.id}</button>
      : <span className="hearing-fact-id">{fact.id}</span>)}
  </li>;
  return <ul className="hearing-why">{facts.map(row)}</ul>;
}

export function Debate({ resolution, dispute, aiOff = false, availableIds, onSelectFact }: { resolution: Resolution; dispute?: DisputeCase; aiOff?: boolean } & FactLinks) {
  const id = useId();
  const hasReplies = !!(resolution.rider_case?.rebuttal?.text?.trim() || resolution.driver_case?.rebuttal?.text?.trim());
  const facts = useMemo(() => factTexts(resolution), [resolution]);
  const links: Links = { facts, availableIds, onSelectFact };
  const [openRounds, setOpenRounds] = useState({ opening: false, replies: false });
  const toggleRound = (round: keyof typeof openRounds) => setOpenRounds(previous => ({ ...previous, [round]: !previous[round] }));
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
    const summary = item.summary || "No opening argument returned.";
    const rest = bottomLine(summary).rest;
    const cited = cardFacts(item.evidence, item.evidence_ids, item.summary, bothRounds(other));
    return <article className={`advocate ${side}`} id={`${id}-${side}-argument`} tabIndex={-1}>
      {heading(side, item.source)}
      <h5 className="section-label">Their Point</h5>
      <TheirPoint text={summary} flags={cardFlags(side, rules.map(rule => ({ rule, verdict: checks.get(rule)?.verdict })), cited, item.summary)} {...links} />
      <CardFold label={cardFoldLabel("Argument", !!rest, cited.length, rules.length)} open={openRounds.opening} onToggle={() => toggleRound("opening")}>
        {rest && <div className="hearing-argument"><p><CitedText text={rest} {...links} /></p></div>}
        <h5 className="section-label">Why</h5>
        <WhyFacts facts={cited} party={side} availableIds={availableIds} onSelectFact={onSelectFact} />
        <h5 className="section-label">Rule They Rely On</h5>
        {rules.length ? <ul className="hearing-rules">{rules.map(rule => {
          const check = checks.get(rule);
          return <li key={rule}>
            <span className="hearing-rule-line"><Chip size="sm"><Term rule={rule} /></Chip> <span>{ruleSummary(rule) ?? "See the rule text."}</span></span>
            {check && <Chip size="sm" tone={riskTone(VERDICT[check.verdict].level)}>{RULE_CHECK_LABELS[check.verdict]}</Chip>}
          </li>;
        })}</ul> : <p className="small muted">{NO_RULE_CITED}</p>}
      </CardFold>
    </article>;
  };

  const reply = (side: Side) => {
    const item = own(side), other = otherSide(side), otherCase = own(other);
    const quote = replyQuote(other, otherCase.summary);
    const text = item.rebuttal?.text;
    const cited = item.rebuttal ? cardFacts(item.rebuttal.evidence, item.rebuttal.evidence_ids, item.rebuttal.text, bothRounds(otherCase)) : [];
    return <article className={`advocate reply ${side}`}>
      {heading(side, item.rebuttal?.source ?? "fallback", true)}
      {text ? <>
        {quote && <a className="reply-link small" href={`#${id}-${other}-argument`}
          onClick={event => { event.preventDefault(); focusSection(`${id}-${other}-argument`, { flash: true }); }}>{replyLabel(other)}</a>}
        <h5 className="section-label">Their Point</h5>
        <TheirPoint text={text} flags={cardFlags(side, [], cited, text)} {...links} />
        <CardFold label={cardFoldLabel("Reply", !!bottomLine(text).rest || !!quote, cited.length)} open={openRounds.replies} onToggle={() => toggleRound("replies")}>
          {quote && <p className="reply-quote small">{quote}</p>}
          {bottomLine(text).rest && <div className="hearing-argument"><p><CitedText text={bottomLine(text).rest} {...links} /></p></div>}
          <h5 className="section-label">Why</h5>
          <WhyFacts facts={cited} party={side} availableIds={availableIds} onSelectFact={onSelectFact} />
        </CardFold>
      </> : <p className="small muted">{missingReplyText(item, otherCase)}</p>}
    </article>;
  };

  return (
    <section className="card debate" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Hearing</h2>
      <p className="hearing-intro">{aiOff ? HEARING_INTRO_OFF : HEARING_INTRO}</p>
      <ol className="hearing-steps" aria-label="How the hearing works">
        {HEARING_STEPS.map((step, index) => <li key={step.number} className={step.done && (step.number !== 2 || hasReplies) ? "is-done" : "is-next"}>
          {index > 0 && <span className="hearing-step-arrow" aria-hidden="true">→</span>}
          <span className="hearing-step-pill">{step.number} · {step.number === 2 && !hasReplies ? "Replies skipped" : step.label}</span>
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
