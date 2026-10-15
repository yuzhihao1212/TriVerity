// The example rulings that rotate on the landing hero card. Each is a sample
// dispute's real result (rules engine, offline run), so the hero never overstates.

export type HeroTone = "ok" | "neutral" | "warn";

export interface HeroRuling {
  id: string;
  kind: string;      // dispute category, shown small
  status: string;    // "Ruling ready" or "Sent to a reviewer"
  outcome: string;
  amount?: string;   // emphasised, coloured by tone
  why: string;
  confidence: string;
  tone: HeroTone;
  label: string;     // one sentence for screen readers
}

export const HERO_ROTATE_MS = 2500;

export const HERO_RULINGS: HeroRuling[] = [
  {
    id: "D001", kind: "Route", status: "Ruling ready", tone: "ok",
    outcome: "Partial refund", amount: "$6.30", why: "Route 44% longer · 6-min stop", confidence: "80% confident",
    label: "Example D001, route deviation: partial refund of $6.30, 80% confident. The route was 44% longer with a 6-minute stop.",
  },
  {
    id: "D006", kind: "No-show", status: "Ruling ready", tone: "neutral",
    outcome: "No-show fee upheld", why: "Waited 7 min at pickup · rider contacted", confidence: "85% confident",
    label: "Example D006, no-show charge: the fee is upheld, 85% confident. The driver waited 7 minutes at the pickup point and contacted the rider.",
  },
  {
    id: "D007", kind: "Route", status: "Sent to a reviewer", tone: "warn",
    outcome: "Escalated to a human", why: "Threat in chat · high bad-faith risk", confidence: "Safety first",
    label: "Example D007, route deviation: escalated to a human reviewer because the chat contains a threat and there is a high bad-faith risk.",
  },
];

/** The next card, wrapping round. */
export function nextHeroIndex(index: number, count: number): number {
  return count > 0 ? (index + 1) % count : 0;
}
