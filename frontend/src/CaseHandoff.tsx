import { OeroMark } from "./OeroAI";
import { handoffAnnouncement, type HandoffPhase } from "./handoffTiming";

/**
 * The veil between two cases (handoffTiming.ts has the timing): the OeroAI mark spins over "Gathering
 * materials…", its dots merge into a tick with "Ready for review", then the veil lifts.
 */
export function CaseHandoff({ caseId, phase }: { caseId: string; phase: HandoffPhase }) {
  return <div className={`case-handoff is-${phase}`}>
    <div className="case-handoff-card" aria-hidden="true">
      <span className="case-handoff-mark">
        <OeroMark />
        <svg className="case-handoff-tick" viewBox="0 0 56 56" focusable="false"><circle cx="28" cy="28" r="24" /><path d="M17 29l8 8 14-15" /></svg>
      </span>
      <span className="case-handoff-text"><span>Gathering materials…</span><span>Ready for review</span></span>
      <span className="case-handoff-bar"><span /></span>
    </div>
    <p className="sr-only" role="status">{handoffAnnouncement(phase, caseId)}</p>
  </div>;
}
