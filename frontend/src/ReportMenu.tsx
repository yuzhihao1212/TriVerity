import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";

import { reportMenuGroups, type ReportMenuEntry } from "./caseReport";
import { menuIndex } from "./disputeList";
import { Icon } from "./Icon";

/** The printer button: a small menu of the cases that have a report, usable from any page. */
export function ReportMenu({ entries, currentId, busy, reportOpen, onOpen, buttonRef }: {
  entries: () => ReportMenuEntry[]; currentId: string | null; busy: boolean; reportOpen: boolean;
  onOpen: (id: string) => void; buttonRef: RefObject<HTMLButtonElement>;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const groups = open ? reportMenuGroups(entries(), currentId) : null;
  const rows = groups ? [...(groups.current ? [groups.current] : []), ...groups.final, ...groups.notFinal] : [];

  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  // Focus moves into the menu, onto the first case.
  useEffect(() => { if (open) items.current[0]?.focus(); }, [open]);

  // A click outside closes it.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => { if (!wrapper.current?.contains(event.target as Node)) close(); };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function onMenuKey(event: KeyboardEvent<HTMLDivElement>) {
    const current = items.current.findIndex(item => item === document.activeElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) && rows.length) {
      event.preventDefault();
      items.current[menuIndex(current, event.key, rows.length)]?.focus();
    } else if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      close();
    }
  }

  const row = (entry: ReportMenuEntry, isCurrent = false) => {
    const index = rows.indexOf(entry);
    return <button type="button" role="menuitem" key={entry.id} tabIndex={-1} className={`report-option${isCurrent ? " is-open-case" : ""}`}
      ref={element => { items.current[index] = element; }} title={entry.status!.label}
      aria-label={`${entry.id}${isCurrent ? ", open now" : ""}, ${entry.status!.label}`}
      onClick={() => { setOpen(false); onOpen(entry.id); }}>
      <span>{entry.id}{isCurrent && <span className="report-open-now"> Open Now</span>}</span>
      <span className={`report-tag${entry.status!.final ? " is-final" : ""}`}>{entry.status!.final ? "Final" : "Not Final"}</span>
    </button>;
  };

  return <div className="filter-menu report-menu" ref={wrapper} onKeyDown={event => { if (event.key === "Escape" && open) close(); }}>
    <button type="button" ref={buttonRef} className={`icon-button home-button case-report-button${reportOpen ? " is-current" : ""}`}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} aria-label="Export PDF" title="Export PDF"
      onClick={() => setOpen(previous => !previous)}
      onKeyDown={event => { if (event.key === "ArrowDown" && !open) { event.preventDefault(); setOpen(true); } }}>
      <Icon name="printer" />
    </button>
    {groups && <div className="filter-popover report-popover" id={menuId} role={rows.length && !busy ? "menu" : undefined} aria-label="Export PDF" onKeyDown={onMenuKey}>
      <p className="report-popover-title">Export PDF</p>
      {busy ? <p className="report-popover-note" role="status">Available when the agents finish.</p> : <>
        {rows.length > 0 && <p className="report-popover-note">Cases that have a result</p>}
        {groups.current && row(groups.current, true)}
        {groups.final.length > 0 && <div role="group" aria-label="Final"><p className="report-group" aria-hidden="true">Final</p>{groups.final.map(entry => row(entry))}</div>}
        {groups.notFinal.length > 0 && <div role="group" aria-label="Not Final"><p className="report-group" aria-hidden="true">Not Final</p>{groups.notFinal.map(entry => row(entry))}</div>}
        {groups.noResult > 0 && <p className="report-popover-note">{rows.length === 0 ? "No case has a result yet." : `${groups.noResult} ${groups.noResult === 1 ? "case has" : "cases have"} no result yet`}</p>}
      </>}
    </div>}
  </div>;
}
