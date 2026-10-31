// Content for the landing sections that show the product at work. Everything here comes from
// the product or the docs, so keep the values and their sources together.
import { customerResult } from "./customerState";

const D001 = { decision: "partial_refund", amount: 6.3 } as const;

// Excerpts of a live Hy3 run on D001, as generated (docs/screenshots/05-hearing.png).
export const HEARING_ROUNDS = [
  {
    title: "Each Side Makes Its Case",
    rider: "Refund the overcharge because the driver took a +44% longer route that also took +59% longer.",
    driver: "Charge should stand because the driver diverted due to congestion, not an unjustified detour.",
  },
  {
    title: "Each Side Replies",
    rider: "The driver advocate overstates by claiming congestion justified the detour; the driver's own chat was neutral and no congestion evidence exists, while the rider questioned the wrong direction.",
    driver: "The rider advocate overstates by calling it an unjustified detour under RD-3, leaving out GPS-6 showing avg speed 22 km/h consistent with congestion during the off-route period, which explains the longer route.",
  },
] as const;

const riderView = customerResult("rider", D001);
const driverView = customerResult("driver", D001);

// The rider and driver lines are the ones their phones show for D001.
export const CASE_VIEWS = [
  { role: "The Rider", icon: "person", need: "Learns the result in plain words, and can appeal.", status: riderView.status, line: riderView.line, next: riderView.next },
  { role: "The Driver", icon: "wheel", need: "Hears the same outcome, without blame.", status: driverView.status, line: driverView.line, next: driverView.next },
  { role: "The Reviewer", icon: "scales", need: "Sees the whole case, and has the final say.", status: "Auto-resolved", line: "Partial refund $6.30",
    next: ["Closed by policy at 80% confidence.", "Evidence, arguments and rules stay open, and the case can be reopened."] },
] as const;

// docs/business-case.md, deployment plan.
export const ROLLOUT = [
  { title: "Shadow Mode", time: "2–4 weeks", detail: "Runs beside the current team with no customer impact, measuring agreement with reviewers." },
  { title: "Pilot", time: "Route disputes first", detail: "Complete, low-risk cases go out automatically while a reviewer samples them daily." },
  { title: "Integrate", time: "Then scale", detail: "Replaces the mock data sources with Ryde’s trip, payment and messaging services, and adds logins and an audit log." },
  { title: "Govern", time: "Continuously", detail: "Versions the policy and re-runs evaluation, fairness and red-team checks before any rule or prompt change." },
] as const;

// docs/business-case.md: 5,000 disputes a day, 78% automated, 5–15 min a review, $20–30 an hour.
export const VALUE_MODEL = { disputes: 5000, automated: 0.78, minutes: [5, 15], hourly: [20, 30], aiCost: 0.002 } as const;
export const VALUE_STATS = [
  { value: "325–975 h", label: "Reviewer time freed a day" },
  { value: "$6,500–29,250", label: "Value of that time a day" },
  { value: "About $10", label: "AI cost a day" },
] as const;

// README.md, docs/security.md and docs/responsible-ai.md. Accessibility: axe-core on this page.
export const ENGINEERING_PROOF = [
  { value: "1,400+", label: "Automated tests", detail: "Backend and frontend, run in CI. None calls a real LLM." },
  { value: "9/9", label: "Rulings when the AI failed", detail: "Every AI reply is checked. If one fails, deterministic text replaces it and the ruling stands." },
  { value: "23", label: "Injection attacks tested", detail: "All offline, and 17 of them across 68 live Hy3 runs." },
  { value: "0", label: "axe violations on this page", detail: "Automated WCAG 2.2 AA check. A manual screen-reader pass is still to do." },
] as const;
