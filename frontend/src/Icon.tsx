import type { ReactNode } from "react";

// Stroke icons (1.75), matching the select chevron in App.tsx. Always decorative:
// every use sits next to text that carries the meaning.
const PATHS: Record<string, ReactNode> = {
  // Workflow steps
  folder: <path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />,
  magnifier: <><circle cx="11" cy="11" r="6" /><path d="m20 20-4.5-4.5" /></>,
  bubbles: <><path d="M3 5h11a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H8l-3 2.5V13H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" /><path d="M18 9h3a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2v2.5L16 17h-4a1 1 0 0 1-1-1v-1" /></>,
  scales: <><path d="M12 4v16M8 20h8M5 7h14" /><path d="m5 7-3 6a3 3 0 0 0 6 0Z" /><path d="m19 7-3 6a3 3 0 0 0 6 0Z" /></>,
  phone: <><rect x="7" y="2.5" width="10" height="19" rx="2" /><path d="M11 18.5h2" /></>,
  // Customer feedback faces: outlined mood icons, with a visible label for every choice.
  "mood-cry": <><circle cx="12" cy="12" r="9" /><path d="M8 9h.01M16 9h.01M8 17q4-6 8 0M7 11v3M17 11v3" /></>,
  "mood-sad": <><circle cx="12" cy="12" r="9" /><path d="M8 9h.01M16 9h.01M8 16q4-5 8 0" /></>,
  "mood-neutral": <><circle cx="12" cy="12" r="9" /><path d="M8 9h.01M16 9h.01M8 15h8" /></>,
  "mood-smile": <><circle cx="12" cy="12" r="9" /><path d="M8 9h.01M16 9h.01M8 14q4 5 8 0" /></>,
  "mood-happy": <><circle cx="12" cy="12" r="9" /><path d="M7 9q1-2 2 0M15 9q1-2 2 0M7 13h10q-1 6-5 6t-5-6Z" /></>,
  // State
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  cross: <path d="M6 6l12 12M18 6 6 18" />,
  pause: <path d="M9 6v12M15 6v12" />,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  function: <><path d="M16.5 4.5c-2.6-.6-4.2.5-4.7 3L9.2 17c-.5 2.5-2.1 3.6-4.7 3" /><path d="M8 10.5h7.5" /></>,
  swap: <><path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4" /></>,
  arrow: <path d="M4 12h15m-5-5 5 5-5 5" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  // Agents
  // The mascot robot as a line icon: head, ear cups, visor and the logo's three dots. For Run Agents.
  agent: <><path d="M5 9.5A4.5 4.5 0 0 1 9.5 5h5A4.5 4.5 0 0 1 19 9.5V15a4.5 4.5 0 0 1-4.5 4.5h-5A4.5 4.5 0 0 1 5 15Z" /><path d="M2.75 11v4.5M21.25 11v4.5" /><rect x="7.75" y="11.5" width="8.5" height="5" rx="2.5" /><path d="M12 7.6h.01M10.6 9.2h.01M13.4 9.2h.01" /></>,
  database: <><ellipse cx="12" cy="5.5" rx="7" ry="2.5" /><path d="M5 5.5v13c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-13" /><path d="M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" /></>,
  shield: <><path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6Z" /><path d="m9 12 2 2 4-4" /></>,
  person: <><circle cx="12" cy="8" r="4" /><path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6" /></>,
  wheel: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.5" /><path d="M3.5 10.5 9.6 11M14.4 11l6.1-.5M12 14.5V21" /></>,
  books: <><path d="M4 4h4v16H4zM10 4h4v16h-4z" /><path d="m16 5 3.5-.8 3 15.6-3.5.8Z" /></>,
  generic: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 2.5" /></>,
  // Tools
  route: <><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7" /></>,
  pin: <><path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11Z" /><circle cx="12" cy="10" r="2.2" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  chat: <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3v-3H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15Z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  // Notes
  warning: <><path d="M12 4 2.8 19.5h18.4Z" /><path d="M12 10v4.5M12 17.2v.1" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.8v.1" /></>,
  history: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
  // Navigation and review
  home: <><path d="M4 11 12 4l8 7" /><path d="M6 9.5V20h12V9.5" /><path d="M10 20v-5h4v5" /></>,
  printer: <><path d="M7 8V3h10v5M7 17H4V9h16v8h-3" /><path d="M7 14h10v7H7Z" /><path d="M17 11h.01" /></>,
  queue: <><path d="M8 6h12M8 12h12M8 18h12" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>,
  send: <><path d="M21 3 10 14" /><path d="M21 3 14.5 21l-4.5-7-7-4.5Z" /></>,
  appeal: <><path d="M4 20V8a2 2 0 0 1 2-2h9l5 5v9Z" /><path d="M9 13h6M12 10v6" /></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16Z" /><path d="m13.5 6.5 4 4" /></>,
};

export function Icon({ name, className }: { name: string; className?: string }) {
  return <svg className={className ? `icon ${className}` : "icon"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{PATHS[name] ?? PATHS.generic}</svg>;
}
