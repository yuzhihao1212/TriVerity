import { useEffect, useState } from "react";

import { getSamples, resolveDispute } from "./services/api";
import type { AgentCase, Decision, DisputeCase, PartyHistory, Resolution } from "./types";

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
  judge: "Judge",
};

export default function App() {
  const [samples, setSamples] = useState<DisputeCase[]>([]);
  const [selected, setSelected] = useState<DisputeCase | null>(null);
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSamples()
      .then((cases) => {
        setSamples(cases);
        if (cases.length) select(cases[0]);
      })
      .catch(() => setError("Can't reach the backend. Start it with: cd backend && uvicorn app.main:app --reload"));
  }, []);

  function select(dispute: DisputeCase) {
    setSelected(dispute);
    setResolution(null);
    setError(null);
    setLoading(true);
    resolveDispute(dispute)
      .then(setResolution)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="brand">TriVerity</h1>
        <span className="muted">Multi-agent dispute resolution for Ryde</span>
        <span className="pill">Demo</span>
      </header>

      <div className="layout">
        <nav className="sidebar" aria-label="Sample disputes">
          <h2 className="section-label">Sample disputes</h2>
          {samples.map((d) => (
            <button
              key={d.dispute_id}
              className={`dispute-item ${selected?.dispute_id === d.dispute_id ? "active" : ""}`}
              onClick={() => select(d)}
            >
              <span className="dispute-meta">
                {d.dispute_id} · {TYPE_LABELS[d.type]}
              </span>
              <span className="dispute-claim">{d.rider_claim}</span>
            </button>
          ))}
        </nav>

        <main className="content">
          {error && <div className="error">{error}</div>}
          {selected && <CasePanel dispute={selected} />}
          {loading && <p className="muted">Resolving…</p>}
          {resolution && (
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
      <div className="advocates">
        <AdvocateCard title="Rider advocate" side="rider" agentCase={resolution.rider_case} />
        <AdvocateCard title="Driver advocate" side="driver" agentCase={resolution.driver_case} />
      </div>
    </section>
  );
}

function AdvocateCard({ title, side, agentCase }: { title: string; side: string; agentCase: AgentCase }) {
  return (
    <div className={`advocate ${side}`}>
      <h3>{title}</h3>
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
        <h2>Judge's ruling</h2>
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
