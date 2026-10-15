import { Fragment } from "react";

import { EvidenceText, type FactLinks } from "./EvidenceList";
import { SourceBadge } from "./Debate";
import { Icon } from "./Icon";
import { reveal } from "./routes";
import {
  agentBadge, agentIcon, callColumns, durationShare, durationText, statusBadge, stepFlow, stripSourceTag, toolIcon, toolName, toolTooltip,
} from "./stepVisuals";
import { agentLabel, agentRole, agentsForTab, agentSource, type WorkflowTab } from "./workflow";
import type { AgentLogEntry, Resolution } from "./types";

export function AgentsStrip({ tab, resolution, availableIds, onSelectFact }: { tab: WorkflowTab; resolution?: Resolution } & FactLinks) {
  const all = resolution?.agent_log ?? [];
  const entries = agentsForTab(all, tab);
  const flow = resolution ? stepFlow(tab, entries, resolution) : null;
  const card = (entry: AgentLogEntry, index: number) => <AgentCard key={`${entry.step}-${entry.agent}-${index}`} entry={entry} all={all}
    resolution={resolution} availableIds={availableIds} onSelectFact={onSelectFact} />;
  return <section className="agents-strip" aria-label="Agents in this step">
    <h3 className="section-label">Agents in this step</h3>
    {entries.length === 0 ? <p className="small muted">{tab === "intake" ? "Manual intake. No agents run in this step."
      : tab === "notify" ? "No additional agent run. These messages come from the saved Judge’s ruling."
      : "No agent log entries were returned for this step."}</p>
    : flow ? <ol className="agent-flow" aria-label="Agents in order, with what each passes on">
      {entries.map((entry, index) => <Fragment key={`${entry.step}-${entry.agent}-${index}`}>
        {card(entry, index)}
        {index < flow.edges.length && <FlowEdge label={flow.edges[index]} />}
      </Fragment>)}
      {flow.result && <li className="agent-flow-result"><strong>{flow.result}</strong></li>}
    </ol>
    : <ul className="agent-entries">{entries.map(card)}</ul>}
  </section>;
}

function FlowEdge({ label }: { label: string | null }) {
  return <li className="agent-flow-edge">
    <Icon name="arrow" className="agent-flow-arrow" />
    {label ? <span className="agent-flow-label">{label}</span> : <span className="sr-only">then</span>}
  </li>;
}

function AgentCard({ entry, all, resolution, availableIds, onSelectFact }: {
  entry: AgentLogEntry; all: AgentLogEntry[]; resolution?: Resolution;
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
    <div className="agent-badges">
      <span className={`status-badge ${status.tone}`}>{status.icon && <Icon name={status.icon} />}{status.label}</span>
      {badge ? <SourceBadge source={badge} explain /> : <span className="tag">Source not supplied</span>}
    </div>
    {time && <div className="agent-duration">
      <span className="agent-duration-track" aria-hidden="true"><span style={{ width: `${Math.max(share * 100, share > 0 ? 3 : 0)}%` }} /></span>
      <span className="agent-duration-text"><span className="sr-only">Took </span>{time}</span>
    </div>}
    {calls.length > 0 ? <ToolCalls calls={calls} />
      : <p className="agent-message"><EvidenceText text={stripSourceTag(entry.message) || "No additional message recorded."} availableIds={availableIds} onSelectFact={onSelectFact} /></p>}
  </li>;
}

/** A compact summary; the full table is "What the evidence collector looked up" below. */
function ToolCalls({ calls }: { calls: NonNullable<NonNullable<Resolution["evidence_collection"]>["calls"]> }) {
  const columns = callColumns(calls);
  const rounds = new Set(calls.map(call => call.round)).size;
  return <div className="tool-calls">
    <div className={`tool-columns${columns.length > 1 ? " two" : ""}`}>{columns.map(column => <div key={column.key}>
      <h4 className="tool-column-title">{column.title}</h4>
      <ul className="tool-chips">{column.calls.map((call, index) => <li key={`${call.round}-${call.tool}-${index}`}>
        <details className="tool-chip" title={toolTooltip(call)}>
          <summary><Icon name={toolIcon(call.tool)} />{toolName(call.tool)}{rounds > 1 && <span className="muted"> · round {call.round}</span>}</summary>
          <p>{toolTooltip(call)}</p>
        </details>
      </li>)}</ul>
    </div>)}</div>
    <a className="tool-calls-link" href="#collector-calls-title" onClick={event => {
      event.preventDefault();
      reveal(document.getElementById("collector-calls-title"));
    }}>Full lookup details <span aria-hidden="true">↓</span></a>
  </div>;
}
