import { useEffect, useId, useRef } from "react";

import { AppealForm } from "./Appeals";
import { PARTY_DECISION_LABELS, partyView } from "./partyView";
import type { DisputeCase, Resolution } from "./types";

const PARTIES = ["rider", "driver"] as const;

/** What each party actually receives, shown as the message on their phone, side by side. */
export function PartyPreview({ resolution, dispute, onAppealed, onSeen }: {
  resolution: Resolution; dispute?: DisputeCase; onAppealed?: () => void;
  /** Fires once, after both phones have each been at least half in view. */
  onSeen?: () => void;
}) {
  const id = useId();
  const phones = useRef<(HTMLElement | null)[]>([]);
  const seenRef = useRef(onSeen);
  seenRef.current = onSeen;
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") { seenRef.current?.(); return; } // Opening the tab counts.
    const seen = new Set<Element>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting && entry.intersectionRatio >= 0.5) seen.add(entry.target);
      if (seen.size >= PARTIES.length) { observer.disconnect(); seenRef.current?.(); }
    }, { threshold: 0.5 });
    for (const phone of phones.current) if (phone) observer.observe(phone);
    return () => observer.disconnect();
  }, []);
  return (
    <section className="card party-preview" aria-labelledby={`${id}-heading`}>
      <div><p className="eyebrow">Notify parties</p><h2 id={`${id}-heading`}>What the rider and the driver see</h2></div>
      <p className="small muted">Only the outcome and a plain explanation: never fraud signals, party history or internal evidence.</p>
      <div className="phones">
        {PARTIES.map(name => {
          const view = partyView(resolution, name);
          const who = name === "rider" ? "Rider" : "Driver";
          return (
            <figure key={name} className="phone-wrap" aria-labelledby={`${id}-${name}`}
              ref={element => { phones.current[PARTIES.indexOf(name)] = element; }}>
              <figcaption id={`${id}-${name}`} className="section-label">{who}’s phone</figcaption>
              <div className="phone">
                <div className="phone-bar" aria-hidden="true"><span>9:41</span><span className="phone-notch" /><span>●●●</span></div>
                <div className="phone-screen">
                  <p className="phone-app">Ryde · Dispute update</p>
                  <div className="phone-message">
                    <p className={`phone-decision ${view.decision}`}>{PARTY_DECISION_LABELS[view.decision]}</p>
                    {view.refund_amount != null && (
                      <p className="phone-amount">
                        {view.decision === "compensation" ? "Amount approved" : "Refund"} <strong>${view.refund_amount.toFixed(2)}</strong>
                      </p>
                    )}
                    <p className="phone-text">{view.message}</p>
                  </div>
                  {dispute && <AppealForm key={`${dispute.dispute_id}-${name}`} dispute={dispute} party={name}
                    decision={resolution.decision} onFiled={onAppealed} />}
                </div>
              </div>
            </figure>
          );
        })}
      </div>
    </section>
  );
}
