import { useEffect, useMemo, useState } from "react";

import { AgentsStrip } from "./AgentsStrip";
import { WorkflowTabs } from "./WorkflowTabs";
import { savedTab, type WorkflowTab } from "./workflow";
import { FactLibrary } from "./FactLibrary";
import { CaseComparison } from "./CaseComparison";
import { Debate } from "./Debate";
import { EvidenceList, EvidenceText, type FactLinks } from "./EvidenceList";
import { VerdictSummary } from "./VerdictSummary";
import { computedFacts, disputeLabel, filterDisputes, money, readPresentationPreference, writePresentationPreference } from "./presentation";
import { AppealsPanel } from "./Appeals";
import { PartyPreview } from "./PartyPreview";
import { DisputeForm } from "./DisputeForm";
import { getSamples, resolveDispute } from "./services/api";
import type { ArgumentReview, Counterfactual, Decision, DisputeCase, PartyHistory, PrecedentReport, Resolution, RiskLevel, Triage, TriageTier } from "./types";

const TYPE_LABELS: Record<DisputeCase["type"], string> = {
  route_deviation: "Route deviation",
  no_show_charge: "No-show charge",
};

const DECISION_LABELS: Record<Decision, string> = {
  partial_refund: "Partial refund",
  full_refund: "Full refund",
  compensation: "Compensation",
  no_action: "No action",
  needs_review: "Needs human review",
};

// The judge types their access code; it is kept for this browser tab only and is
// never part of the built bundle.
const ACCESS_CODE_KEY = "triverity.accessCode";

function loadAccessCode(): string {
  try {
    return sessionStorage.getItem(ACCESS_CODE_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveAccessCode(code: string) {
  try {
    if (code) sessionStorage.setItem(ACCESS_CODE_KEY, code);
    else sessionStorage.removeItem(ACCESS_CODE_KEY);
  } catch {
    // Storage blocked: the code still works until the page reloads.
  }
}

function loadPresentationMode() {
  try { return readPresentationPreference(localStorage); } catch { return false; }
}

export default function App() {
  const [presentation, setPresentation] = useState(loadPresentationMode);
  const [filter, setFilter] = useState("all");
  const [activeTabs, setActiveTabs] = useState<Record<string, WorkflowTab>>({});
  const [activeFact, setActiveFact] = useState<string | null>(null);
  const [factRequest, setFactRequest] = useState(0);
  const [samples, setSamples] = useState<DisputeCase[]>([]);
  // Disputes the judge typed in; resolved with their access code.
  const [own, setOwn] = useState<DisputeCase[]>([]);
  const [form, setForm] = useState<{ template?: DisputeCase } | null>(null);
  const [accessCode, setAccessCode] = useState(loadAccessCode);
  const [selected, setSelected] = useState<DisputeCase | null>(null);
  // Results are kept per dispute so revisiting a case doesn't call the LLM again.
  const [results, setResults] = useState<Record<string, Resolution>>({});
  const [resolving, setResolving] = useState<string | null>(null);
  const [completedId, setCompletedId] = useState<string | null>(null);
  const [loadingSamples, setLoadingSamples] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumped when an appeal is filed or decided, so the reviewer's appeal list reloads.
  const [appealsVersion, setAppealsVersion] = useState(0);

  // Loading the samples is free; the agents (and LLM tokens) only run on "Resolve".
  useEffect(() => {
    getSamples()
      .then((cases) => {
        setSamples(cases);
        if (cases.length) setSelected(cases[0]);
      })
      .catch(() => setError("Can’t load disputes. Check your connection and reload the page."))
      .finally(() => setLoadingSamples(false));
  }, []);

  function select(dispute: DisputeCase) {
    setActiveFact(null);
    setSelected(dispute);
    setForm(null);
    setError(null);
  }

  function addOwn(dispute: DisputeCase) {
    setFilter("all");
    setOwn((prev) => [dispute, ...prev]);
    select(dispute);
  }

  function changeAccessCode(code: string) {
    setAccessCode(code);
    saveAccessCode(code.trim());
  }

  function resolve(dispute: DisputeCase) {
    if (resolving !== null) return;
    setError(null);
    setResolving(dispute.dispute_id);
    // Samples never send the code: they are served from the server's cache and
    // don't use up the judge's quota.
    const isOwn = own.some((d) => d.dispute_id === dispute.dispute_id);
    resolveDispute(dispute, isOwn ? accessCode.trim() || undefined : undefined)
      .then((r) => {
        setActiveFact(null);
        setResults((prev) => ({ ...prev, [dispute.dispute_id]: r }));
        setActiveTabs(prev => ({ ...prev, [dispute.dispute_id]: "evidence" }));
        setCompletedId(dispute.dispute_id);
      })
      .catch((e: Error) => setError(`${dispute.dispute_id}: ${e.message}`))
      .finally(() => setResolving(null));
  }

  const resolution = selected ? results[selected.dispute_id] : undefined;
  const facts = useMemo(() => resolution ? computedFacts(resolution) : [], [resolution]);
  const factIds = useMemo(() => new Set(facts.flatMap(fact => fact.id ? [fact.id] : [])), [facts]);

  const activeTab = savedTab(selected ? activeTabs[selected.dispute_id] : undefined, !!resolution);

  function changeTab(tab: WorkflowTab) {
    if (!selected) return;
    setActiveFact(null);
    setActiveTabs(prev => ({ ...prev, [selected.dispute_id]: tab }));
  }

  function selectFact(id: string) {
    if (!factIds.has(id)) return;
    if (selected) setActiveTabs(prev => ({ ...prev, [selected.dispute_id]: "evidence" }));
    setActiveFact(id);
    setFactRequest(value => value + 1);
  }

  function togglePresentation() {
    const next = !presentation;
    setPresentation(next);
    try { writePresentationPreference(localStorage, next); } catch { /* Storage itself may be blocked. */ }
  }

  useEffect(() => {
    if (!form && resolving === selected?.dispute_id) {
      const heading = document.getElementById("loading-title");
      heading?.scrollIntoView({ block: "start" });
      heading?.focus({ preventScroll: true });
    }
  }, [resolving, selected?.dispute_id, form]);

  useEffect(() => {
    if (!completedId) return;
    if (!form && completedId === selected?.dispute_id) {
      const summary = document.querySelector<HTMLButtonElement>('[data-workflow-tab="evidence"]');
      summary?.scrollIntoView({ block: "nearest" });
      summary?.focus({ preventScroll: true });
    }
    setCompletedId(null);
  }, [completedId, selected, form]);

  const disputeButton = (d: DisputeCase) => (
    <button
      key={d.dispute_id}
      className={`dispute-item ${!form && selected?.dispute_id === d.dispute_id ? "active" : ""}`}
      aria-current={!form && selected?.dispute_id === d.dispute_id ? "true" : undefined}
      onClick={() => select(d)}
    >
      <span className="dispute-meta">
        <TypeIcon type={d.type} />{d.dispute_id} · {TYPE_LABELS[d.type]}
      </span>
      <span className="dispute-label" title={disputeLabel(d)}>{disputeLabel(d)}</span>
      {results[d.dispute_id] && (
        <span className="dispute-done">{DECISION_LABELS[results[d.dispute_id].decision]}</span>
      )}
    </button>
  );

  return (
    <div className={`app${presentation ? " presentation-mode" : ""}`}>
      <a className="skip-link" href="#main-content">Skip to dispute</a>
      <header className="topbar">
        <h1 className="brand">TriVerity</h1>
        <span className="muted">Multi-agent dispute resolution for Ryde</span>
        <div className="topbar-right">
          <button type="button" className="secondary-button presentation-toggle" aria-pressed={presentation} onClick={togglePresentation}>Presentation mode</button>
          <label className="access-code">
            <span className="small muted">Judge access code</span>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={accessCode}
              onChange={(e) => changeAccessCode(e.target.value)}
              placeholder="Needed for your own disputes"
            />
          </label>
          <span
            className="pill"
            title="Internal reviewer view: it shows fraud signals and both parties' data, which riders and drivers never see."
          >
            Reviewer console
          </span>
        </div>
      </header>

      <div className="layout">
        <nav className="sidebar" aria-label="Disputes">
          <button className="secondary-button" onClick={() => { setForm({}); setError(null); }}>
            + New dispute
          </button>
          <label className="sidebar-filter"><span className="section-label">Filter disputes</span>
            <span className="sidebar-select">
              <select value={filter} onChange={event => setFilter(event.target.value)}>
                <option value="all">All dispute types</option><option value="route_deviation">Route deviation</option><option value="no_show_charge">No-show charge</option>
              </select>
              <svg className="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </span>
          </label>
          {selected && filter !== "all" && selected.type !== filter && <p className="small muted">The selected case is outside this filter.</p>}
          {!loadingSamples && !filterDisputes([...own, ...samples], filter).length && <p className="small muted">No disputes match this filter.</p>}
          {own.length > 0 && (
            <>
              <h2 className="section-label">Your disputes</h2>
              {filterDisputes(own, filter).map(disputeButton)}
            </>
          )}
          <h2 className="section-label">Sample disputes</h2>
          {filterDisputes(samples, filter).map(disputeButton)}
        </nav>

        <main className="content" id="main-content" tabIndex={-1}>
          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {loadingSamples ? "Loading sample disputes…" : resolving ? `Agents working on ${resolving} (about 10–15 seconds). Waiting for the complete result.` : resolution ? "Saved ruling ready." : ""}
          </p>
          <div role="alert" aria-atomic="true">{error && <p className="error">{error}</p>}</div>
          {!form && loadingSamples && <section className="card empty-state"><h2>Loading disputes…</h2><p className="muted">The sample list is loading. No agents have run.</p></section>}
          {!form && !loadingSamples && !selected && <section className="card empty-state"><h2>No dispute selected</h2><p className="muted">Choose a sample or add a new dispute to begin.</p></section>}
          {!form && resolving && resolving !== selected?.dispute_id && <p className="small muted">Agents are working on {resolving}. This case remains available.</p>}
          {form && <DisputeForm key={form.template?.dispute_id ?? "blank"} template={form.template} onSubmit={addOwn} onCancel={() => setForm(null)} />}
          {!form && selected && <section className="case-file" aria-labelledby="case-title">
            <header className="case-file-head">
              <div><p className="eyebrow">Dispute file</p><h2 id="case-title">{selected.dispute_id} <span className="tag">{TYPE_LABELS[selected.type]}</span></h2></div>
              <span className="case-save-status">{resolving === selected.dispute_id ? "Agents working · one request" : resolution ? "Saved result · no new request" : "Ready for intake"}</span>
            </header>
            <WorkflowTabs active={activeTab} resolution={resolution} busy={resolving === selected.dispute_id} onChange={changeTab}
              render={tab => resolving === selected.dispute_id ? <LoadingPanel disputeId={selected.dispute_id} /> : <>
                <AgentsStrip tab={tab} resolution={resolution} availableIds={factIds} onSelectFact={selectFact} />
                {tab === "intake" && <>
                  <CasePanel dispute={selected} availableIds={factIds} onSelectFact={selectFact} />
                  <div className="run-bar">
                    <button className="run-button" onClick={() => resolve(selected)} disabled={resolving !== null}>
                      {resolution ? "Re-run agents" : "Run agents"}
                    </button>
                    <span className="token-warning" role="note">Uses real AI tokens when enabled · one run per click</span>
                    <button className="secondary-button" onClick={() => { setForm({ template: selected }); setError(null); }}>Edit as new dispute</button>
                  </div>
                  {resolution && <p className="small muted">This case has a saved result. Re-running uses tokens again.</p>}
                </>}
                {tab === "evidence" && resolution && <FactLibrary facts={facts} activeId={activeFact} request={factRequest} expanded grouped onSelectFact={selectFact} />}
                {tab === "hearing" && resolution && <Debate resolution={resolution} availableIds={factIds} onSelectFact={selectFact} />}
                {tab === "ruling" && resolution && <>
                  <VerdictSummary resolution={resolution} disputeId={selected.dispute_id} />
                  <RulingPanel resolution={resolution} availableIds={factIds} onSelectFact={selectFact} />
                  {resolution.argument_review && resolution.argument_review.length > 0 && <section className="card"><ArgumentReviewPanel reviews={resolution.argument_review} /></section>}
                  {resolution.counterfactuals && resolution.counterfactuals.length > 0 && <section className="card"><CounterfactualPanel items={resolution.counterfactuals} /></section>}
                  {resolution.precedents && <section className="card"><PrecedentPanel report={resolution.precedents} /></section>}
                  {resolution.triage && <section className="card"><TriagePanel triage={resolution.triage} /></section>}
                  <AppealsPanel disputeId={selected.dispute_id} version={appealsVersion} onChanged={() => setAppealsVersion(v => v + 1)} />
                  <section className="card"><RiskPanel risk={resolution.risk} /></section>
                  <details className="raw"><summary>Raw API response · internal record</summary><pre>{JSON.stringify(resolution, null, 2)}</pre></details>
                </>}
                {tab === "notify" && resolution && <PartyPreview resolution={resolution} dispute={selected} onAppealed={() => setAppealsVersion(v => v + 1)} />}
              </>} />
          </section>}

        </main>
      </div>
    </div>
  );
}

function CasePanel({ dispute, availableIds, onSelectFact }: { dispute: DisputeCase } & FactLinks) {
  const { trip, fare } = dispute;
  const facts: [string, string][] = [];
  if (fare.cancellation_fee != null) facts.push(["No-show fee", money(fare.cancellation_fee)]);
  if (trip.driver_wait_min != null) facts.push(["Driver waited", `${trip.driver_wait_min} min`]);
  if (fare.surge_multiplier != null && fare.surge_multiplier > 1) facts.push(["Surge", `x${fare.surge_multiplier}`]);
  if (fare.promo_code) facts.push(["Promo", fare.promo_discount != null
    ? `${fare.promo_code} (${money(fare.promo_discount)} off)` : `${fare.promo_code} (discount not recorded)`]);

  return (
    <section className="card case-overview">
      <div><p className="eyebrow">Step 1</p><h2>Intake</h2></div>
      <div className="statements">
        <blockquote className="rider"><span className="who">Rider’s claim</span><EvidenceText text={dispute.rider_claim} availableIds={availableIds} onSelectFact={onSelectFact} /></blockquote>
        <blockquote className="driver"><span className="who">Driver’s statement</span>{dispute.driver_statement
          ? <EvidenceText text={dispute.driver_statement} availableIds={availableIds} onSelectFact={onSelectFact} /> : <em className="muted">No statement provided</em>}</blockquote>
      </div>
      <CaseComparison dispute={dispute} />
      {facts.length > 0 && (
        <dl className="facts">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <details className="case-details"><summary>Chat log and party history</summary>
      {dispute.chat_logs.length > 0 && (
        <>
          <h3 className="section-label">Chat log</h3>
          <div className="chat">
            {dispute.chat_logs.map((m, i) => (
              <div key={i} className={`bubble ${m.sender}`}>
                <span className="who">{m.sender}</span>
                {m.message}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="history">
        <History label="Rider history" history={dispute.rider_history} />
        <History label="Driver history" history={dispute.driver_history} />
      </div>
      </details>
    </section>
  );
}

function History({ label, history }: { label: string; history: PartyHistory }) {
  const parts = [
    history.account_age_days != null && `${history.account_age_days} days old`,
    history.rating != null && `★ ${history.rating}`,
    history.completed_trips != null && `${history.completed_trips} trips`,
    history.disputes_last_90d != null && `${history.disputes_last_90d} disputes / 90d`,
  ].filter(Boolean);
  return (
    <p className="muted small">
      <strong>{label}:</strong> {parts.length ? parts.join(" · ") : "not provided"}
    </p>
  );
}

function RiskPanel({ risk }: { risk: Resolution["risk"] }) {
  return (
    <div className="risk-panel">
      <div><p className="eyebrow">Internal review only</p><h2>Fraud &amp; bad-faith risk</h2></div>
      <div className="risk-badges">
        <div className="risk-row">
          <span className="risk-party">Rider</span>
          <RiskBadge level={risk.rider_risk} />
        </div>
        <div className="risk-row">
          <span className="risk-party">Driver</span>
          <RiskBadge level={risk.driver_risk} />
        </div>
      </div>
      {risk.signals.length === 0 && <p className="small muted">No bad-faith signals detected.</p>}
      {risk.signals.length > 0 && (
        <ul className="small risk-signals">
          {risk.signals.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Reuses the risk badge colours, so a safety case stands out like a high risk.
const TRIAGE_BADGE: Record<TriageTier, RiskLevel> = { safety: "high", high: "medium", standard: "low", low: "low" };
const TRIAGE_LABEL: Record<TriageTier, string> = {
  safety: "Safety · review first", high: "High", standard: "Standard", low: "Low",
};

function TriagePanel({ triage }: { triage: Triage }) {
  return (
    <div className="risk-panel">
      <div><p className="eyebrow">Internal review only</p><h2>Review priority</h2></div>
      {triage.tier ? (
        <>
          <div className="risk-badges">
            <div className="risk-row">
              <span className={`risk-badge ${TRIAGE_BADGE[triage.tier]}`}>{TRIAGE_LABEL[triage.tier]}</span>
              <span className="risk-party">Score {triage.score} / 100</span>
            </div>
          </div>
          <ul className="small risk-signals">
            {triage.reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </>
      ) : (
        <p className="small muted">Resolved automatically; no human review needed.</p>
      )}
    </div>
  );
}

const VERDICT: Record<ArgumentReview["rules"][number]["verdict"], { label: string; level: RiskLevel }> = {
  supports: { label: "Holds for this side", level: "low" },
  favours_other_side: { label: "Favours the other side", level: "high" },
  does_not_apply: { label: "Does not apply", level: "medium" },
};

function ArgumentReviewPanel({ reviews }: { reviews: ArgumentReview[] }) {
  return (
    <div className="risk-panel">
      <div><p className="eyebrow">Internal review only · computed from the policy</p><h2>How the Judge weighed each side</h2></div>
      <div className="debate-grid">
        {reviews.map((review) => (
          <div key={review.party} className={`advocate ${review.party}`}>
            <h4>{review.party === "rider" ? "Rider advocate" : "Driver advocate"}</h4>
            {review.rules.length > 0 ? (
              <ul className="small argument-checks">
                {review.rules.map((check) => (
                  <li key={check.rule}>
                    <strong>{check.rule}</strong>{" "}
                    <span className={`risk-badge ${VERDICT[check.verdict].level}`}>{VERDICT[check.verdict].label}</span>
                    {check.decisive && <span className="tag"> Decided the case</span>}
                  </li>
                ))}
              </ul>
            ) : <p className="small muted">No policy rule cited.</p>}
            <p className="small muted">{review.summary}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CounterfactualPanel({ items }: { items: Counterfactual[] }) {
  return (
    <div className="risk-panel">
      <div><p className="eyebrow">Internal review only · computed from the policy</p><h2>What would change this ruling</h2></div>
      <ul className="small counterfactual-list">
        {items.map((cf, i) => (
          <li key={i}>
            If {cf.change}, the outcome would be <strong>{cf.outcome}</strong>
            {cf.rules.length > 0 && <span className="muted"> ({cf.rules.join(", ")})</span>}.
          </li>
        ))}
      </ul>
    </div>
  );
}

const CONSISTENCY_LABEL: Record<PrecedentReport["consistency"], string> = {
  consistent: "Consistent with precedent", mixed: "Mixed precedent",
  overridden: "Reviewers decided differently", no_precedent: "No close precedent",
};

function PrecedentPanel({ report }: { report: PrecedentReport }) {
  return (
    <div className="risk-panel">
      <div><p className="eyebrow">Internal review only · Policy &amp; Precedent agent</p><h2>Similar past rulings</h2></div>
      <div className="risk-row">
        <span className={`risk-badge ${report.consistency === "overridden" ? "high" : report.consistency === "mixed" ? "medium" : "low"}`}>
          {CONSISTENCY_LABEL[report.consistency]}
        </span>
      </div>
      {report.summary && <p className="small">{report.summary}</p>}
      {report.matches.length > 0 ? (
        <ul className="small precedent-list">
          {report.matches.map((m) => (
            <li key={m.id}>
              <strong className="evidence-id">{m.id}</strong>{" "}
              {DECISION_LABELS[m.decision]} · {Math.round(m.similarity * 100)}% similar ·{" "}
              {m.decided_by === "human_review" ? "decided by a reviewer" : "decided by the policy rules"}
              <span className="muted"> — {m.summary}</span>
              {m.note && <span className="muted"> ({m.note})</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="small muted">No past ruling was similar enough to compare.</p>
      )}
    </div>
  );
}

function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span className={`risk-badge ${level}`}>
      {level.charAt(0).toUpperCase() + level.slice(1)}
    </span>
  );
}

function RulingPanel({ resolution, availableIds, onSelectFact }: { resolution: Resolution } & FactLinks) {
  const pct = Math.round(resolution.confidence * 100);
  return (
    <section className="card ruling-detail">
      <div className="card-head">
        <h2>
          Why the Judge ruled this way
          <span className={`source-badge ${resolution.explanation_source}`}>
            {resolution.explanation_source === "llm" ? "AI" : "Fallback"}
          </span>
        </h2>
        <span className="decision">{DECISION_LABELS[resolution.decision]}</span>
      </div>

      <div className="confidence">
        <span className="small muted">Confidence</span>
        <div className="meter" role="meter" aria-label="Ruling confidence" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${pct}%` }} />
        </div>
        <strong>{pct}%</strong>
      </div>

      <p className="action"><EvidenceText text={resolution.recommended_action} availableIds={availableIds} onSelectFact={onSelectFact} /></p>
      <p><EvidenceText text={resolution.explanation} availableIds={availableIds} onSelectFact={onSelectFact} /></p>

      <h3 className="section-label">Policy applied</h3>
      <ul className="small">
        {resolution.policy_refs.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>

      <h3 className="section-label">Evidence considered</h3>
      <EvidenceList texts={resolution.judge_evidence} availableIds={availableIds} onSelectFact={onSelectFact} />
    </section>
  );
}

function LoadingPanel({ disputeId }: { disputeId: string }) {
  return <section className="card loading-state" aria-labelledby="loading-title">
    <div className="card-head"><h2 id="loading-title" tabIndex={-1}>Agents working · {disputeId}</h2><span className="spinner" role="progressbar" aria-label="Waiting for the complete agent result" /></div>
    <p>About 15 seconds. The server returns one complete result; individual step progress is not available.</p>
    <ol className="pending-steps"><li>Evidence loader</li><li>Evidence collector</li><li>Rider &amp; Driver advocates</li><li>Fraud detector</li><li>Rebuttal round</li><li>Policy &amp; Precedent agent</li><li>Judge: policy ruling &amp; explanation</li></ol>
    <p className="small muted">These are the stages of a resolve, not live progress. Previous saved results are retained until a new run succeeds.</p>
  </section>;
}

function TypeIcon({ type }: { type: DisputeCase["type"] }) {
  return <svg className="type-icon" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" focusable="false">
    {type === "route_deviation"
      ? <><circle cx="4" cy="4" r="2" /><circle cx="16" cy="16" r="2" /><path d="M6 4h6a4 4 0 0 1 0 8H8a4 4 0 0 0-4 4h10" /></>
      : <><circle cx="10" cy="10" r="7" /><path d="M10 5v5l3 2" /></>}
  </svg>;
}
