import { decisionTone } from "./outcomeTone";

type FeaturedCase = {
  id: string;
  icon: "route" | "shield" | "pin";
  title: string;
  evidence: readonly [string, string];
  evidenceSummary: string;
} & ({ decision: "partial_refund"; refundAmount: number } | {
  decision: "needs_review" | "no_action";
  refundAmount?: never;
});

// Curated snapshots of these synthetic samples, not a request to run the agents.
const SAMPLES: readonly FeaturedCase[] = [
  { id: "D001", icon: "route", title: "A detour and a refund", evidence: ["+44% route", "6-min stop"],
    evidenceSummary: "Route 44% longer, a 6-minute stop", decision: "partial_refund", refundAmount: 6.3 },
  { id: "D007", icon: "shield", title: "When a human should step in", evidence: ["Threat in chat", "Fraud risk"],
    evidenceSummary: "Threat in chat, high bad-faith risk", decision: "needs_review" },
  { id: "DISP-002", icon: "pin", title: "The organisers’ own case", evidence: ["0 m from pickup", "Waited 8 min"],
    evidenceSummary: "Driver arrived 0 metres from pickup and waited 8 minutes", decision: "no_action" },
];

export const CASES = SAMPLES.map(sample => {
  const amount = sample.decision === "partial_refund" ? `$${sample.refundAmount.toFixed(2)}` : null;
  const outcome = amount ? `Partial refund ${amount}` : sample.decision === "needs_review" ? "Escalated to a human" : "Fee upheld";
  const spokenOutcome = amount ? `partial refund of ${amount}` : sample.decision === "needs_review" ? "escalated to a human reviewer" : "no-show fee upheld";
  return {
    ...sample, href: `#/console/${sample.id}`, tone: decisionTone(sample.decision), outcome,
    accessibleName: `Open case ${sample.id}: ${sample.title}. ${sample.evidenceSummary}. Outcome: ${spokenOutcome}.`,
  };
});
