import { useEffect, useId, useRef, useState } from "react";

import face from "./assets/mascot/owl-face.webp";
import { buddyAnswers, type BuddyStage } from "./buddyAnswers";
import { Chip } from "./Chip";
import { EvidenceText, type FactLinks } from "./EvidenceList";
import { Icon } from "./Icon";
import { Term } from "./Term";
import type { DisputeCase, Resolution } from "./types";

/** The owl in the corner of a case: questions a lost reviewer would ask, answered from the case's own records. */
export function CaseBuddy({ resolution, dispute, stage, tab, availableIds, onSelectFact, onOpenHearing }: {
  resolution: Resolution; dispute: DisputeCase; stage: BuddyStage; tab: string; onOpenHearing: () => void;
} & FactLinks) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const answers = buddyAnswers({ resolution, dispute, stage, tab });
  const answer = answers.find(item => item.id === chosen);

  function close() {
    setOpen(false);
    button.current?.focus();
  }

  useEffect(() => { if (open) heading.current?.focus(); }, [open]);

  // On the page, not the panel: following a source moves focus out of it, and the panel stays open.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);


  return <div className="case-buddy">
    {open && <section id={id} className="case-buddy-panel" aria-labelledby={`${id}-title`}>
      <div className="case-buddy-head">
        <img src={face} alt="" width={54} height={40} />
        <div>
          <h2 id={`${id}-title`} ref={heading} tabIndex={-1}>Need More Context?</h2>
          <p>Answers come from this case's records.</p>
        </div>
        <button type="button" className="icon-button" aria-label="Close" title="Close" onClick={close}><Icon name="cross" /></button>
      </div>
      <div className="case-buddy-answer" aria-live="polite">
        {answer ? <>
          <p className="case-buddy-lead">{answer.lead}</p>
          {answer.points.length > 0 && <ul>{answer.points.map(point => <li key={point}>{point}</li>)}</ul>}
          {answer.note && <p className="case-buddy-note">{answer.note}</p>}
          {(answer.rules.length > 0 || answer.facts.length > 0 || answer.step) && <div className="case-buddy-sources">
            {answer.rules.map(rule => <Chip key={rule} size="sm"><Term rule={rule} contained /></Chip>)}
            {answer.facts.map(fact => <Chip key={fact} size="sm" tone="neutral"><EvidenceText text={fact} availableIds={availableIds} onSelectFact={onSelectFact} /></Chip>)}
            {answer.step && tab !== "hearing" && <button type="button" className="text-button" onClick={onOpenHearing}>Open the Hearing</button>}
          </div>}
        </> : <p>Pick a question to see what the records say. The decision stays yours.</p>}
      </div>
      <div className="case-buddy-questions">
        {answers.map(item => <button type="button" key={item.id} className={item.id === chosen ? "is-chosen" : undefined}
          aria-pressed={item.id === chosen} onClick={() => setChosen(item.id)}>{item.question}</button>)}
      </div>
      <p className="case-buddy-foot"><Icon name="info" />No AI call and no cost. It never recommends an outcome.</p>
    </section>}
    <button type="button" ref={button} className="case-buddy-button" aria-expanded={open} aria-controls={open ? id : undefined}
      aria-label="Ask the owl about this case" title="Ask the owl about this case" onClick={() => open ? close() : setOpen(true)}>
      <img src={face} alt="" width={54} height={40} />
    </button>
  </div>;
}
