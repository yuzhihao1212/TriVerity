import { EvidenceText, type FactLinks } from "./EvidenceList";
import { SourceBadge } from "./Debate";
import { agentLabel, agentsForTab, agentSource, type WorkflowTab } from "./workflow";
import type { Resolution } from "./types";

export function AgentsStrip({ tab, resolution, availableIds, onSelectFact }: { tab: WorkflowTab; resolution?: Resolution } & FactLinks) {
  const entries = agentsForTab(resolution?.agent_log ?? [], tab);
  return <section className="agents-strip" aria-label="Agents in this step">
    <h3 className="section-label">Agents in this step</h3>
    {entries.length > 0 ? <ul className="agent-entries">
      {entries.map((entry, index) => {
        const source = resolution ? agentSource(entry.agent, resolution) : null;
        return <li key={`${entry.step}-${entry.agent}-${index}`}>
          <div className="agent-entry-head"><strong>{agentLabel(entry.agent)}</strong>
            <span className="agent-status">{entry.status}</span>
            {source ? <SourceBadge source={source} />
              : <span className="tag">{["evidence_loader", "fraud_detector"].includes(entry.agent) ? "Code" : "Source not supplied"}</span>}
          </div>
          <p><EvidenceText text={entry.message || "No additional message recorded."} availableIds={availableIds} onSelectFact={onSelectFact} /></p>
        </li>;
      })}
    </ul> : <p className="small muted">{tab === "intake" ? "Manual intake. No agents run in this step."
      : tab === "notify" ? "No additional agent run. These messages come from the saved Judge’s ruling."
      : "No agent log entries were returned for this step."}</p>}
  </section>;
}
