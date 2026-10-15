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
