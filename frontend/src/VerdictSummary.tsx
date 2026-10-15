import { useId } from "react";

import { Chip } from "./Chip";
import { SourceBadge } from "./Debate";
import { partyView, PARTY_DECISION_LABELS } from "./partyView";
import { money, outputSources, policyIds } from "./presentation";
import { decisionTone } from "./outcomeTone";
import { Term } from "./Term";
import type { Resolution } from "./types";

export function VerdictSummary({ resolution, disputeId }: { resolution: Resolution; disputeId: string }) {
  const id = useId();
  const view = partyView(resolution, "rider");
  const percent = Math.round(resolution.confidence * 100);
  // The outcome's own tone (ok / warn / neutral), not brand red.
  const tone = decisionTone(resolution.decision);
  return (
    <section id="ruling-summary" tabIndex={-1} className={`card verdict ruling ${resolution.decision}`} aria-labelledby={`${id}-title`}>
      <div className="card-head">
        <h2 id={`${id}-title`}>The ruling</h2>
        <Chip tone={tone}>{PARTY_DECISION_LABELS[view.decision]}</Chip>
      </div>
      <WhySummary resolution={resolution} />
      <div className="verdict-metrics">
        <div><span className="section-label">{view.refund_amount != null ? "Amount approved" : "Next step"}</span>
          <p className={`verdict-value tone-text-${tone}`}>{view.refund_amount != null ? money(view.refund_amount) : resolution.decision === "needs_review" ? "Human review" : "Charge stands"}</p>
        </div>
        <div><span className="section-label"><Term term="confidence">Confidence</Term></span><p className="verdict-value">{percent}%</p>
          <p className="small muted">{percent >= 60 ? "Clear enough to decide automatically" : "Below 60%: a human decides"}</p></div>
        <div><span className="section-label">Policy applied</span><div className="chip-row">
          {policyIds(resolution.policy_refs).map(ref => <Chip key={ref}><Term rule={ref} /></Chip>)}
          {!resolution.policy_refs.length && <span className="small muted">None returned</span>}
        </div></div>
      </div>
      <p className="small muted">Rules decide the outcome. Hy3 argues and explains (<Term term="ai">AI</Term>); checked{" "}
        <Term term="fallback">fallback</Term> text is used when needed.</p>
      <div className="output-sources" aria-label="AI and fallback status">
        {outputSources(resolution).map(item => <span className="output-source small" key={item.label}>
          {item.label} {item.source ? <SourceBadge source={item.source} /> : <Chip size="sm" tone="outline">Not run</Chip>}
        </span>)}
      </div>
    </section>
  );
}

/** Why, in one line, plus what would have changed it: the first thing a reviewer needs.
 *  The outcome and amount are already shown above, so this says only the reason. */
function WhySummary({ resolution }: { resolution: Resolution }) {
  const reason = resolution.explanation.split(/(?<=[.!?])\s+/)[0];
  const change = resolution.counterfactuals?.[0];
  return <div className="why-summary">
    <p className="why-line"><strong>Why: </strong>{reason}</p>
    {change && <p className="small why-change"><strong><Term term="counterfactual">What would change it</Term>: </strong>
      if {change.change}, the outcome would be {change.outcome}.</p>}
  </div>;
}
