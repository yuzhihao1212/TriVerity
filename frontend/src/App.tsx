import { useEffect, useMemo, useState } from "react";

import { FactLibrary } from "./FactLibrary";
import { CaseComparison } from "./CaseComparison";
import { Debate } from "./Debate";
import { EvidenceList } from "./EvidenceList";
import { VerdictSummary } from "./VerdictSummary";
import { factIndex, filterDisputes, money, readPresentationPreference, writePresentationPreference } from "./presentation";
import { PartyPreview } from "./PartyPreview";
import { DisputeForm } from "./DisputeForm";
import { getSamples, resolveDispute } from "./services/api";
import type { Decision, DisputeCase, PartyHistory, Resolution, RiskLevel, TriageTier } from "./types";

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

const AGENT_LABELS: Record<string, string> = {
  evidence_loader: "Evidence loader",
  rider_advocate: "Rider advocate",
  driver_advocate: "Driver advocate",
  fraud_detector: "Fraud detector",
  rider_rebuttal: "Rider rebuttal",
  driver_rebuttal: "Driver rebuttal",
  judge: "Judge",
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
        setCompletedId(dispute.dispute_id);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setResolving(null));
  }

  const resolution = selected ? results[selected.dispute_id] : undefined;
  const facts = useMemo(() => resolution ? factIndex(resolution) : [], [resolution]);
  const factIds = useMemo(() => new Set(facts.map(fact => fact.id!)), [facts]);

  function selectFact(id: string) {
    if (!factIds.has(id)) return;
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
      const summary = document.getElementById("ruling-summary");
      summary?.scrollIntoView({ block: "start" });
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
      <span className="dispute-claim">{d.rider_claim}</span>
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
            <select value={filter} onChange={event => setFilter(event.target.value)}>
              <option value="all">All dispute types</option><option value="route_deviation">Route deviation</option><option value="no_show_charge">No-show charge</option>
            </select>
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
          {!form && resolving && <LoadingPanel disputeId={resolving} />}
          {!form && resolution && selected && <VerdictSummary resolution={resolution} disputeId={selected.dispute_id} />}
          {form && (
            <DisputeForm
              key={form.template?.dispute_id ?? "blank"}
              template={form.template}
              onSubmit={addOwn}
              onCancel={() => setForm(null)}
            />
          )}
          {!form && selected && <CasePanel dispute={selected} />}
          {!form && selected && (
            <div className="run-bar">
              <button
                className="run-button"
                onClick={() => resolve(selected)}
                disabled={resolving !== null}
              >
                {resolving === selected.dispute_id ? "Agents working…" : resolution ? "Re-run agents" : "Resolve dispute"}
              </button>
              <span className="token-warning" role="note">
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                  <path d="M8 1.5 15 14H1L8 1.5Z" fill="currentColor" />
                  <path d="M8 6v3.5M8 11.4v.1" stroke="var(--warn-soft)" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                Uses real AI tokens (~5,400 per run)
              </span>
              {resolution && <span className="small muted">Showing the saved result. Re-running uses tokens again.</span>}
              <button className="secondary-button" onClick={() => { setForm({ template: selected }); setError(null); }}>
                Edit as new dispute
              </button>
            </div>
          )}
          {!form && selected && !resolution && !resolving && <section className="card empty-state"><h2>Ready when you are</h2><p className="muted">Resolve this dispute to hear both sides and see the policy ruling. Selecting a case does not run the agents.</p></section>}
          {!form && resolution && (
            <>
              <Workflow resolution={resolution} />
              <Debate key={selected?.dispute_id} resolution={resolution} availableIds={factIds} onSelectFact={selectFact} />
              <section className="card"><TriagePanel triage={resolution.triage} /></section>
              <section className="card"><RiskPanel risk={resolution.risk} /></section>
              <RulingPanel resolution={resolution} />
              <FactLibrary key={selected?.dispute_id} facts={facts} activeId={activeFact} request={factRequest} />
              <PartyPreview key={selected?.dispute_id} resolution={resolution} />
              <details className="card raw">
                <summary>Raw API response</summary>
                <pre>{JSON.stringify(resolution, null, 2)}</pre>
              </details>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function CasePanel({ dispute }: { dispute: DisputeCase }) {
  const { trip, fare } = dispute;
  const facts: [string, string][] = [];
  if (fare.cancellation_fee != null) facts.push(["No-show fee", money(fare.cancellation_fee)]);
  if (trip.driver_wait_min != null) facts.push(["Driver waited", `${trip.driver_wait_min} min`]);
  if (fare.surge_multiplier != null && fare.surge_multiplier > 1) facts.push(["Surge", `x${fare.surge_multiplier}`]);
  if (fare.promo_code) facts.push(["Promo", fare.promo_discount != null
    ? `${fare.promo_code} (${money(fare.promo_discount)} off)` : `${fare.promo_code} (discount not recorded)`]);

  return (
    <section className="card case-overview">
      <div className="card-head">
        <h2>
          {dispute.dispute_id} <span className="tag">{TYPE_LABELS[dispute.type]}</span>
        </h2>
      </div>
      <p className="eyebrow">Case at a glance</p>
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
      <details className="case-details"><summary>Statements, chat and history</summary>
      <div className="statements">
        <blockquote className="rider">
          <span className="who">Rider</span>
          {dispute.rider_claim}
        </blockquote>
        <blockquote className="driver">
          <span className="who">Driver</span>
          {dispute.driver_statement ?? <em className="muted">No statement</em>}
        </blockquote>
      </div>


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

function Workflow({ resolution }: { resolution: Resolution }) {
  return (
    <section className="card">
      <h2>How this ruling was reached</h2>
      <p className="small muted">Facts computed → advocates argue → fraud check → replies when available → policy rules decide → Hy3 explains.</p>
      <details className="disclosure"><summary>View all {resolution.agent_log.length} agent log entries</summary>
      <ol className="steps">
        {resolution.agent_log.map((entry) => (
          <li key={entry.step} className={`step ${entry.agent}`}>
            <span className="step-num">{entry.step}</span>
            <div>
              <strong>{AGENT_LABELS[entry.agent] ?? entry.agent}</strong>
              <p className="small muted">{entry.message}</p>
            </div>
          </li>
        ))}
      </ol>
      </details>
    </section>
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

// Reuses the risk badge colours: safety red, high amber, standard and low neutral.
const TRIAGE_BADGE: Record<TriageTier, RiskLevel> = { safety: "high", high: "medium", standard: "low", low: "low" };
const TRIAGE_LABEL: Record<TriageTier, string> = {
  safety: "Safety · review first", high: "High", standard: "Standard", low: "Low",
};

function TriagePanel({ triage }: { triage: Resolution["triage"] }) {
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

function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span className={`risk-badge ${level}`}>
      {level.charAt(0).toUpperCase() + level.slice(1)}
    </span>
  );
}

function RulingPanel({ resolution }: { resolution: Resolution }) {
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

      <p className="action">{resolution.recommended_action}</p>
      <p>{resolution.explanation}</p>

      <h3 className="section-label">Policy applied</h3>
      <ul className="small">
        {resolution.policy_refs.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>

      <h3 className="section-label">Evidence considered</h3>
      <EvidenceList texts={resolution.judge_evidence} />
    </section>
  );
}

function LoadingPanel({ disputeId }: { disputeId: string }) {
  return <section className="card loading-state" aria-labelledby="loading-title">
    <div className="card-head"><h2 id="loading-title" tabIndex={-1}>Agents working · {disputeId}</h2><span className="spinner" role="progressbar" aria-label="Waiting for the complete agent result" /></div>
    <p>About 10–15 seconds. The server returns one complete result; individual step progress is not available.</p>
    <ol className="pending-steps"><li>Evidence loader</li><li>Rider &amp; Driver advocates</li><li>Fraud detector</li><li>Rebuttal round</li><li>Judge: policy ruling &amp; explanation</li></ol>
    <p className="small muted">These are the stages of a resolve, not live progress. Any previous saved result remains below.</p>
  </section>;
}

function TypeIcon({ type }: { type: DisputeCase["type"] }) {
  return <svg className="type-icon" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" focusable="false">
    {type === "route_deviation"
      ? <><circle cx="4" cy="4" r="2" /><circle cx="16" cy="16" r="2" /><path d="M6 4h6a4 4 0 0 1 0 8H8a4 4 0 0 0-4 4h10" /></>
      : <><circle cx="10" cy="10" r="7" /><path d="M10 5v5l3 2" /></>}
  </svg>;
}
