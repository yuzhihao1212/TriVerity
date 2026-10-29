import { useId, useState } from "react";

import { Chip } from "./Chip";
import { EvidenceText, type FactLinks } from "./EvidenceList";
import { Icon } from "./Icon";
import { DECISION_LABELS } from "./outcomeTone";
import { appliedRuleIds, counterfactualLine, debugEnabled, priorityChip, reviewRows, suppliedRuleChecks, type CheckRowId } from "./rulingDetails";
import { SourceBadge } from "./SourceBadge";
import { Term } from "./Term";
import type { Resolution } from "./types";

/** Ruling-only review questions. Counts and answers use only data supplied in this result. */
export function RulingChecks({ resolution, availableIds, onSelectFact }: { resolution: Resolution } & FactLinks) {
  const id = useId();
  const [open, setOpen] = useState<Set<CheckRowId>>(() => new Set());
  const [opened, setOpened] = useState<Set<CheckRowId>>(() => new Set());
  const rows = reviewRows(resolution);
  const priority = priorityChip(resolution);
  const checks = suppliedRuleChecks(resolution.argument_review);
  const applied = appliedRuleIds(resolution.policy_refs);
  const allOpen = open.size === rows.length;
  function toggle(key: CheckRowId) {
    setOpen(previous => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; });
    setOpened(previous => new Set([...previous, key]));
  }
  return <section className="card ruling-checks" aria-labelledby={`${id}-title`}>
    <div className="ruling-checks-head">
      <h2 id={`${id}-title`}>Check before you decide</h2>
      <Chip tone={priority.tone} size="sm">{priority.text}</Chip>
      <div className="ruling-checks-tools">
        <span className="small muted" role="status">{opened.size} of 4 opened</span>
        <button type="button" className="text-button" onClick={() => {
          setOpen(allOpen ? new Set() : new Set(rows.map(row => row.id)));
          if (!allOpen) setOpened(new Set(rows.map(row => row.id)));
        }}>{allOpen ? "Close all" : "Open all"}</button>
      </div>
    </div>
    <div className="ruling-checks-list">
      {rows.map(row => <div className={`ruling-check-row${row.tone === "warn" ? " look-closer" : ""}`} key={row.id}>
        <h3 className="ruling-check-question">
          <button type="button" className="ruling-check-trigger" aria-expanded={open.has(row.id)} aria-controls={`${id}-${row.id}-detail`}
            onClick={() => toggle(row.id)}>
            <span className="ruling-check-marker" aria-hidden="true">▸</span>
            <span className={`ruling-check-status tone-${row.tone}`}><Icon name={row.icon} /></span>
            <span className="ruling-check-label">
              <span className="ruling-check-title">{row.question}{row.id === "risk" && <Chip tone="outline" size="sm" icon="lock">Reviewer only</Chip>}</span>
              <span className="ruling-check-answer">{row.answer}</span>
            </span>
          </button>
        </h3>
        <div id={`${id}-${row.id}-detail`} className={`ruling-check-detail${open.has(row.id) ? " open" : ""}`} aria-hidden={!open.has(row.id)}
          {...(!open.has(row.id) ? { inert: "" } : {})}>
          <div className="ruling-check-clip"><div className="ruling-check-body">
            {row.id === "why" && <>
              {checks.length > 0 && <p className="small muted">The rules each side cited, checked against the facts:</p>}
              {checks.length > 0 && <ul className="ruling-rule-checks">
                {checks.map((check, index) => <li key={`${check.party}-${check.rule}-${index}`}>
                  <span className={`ruling-condition-symbol${check.applies ? " met" : ""}`} aria-hidden="true">{check.applies ? "✓" : "⊖"}</span>
                  <span><span className="muted">{check.party === "rider" ? "Rider" : "Driver"} cited: </span>{check.text}{check.decisive ? " · Decided the case" : ""}</span>
                  <Chip size="sm" tone="neutral"><Term rule={check.rule} /></Chip>
                </li>)}
              </ul>}
              {applied.length > 0 && <div className="ruling-applied-rules"><span className="small muted">Rules applied:</span>{applied.map(rule => <Chip key={rule} size="sm" tone="neutral"><Term rule={rule} /></Chip>)}</div>}
              <h4 className="ruling-plain-title">In plain words <SourceBadge source={resolution.explanation_source === "llm" ? "llm" : "fallback"} /></h4>
              <p className="ruling-plain-text"><EvidenceText text={resolution.explanation} availableIds={availableIds} onSelectFact={onSelectFact} /></p>
              <p className="small muted">The outcome comes from the rules above. The AI only writes the plain-words summary.</p>
            </>}
            {row.id === "risk" && (resolution.risk.signals.length ? <>
              <ul className="ruling-signals">{resolution.risk.signals.map((signal, index) => <li key={index}><EvidenceText text={signal} availableIds={availableIds} onSelectFact={onSelectFact} /></li>)}</ul>
              <p className="small muted">A signal isn't proof. It's a reason to look closer, or to choose 'Needs further investigation'.</p>
            </> : <p>No risk signals</p>)}
            {row.id === "precedents" && (resolution.precedents?.matches.length ? <ul className="ruling-precedents">
              {resolution.precedents.matches.map(match => <li key={match.id}>
                <span><strong>{match.id}</strong>{match.summary ? ` · ${match.summary}` : ""} → {DECISION_LABELS[match.decision]}{match.decided_by === "human_review" ? " · reviewer decision" : ""}</span>
                <Chip size="sm" tone="neutral">{Math.round(match.similarity * 100)}% alike</Chip>
              </li>)}
            </ul> : <p className="small muted">No similar cases in this result.</p>)}
            {row.id === "changes" && (resolution.counterfactuals?.length ? <>
              <ul className="ruling-counterfactuals">{resolution.counterfactuals.map((item, index) => <li key={index}>
                <span>{counterfactualLine(item)}</span>
                <span className="ruling-rule-tags">{item.rules.map(rule => <Chip key={rule} size="sm" tone="neutral"><Term rule={rule} /></Chip>)}</span>
              </li>)}</ul>
              <p className="small muted">If you know one of these is true, override and say so in your reason.</p>
            </> : <p className="small muted">No alternative conditions supplied in this result.</p>)}
          </div></div>
        </div>
      </div>)}
    </div>
    {debugEnabled(window.location.search) && <details className="raw"><summary>Raw API response · internal record</summary><pre>{JSON.stringify(resolution, null, 2)}</pre></details>}
  </section>;
}
