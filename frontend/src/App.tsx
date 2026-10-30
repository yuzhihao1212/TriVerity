import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { LiveProgress, ProgressAnnouncements } from "./LiveProgress";
import type { FinishedTimes } from "./progressEstimate";
import { CollectorCalls } from "./CollectorCalls";
import { AgentsStrip } from "./AgentsStrip";
import { WorkflowTabs } from "./WorkflowTabs";
import { savedTab, type WorkflowTab } from "./workflow";
import { FactLibrary } from "./FactLibrary";
import { AGENT_ICONS, statusPill, type FinalHeaderOutcome } from "./stepVisuals";
import { createReviewStore, openCounts, reviewKey, reviewSummary, reviewedSteps, REOPENED_STEPS, type ReviewSummary } from "./reviewProgress";
import { CaseBrief } from "./CaseBriefCard";
import { caseHeadline, headerFinalOutcome } from "./caseBrief";
import { RunCost } from "./RunCost";
import { CaseComparison } from "./CaseComparison";
import { Debate } from "./Debate";
import { EvidenceText, type FactLinks } from "./EvidenceList";
import { RulingChecks } from "./RulingChecks";
import { VerdictSummary } from "./VerdictSummary";
import { computedFacts, disputeLabel, money } from "./presentation";
import { caseHash, focusSection, HOME_HASH, missingCase, reveal, selectSample } from "./routes";
import { allowedActions, caseStatus, pendingAppealIds, sortQueue, STATUS_WORDS, type CaseStatus } from "./caseQueue";
import { nextAfterClose } from "./homeState";
import { Home, type HomeRow } from "./Home";
import { AppealsPanel } from "./Appeals";
import { ClosedCase, ClosedSummary } from "./ClosedCase";
import { DecisionBar, ReviewerDecision, useReviewerDecision } from "./ReviewerDecision";
import { DECISION_LABELS, decisionTone } from "./outcomeTone";
import { Chip } from "./Chip";
import { chipClass, chipTone } from "./chipStyle";
import { Loader3D, OeroMark, useLoaderVisible } from "./OeroAI";
import { savedText } from "./decisionState";
import { AiToggle } from "./AiToggle";
import { readAiMode, writeAiMode, type AiMode } from "./aiMode";
import { CurrentCaseShortcut, SidebarNewButton, SidebarToggle } from "./SidebarToggle";
import { readGroupOpen, writeGroupOpen, readSidebarOpen, writeSidebarOpen } from "./sidebar";
import { PresentationToggle, ThemeToggle } from "./ThemeToggle";
import type { Theme } from "./theme";
import { PartyPreview, sentRecords } from "./PartyPreview";
import { clockText, DELIVERED_ANNOUNCEMENT } from "./notifyState";
import { DisputeForm } from "./DisputeForm";
import { ApiError, getSamples, listAppeals, resolveDisputeLive } from "./services/api";
import { AccessCodeField } from "./AccessCodeField";
import { ACCESS_CODE_FIELD_ID, accessCodeMessage, accessCodeProblem, needsAccessCode } from "./consoleHeader";
import { disputeCategory, groupByCategory, type Category, disputeItemName, filterLabel, filterShortLabel, TYPE_LABELS, type DisputeFilter } from "./disputeList";
import { FilterMenu } from "./FilterMenu";
import { Icon } from "./Icon";
import type { AgentLogEntry, Appeal, Decision, DisputeCase, PartyHistory, Resolution } from "./types";


// The reviewer's progress per ruling, for this browser session (shared by every mount).
let reviewStore: ReturnType<typeof createReviewStore> | null = null;
function reviews() {
  if (!reviewStore) {
    let storage: Storage | null = null;
    try { storage = window.sessionStorage; } catch { /* Blocked storage: memory only. */ }
    reviewStore = createReviewStore(storage);
  }
  return reviewStore;
}

const REVIEWER_CONSOLE_NOTE = "Internal reviewer view: it shows fraud signals and both parties' data, which riders and drivers never see.";

// The judge types their access code; it is kept for this browser tab only and is
// never part of the built bundle.
const ACCESS_CODE_KEY = "triverity.accessCode";
/** A result faster than this came from the cache: there was no run to watch. */
const INSTANT_RESULT_MS = 1500;

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

export default function App({ active, sampleId, navigation = 0, presentation, onTogglePresentation, theme, onToggleTheme }: {
  active: boolean; sampleId?: string; navigation?: number; presentation: boolean; onTogglePresentation: () => void;
  theme: Theme; onToggleTheme: () => void;
}) {
  const [filter, setFilter] = useState<DisputeFilter>("all");
  const [aiMode, setAiMode] = useState<AiMode>(() => readAiMode(localStorage));
  const [sidebarOpen, setSidebarOpen] = useState(() => readSidebarOpen(localStorage));
  const [groupOpen, setGroupOpen] = useState<Record<Category, boolean>>(() => ({
    route: readGroupOpen("route"), "no-show": readGroupOpen("no-show"), other: readGroupOpen("other"),
  }));
  const [revealCurrent, setRevealCurrent] = useState(false);
  const currentCaseButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!sidebarOpen || !revealCurrent) return;
    reveal(currentCaseButton.current, "nearest", { instant: true });
    setRevealCurrent(false);
  }, [sidebarOpen, revealCurrent]);
  function setCategoryOpen(category: Category, open: boolean) {
    setGroupOpen(previous => ({ ...previous, [category]: open }));
    writeGroupOpen(category, open);
  }
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
  const accessCodeInput = useRef<HTMLInputElement>(null);
  const [focusAccessCode, setFocusAccessCode] = useState(false);
  const [selected, setSelected] = useState<DisputeCase | null>(null);
  // Results are kept per dispute so revisiting a case doesn't call the LLM again.
  const [results, setResults] = useState<Record<string, Resolution>>(() => sentRecords().results());
  const [liveSteps, setLiveSteps] = useState<AgentLogEntry[]>([]);
  const [runStartedAt, setRunStartedAt] = useState(0);
  // When each agent's result arrived (seconds after the run started), for the time estimate.
  const [finishedAt, setFinishedAt] = useState<FinishedTimes>({});
  // A finished live run keeps its progress panel, with a completion card, until the reviewer moves on.
  const [completion, setCompletion] = useState<{ id: string; endedAt: number } | null>(null);
  const [streaming, setStreaming] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);
  const [completedId, setCompletedId] = useState<string | null>(null);
  const [loadingSamples, setLoadingSamples] = useState(true);
  const samplesLoader = useLoaderVisible(loadingSamples);
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

  // "#/console" is the reviewer's home (the queue); "#/console/D001" opens that case; an
  // unknown ID shows home with a note. `navigation` re-runs this for a link to the same ID.
  const [missing, setMissing] = useState<string | null>(null);
  useEffect(() => {
    if (active && samples.length) {
      const cases = [...own, ...samples];
      const next = selectSample(cases, sampleId);
      if (next?.dispute_id !== selected?.dispute_id) leaveCase();
      setSelected(next);
      setMissing(missingCase(cases, sampleId));
      setForm(null);
      setActiveFact(null);
    }
  }, [active, samples, sampleId, navigation]);

  function select(dispute: DisputeCase) {
    if (dispute.dispute_id !== selected?.dispute_id) leaveCase();
    setActiveFact(null);
    setSelected(dispute);
    setForm(null);
    setError(null);
    setMissing(null);
    // Keep the address in step (no hashchange), so links to this case and home always work.
    try { window.history.replaceState(null, "", caseHash(dispute.dispute_id)); } catch { /* Sandboxed: the view still changes. */ }
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
    const previous = results[dispute.dispute_id];
    if (previous && sentRecords().get(reviewKey(dispute.dispute_id, previous))) return;
    setError(null);
    setResolving(dispute.dispute_id);
    const started = performance.now();
    setLiveSteps([]);
    setFinishedAt({});
    setCompletion(null);
    setRunStartedAt(started);
    setStreaming(true);
    // Samples never send the code: they are served from the server's cache and
    // don't use up the judge's quota.
    const isOwn = own.some((d) => d.dispute_id === dispute.dispute_id);
    resolveDisputeLive(dispute, entry => {
      setLiveSteps(previous => previous.some(item => item.step === entry.step) ? previous : [...previous, entry]);
      const at = (performance.now() - started) / 1000;
      setFinishedAt(previous => entry.agent in previous ? previous : { ...previous, [entry.agent]: at });
    }, () => setStreaming(false), isOwn ? accessCode.trim() || undefined : undefined, aiMode)
      .then((r) => {
        setActiveFact(null);
        sentRecords().saveResult(dispute.dispute_id, r);
        setResults((prev) => ({ ...prev, [dispute.dispute_id]: r }));
        const ended = performance.now();
        // An instant (cached) result has no run to watch: go straight to Evidence as before.
        // A real run ends on a completion card; the reviewer chooses when to move on.
        if (ended - started < INSTANT_RESULT_MS) {
          setActiveTabs(prev => ({ ...prev, [dispute.dispute_id]: "evidence" }));
          setCompletedId(dispute.dispute_id);
        } else setCompletion({ id: dispute.dispute_id, endedAt: ended });
      })
      .catch((e: Error) => {
        if (accessCodeProblem(e, isOwn)) {
          // Point at the field (shown above Run agents for own disputes) and move focus to it.
          setError(`${dispute.dispute_id}: ${accessCodeMessage((e as ApiError).status)}`);
          setFocusAccessCode(true);
        } else setError(`${dispute.dispute_id}: ${e.message}`);
      })
      .finally(() => setResolving(null));
  }

  const resolution = selected ? results[selected.dispute_id] : undefined;
  const facts = useMemo(() => resolution ? computedFacts(resolution) : [], [resolution]);
  const factIds = useMemo(() => new Set(facts.flatMap(fact => fact.id ? [fact.id] : [])), [facts]);

  const activeTab = savedTab(selected ? activeTabs[selected.dispute_id] : undefined, !!resolution);

  // Reviewer progress. A step counts once the reviewer has been on it: marked when they
  // navigate to it or move on from it (the automatic switch to Evidence after a run is
  // not the reviewer's own visit until they move on). Ruling and Notify need real actions.
  const [sentVersion, setSentVersion] = useState(0);
  const [reviewVersion, setReviewVersion] = useState(0);
  const [decisionsUnavailable, setDecisionsUnavailable] = useState(false);
  const reviewId = selected && resolution ? reviewKey(selected.dispute_id, resolution) : null;
  const sent = reviewId ? sentRecords().get(reviewId) : null;
  const latestSent = reviewId ? sentRecords().latest(reviewId) : null;
  const reopened = !!reviewId && sentRecords().reopened(reviewId);
  const closed = !!sent;
  useEffect(() => {
    // Older closed cases have no known start: never start a timer after the send.
    if (active && !form && reviewId && !sent) reviews().markOpened(reviewId, Date.now());
  }, [active, form, reviewId, sent]);
  const reviewed = useMemo(() => reviewedSteps(reviewId ? reviews().get(reviewId) : [], closed),
    [reviewId, reviewVersion, closed]);
  const progress: ReviewSummary | null = resolution ? reviewSummary(reviewed) : null;
  function markReviewed(tab: WorkflowTab) {
    if (reviewId && reviews().add(reviewId, tab)) setReviewVersion(v => v + 1);
  }
  function visit(...tabs: WorkflowTab[]) {
    if (resolving === selected?.dispute_id) return; // Mid-run, the panels show live progress.
    for (const tab of tabs) if (openCounts(tab, { decisionsUnavailable })) markReviewed(tab);
  }

  /** Moving to another case counts as moving on from the step being viewed. */
  function leaveCase() { visit(activeTab); }
  function onDecisionsUnavailable() {
    // Recording is off (public demo): opening Ruling is all the reviewer can do, so it counts.
    setDecisionsUnavailable(true);
    markReviewed("ruling");
  }

  // One decision state for the sticky bar and the "Your decision" card, per ruling.
  const decision = useReviewerDecision({ runKey: reviewId, dispute: selected, resolution,
    onDecided: () => markReviewed("ruling"), onUnavailable: onDecisionsUnavailable, locked: closed });

  // One status per case, the same wording on the home page and in the sidebar.
  const [appeals, setAppeals] = useState<Appeal[] | null>(null);
  const waitingIds = useMemo(() => pendingAppealIds(appeals), [appeals]);
  const actions = allowedActions(closed ? "closed" : reopened ? "reopened" : "ready", closed);
  // Announced once through the polite status region when the phones switch to delivered.
  const [deliveredFor, setDeliveredFor] = useState<string | null>(null);
  const allCases = useMemo(() => [...own, ...samples], [own, samples]);
  const queueRows: HomeRow[] = useMemo(() => allCases.map(d => {
    const result = results[d.dispute_id];
    const key = result ? reviewKey(d.dispute_id, result) : null;
    const saved = decision.savedFor(key);
    const status: CaseStatus = caseStatus(result, !!saved, !!(key && sentRecords().get(key)), { reopened: !!key && sentRecords().reopened(key), appealWaiting: waitingIds.has(d.dispute_id) });
    // The outcome dot follows the final decision: an override replaces the ruling's outcome.
    return { id: d.dispute_id, dispute: d, status, tier: result?.triage?.tier ?? null, decision: saved?.decision ?? (key ? sentRecords().latest(key)?.decision : null) ?? result?.decision ?? null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [allCases, results, decision.savedFor, sentVersion, waitingIds]);
  const statusOf = (id: string) => queueRows.find(row => row.id === id)?.status ?? "not_run";
  const following = selected ? nextAfterClose(queueRows, selected.dispute_id) : null;
  const goToFollowing = () => { window.location.hash = following ? caseHash(following.row.id) : HOME_HASH; };

  // One appeal list feeds the queue and case banner; unavailable (403) shows neither.
  const onHome = active && !form && !selected && !loadingSamples;
  useEffect(() => {
    if (!active) return;
    let live = true;
    listAppeals().then(list => { if (live) setAppeals(list); })
      .catch(() => { if (live) setAppeals(null); });
    return () => { live = false; };
  }, [active, selected?.dispute_id, appealsVersion]);

  function reopenCase() {
    if (!reviewId || !selected || !sentRecords().reopen(reviewId, clockText(new Date()), new Date().toISOString())) return;
    decision.reopen();
    reviews().set(reviewId, REOPENED_STEPS);
    setReviewVersion(v => v + 1);
    setSentVersion(v => v + 1);
    setDeliveredFor(null);
    setActiveTabs(prev => ({ ...prev, [selected.dispute_id]: "ruling" }));
    requestAnimationFrame(() => reveal(document.querySelector<HTMLButtonElement>('[data-workflow-tab="ruling"]'), "nearest"));
  }

  function changeTab(tab: WorkflowTab) {
    if (!selected) return;
    setCompletion(null);
    visit(activeTab, tab);
    setActiveFact(null);
    setActiveTabs(prev => ({ ...prev, [selected.dispute_id]: tab }));
  }

  // The completion card belongs to the case that ran; another case shows its own steps.
  useEffect(() => {
    if (completion && completion.id !== selected?.dispute_id) setCompletion(null);
  }, [completion, selected?.dispute_id]);

  function selectFact(id: string) {
    if (!factIds.has(id)) return;
    visit(activeTab, "evidence");
    if (selected) setActiveTabs(prev => ({ ...prev, [selected.dispute_id]: "evidence" }));
    setActiveFact(id);
    setFactRequest(value => value + 1);
  }

  useEffect(() => {
    if (active && !form && resolving === selected?.dispute_id) {
      reveal(document.getElementById("loading-title"));
    }
  }, [active, resolving, selected?.dispute_id, form]);

  useEffect(() => {
    if (!completedId) return;
    if (active && !form && completedId === selected?.dispute_id) {
      reveal(document.querySelector<HTMLButtonElement>('[data-workflow-tab="evidence"]'), "nearest");
    }
    setCompletedId(null);
  }, [active, completedId, selected, form]);

  // A run refused for its access code: once the run panel is back, focus the field.
  useEffect(() => {
    if (!focusAccessCode || resolving) return;
    setFocusAccessCode(false);
    reveal(accessCodeInput.current, "center");
  }, [focusAccessCode, resolving]);

  const disputeButton = (d: DisputeCase) => {
    const current = !form && selected?.dispute_id === d.dispute_id;
    const summary = disputeLabel(d);
    const decision = results[d.dispute_id]?.decision;
    const status = statusOf(d.dispute_id);
    return <li key={d.dispute_id}>
      <button type="button" className={`dispute-item${current ? " active" : ""}`} ref={current ? currentCaseButton : undefined} aria-current={current ? "true" : undefined}
        aria-label={`${disputeItemName(d, summary, decision)}${status !== "not_run" ? `. Status: ${STATUS_WORDS[status]}` : ""}`} title={summary} onClick={() => select(d)}>
        <span className="dispute-line"><span className="dispute-label">{summary}</span></span>
        <span className="dispute-sub">
          <span className="dispute-id">{d.dispute_id}</span>
          {results[d.dispute_id]?.triage?.tier === "safety" && <Chip size="sm" tone="danger">Safety</Chip>}
          {decision && <Chip size="sm" dot tone={status === "appeal_waiting" ? "warn" : status === "closed" ? "ok" : decisionTone(decision)} title={DECISION_LABELS[decision]}>{STATUS_WORDS[status]}</Chip>}
        </span>
      </button>
    </li>;
  };
  const newDispute = () => { setForm({}); setError(null); };
  const sidebarGroups = groupByCategory(sortQueue(queueRows).map(row => row.dispute), filter);
  function openCurrentCase() {
    if (!selected) return;
    select(selected);
    if (filter !== "all" && selected.type !== filter) setFilter("all");
    setCategoryOpen(disputeCategory(selected.type), true);
    writeSidebarOpen(localStorage, true);
    setSidebarOpen(true);
    setRevealCurrent(true);
  }

  return (
    <div className={`app${presentation ? " presentation-mode" : ""}`}>
      <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); focusSection("main-content"); }}>Skip to dispute</a>
      <header className="topbar">
        <div className="topbar-brand">
          <h1 className="brand"><a className="console-home" href="#/">TriVerity<span className="brand-dot" aria-hidden="true">.</span><span className="sr-only"> home</span></a></h1>
          <span className="topbar-context">
            <span className="byline">by <OeroMark /><strong>OeroAI</strong></span>
            {/* The context stays for screen readers; the bar itself shows only the brand. */}
            <span className="sr-only">. Reviewer console. {REVIEWER_CONSOLE_NOTE}</span>
          </span>
        </div>
        <div className="topbar-right">
          <AiToggle mode={aiMode} onToggle={toggleAi} />
          <span className="topbar-tools">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            <PresentationToggle presentation={presentation} onToggle={onTogglePresentation} />
          </span>
        </div>
      </header>

      <div className={`layout${onHome ? " no-sidebar" : sidebarOpen ? "" : " sidebar-collapsed"}`}>
        {/* On the home page the queue is the list, so the sidebar returns only in the case view. */}
        {!onHome && <nav className="sidebar" aria-label="Disputes">
          <div className="sidebar-head">
            <SidebarToggle open={sidebarOpen} onToggle={toggleSidebar} />
            <a className="icon-button home-button" href={HOME_HASH} aria-label="Back to queue" title="Back to queue"><Icon name="home" /></a>
            {sidebarOpen
              ? <div className="sidebar-actions">
                  <FilterMenu value={filter} onChange={setFilter} />
                  <SidebarNewButton onClick={newDispute} />
                </div>
              : <SidebarNewButton onClick={newDispute} />}
          </div>
          {!sidebarOpen && selected && <CurrentCaseShortcut id={selected.dispute_id} summary={disputeLabel(selected)} type={selected.type}
            icon={<TypeIcon type={selected.type} />} onOpen={openCurrentCase} />}
          <div className="sidebar-body" id="dispute-list" hidden={!sidebarOpen}>
          {filter !== "all" && <button type="button" className={chipClass({ tone: "brand", className: "chip-button" })} aria-label={`Clear filter: ${filterLabel(filter)}`} onClick={() => setFilter("all")}>
            {filterShortLabel(filter)}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M7 7l10 10M17 7 7 17" /></svg>
          </button>}
          {selected && filter !== "all" && selected.type !== filter && <p className="sidebar-note">The selected case is outside this filter.</p>}
          {!loadingSamples && !sidebarGroups.length && <p className="sidebar-note">No disputes match this filter.</p>}
          {sidebarGroups.map(group => <section className="sidebar-category" data-open={groupOpen[group.id]} key={group.id} aria-labelledby={`sidebar-group-${group.id}`}>
            <h2 className="sidebar-group">
              <button type="button" id={`sidebar-group-${group.id}`} className={`sidebar-group-button sidebar-category-${group.id}`}
                aria-expanded={groupOpen[group.id]} aria-controls={`sidebar-cases-${group.id}`}
                onClick={() => setCategoryOpen(group.id, !groupOpen[group.id])}>
                <span className="sidebar-group-label">{group.id !== "other" && <TypeIcon type={group.id === "route" ? "route_deviation" : "no_show_charge"} />}{group.label} · {group.count}</span><Icon name="chevron" />
              </button>
            </h2>
            <ul id={`sidebar-cases-${group.id}`} className="dispute-list" hidden={!groupOpen[group.id]}>
              {group.items.map(disputeButton)}
            </ul>
          </section>)}
          </div>
        </nav>}

        <main className="content" id="main-content" tabIndex={-1}>
          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {loadingSamples ? "Loading sample disputes…" : resolving ? `Agents working on ${resolving}.`
              : resolution && deliveredFor === reviewId ? `${DELIVERED_ANNOUNCEMENT}.`
              : resolution ? `Saved ruling ready. ${progress?.text}.${decision.saved ? ` ${savedText(decision.saved)}.` : ""}` : ""}
          </p>
          <ProgressAnnouncements steps={liveSteps} />
          <div role="alert" aria-atomic="true">{error && <p className="error">{error}</p>}</div>
          {!form && (loadingSamples || samplesLoader) && <section className="card empty-state loading-disputes">
            {samplesLoader && <Loader3D size={112} />}
            <div><h2>Loading disputes…</h2><p className="muted">The sample list is loading. No agents have run.</p></div>
          </section>}
          {onHome && <Home rows={queueRows} holds={decision.holds()} appealsWaiting={appeals === null ? null : waitingIds.size} showStart={Object.keys(results).length === 0}
            missing={missing} onDismissMissing={() => setMissing(null)} onNew={newDispute} typeIcon={type => <TypeIcon type={type} />} />}
          {!form && resolving && resolving !== selected?.dispute_id && <p className="small muted">Agents are working on {resolving}. This case remains available.</p>}
          {form && <DisputeForm key={form.template?.dispute_id ?? "blank"} template={form.template} onSubmit={addOwn} onCancel={() => setForm(null)}
            accessCode={accessCode} onAccessCodeChange={changeAccessCode} />}
          {!form && selected && <section className="case-file" aria-labelledby="case-title">
            <nav className="breadcrumb" aria-label="Breadcrumb"><ol>
              <li><a href={HOME_HASH}>Console</a></li>
              <li aria-current="page">{selected.dispute_id}</li>
            </ol></nav>
            {reviewId && <ClosedCase disputeId={selected.dispute_id} sent={sent} latest={latestSent}
              events={sentRecords().events(reviewId)} earlier={sentRecords().earlier(selected.dispute_id, reviewId)}
              appealWaiting={waitingIds.has(selected.dispute_id)} openedAt={reviews().openedAt(reviewId)}
              nextLabel={following?.label ?? "Back to queue"} onNext={goToFollowing} nextPrimary={activeTab !== "notify" || !following} onReopen={reopenCase} />}
            <CaseHeader dispute={selected} resolution={resolution} busy={resolving === selected.dispute_id} streaming={streaming} progress={progress}
              final={resolution ? headerFinalOutcome(resolution, selected, decision.saved, latestSent) : null} />
            <CaseBrief dispute={selected} resolution={resolution} showProposal={reviewed.has("ruling")} />
            <WorkflowTabs active={activeTab} resolution={resolution} busy={resolving === selected.dispute_id}
              closed={closed} decisionRecorded={!!decision.saved}
              unlocking={completion?.id === selected.dispute_id}
              liveSteps={resolving === selected.dispute_id ? liveSteps : undefined} reviewed={reviewed} onChange={changeTab}
              render={tab => resolving === selected.dispute_id || completion?.id === selected.dispute_id
                ? <LiveProgress disputeId={selected.dispute_id} steps={liveSteps} startedAt={runStartedAt} finishedAt={finishedAt}
                  endedAt={completion?.id === selected.dispute_id ? completion.endedAt : null} streaming={streaming}
                  onReviewEvidence={() => changeTab("evidence")} /> : <>
                {/* Outcome first: each step's content, then how it was decided. */}
                {tab === "intake" && <>
                  <CasePanel dispute={selected} availableIds={factIds} onSelectFact={selectFact} />
                  {actions.run && needsAccessCode(selected.dispute_id, own) && <AccessCodeField ref={accessCodeInput} id={ACCESS_CODE_FIELD_ID}
                    value={accessCode} onChange={changeAccessCode} />}
                  {actions.run ? <div className="run-bar case-run-bar">
                    <button className={resolution ? "secondary-button" : "run-button"} onClick={() => resolve(selected)} disabled={resolving !== null}>
                      {resolution ? "Re-run agents" : "Run agents"}
                    </button>
                    <RunCost offline={aiMode === "offline"} hasResult={!!resolution} />
                    <button className="secondary-button" onClick={() => { setForm({ template: selected }); setError(null); }}>Edit as new dispute</button>
                  </div> : <p className="small muted">Closed. Reopen the case to run the agents again.</p>}
                </>}
                {tab === "evidence" && resolution && <><FactLibrary facts={facts} activeId={activeFact} request={factRequest} expanded grouped onSelectFact={selectFact} dispute={selected} resolution={resolution} /><CollectorCalls collection={resolution.evidence_collection} /></>}
                {tab === "hearing" && resolution && <Debate resolution={resolution} dispute={selected} availableIds={factIds} onSelectFact={selectFact} />}
                {tab === "ruling" && resolution && <>
                  <VerdictSummary key={`ruling-${reviewId}`} resolution={resolution} dispute={selected} availableIds={factIds} onSelectFact={selectFact} />
                  <RulingChecks key={reviewId} resolution={resolution} availableIds={factIds} onSelectFact={selectFact} />
                  {actions.decide ? <ReviewerDecision resolution={resolution} controller={decision} onContinue={() => changeTab("notify")} /> : sent && <ClosedSummary record={sent} />}
                  <AppealsPanel disputeId={selected.dispute_id} version={appealsVersion} onChanged={() => setAppealsVersion(v => v + 1)} />

                </>}
                {tab === "notify" && resolution && reviewId && <PartyPreview key={`${reviewId}-${sentRecords().events(reviewId).length}`} reviewKey={reviewId} resolution={resolution} dispute={selected}
                  reopened={reopened} previous={reopened ? latestSent : null} appealsAvailable={appeals !== null}
                  saved={decision.saved ?? (reopened ? latestSent?.reviewer ?? null : null)} unavailable={decisionsUnavailable} rulingVisited={reviewed.has("ruling")}
                  onGoToRuling={() => changeTab("ruling")} onAppealed={() => setAppealsVersion(v => v + 1)}
                  progress={progress}
                  onSent={() => { markReviewed("notify"); setSentVersion(v => v + 1); setDeliveredFor(reviewId); }}
                  next={following?.row.id ?? null} nextLabel={following?.label} onNext={goToFollowing}
                  onBack={() => { window.location.hash = HOME_HASH; }} />}
                {(tab !== "ruling" || !resolution) && <AgentsStrip tab={tab} resolution={resolution} availableIds={factIds} onSelectFact={selectFact} />}
                {tab === "ruling" && resolution && actions.decide && <DecisionBar resolution={resolution} controller={decision} unavailable={decisionsUnavailable} />}
              </>} />
          </section>}

        </main>
      </div>
    </div>
  );
}

function CaseHeader({ dispute, resolution, busy, streaming, progress, final }: {
  dispute: DisputeCase; resolution?: Resolution; busy: boolean; streaming: boolean; progress: ReviewSummary | null;
  final?: FinalHeaderOutcome | null;
}) {
  const headline = caseHeadline(dispute, resolution, final);
  const status = statusPill({ busy, streaming, hasResult: !!resolution });
  return <header className="case-file-head">
    <div className="case-file-title">
      <h2 id="case-title">{dispute.dispute_id} <Chip>{TYPE_LABELS[dispute.type]}</Chip></h2>
      {(headline.facts || headline.outcome) && <p className="case-headline">
        {headline.facts}{headline.facts && headline.outcome && " "}
        {headline.outcome && <span className={`case-headline-outcome tone-${headline.tone}`}>{headline.outcome}</span>}
      </p>}
    </div>
    <div className="case-status">
      <Chip dot pulse={status.pulse} tone={chipTone(status.tone)} className="case-save-status" title={status.detail}>
        {status.label}
        {status.detail !== status.label && <span className="sr-only"> ({status.detail})</span>}
      </Chip>
      {/* Announced through the page's polite status region, not a second live region. */}
      {progress && (progress.complete
        ? <Chip tone="ok">{progress.text}<Icon name="check" /></Chip>
        : <span className="review-progress">{progress.text}</span>)}
    </div>
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
      <h2>Intake</h2>
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
                <span className="who">
                  {m.sender !== "system" && <Icon name={AGENT_ICONS[m.sender === "rider" ? "rider_advocate" : "driver_advocate"]} />}
                  {m.sender === "rider" ? "Rider" : m.sender === "driver" ? "Driver" : m.sender}
                  {m.timestamp && <time dateTime={m.timestamp} title={m.timestamp}>{Number.isFinite(Date.parse(m.timestamp)) ? clockText(new Date(m.timestamp)) : m.timestamp}</time>}
                </span>
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
  const parts: ReactNode[] = [
    history.account_age_days != null && `${history.account_age_days} days old`,
    history.rating != null && <span key="rating"><span className="rating-star" aria-hidden="true">★</span> {history.rating}
      <span className="sr-only"> rating out of 5</span></span>,
    history.completed_trips != null && `${history.completed_trips} trips`,
    history.disputes_last_90d != null && `${history.disputes_last_90d} disputes / 90d`,
  ].filter(Boolean);
  return (
    <p className="muted small">
      <strong>{label}:</strong> {parts.length
        ? parts.map((part, i) => <Fragment key={i}>{i > 0 && " · "}{part}</Fragment>)
        : "not provided"}
    </p>
  );
}


function TypeIcon({ type }: { type: DisputeCase["type"] }) {
  return <svg className="type-icon" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" focusable="false">
    {type === "route_deviation"
      ? <><circle cx="4" cy="4" r="2" /><circle cx="16" cy="16" r="2" /><path d="M6 4h6a4 4 0 0 1 0 8H8a4 4 0 0 0-4 4h10" /></>
      : <><circle cx="10" cy="10" r="7" /><path d="M10 5v5l3 2" /></>}
  </svg>;
}
