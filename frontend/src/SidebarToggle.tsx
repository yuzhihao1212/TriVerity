import { useId, useState, type ReactNode } from "react";
import { disputeCategory } from "./disputeList";

/** Opens or collapses the dispute list, like the side panel in chat apps. Stays in place so focus never jumps. */
export function SidebarToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const label = open ? "Hide dispute list" : "Show dispute list";
  return (
    <button type="button" className="icon-button sidebar-toggle" aria-expanded={open} aria-controls="dispute-list"
      aria-label={label} title={`${label} (Ctrl+Shift+S)`} aria-keyshortcuts="Control+Shift+S Meta+Shift+S" onClick={onToggle}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" />
      </svg>
    </button>
  );
}

export function NewDisputeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** The sidebar uses an icon; the home page keeps its labelled New button. */
export function SidebarNewButton({ onClick }: { onClick: () => void }) {
  const id = useId();
  const [dismissed, setDismissed] = useState(false);
  return <span className="sidebar-new">
    <button type="button" className="icon-button" aria-label="New dispute" aria-describedby={dismissed ? undefined : id}
      onClick={onClick} onFocus={() => setDismissed(false)} onMouseEnter={() => setDismissed(false)}
      onKeyDown={event => { if (event.key === "Escape") setDismissed(true); }}><NewDisputeIcon /></button>
    <span id={id} role="tooltip" className="sidebar-new-tooltip" hidden={dismissed}>New dispute</span>
  </span>;
}

/** The collapsed sidebar's current case: its category icon (same as the list), named on hover, focus and tap. */
export function CurrentCaseShortcut({ id, summary, type, icon, onOpen }: {
  id: string; summary: string; type: string; icon: ReactNode; onOpen: () => void;
}) {
  const tooltipId = useId();
  const [dismissed, setDismissed] = useState(false);
  const category = disputeCategory(type);
  const label = `Current case: ${id} · ${summary}`;
  return <div className="sidebar-current">
    <button type="button" className={`sidebar-current-button category-${category}`} aria-label={label}
      aria-describedby={dismissed ? undefined : tooltipId} aria-controls="dispute-list" aria-expanded={false}
      onClick={onOpen} onMouseEnter={() => setDismissed(false)} onFocus={() => setDismissed(false)}
      onKeyDown={event => { if (event.key === "Escape") setDismissed(true); }}>
      {icon}
    </button>
    <span id={tooltipId} role="tooltip" className="sidebar-current-tooltip" hidden={dismissed}>{label}</span>
  </div>;
}
