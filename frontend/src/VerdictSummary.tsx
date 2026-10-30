import { useEffect, useId, useState, type CSSProperties } from "react";

import { AgentsStrip } from "./AgentsStrip";
import { Chip } from "./Chip";
import { createSeenCases } from "./chartIntro";
import { easeOut } from "./countUp";
import { EvidenceInfo } from "./EvidenceDisclosure";
import { EvidenceText, type FactLinks } from "./EvidenceList";
import { Icon } from "./Icon";
import { SourceBadge } from "./SourceBadge";
import { money, outputSources, policyIds } from "./presentation";
import { Term } from "./Term";
import { CONFIDENCE_HELP, confidenceDisplay, refundSum, rulingConditionGroups, rulingCredits, rulingHero } from "./verdictDisplay";
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

export function VerdictSummary({ resolution, dispute, availableIds, onSelectFact }: {
  resolution: Resolution; dispute: DisputeCase;
} & FactLinks) {
  const id = useId();
  const disputeId = dispute.dispute_id;
  const hero = rulingHero(resolution);
  const confidence = confidenceDisplay(resolution);
  const groups = rulingConditionGroups(resolution);
  const total = groups.reduce((sum, group) => sum + group.checks.length, 0);
  const sum = refundSum(resolution, dispute.fare);
  const credits = rulingCredits(resolution);
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
      if (hero.amount != null) setAnimatedAmount(hero.amount * easeOut((elapsed - 1250) / 500));
      if (elapsed < 2050) frame = requestAnimationFrame(tick); else finish();
    }
    frame = requestAnimationFrame(tick);
    const reduce = () => { if (media.matches) finish(); };
    media.addEventListener("change", reduce);
    return () => { cancelAnimationFrame(frame); media.removeEventListener("change", reduce); };
  }, [disputeId, hero.amount, firstView]);
  const change = resolution.counterfactuals?.[0];
  return <section id="ruling-summary" tabIndex={-1} className={`card verdict ruling ruling-revamp ${resolution.decision}${intro ? " ruling-intro" : ""}`} aria-labelledby={`${id}-title`}>
    <div className={`ruling-hero tone-${hero.tone}`}>
      <span className="ruling-outcome-icon"><Icon name={hero.icon} /></span>
      <div className="ruling-outcome">
        <h2 id={`${id}-title`}>{hero.label}</h2>
        <p className="ruling-amount"><span className="sr-only">{hero.headline} {hero.suffix}</span><span aria-hidden="true" className={`ruling-amount-number${hero.amount != null ? " money" : ""}`}>{animatedAmount != null ? money(animatedAmount) : hero.headline}</span>{hero.suffix && <span aria-hidden="true" className="ruling-amount-suffix">{hero.suffix}</span>}</p>
      </div>
      <div className={`ruling-confidence tone-${confidence.tone}`}>
        <div className="ruling-confidence-title"><span>Confidence <EvidenceInfo label="About ruling confidence">{CONFIDENCE_HELP}</EvidenceInfo></span><strong>{confidence.percent}%</strong></div>
        <div className="ruling-confidence-track" role="meter" aria-label="Ruling confidence" aria-valuemin={0} aria-valuemax={100} aria-valuenow={confidence.percent} aria-describedby={`${id}-confidence-note`}>
          <span className="ruling-confidence-fill" style={{ width: `${confidence.percent}%` }} />
          {confidence.thresholdPercent != null && <span className="ruling-confidence-marker" style={{ left: `${confidence.thresholdPercent}%` }} />}
        </div>
        <div className="ruling-confidence-scale" aria-hidden="true"><span>0%</span>{confidence.thresholdPercent != null && <span className={`ruling-confidence-threshold${confidence.thresholdPercent < 15 ? " near-start" : confidence.thresholdPercent > 85 ? " near-end" : ""}`} style={{ left: `${confidence.thresholdPercent}%` }}>{confidence.thresholdLabel} threshold</span>}<span>100%</span></div>
        <p id={`${id}-confidence-note`} className="ruling-confidence-caption">{confidence.caption}</p>
      </div>
    </div>
    {total > 0 && <div className="ruling-proof" aria-labelledby={`${id}-checks`}>
      <h3 id={`${id}-checks`}>{hero.checklistTitle}</h3>
      <div className="ruling-policy-summary"><span className="ruling-rule-tags">{policyIds(resolution.policy_refs).map(rule => <Chip key={rule} size="sm"><Term rule={rule} contained /></Chip>)}</span><p>{hero.summary}</p></div>
      {groups.map((group, groupIndex) => {
        const offset = groups.slice(0, groupIndex).reduce((sum, previous) => sum + previous.checks.length, 0);
        const list = <ul className="ruling-condition-list">{group.checks.map((check, index) => <li key={`${check.rule}-${index}`} style={{ "--condition-delay": `${200 + (offset + index) / Math.max(1, total - 1) * 850}ms` } as CSSProperties}>
            <span className={`ruling-condition-symbol${check.met ? " met" : ""}`} aria-hidden="true">{check.symbol}</span>
            <div className="ruling-condition-label"><span className="sr-only">{check.status}: </span>{check.label} <Chip size="sm"><Term rule={check.rule} contained /></Chip></div>
            <span className="ruling-condition-value">{check.value}</span>
            <span className="ruling-fact-ids">{check.fact_ids.map(factId => <Chip key={factId} size="sm" tone="neutral"><EvidenceText text={factId} availableIds={availableIds} onSelectFact={onSelectFact} /></Chip>)}</span>
          </li>)}</ul>;
        // The deciding checks stay open; the rest (often eight overlays and unmet branches) fold.
        return group.key === "others" && groups.length > 1
          ? <details key={group.key} className={`ruling-condition-group is-${group.key}`}>
              <summary className="ruling-condition-group-title">{group.title} · {group.checks.length} more {group.checks.length === 1 ? "check" : "checks"}</summary>
              {list}
            </details>
          : <section key={group.key} className={`ruling-condition-group is-${group.key}`} aria-labelledby={`${id}-${group.key}`}>
              <h4 id={`${id}-${group.key}`} className="ruling-condition-group-title">{group.title}</h4>
              {list}
            </section>;
      })}
      {sum && <p className="ruling-sum">Charged <span>{sum.charged}</span> <span aria-hidden="true">−</span><span className="sr-only">minus</span> Expected <span>{sum.expected}</span> <span aria-hidden="true">=</span><span className="sr-only">equals</span> <strong>{sum.amount}</strong></p>}
    </div>}
    {change && <p className="ruling-change"><Icon name="swap" /><span><strong>What would change it: </strong>If {change.change}, the outcome would be {change.outcome}.</span></p>}
    <footer className="ruling-credit">
      <span><SourceBadge source="code" /> decided the outcome.</span><span aria-hidden="true">·</span>
      <span><SourceBadge source={credits.source} /> {credits.text}</span><span aria-hidden="true">·</span>
      <button type="button" className="text-button" aria-expanded={sourcesOpen} aria-controls={`${id}-sources`} onClick={() => setSourcesOpen(open => !open)}>See which steps used AI <span aria-hidden="true">{sourcesOpen ? "▾" : "▸"}</span></button>
    </footer>
    <div id={`${id}-sources`} className="ruling-source-details" hidden={!sourcesOpen}>
      <div className="output-sources" aria-label="AI and fallback status">{outputSources(resolution).map(item => <span className="output-source small" key={item.label}>{item.label} {item.source ? <SourceBadge source={item.source} /> : <Chip size="sm" tone="outline">Not run</Chip>}</span>)}</div>
      <AgentsStrip tab="ruling" resolution={resolution} availableIds={availableIds} onSelectFact={onSelectFact} />
    </div>
  </section>;
}
