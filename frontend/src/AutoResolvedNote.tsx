import { Icon } from "./Icon";
import type { Autonomy } from "./types";

/**
 * On the Ruling step: why this ruling went through without a person, that it was picked for
 * the audit sample, or that a reviewer reopened an automatic decision. The reasons come from
 * the backend with the case's own numbers (services/autonomy.py), so nothing here restates
 * the policy limits.
 */
export function AutoResolvedNote({ autonomy, closedAutomatically }: { autonomy?: Autonomy; closedAutomatically: boolean }) {
  if (!autonomy?.eligible) return null;
  const [first, ...rest] = autonomy.reasons;
  const reasons = autonomy.audit ? rest : autonomy.reasons;
  const title = autonomy.audit ? "Audit sample: this one could have gone through automatically. Check it by hand."
    : closedAutomatically ? "Resolved automatically under policy" : "Resolved automatically, then reopened for review";
  return <section className={`auto-note${autonomy.audit ? " is-audit" : ""}`} aria-label={autonomy.audit ? "Audit sample" : "Auto-resolved"}>
    <p className="auto-note-title"><Icon name={autonomy.audit ? "magnifier" : "check"} />{title}</p>
    {reasons.length > 0 && <ul className="auto-note-reasons">{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
    {!autonomy.audit && closedAutomatically && <p className="small muted">The rider and driver were notified, with how to appeal. No precedent is saved for automatic decisions. Reopen the case to change the decision.</p>}
    {!autonomy.audit && !closedAutomatically && <p className="small muted">Your decision replaces the automatic one when you send it.</p>}
    {autonomy.audit && first && <p className="small muted">{first}</p>}
  </section>;
}
