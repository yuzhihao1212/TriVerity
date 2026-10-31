import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";

import face from "./assets/mascot/owl-face.webp";
import { buddyAnswers, type BuddyStage } from "./buddyAnswers";
import { clampSpot, panelBox, readSpot, readTucked, spotOf, writeSpot, writeTucked, type BuddySpot, type PanelBox } from "./buddyPosition";
import { Chip } from "./Chip";
import { EvidenceText, type FactLinks } from "./EvidenceList";
import { Icon } from "./Icon";
import { Term } from "./Term";
import type { DisputeCase, Resolution } from "./types";

function storage(): Storage | null { try { return window.localStorage; } catch { return null; } }
// Without the scrollbar, like the right and bottom that position the owl.
function viewport() { return { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight }; }
const NARROW = "(max-width: 560px)";
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };

/** The owl in the corner of a case: questions a lost reviewer would ask, answered from the case's own records. */
export function CaseBuddy({ resolution, dispute, stage, tab, availableIds, onSelectFact, onOpenHearing }: {
  resolution: Resolution; dispute: DisputeCase; stage: BuddyStage; tab: string; onOpenHearing: () => void;
} & FactLinks) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const id = useId();
  // The owl is a pill of two buttons: its face (tucks the owl away, or brings it back with the panel) and its label (the panel).
  const pill = useRef<HTMLDivElement>(null);
  const faceButton = useRef<HTMLButtonElement>(null);
  const labelButton = useRef<HTMLButtonElement>(null);
  const [tucked, setTucked] = useState(() => readTucked(storage()));
  // On a phone the label is never shown, so the face opens the panel itself.
  const [narrow, setNarrow] = useState(() => window.matchMedia?.(NARROW).matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.(NARROW);
    if (!query) return;
    const change = () => setNarrow(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  const faceOnly = tucked || narrow;
  // Bumped when the pill finishes growing or shrinking, so the panel lines up with its new width.
  const [resized, setResized] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  // Wherever the reviewer last left it (null: the corner the CSS gives it), and where its panel opens from there.
  const [spot, setSpot] = useState<BuddySpot | null>(() => readSpot(storage()));
  const [panel, setPanel] = useState<PanelBox | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; from: BuddySpot; to: BuddySpot; moved: boolean; part: "face" | "label" | null } | null>(null);
  const answers = buddyAnswers({ resolution, dispute, stage, tab });
  const answer = answers.find(item => item.id === chosen);

  function close() {
    setOpen(false);
    (faceOnly ? faceButton : labelButton).current?.focus();
  }
  function pressFace() {
    if (narrow) return open ? close() : setOpen(true);
    const next = !tucked;
    setTucked(next);
    writeTucked(storage(), next);
    // Tucking away closes the panel; bringing the owl back opens it, as the label would.
    setOpen(!next);
    if (next) faceButton.current?.focus();
  }
  function pressLabel() {
    if (open) close(); else setOpen(true);
  }
  // Keyboard presses arrive as clicks (detail 0); pointer presses are settled in endDrag, which knows
  // whether the pointer moved, so the click a captured pointer may still send is ignored.
  const keyboardOnly = (press: () => void) => (event: ReactMouseEvent) => { if (event.detail === 0) press(); };

  useEffect(() => { if (open) heading.current?.focus(); }, [open]);

  function owlBox() {
    const { left, top, width, height } = pill.current!.getBoundingClientRect();
    return { left, top, width, height };
  }
  function moveTo(next: BuddySpot) {
    const fitted = clampSpot(next, owlBox(), viewport());
    setSpot(fitted);
    return fitted;
  }

  // Before paint: a saved spot is pulled back on screen, and the panel opens on the roomier side.
  useLayoutEffect(() => {
    const fit = () => {
      if (!pill.current) return;
      if (spot) {
        const fitted = clampSpot(spot, owlBox(), viewport());
        if (fitted.right !== spot.right || fitted.bottom !== spot.bottom) return setSpot(fitted);
      }
      setPanel(open ? panelBox(owlBox(), viewport()) : null);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [open, spot, faceOnly, resized]);

  // The owl and the panel's header both move it. A press that barely moves is a press on the part it
  // landed on: the face or the label.
  function startDrag(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest(".case-buddy-head button")) return;
    const target = event.target as HTMLElement;
    const part = event.currentTarget !== pill.current ? null : target.closest(".case-buddy-face") ? "face" : target.closest(".case-buddy-label") ? "label" : null;
    const from = spotOf(owlBox(), viewport());
    drag.current = { x: event.clientX, y: event.clientY, from, to: from, moved: false, part };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveDrag(event: ReactPointerEvent<HTMLElement>) {
    const current = drag.current;
    if (!current) return;
    const dx = event.clientX - current.x, dy = event.clientY - current.y;
    if (!current.moved && Math.hypot(dx, dy) < 4) return;
    if (!current.moved) setDragging(true);
    current.moved = true;
    current.to = moveTo({ right: current.from.right - dx, bottom: current.from.bottom - dy });
  }
  function endDrag(event: ReactPointerEvent<HTMLElement>) {
    const current = drag.current;
    drag.current = null;
    if (!current) return;
    if (!current.moved) {
      if (event.type === "pointerup" && current.part === "face") pressFace();
      if (event.type === "pointerup" && current.part === "label") pressLabel();
      return;
    }
    setDragging(false);
    // The last spot the drag asked for: the page may not have drawn it yet.
    writeSpot(storage(), current.to);
  }
  function nudge(event: ReactKeyboardEvent<HTMLButtonElement>) {
    const arrow = ARROWS[event.key];
    if (!arrow) return;
    event.preventDefault();
    const step = event.shiftKey ? 96 : 24;
    const from = spotOf(owlBox(), viewport());
    writeSpot(storage(), moveTo({ right: from.right + arrow[0] * step, bottom: from.bottom + arrow[1] * step }));
  }

  // On the page, not the panel: following a source moves focus out of it, and the panel stays open.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);


  const drags = { onPointerDown: startDrag, onPointerMove: moveDrag, onPointerUp: endDrag, onPointerCancel: endDrag };
  return <div className={dragging ? "case-buddy is-dragging" : "case-buddy"} style={spot ?? undefined}>
    {open && <section id={id} className="case-buddy-panel" aria-labelledby={`${id}-title`}
      style={panel ? { [panel.below ? "top" : "bottom"]: "calc(100% + 8px)", left: panel.left, width: panel.width, maxHeight: panel.maxHeight } : { visibility: "hidden" }}>
      <div className="case-buddy-head" {...drags}>
        <img src={face} alt="" width={54} height={40} draggable={false} />
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
            {answer.rules.map(rule => <Chip key={rule} size="sm"><Term rule={rule} /></Chip>)}
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
    <div ref={pill} className={`case-buddy-pill${faceOnly ? " is-tucked" : ""}`} title="Drag to move" {...drags}
      onTransitionEnd={event => { if (event.propertyName === "max-width") setResized(count => count + 1); }}>
      <button type="button" ref={faceButton} className="case-buddy-face" onClick={keyboardOnly(pressFace)} onKeyDown={nudge}
        aria-label={faceOnly ? "Ask about this case" : "Tuck the owl away"} aria-describedby={`${id}-move`}
        aria-expanded={faceOnly ? open : undefined} aria-controls={faceOnly && open ? id : undefined}>
        <img src={face} alt="" width={54} height={40} draggable={false} />
      </button>
      <button type="button" ref={labelButton} className="case-buddy-label" onClick={keyboardOnly(pressLabel)} onKeyDown={nudge}
        aria-expanded={open} aria-controls={open ? id : undefined} aria-describedby={`${id}-move`} tabIndex={faceOnly ? -1 : undefined}>
        <span>Ask about this case</span>
      </button>
    </div>
    <span id={`${id}-move`} className="sr-only">Drag it, or use the arrow keys, to move it.</span>
  </div>;
}
