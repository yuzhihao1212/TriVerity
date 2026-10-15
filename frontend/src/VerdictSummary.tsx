import { useId } from "react";

import { SourceBadge } from "./Debate";
import { partyView, PARTY_DECISION_LABELS } from "./partyView";
import { money, outputSources, policyIds } from "./presentation";
import type { Resolution } from "./types";

export function VerdictSummary({ resolution, disputeId }: { resolution: Resolution; disputeId: string }) {
  const id = useId();
  const view = partyView(resolution, "rider");
  const percent = Math.round(resolution.confidence * 100);
  return (
    <section id="ruling-summary" tabIndex={-1} className={`card verdict ruling ${resolution.decision}`} aria-labelledby={`${id}-title`}>
      <div className="card-head">
        <div><p className="eyebrow">Policy decides · {disputeId}</p><h2 id={`${id}-title`}>The ruling</h2></div>
        <span className="decision">{PARTY_DECISION_LABELS[view.decision]}</span>
      </div>
      <div className="verdict-metrics">
        <div><span className="section-label">{view.refund_amount != null ? "Amount approved" : "Next step"}</span>
          <p className="verdict-value">{view.refund_amount != null ? money(view.refund_amount) : resolution.decision === "needs_review" ? "Human review" : "Charge stands"}</p>
        </div>
        <div><span className="section-label">Confidence</span><p className="verdict-value">{percent}%</p></div>
        <div><span className="section-label">Policy applied</span><div className="policy-chips">
          {policyIds(resolution.policy_refs).map(ref => <span className="source-chip" key={ref}>{ref}</span>)}
          {!resolution.policy_refs.length && <span className="small muted">None returned</span>}
        </div></div>
      </div>
      <p className="small muted">Rules decide the outcome. Hy3 argues and explains; checked fallback text is used when needed.</p>
      <div className="output-sources" aria-label="AI and fallback status">
        {outputSources(resolution).map(item => <span className="output-source small" key={item.label}>
          {item.label} {item.source ? <SourceBadge source={item.source} /> : <span className="tag">Not run</span>}
        </span>)}
      </div>
    </section>
  );
}
