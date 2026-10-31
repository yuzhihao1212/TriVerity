import { Fragment, useId, useState } from "react";

import { AGENT_OPEN_KEY, readDetailOpen, writeDetailOpen } from "./detailDisclosure";
import { EVIDENCE_FACTS_ID } from "./FactLibrary";
import { reveal } from "./routes";
import { agentLineParts, SOURCE_KEY, stepHeading } from "./agentDisplay";
import { titleCase } from "./presentation";
import { humanizeAgentMessage } from "./agentText";

import { EvidenceText, type FactLinks } from "./EvidenceList";
import { openAuditTrail } from "./CollectorCalls";
import { Chip } from "./Chip";
import { chipClass, chipTone } from "./chipStyle";
import { Icon } from "./Icon";
import { SourceBadge } from "./SourceBadge";
import { CLOSED_TRUST_TILE, trustTileState } from "./trustTileState";
import {
  agentBadge, agentIcon, callColumns, durationShare, durationText, statusBadge, stepFlow, toolIcon, toolName, toolTooltip,
} from "./stepVisuals";
import { agentLabel, agentRole, agentsForTab, agentSource, type WorkflowTab } from "./workflow";
import type { AgentLogEntry, Resolution } from "./types";

/**
 * "How this step was decided", shown after the step's own content. Collapsed (the default):
 * one line per agent. Expanded: the full cards, the flow between them and the tool chips.
 * The choice is remembered for the session.
 */
export function AgentsStrip({ tab, resolution, availableIds, onSelectFact }: { tab: WorkflowTab; resolution?: Resolution } & FactLinks) {
  const id = useId();
  const [open, setOpen] = useState(() => readDetailOpen(AGENT_OPEN_KEY));
  function toggle() {
    setOpen(previous => {
      writeDetailOpen(AGENT_OPEN_KEY, !previous);
      return !previous;
    });
  }
  const all = resolution?.agent_log ?? [];
  const entries = agentsForTab(all, tab);
  const flow = resolution ? stepFlow(tab, entries, resolution) : null;
  const card = (entry: AgentLogEntry, index: number) => <AgentCard key={`${entry.step}-${entry.agent}-${index}`} entry={entry} all={all}
    resolution={resolution} tab={tab} availableIds={availableIds} onSelectFact={onSelectFact} />;
  return <section className="agents-strip" aria-labelledby={`${id}-title`}>
    <div className="agents-head">
      <div className="agents-title"><h3 className="section-label" id={`${id}-title`}>{titleCase(stepHeading(tab))}</h3>{entries.length > 0 && <SourceKey />}</div>
      {entries.length > 0 && <button type="button" className="agents-toggle" aria-expanded={open} aria-controls={`${id}-body`} onClick={toggle}>
        {open ? "Hide Details" : "Show Details"}<Icon name="arrow" className="agents-toggle-icon" />
      </button>}
    </div>
    <div id={`${id}-body`}>
    {entries.length === 0 ? <p className="small muted">{tab === "intake" ? "You supplied the case details; no AI was called."
      : tab === "notify" ? "You check the final messages and approve what is sent."
      : "No preparation log was returned for this step."}</p>
    : !open ? <ul className="agent-lines">{entries.map((entry, index) => <AgentLine key={`${entry.step}-${entry.agent}-${index}`} entry={entry} resolution={resolution} />)}</ul>
    : flow ? <ol className="agent-flow" aria-label="Agents in order, with what each passes on">
      {entries.map((entry, index) => <Fragment key={`${entry.step}-${entry.agent}-${index}`}>
        {card(entry, index)}
        {index < flow.edges.length && <FlowEdge label={flow.edges[index]} />}
      </Fragment>)}
      {flow.result && <li className="agent-flow-result"><button type="button" className={chipClass({ tone: "brand" })} onClick={() => {
        const target = document.getElementById(EVIDENCE_FACTS_ID);
        const disclosure = target?.querySelector<HTMLDetailsElement>("details.disclosure");
        if (disclosure) disclosure.open = true;
        reveal(target, "start", { flash: true });
      }}><strong>{flow.result} ↑</strong></button></li>}
    </ol>
    : <ul className="agent-entries">{entries.map(card)}</ul>}
    </div>
  </section>;
}

/** Three columns: the source badge, the action (internal agent names stay in the expanded cards), the time. */
function AgentLine({ entry, resolution }: { entry: AgentLogEntry; resolution?: Resolution }) {
  const { action, source, how, time } = agentLineParts(entry, resolution);
  return <li className="agent-line">
    <span className="agent-line-source">{source && <SourceBadge source={source} />}</span>
    <span className="agent-action"><strong>{action}</strong>{how && <span className="muted"> {how}</span>}</span>
    <span className="agent-line-time">{time && <><span className="sr-only">, </span>{time}</>}</span>
  </li>;
}

/** ⓘ next to the heading: hover or focus previews what Rules and Hunyuan AI mean; a click or tap pins it; Escape closes. */
function SourceKey() {
  const id = useId();
  const [state, setState] = useState(CLOSED_TRUST_TILE);
  const open = state.openId === id;
  const dismiss = () => setState(CLOSED_TRUST_TILE);
  return <span className="agent-source-key" onMouseEnter={() => setState(s => trustTileState(s, { type: "hover", id }))}
    onMouseLeave={() => setState(s => trustTileState(s, { type: "leave", id }))}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) dismiss(); }}
    onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); dismiss(); } }}>
    <button type="button" className="icon-button agent-source-info" aria-label="About Rules and Hunyuan AI"
      aria-expanded={open} aria-describedby={open ? id : undefined} aria-controls={id}
      onFocus={() => setState(s => trustTileState(s, { type: "focus", id }))}
      onClick={() => setState(s => trustTileState(s, { type: "toggle", id }))}>
      <Icon name="info" />
    </button>
    <span id={id} role="tooltip" className="agent-source-tip" hidden={!open}>
      {SOURCE_KEY.map(line => <span key={line.label} className="agent-source-tip-line"><strong>{line.label}</strong>: {line.text}</span>)}
    </span>
  </span>;
}

function FlowEdge({ label }: { label: string | null }) {
  return <li className="agent-flow-edge">
    <Icon name="arrow" className="agent-flow-arrow" />
    {label ? <span className="agent-flow-label">{label}</span> : <span className="sr-only">then</span>}
  </li>;
}

function AgentCard({ entry, all, resolution, tab, availableIds, onSelectFact }: {
  entry: AgentLogEntry; all: AgentLogEntry[]; resolution?: Resolution; tab: WorkflowTab;
} & FactLinks) {
  const status = statusBadge(entry.status);
  const badge = agentBadge(entry.agent, resolution ? agentSource(entry.agent, resolution) : null);
  const time = durationText(entry.duration_ms);
  const share = durationShare(entry.duration_ms, all);
  const role = agentRole(entry.agent);
  const calls = entry.agent === "evidence_collector" ? resolution?.evidence_collection?.calls ?? [] : [];
  return <li className="agent-card">
    <div className="agent-card-head">
      <span className="agent-avatar"><Icon name={agentIcon(entry.agent)} /></span>
      <div className="agent-card-title"><strong>{agentLabel(entry.agent)}</strong>{role && <span className="agent-role">{role}</span>}</div>
    </div>
    <div className="chip-row">
      <Chip size="sm" tone={chipTone(status.tone)} icon={status.icon ?? undefined}>{status.label}</Chip>
      {badge ? <SourceBadge source={badge} explain /> : <Chip size="sm" tone="outline">Source not supplied</Chip>}
    </div>
    {time && <div className="agent-duration">
      <span className="agent-duration-track" aria-hidden="true"><span style={{ width: `${Math.max(share * 100, share > 0 ? 3 : 0)}%` }} /></span>
      <span className="agent-duration-text"><span className="sr-only">Took </span>{time}</span>
    </div>}
    {calls.length > 0 ? <ToolCalls calls={calls} />
      : <p className="agent-message"><EvidenceText text={humanizeAgentMessage(entry.agent, entry.message, resolution) || "No additional message recorded."} availableIds={availableIds} onSelectFact={onSelectFact} /></p>}
  </li>;
}

/** A compact summary; the full table is "What the evidence collector looked up" below. */
function ToolCalls({ calls }: { calls: NonNullable<NonNullable<Resolution["evidence_collection"]>["calls"]> }) {
  const columns = callColumns(calls);
  const rounds = new Set(calls.map(call => call.round)).size;
  return <div className="tool-calls">
    <div className={`tool-columns${columns.length > 1 ? " two" : ""}`}>{columns.map(column => <div key={column.key}>
      <h4 className="tool-column-title">{column.title}</h4>
      <ul className="tool-list">{column.calls.map((call, index) => <li key={`${call.round}-${call.tool}-${index}`}>
        <details className="tool-detail" title={toolTooltip(call)}>
          <summary className={chipClass({ tone: "outline" })}><Icon name={toolIcon(call.tool)} />{toolName(call.tool)}{rounds > 1 && <span className="muted"> · Round {call.round}</span>}</summary>
          <p>{toolTooltip(call)}</p>
        </details>
      </li>)}</ul>
    </div>)}</div>
    <a className="tool-calls-link" href="#collector-calls-title" onClick={event => {
      event.preventDefault();
      // Opens the audit trail first; it then scrolls to its heading and flashes it.
      openAuditTrail();
    }}>Full lookup details <span aria-hidden="true">↑</span></a>
  </div>;
}
