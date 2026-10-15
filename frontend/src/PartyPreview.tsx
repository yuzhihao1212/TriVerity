import { useId, useRef, useState, type KeyboardEvent } from "react";

import { PARTY_DECISION_LABELS, partyView } from "./partyView";
import type { Resolution } from "./types";

const PARTIES = ["rider", "driver"] as const;

export function PartyPreview({ resolution }: { resolution: Resolution }) {
  const [party, setParty] = useState<"rider" | "driver">("rider");
  const id = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    switch (event.key) {
      case "ArrowRight": next = (index + 1) % PARTIES.length; break;
      case "ArrowLeft": next = (index + PARTIES.length - 1) % PARTIES.length; break;
      case "Home": next = 0; break;
      case "End": next = PARTIES.length - 1; break;
      default: return;
    }
    event.preventDefault();
    setParty(PARTIES[next]);
    tabs.current[next]?.focus();
  }

  return (
    <section className="card party-preview" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>What the parties see</h2>
      <div className="party-tabs" role="tablist" aria-labelledby={`${id}-heading`}>
        {PARTIES.map((name, index) => (
          <button
            key={name}
            ref={(element) => { tabs.current[index] = element; }}
            type="button"
            role="tab"
            id={`${id}-${name}-tab`}
            aria-selected={party === name}
            aria-controls={`${id}-${name}-panel`}
            tabIndex={party === name ? 0 : -1}
            onClick={() => setParty(name)}
            onKeyDown={(event) => navigate(event, index)}
          >
            {name === "rider" ? "Rider" : "Driver"}
          </button>
        ))}
      </div>
      {PARTIES.map((name) => {
        const view = partyView(resolution, name);
        return (
          <div
            key={name}
            role="tabpanel"
            id={`${id}-${name}-panel`}
            aria-labelledby={`${id}-${name}-tab`}
            hidden={party !== name}
            tabIndex={0}
          >
            <p className="action">{PARTY_DECISION_LABELS[view.decision]}</p>
            {view.refund_amount != null && (
              <p>{view.decision === "compensation" ? "Amount approved" : "Refund amount"}: ${view.refund_amount.toFixed(2)}</p>
            )}
            <p className="party-message">{view.message}</p>
          </div>
        );
      })}
    </section>
  );
}
