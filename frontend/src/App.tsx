import { useEffect, useState } from "react";

import { DisputeForm } from "./DisputeForm";
import { getSamples, resolveDispute } from "./services/api";
import type { AgentCase, Decision, DisputeCase, PartyHistory, Resolution, RiskLevel } from "./types";

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

export default function App() {
  const [samples, setSamples] = useState<DisputeCase[]>([]);
  // Disputes the judge typed in; resolved with their access code.
  const [own, setOwn] = useState<DisputeCase[]>([]);
  const [form, setForm] = useState<{ template?: DisputeCase } | null>(null);
  const [accessCode, setAccessCode] = useState(loadAccessCode);
  const [selected, setSelected] = useState<DisputeCase | null>(null);
  // Results are kept per dispute so revisiting a case doesn't call the LLM again.
  const [results, setResults] = useState<Record<string, Resolution>>({});
  const [resolving, setResolving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Loading the samples is free; the agents (and LLM tokens) only run on "Resolve".
  useEffect(() => {
    getSamples()
      .then((cases) => {
        setSamples(cases);
        if (cases.length) setSelected(cases[0]);
      })
      .catch(() => setError("Can't reach the backend. Start it with: cd backend && uvicorn app.main:app --reload"));
  }, []);

  function select(dispute: DisputeCase) {
    setSelected(dispute);
    setForm(null);
    setError(null);
  }

  function addOwn(dispute: DisputeCase) {
    setOwn((prev) => [dispute, ...prev]);
    select(dispute);
  }

  function changeAccessCode(code: string) {
    setAccessCode(code);
    saveAccessCode(code.trim());
  }

  function resolve(dispute: DisputeCase) {
    setError(null);
    setResolving(dispute.dispute_id);
    // Samples never send the code: they are served from the server's cache and
    // don't use up the judge's quota.
    const isOwn = own.some((d) => d.dispute_id === dispute.dispute_id);
    resolveDispute(dispute, isOwn ? accessCode.trim() || undefined : undefined)
      .then((r) => setResults((prev) => ({ ...prev, [dispute.dispute_id]: r })))
      .catch((e: Error) => setError(e.message))
      .finally(() => setResolving(null));
  }

  const resolution = selected ? results[selected.dispute_id] : undefined;

  const disputeButton = (d: DisputeCase) => (
    <button
      key={d.dispute_id}
      className={`dispute-item ${!form && selected?.dispute_id === d.dispute_id ? "active" : ""}`}
      onClick={() => select(d)}
    >
      <span className="dispute-meta">
        {d.dispute_id} · {TYPE_LABELS[d.type]}
      </span>
      <span className="dispute-claim">{d.rider_claim}</span>
      {results[d.dispute_id] && (
        <span className="dispute-done">{DECISION_LABELS[results[d.dispute_id].decision]}</span>
      )}
    </button>
  );

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="brand">TriVerity</h1>
        <span className="muted">Multi-agent dispute resolution for Ryde</span>
        <div className="topbar-right">
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
          {own.length > 0 && (
            <>
              <h2 className="section-label">Your disputes</h2>
              {own.map(disputeButton)}
            </>
          )}
          <h2 className="section-label">Sample disputes</h2>
          {samples.map(disputeButton)}
        </nav>

        <main className="content">
          {error && <div className="error">{error}</div>}
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
                Uses real AI tokens (~3–4k per run)
              </span>
              {resolution && <span className="small muted">Showing the saved result.</span>}
              <button className="secondary-button" onClick={() => { setForm({ template: selected }); setError(null); }}>
                Edit as new dispute
              </button>
            </div>
          )}
          {!form && resolution && (
            <>
              <Workflow resolution={resolution} />
              <RulingPanel resolution={resolution} />
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
  if (trip.expected_distance_km != null)
    facts.push(["Distance", `${trip.expected_distance_km} km expected → ${trip.actual_distance_km ?? "?"} km actual`]);
  if (trip.expected_duration_min != null)
    facts.push(["Duration", `${trip.expected_duration_min} min expected → ${trip.actual_duration_min ?? "?"} min actual`]);
  if (fare.expected != null) facts.push(["Fare", `${money(fare.expected)} expected → ${money(fare.actual)} charged`]);
  if (fare.cancellation_fee != null) facts.push(["No-show fee", money(fare.cancellation_fee)]);
  if (trip.driver_wait_min != null) facts.push(["Driver waited", `${trip.driver_wait_min} min`]);
  if (fare.surge_multiplier != null && fare.surge_multiplier > 1) facts.push(["Surge", `x${fare.surge_multiplier}`]);
  if (fare.promo_code) facts.push(["Promo", `${fare.promo_code} (${money(fare.promo_discount)} off)`]);

  return (
    <section className="card">
      <div className="card-head">
        <h2>
          {dispute.dispute_id} <span className="tag">{TYPE_LABELS[dispute.type]}</span>
        </h2>
      </div>
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
      <h2 className="section-label">Agent workflow</h2>
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
      {resolution.risk.signals.length > 0 && <RiskPanel risk={resolution.risk} />}
      <div className="advocates">
        <AdvocateCard title="Rider advocate" side="rider" agentCase={resolution.rider_case} />
        <AdvocateCard title="Driver advocate" side="driver" agentCase={resolution.driver_case} />
      </div>
    </section>
  );
}

function RiskPanel({ risk }: { risk: Resolution["risk"] }) {
  return (
    <div className="risk-panel">
      <h3 className="section-label">Fraud & bad-faith risk</h3>
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

function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span className={`risk-badge ${level}`}>
      {level.charAt(0).toUpperCase() + level.slice(1)}
    </span>
  );
}

function AdvocateCard({ title, side, agentCase }: { title: string; side: string; agentCase: AgentCase }) {
  return (
    <div className={`advocate ${side}`}>
      <h3>
        {title}
        <span className={`source-badge ${agentCase.source}`}>
          {agentCase.source === "llm" ? "AI" : "Fallback"}
        </span>
      </h3>
      <p>{agentCase.summary}</p>
      <h4 className="section-label">Evidence</h4>
      <ul className="small">
        {agentCase.evidence.map((e, i) => (
          <li key={i}>{e}</li>
        ))}
      </ul>
      <h4 className="section-label">Policy cited</h4>
      {agentCase.policy_refs.length ? (
        <ul className="small">
          {agentCase.policy_refs.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : (
        <p className="small muted">None yet</p>
      )}
    </div>
  );
}

function RulingPanel({ resolution }: { resolution: Resolution }) {
  const pct = Math.round(resolution.confidence * 100);
  return (
    <section className={`card ruling ${resolution.decision}`}>
      <div className="card-head">
        <h2>
          Judge's ruling
          <span className={`source-badge ${resolution.explanation_source}`}>
            {resolution.explanation_source === "llm" ? "AI" : "Fallback"}
          </span>
        </h2>
        <span className="decision">{DECISION_LABELS[resolution.decision]}</span>
      </div>

      <div className="confidence">
        <span className="small muted">Confidence</span>
        <div className="meter" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${pct}%` }} />
        </div>
        <strong>{pct}%</strong>
      </div>

      <p className="action">{resolution.recommended_action}</p>
      <p>{resolution.explanation}</p>

      <div className="party-messages">
        <div>
          <h4 className="section-label">To the rider</h4>
          <p className="small">{resolution.rider_explanation}</p>
        </div>
        <div>
          <h4 className="section-label">To the driver</h4>
          <p className="small">{resolution.driver_explanation}</p>
        </div>
      </div>

      <h4 className="section-label">Policy applied</h4>
      <ul className="small">
        {resolution.policy_refs.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>

      <h4 className="section-label">Evidence considered</h4>
      <ul className="small">
        {resolution.judge_evidence.map((e, i) => (
          <li key={i}>{e}</li>
        ))}
      </ul>
    </section>
  );
}

function money(value: number | null | undefined) {
  return value == null ? "?" : `$${value.toFixed(2)}`;
}
