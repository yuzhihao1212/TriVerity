/** Demo customer copy. Generated explanations are supplied unchanged by the API and are
 * deliberately not templates here.
 */

/**
 * Customer promises the team still has to confirm (Task 10's CONFIRMED facts). Each claim is
 * shown only once its value is set here; until then the phone says only what is certain.
 * e.g. refundTime: "3–5 working days", ratingUnaffected: true, appealWindowDays: 7.
 */
export interface Confirmed { refundTime: string | null; ratingUnaffected: boolean; appealWindowDays: number | null }
export const CONFIRMED: Confirmed = { refundTime: null, ratingUnaffected: false, appealWindowDays: null };

/** The lines that depend on CONFIRMED; null means the claim is left out. */
export function confirmedCopy(c: Confirmed = CONFIRMED) {
  const within = c.appealWindowDays != null ? ` within ${c.appealWindowDays} days` : "";
  return {
    refundNext: c.refundTime ? `Back on your card in ${c.refundTime}.` : "The refund goes back to your original payment method.",
    rating: c.ratingUnaffected ? "Your rating isn't affected." : null,
    appealWindow: c.appealWindowDays != null ? `You can appeal within ${c.appealWindowDays} days.` : "If you disagree, you can appeal.",
    appealNote: `If you'd like us to look again, open More info and choose Appeal case${within}.`,
    refundTiming: c.refundTime ? (amount: string) => `Your ${amount} refund should reach your card within ${c.refundTime}.` : null,
    autoNotice: `This was decided automatically under our dispute policy. If you disagree, you can appeal${within}.`,
  };
}
const PROMISES = confirmedCopy();

export const CUSTOMER_COPY = {
  app: "Ryde · dispute update", caseTag: (id: string) => `Case ${id}`,
  region: (party: string) => `What the ${party} sees`,
  greeting: (name: string | null) => name ? `Hi ${name},` : "Hi there,",
  resolved: "Resolved", underReview: "Under review",
  result: {
    refund: (amount: string) => `You're getting ${amount} back`,
    credit: (amount: string) => `You're getting a ${amount} credit`,
    pendingAmount: "Your payment adjustment is being confirmed",
    noChange: "The charge stays as it is", driver: "This dispute is resolved",
    review: "A human reviewer will decide",
  },
  next: {
    refund: PROMISES.refundNext,
    credit: "Your credit will be added to your account.",
    driverRefund: (amount: string) => `${amount} of this fare went back to the rider.`,
    driverCredit: (amount: string) => `The rider receives a ${amount} credit.`,
    rating: PROMISES.rating, noChange: "You don't need to do anything.",
    review: "We'll follow up when a reviewer has looked at your case.",
  },
  note: "Note from your reviewer", more: "More info ›", back: "‹ Back",
  found: "What we found", nextSteps: "What happens now",
  footer: "Ryde Customer Support", message: "Your case update",
  rate: "Rate our support", appeal: "Appeal case", appealWindow: PROMISES.appealWindow,
  locked: (party: string) => `Available to the ${party} after sending. Try them in the next step: Customer view.`,
  feedback: {
    title: "How did we handle your case?", simulatedTag: "(simulated)", ratings: ["Very poor", "Poor", "Okay", "Good", "Great"],
    group: "Support rating", comment: "Anything else? · optional",
    placeholder: "Tell us what went well or what we could do better", send: "Send feedback",
    pick: "Pick a face first.", simulated: "Feedback is simulated and saved for this browser session only.",
    thanks: (name: string | null) => name ? `Thanks, ${name}` : "Thanks",
    saved: "We've saved your feedback. You can change it any time.",
    rated: (label: string) => `You rated us: ${label}`, change: "Change feedback", back: "Back to my case",
  },
  quick: {
    rider: {
      sorry: { label: "Sorry about your trip", text: (name: string | null) => `We're sorry about your trip${name ? `, ${name}` : ""}. Thanks for your patience.` },
      timing: { label: "When the refund arrives", text: PROMISES.refundTiming },
      thanks: { label: "Thanks for telling us", text: (name: string | null) => `Thank you for telling us${name ? `, ${name}` : ""}. Your feedback helps us improve every trip.` },
    },
    driver: {
      patience: { label: "Thanks for your patience", text: (name: string | null) => `Thanks for your patience while we reviewed this case${name ? `, ${name}` : ""}.` },
      appeal: { label: "How to appeal", text: PROMISES.appealNote },
      route: { label: "Route reminder", text: (name: string | null) => `Please follow the planned route and let the rider know if it needs to change${name ? `, ${name}` : ""}.` },
    },
  },
  placeholders: { rider: "Optional: a note to the rider, or choose a quick note", driver: "Optional: a note to the driver, or choose a quick note" },
} as const;
