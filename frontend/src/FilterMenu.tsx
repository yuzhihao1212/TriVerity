import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { FILTER_OPTIONS, filterButtonLabel, menuIndex, type DisputeFilter } from "./disputeList";

/** A funnel button with a small radio menu; replaces the dispute-type <select>. */
export function FilterMenu({ value, onChange, options = FILTER_OPTIONS }: {
  value: DisputeFilter; onChange: (value: DisputeFilter) => void;
  /** The choices on offer (disputeList.filterOptions: On Hold only while a case is on hold). */
  options?: typeof FILTER_OPTIONS;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const checked = Math.max(0, options.findIndex(item => item.value === value));
  const active = value !== "all";

  function close() {
    setOpen(false);
    button.current?.focus();
  }
  function choose(next: DisputeFilter) {
    onChange(next);
    close();
  }

  // Focus moves into the menu, onto the current option.
  useEffect(() => { if (open) items.current[checked]?.focus(); }, [open]);

  // A click outside closes it.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => { if (!wrapper.current?.contains(event.target as Node)) close(); };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function onMenuKey(event: KeyboardEvent<HTMLDivElement>) {
    const current = items.current.findIndex(item => item === document.activeElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      items.current[menuIndex(current, event.key, options.length)]?.focus();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (current >= 0) choose(options[current].value);
    } else if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      close();
    }
  }

  return <div className="filter-menu" ref={wrapper}>
    <button type="button" ref={button} className={`icon-button filter-button${active ? " active" : ""}`}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      aria-label={filterButtonLabel(value)} title={filterButtonLabel(value)}
      onClick={() => setOpen(previous => !previous)}
      onKeyDown={event => { if (event.key === "ArrowDown" && !open) { event.preventDefault(); setOpen(true); } }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M4 5h16l-6.2 7.2V18l-3.6 1.8v-7.6Z" />
      </svg>
      {active && <span className="filter-dot" aria-hidden="true" />}
    </button>
    {open && <div className="filter-popover" role="menu" id={menuId} aria-label="Filter disputes" onKeyDown={onMenuKey}>
      {options.map((item, index) => <button type="button" key={item.value} role="menuitemradio" aria-checked={item.value === value}
        tabIndex={-1} ref={element => { items.current[index] = element; }} className="filter-option"
        onClick={() => choose(item.value)}>
        <svg className="filter-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          {item.value === value && <path d="m5 12.5 4.5 4.5L19 7.5" />}
        </svg>
        {item.label}
      </button>)}
    </div>}
  </div>;
}
