import { useEffect, useMemo, useState } from "react";

import { LiveProgress, ProgressAnnouncements } from "./LiveProgress";
import { CollectorCalls } from "./CollectorCalls";
import { AgentsStrip } from "./AgentsStrip";
import { WorkflowTabs } from "./WorkflowTabs";
import { savedTab, type WorkflowTab } from "./workflow";
import { FactLibrary } from "./FactLibrary";
import { headerChips, statusPill } from "./stepVisuals";
import { CaseComparison } from "./CaseComparison";
import { Debate } from "./Debate";
import { EvidenceList, EvidenceText, type FactLinks } from "./EvidenceList";
import { VerdictSummary } from "./VerdictSummary";
import { computedFacts, disputeLabel, filterDisputes, money } from "./presentation";
import { focusSection, selectSample } from "./routes";
import { AppealsPanel } from "./Appeals";
import { ReviewerDecision } from "./ReviewerDecision";
import { AiToggle } from "./AiToggle";
import { readAiMode, writeAiMode, type AiMode } from "./aiMode";
import { NewDisputeIcon, SidebarToggle } from "./SidebarToggle";
import { readSidebarOpen, writeSidebarOpen } from "./sidebar";
import { Term } from "./Term";
import { ThemeToggle } from "./ThemeToggle";
import type { Theme } from "./theme";
import { PartyPreview } from "./PartyPreview";
import { DisputeForm } from "./DisputeForm";
import { getSamples, resolveDisputeLive } from "./services/api";
import { decisionTone, disputeItemName, filterLabel, filterShortLabel, STATUS_LABELS, TYPE_LABELS, type DisputeFilter } from "./disputeList";
import { FilterMenu } from "./FilterMenu";
import type { AgentLogEntry, ArgumentReview, Counterfactual, Decision, DisputeCase, PartyHistory, PrecedentReport, Resolution, RiskLevel, Triage, TriageTier } from "./types";

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

export default function App({ active, sampleId, presentation, onTogglePresentation, theme, onToggleTheme }: {
  active: boolean; sampleId?: string; presentation: boolean; onTogglePresentation: () => void;
  theme: Theme; onToggleTheme: () => void;
}) {
  const [filter, setFilter] = useState<DisputeFilter>("all");
  const [aiMode, setAiMode] = useState<AiMode>(() => readAiMode(localStorage));
  const [sidebarOpen, setSidebarOpen] = useState(() => readSidebarOpen(localStorage));
  function toggleSidebar() {
    setSidebarOpen(open => { writeSidebarOpen(localStorage, !open); return !open; });
  }
  useEffect(() => {
    // Ctrl/Cmd+Shift+S, as in chat apps; ignored while typing in a field.
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        toggleSidebar();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  function toggleAi() {
    const next: AiMode = aiMode === "live" ? "offline" : "live";
    setAiMode(next);
    writeAiMode(localStorage, next);
  }
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
  const [liveSteps, setLiveSteps] = useState<AgentLogEntry[]>([]);
  const [runStartedAt, setRunStartedAt] = useState(0);
  const [streaming, setStreaming] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);
  const [completedId, setCompletedId] = useState<string | null>(null);
  const [loadingSamples, setLoadingSamples] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumped when an appeal is filed or decided, so the reviewer's appeal list reloads.
  const [appealsVersion, setAppealsVersion] = useState(0);

  // Loading the samples is free; the agents (and LLM tokens) only run on "Resolve".
  useEffect(() => {
    getSamples()
      .then(setSamples)
      .catch(() => setError("Can’t load disputes. Check your connection and reload the page."))
      .finally(() => setLoadingSamples(false));
  }, []);

  useEffect(() => {
    if (active && samples.length) {
      setSelected(selectSample(samples, sampleId));
      setForm(null);
      setActiveFact(null);
    }
  }, [active, samples, sampleId]);

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
    setLiveSteps([]);
    setRunStartedAt(performance.now());
    setStreaming(true);
    // Samples never send the code: they are served from the server's cache and
    // don't use up the judge's quota.
    const isOwn = own.some((d) => d.dispute_id === dispute.dispute_id);
    resolveDisputeLive(dispute, entry => {
      setLiveSteps(previous => previous.some(item => item.step === entry.step) ? previous : [...previous, entry]);
    }, () => setStreaming(false), isOwn ? accessCode.trim() || undefined : undefined, aiMode)
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

  useEffect(() => {
    if (active && !form && resolving === selected?.dispute_id) {
      const heading = document.getElementById("loading-title");
      heading?.scrollIntoView({ block: "start" });
      heading?.focus({ preventScroll: true });
    }
  }, [active, resolving, selected?.dispute_id, form]);

  useEffect(() => {
    if (!completedId) return;
    if (active && !form && completedId === selected?.dispute_id) {
      const summary = document.querySelector<HTMLButtonElement>('[data-workflow-tab="evidence"]');
      summary?.scrollIntoView({ block: "nearest" });
      summary?.focus({ preventScroll: true });
    }
    setCompletedId(null);
  }, [active, completedId, selected, form]);

  const disputeButton = (d: DisputeCase) => {
    const current = !form && selected?.dispute_id === d.dispute_id;
    const summary = disputeLabel(d);
    const decision = results[d.dispute_id]?.decision;
    return <li key={d.dispute_id}>
      <button type="button" className={`dispute-item${current ? " active" : ""}`} aria-current={current ? "true" : undefined}
        aria-label={disputeItemName(d, summary, decision)} title={summary} onClick={() => select(d)}>
        <span className="dispute-line"><TypeIcon type={d.type} /><span className="dispute-label">{summary}</span></span>
        <span className="dispute-sub">
          <span className="dispute-id">{d.dispute_id}</span>
          {decision && <span className={`dispute-status ${decisionTone(decision)}`}><span className="status-dot" aria-hidden="true" />{STATUS_LABELS[decision]}</span>}
        </span>
      </button>
    </li>;
  };
  const newDispute = () => { setForm({}); setError(null); };
  const ownShown = filterDisputes(own, filter), samplesShown = filterDisputes(samples, filter);
  const showGroups = ownShown.length > 0 && samplesShown.length > 0;

  return (
    <div className={`app${presentation ? " presentation-mode" : ""}`}>
      <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); focusSection("main-content"); }}>Skip to dispute</a>
      <header className="topbar">
        <h1 className="brand"><a className="console-home" href="#/">TriVerity<span className="sr-only"> home</span></a></h1>
        <span className="muted byline">By OeroAI</span>
        <div className="topbar-right">
          <AiToggle mode={aiMode} onToggle={toggleAi} />
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button type="button" className="secondary-button presentation-toggle" aria-pressed={presentation} onClick={onTogglePresentation}>Presentation mode</button>
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

      <div className={`layout${sidebarOpen ? "" : " sidebar-collapsed"}`}>
        <nav className="sidebar" aria-label="Disputes">
          <div className="sidebar-head">
            <SidebarToggle open={sidebarOpen} onToggle={toggleSidebar} />
            {sidebarOpen
              ? <div className="sidebar-actions">
                  <FilterMenu value={filter} onChange={setFilter} />
                  <button type="button" className="new-button" aria-label="New dispute" title="New dispute" onClick={newDispute}>
                    <NewDisputeIcon /><span aria-hidden="true">New</span>
                  </button>
                </div>
              : <button type="button" className="icon-button" aria-label="New dispute" title="New dispute" onClick={newDispute}>
                  <NewDisputeIcon />
                </button>}
          </div>
          {!sidebarOpen && selected && <span className="sidebar-current" title={`Open: ${selected.dispute_id}`}>{selected.dispute_id}</span>}
          <div className="sidebar-body" id="dispute-list" hidden={!sidebarOpen}>
          {filter !== "all" && <button type="button" className="filter-chip" aria-label={`Clear filter: ${filterLabel(filter)}`} onClick={() => setFilter("all")}>
            {filterShortLabel(filter)}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M7 7l10 10M17 7 7 17" /></svg>
          </button>}
          {selected && filter !== "all" && selected.type !== filter && <p className="sidebar-note">The selected case is outside this filter.</p>}
          {!loadingSamples && !ownShown.length && !samplesShown.length && <p className="sidebar-note">No disputes match this filter.</p>}
          {/* Group labels only when both groups have visible items; otherwise one label would stand alone. */}
          {showGroups && <h2 className="sidebar-group">Yours</h2>}
          {ownShown.length > 0 && <ul className="dispute-list">{ownShown.map(disputeButton)}</ul>}
          {showGroups && <h2 className="sidebar-group">Samples</h2>}
          {samplesShown.length > 0 && <ul className="dispute-list">{samplesShown.map(disputeButton)}</ul>}
          </div>
        </nav>

        <main className="content" id="main-content" tabIndex={-1}>
          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {loadingSamples ? "Loading sample disputes…" : resolving ? `Agents working on ${resolving}.` : resolution ? "Saved ruling ready." : ""}
          </p>
          <ProgressAnnouncements steps={liveSteps} />
          <div role="alert" aria-atomic="true">{error && <p className="error">{error}</p>}</div>
          {!form && loadingSamples && <section className="card empty-state"><h2>Loading disputes…</h2><p className="muted">The sample list is loading. No agents have run.</p></section>}
          {!form && !loadingSamples && !selected && <section className="card empty-state"><h2>No dispute selected</h2><p className="muted">Choose a sample or add a new dispute to begin.</p></section>}
          {!form && resolving && resolving !== selected?.dispute_id && <p className="small muted">Agents are working on {resolving}. This case remains available.</p>}
          {form && <DisputeForm key={form.template?.dispute_id ?? "blank"} template={form.template} onSubmit={addOwn} onCancel={() => setForm(null)} />}
          {!form && selected && <section className="case-file" aria-labelledby="case-title">
            <CaseHeader dispute={selected} resolution={resolution} busy={resolving === selected.dispute_id} streaming={streaming} />
            <WorkflowTabs active={activeTab} resolution={resolution} busy={resolving === selected.dispute_id}
              liveSteps={resolving === selected.dispute_id ? liveSteps : undefined} onChange={changeTab}
              render={tab => resolving === selected.dispute_id ? <LiveProgress disputeId={selected.dispute_id} steps={liveSteps} startedAt={runStartedAt} streaming={streaming} /> : <>
                <AgentsStrip tab={tab} resolution={resolution} availableIds={factIds} onSelectFact={selectFact} />
                {tab === "intake" && <>
                  <CasePanel dispute={selected} availableIds={factIds} onSelectFact={selectFact} />
                  <div className="run-bar">
                    <button className="run-button" onClick={() => resolve(selected)} disabled={resolving !== null}>
                      {resolution ? "Re-run agents" : "Run agents"}
                    </button>
                    <span className={`token-warning${aiMode === "offline" ? " offline" : ""}`} role="note">{aiMode === "live"
                      ? "AI live: uses real tokens (about $0.002 per run)"
                      : "AI offline: free, same ruling; arguments and explanations use template text"}</span>
                    <button className="secondary-button" onClick={() => { setForm({ template: selected }); setError(null); }}>Edit as new dispute</button>
                  </div>
                  {resolution && <p className="small muted">This case has a saved result. Re-running uses tokens again.</p>}
                </>}
                {tab === "evidence" && resolution && <><FactLibrary facts={facts} activeId={activeFact} request={factRequest} expanded grouped onSelectFact={selectFact} /><CollectorCalls collection={resolution.evidence_collection} /></>}
                {tab === "hearing" && resolution && <Debate resolution={resolution} availableIds={factIds} onSelectFact={selectFact} />}
                {tab === "ruling" && resolution && <>
                  <VerdictSummary resolution={resolution} disputeId={selected.dispute_id} />
                  <ReviewerDecision key={`${selected.dispute_id}-${resolution.agent_log[0]?.started_at ?? ""}`} dispute={selected} resolution={resolution} />
                  <AppealsPanel disputeId={selected.dispute_id} version={appealsVersion} onChanged={() => setAppealsVersion(v => v + 1)} />
                  <RulingSection title="Reasoning" hint="The Judge's explanation, policy and evidence" open>
                    <RulingPanel resolution={resolution} availableIds={factIds} onSelectFact={selectFact} />
                  </RulingSection>
                  {(resolution.argument_review?.length || resolution.counterfactuals?.length) ? <RulingSection title="How the Judge weighed each side" hint="Cited rules checked against the facts, and what would change the ruling">
                    {resolution.argument_review && resolution.argument_review.length > 0 && <section className="card"><ArgumentReviewPanel reviews={resolution.argument_review} /></section>}
                    {resolution.counterfactuals && resolution.counterfactuals.length > 0 && <section className="card"><CounterfactualPanel items={resolution.counterfactuals} /></section>}
                  </RulingSection> : null}
                  {(resolution.precedents || resolution.triage) && <RulingSection title="Precedents and review priority" hint="Similar past rulings, and where this sits in the review queue">
                    {resolution.precedents && <section className="card"><PrecedentPanel report={resolution.precedents} /></section>}
                    {resolution.triage && <section className="card"><TriagePanel triage={resolution.triage} /></section>}
                  </RulingSection>}
                  <RulingSection title="Internal risk" hint="Bad-faith signals; never shown to the rider or driver">
                    <section className="card"><RiskPanel risk={resolution.risk} /></section>
                  </RulingSection>
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

function CaseHeader({ dispute, resolution, busy, streaming }: { dispute: DisputeCase; resolution?: Resolution; busy: boolean; streaming: boolean }) {
  const chips = headerChips(dispute, resolution);
  const status = statusPill({ busy, streaming, hasResult: !!resolution });
  return <header className="case-file-head">
    <div className="case-file-title">
      <p className="eyebrow">Dispute file</p>
      <h2 id="case-title">{dispute.dispute_id} <span className="tag">{TYPE_LABELS[dispute.type]}</span></h2>
      {chips.length > 0 && <ul className="case-chips" aria-label="Case summary">
        {chips.map(chip => <li key={chip.key} className={`case-chip ${chip.tone}`}>{chip.label}</li>)}
      </ul>}
    </div>
    <span className={`case-save-status status-pill ${status.tone}${status.pulse ? " pulse" : ""}`} title={status.detail}>
      <span className="status-dot" aria-hidden="true" />{status.label}
      {status.detail !== status.label && <span className="sr-only"> ({status.detail})</span>}
    </span>
  </header>;
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
      <div><p className="eyebrow">Internal review only</p><h2><Term term="triage">Review priority</Term></h2></div>
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
                    <strong><Term rule={check.rule} /></strong>{" "}
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

/** A collapsible group in the Ruling tab: essentials first, detail on demand. */
function RulingSection({ title, hint, open = false, children }: { title: string; hint: string; open?: boolean; children: React.ReactNode }) {
  return <details className="ruling-section" open={open}>
    <summary><span className="ruling-section-title">{title}</span><span className="small muted">{hint}</span></summary>
    <div className="ruling-section-body">{children}</div>
  </details>;
}

function CounterfactualPanel({ items }: { items: Counterfactual[] }) {
  return (
    <div className="risk-panel">
      <div><p className="eyebrow">Internal review only · computed from the policy</p><h2>What would change this ruling</h2></div>
      <ul className="small counterfactual-list">
        {items.map((cf, i) => (
          <li key={i}>
            If {cf.change}, the outcome would be <strong>{cf.outcome}</strong>
            {cf.rules.length > 0 && <span className="muted"> ({cf.rules.map((r, j) => <span key={r}>{j > 0 && ", "}<Term rule={r} /></span>)})</span>}.
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
      <div><p className="eyebrow">Internal review only · Policy &amp; Precedent agent</p><h2>Similar past rulings <Term term="precedent">(precedents)</Term></h2></div>
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

function TypeIcon({ type }: { type: DisputeCase["type"] }) {
  return <svg className="type-icon" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" focusable="false">
    {type === "route_deviation"
      ? <><circle cx="4" cy="4" r="2" /><circle cx="16" cy="16" r="2" /><path d="M6 4h6a4 4 0 0 1 0 8H8a4 4 0 0 0-4 4h10" /></>
      : <><circle cx="10" cy="10" r="7" /><path d="M10 5v5l3 2" /></>}
  </svg>;
}
