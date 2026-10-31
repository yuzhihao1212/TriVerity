import { useEffect, useId, useState, type CSSProperties } from "react";

import { AgentsStrip } from "./AgentsStrip";
import { Chip } from "./Chip";
import { createSeenCases } from "./chartIntro";
import { easeOut } from "./countUp";
import { EvidenceInfo } from "./EvidenceDisclosure";
import { EvidenceText, type FactLinks } from "./EvidenceList";
import { Icon } from "./Icon";
import { SourceBadge } from "./SourceBadge";
import { money, outputSources, policyIds, titleCase } from "./presentation";
import { Term } from "./Term";
import { CONFIDENCE_HELP, confidenceDisplay, refundSum, rulingBrief, rulingConditionGroups, rulingCredits, rulingHero, rulingSides, decidedHero } from "./verdictDisplay";
import type { FinalHeaderOutcome } from "./stepVisuals";
import type { DisputeCase, Resolution } from "./types";

let seen: ReturnType<typeof createSeenCases> | undefined;
function seenRulings() {
  if (!seen) {
    let storage: Storage | null = null;
    try { storage = window.sessionStorage; } catch { /* In-memory tracking when storage is blocked. */ }
    seen = createSeenCases(storage, "triverity.rulingIntroSeen");
  }
  return seen;
}

export function VerdictSummary({ resolution, dispute, final = null, aiLive = false, availableIds, onSelectFact }: {
  resolution: Resolution; dispute: DisputeCase; final?: FinalHeaderOutcome | null; aiLive?: boolean;
} & FactLinks) {
  const id = useId();
  const disputeId = dispute.dispute_id;
  const hero = decidedHero(rulingHero(resolution), final);
  const confidence = confidenceDisplay(resolution);
  const groups = rulingConditionGroups(resolution);
  const total = groups.reduce((sum, group) => sum + group.checks.length, 0);
  const sum = refundSum(resolution, dispute.fare);
  const credits = rulingCredits(resolution, aiLive);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [firstView] = useState(() => !window.matchMedia("(prefers-reduced-motion: reduce)").matches && !seenRulings().has(disputeId));
  const [intro, setIntro] = useState(false);
  const [animatedAmount, setAnimatedAmount] = useState<number | null>(null);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches || !firstView) return;
    seenRulings().mark(disputeId);
    setIntro(true);
    let frame = 0;
    const start = performance.now();
    const finish = () => { cancelAnimationFrame(frame); setIntro(false); setAnimatedAmount(null); };
    function tick(now: number) {
      const elapsed = now - start;
      // Counts up while the checks tick in, landing as the sum appears: never a static $0.00.
      if (hero.amount != null) setAnimatedAmount(hero.amount * easeOut((elapsed - 200) / 1550));
      if (elapsed < 2050) frame = requestAnimationFrame(tick); else finish();
    }
    frame = requestAnimationFrame(tick);
    const reduce = () => { if (media.matches) finish(); };
    media.addEventListener("change", reduce);
    return () => { cancelAnimationFrame(frame); media.removeEventListener("change", reduce); };
  }, [disputeId, hero.amount, firstView]);
  const brief = rulingBrief(resolution);
  const sides = rulingSides(resolution);
  const review = resolution.decision === "needs_review";
  // The sentence describes the rules' result, which a reviewer may have gone against.
  const overrode = !!final?.by && final.by !== "decided";
  const warnBox = brief.triggers.length > 0 || !!brief.proposed;
  return <section id="ruling-summary" tabIndex={-1} className={`card verdict ruling ruling-revamp ${resolution.decision}${intro ? " ruling-intro" : ""}`} aria-labelledby={`${id}-title`}>
    <div className={`ruling-hero tone-${hero.tone}`}>
      <span className="ruling-outcome-icon"><Icon name={hero.icon} /></span>
      <div className="ruling-outcome">
        {hero.solo ? <h2 id={`${id}-title`} className="ruling-solo-title">{hero.headline}</h2> : <>
          <h2 id={`${id}-title`}>{titleCase(hero.label)}</h2>
          <p className="ruling-amount"><span className="sr-only">{hero.headline} {hero.suffix}</span><span aria-hidden="true" className={`ruling-amount-number${hero.amount != null ? " money" : ""}`}>{animatedAmount != null ? money(animatedAmount) : hero.headline}</span>{hero.suffix && <span aria-hidden="true" className="ruling-amount-suffix">{hero.suffix}</span>}</p>
        </>}
        <p className="ruling-reason">{overrode ? `The rules alone found: ${brief.reason}` : brief.reason}</p>
      </div>
    </div>
    {(brief.known.length > 0 || warnBox || (brief.changeLine && !review)) && <div className="ruling-brief">
      {brief.known.length > 0 && <div className="ruling-brief-box">
        <h3><Icon name="check" />{brief.knownTitle}</h3>
        <ul>{brief.known.map(check => <li key={check.rule}><span className="sr-only">{check.status}: </span>{check.label}: <strong>{check.value}</strong></li>)}</ul>
        {sum && <p className="ruling-sum">Charged <span>{sum.charged}</span> <span aria-hidden="true">−</span><span className="sr-only">minus</span> Expected <span>{sum.expected}</span> <span aria-hidden="true">=</span><span className="sr-only">equals</span> <strong>{sum.amount}</strong></p>}
      </div>}
      {brief.missing ? <div className="ruling-brief-box is-warn">
        <h3><Icon name="warning" />What's Missing</h3>
        <p><strong>{brief.missing.fact}.</strong> {brief.missing.changeLine}</p>
      </div> : warnBox ? <div className="ruling-brief-box is-warn">
        <h3><Icon name="warning" />{final?.by ? "Why It Needed You" : "Why It Needs You"}</h3>
        <ul>{brief.triggers.map(check => <li key={check.rule}>{check.label}: <strong>{check.value}</strong>
          {check.rule === "FRAUD-1" && brief.riskReasons.length > 0 && <>
            <ul className="ruling-risk-reasons">{brief.riskReasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
            <p className="ruling-risk-note">A signal isn't proof. It's a reason to look closer.</p>
          </>}
        </li>)}</ul>
        {brief.proposed && <p className="ruling-proposed"><strong>The Rules Propose:</strong> {brief.proposed}.</p>}
      </div> : brief.changeLine && !review ? <div className="ruling-brief-box">
        <h3><Icon name="swap" />What Would Change It</h3>
        <p>{brief.changeLine}</p>
      </div> : null}
    </div>}
    {sides && !final?.by && <div className="ruling-sides" aria-labelledby={`${id}-sides`}>
      <h3 id={`${id}-sides`}>What Each Side Asks For</h3>
      <div className="ruling-brief">
        <div className="ruling-side"><h4><Icon name="person" />Rider</h4><p>{sides.rider}</p></div>
        <div className="ruling-side"><h4><Icon name="wheel" />Driver</h4><p>{sides.driver}</p></div>
      </div>
    </div>}
    <p className={`ruling-credit${credits.warn ? " is-warn" : ""}`}>
      <span><SourceBadge source="code" /> decided the outcome.</span><span aria-hidden="true">·</span>
      <span><SourceBadge source={credits.source} /> {credits.text}</span><span aria-hidden="true">·</span>
      <span className="ruling-confidence-line">{confidence.label} · {confidence.percent}% <EvidenceInfo label="About ruling confidence">{CONFIDENCE_HELP}</EvidenceInfo></span>
    </p>
    <details className="ruling-details">
      <summary>Rules and Sources</summary>
      <p className="ruling-confidence-note">{confidence.caption}</p>
      {brief.changeLine && review && !brief.missing && <p className="ruling-change"><Icon name="swap" /><span><strong>What would change it: </strong>{brief.changeLine}</span></p>}
      <span className="ruling-rule-tags">{policyIds(resolution.policy_refs).map(rule => <Chip key={rule} size="sm"><Term rule={rule} /></Chip>)}</span>
      {total > 0 && groups.map((group, groupIndex) => {
        const offset = groups.slice(0, groupIndex).reduce((sum, previous) => sum + previous.checks.length, 0);
        const list = <ul className="ruling-condition-list">{group.checks.map((check, index) => <li key={`${check.rule}-${index}`} style={{ "--condition-delay": `${200 + (offset + index) / Math.max(1, total - 1) * 850}ms` } as CSSProperties}>
            <span className={`ruling-condition-symbol${check.met ? " met" : ""}`} aria-hidden="true">{check.symbol}</span>
            <div className="ruling-condition-label"><span className="sr-only">{check.status}: </span>{check.label} <Chip size="sm"><Term rule={check.rule} /></Chip></div>
            <span className="ruling-condition-value">{check.value}</span>
            <span className="ruling-fact-ids">{check.fact_ids.map(factId => <Chip key={factId} size="sm" tone="neutral"><EvidenceText text={factId} availableIds={availableIds} onSelectFact={onSelectFact} /></Chip>)}</span>
          </li>)}</ul>;
        // The deciding and other rule checks stay open; only the escalation checks fold.
        return group.key === "overlays" && groups.length > 1
          ? <details key={group.key} className={`ruling-condition-group is-${group.key}`}>
              <summary className="ruling-condition-group-title">{group.title} · {group.checks.length} {group.checks.length === 1 ? "Check" : "Checks"}</summary>
              {list}
            </details>
          : <section key={group.key} className={`ruling-condition-group is-${group.key}`} aria-labelledby={`${id}-${group.key}`}>
              <h4 id={`${id}-${group.key}`} className="ruling-condition-group-title">{group.title}</h4>
              {list}
            </section>;
      })}
      <button type="button" className="text-button" aria-expanded={sourcesOpen} aria-controls={`${id}-sources`} onClick={() => setSourcesOpen(open => !open)}>See Which Steps Used AI <span aria-hidden="true">{sourcesOpen ? "▾" : "▸"}</span></button>
      <div id={`${id}-sources`} className="ruling-source-details" hidden={!sourcesOpen}>
        <div className="output-sources" aria-label="AI and fallback status">{outputSources(resolution).map(item => <span className="output-source small" key={item.label}>{item.label} {item.source ? <SourceBadge source={item.source} /> : <Chip size="sm" tone="outline">Not run</Chip>}</span>)}</div>
        <AgentsStrip tab="ruling" resolution={resolution} availableIds={availableIds} onSelectFact={onSelectFact} />
      </div>
    </details>
  </section>;
}
