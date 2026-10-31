// The owl mascot (Mascot.tsx): where its pupils look, which idle action it plays next, and what it
// says. Pure functions, so the behaviour is testable without a browser.

/** Idle actions, played one at a time every few seconds while nothing else is happening. */
export const IDLE_ACTIONS = ["blink", "double-blink", "hop", "tilt", "wiggle", "glance", "wave", "stretch"] as const;
export type IdleAction = typeof IDLE_ACTIONS[number];
/** The owl's one action that isn't idle: being clicked too many times. */
export type OwlAction = IdleAction | "ruffled";
export const RUFFLED_MS = 900;
/** How long each action's class stays on (ms); blinks are handled by the lids, not a class. */
export const ACTION_MS: Record<IdleAction, number> = { blink: 180, "double-blink": 460, hop: 620, tilt: 900, wiggle: 700, glance: 1400, wave: 1300, stretch: 1500 };

/** The next idle action: never the same one twice in a row. `random` is in [0, 1). */
export function nextIdleAction(previous: IdleAction | null, random: number): IdleAction {
  const choices = IDLE_ACTIONS.filter(action => action !== previous);
  return choices[Math.min(choices.length - 1, Math.floor(random * choices.length))];
}

/** Wait before the next idle action: 3.5–7 s. */
export function idleDelay(random: number): number {
  return Math.round(3500 + random * 3500);
}

/** Eyes follow the cursor once it is this close to the owl's centre (CSS px). */
export const FOLLOW_RADIUS = 360;

/**
 * The pupils' offset (in the eye's own units, -1..1 on each axis) for a cursor at (dx, dy) from the
 * owl's centre: following inside FOLLOW_RADIUS, looking ahead (0, 0) outside it. The pull eases in
 * over the first 140 px so the eyes don't snap when the cursor is right on the owl.
 */
export function lookAt(dx: number, dy: number, radius = FOLLOW_RADIUS): { x: number; y: number; following: boolean } {
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance > radius || distance === 0) return { x: 0, y: 0, following: distance === 0 };
  const strength = Math.min(1, distance / 140);
  return { x: (dx / distance) * strength, y: (dy / distance) * strength, following: true };
}

/** A gentle 3D tilt toward the cursor (degrees), only while following. */
export function tiltToward(look: { x: number; y: number; following: boolean }, max = 9): { rx: number; ry: number } {
  if (!look.following) return { rx: 0, ry: 0 };
  return { rx: Math.round(-look.y * max * 10) / 10, ry: Math.round(look.x * max * 10) / 10 };
}

/** What the owl says after the reviewer closes a case: what they did, then what's left. */
export function cheerLine({ caseId, closedByYou, left }: { caseId: string; closedByYou: number; left: number }): { title: string; detail: string } {
  const titles = ["Nice work!", "Great call!", "Case closed!", "Well done!"];
  const title = titles[(closedByYou - 1 + titles.length) % titles.length];
  const tally = closedByYou === 1 ? "That's your first case closed today." : `That's ${closedByYou} cases you've closed today.`;
  const rest = left === 0 ? "Your queue is all clear." : `${left} ${left === 1 ? "dispute is" : "disputes are"} still in your queue.`;
  return { title, detail: `${caseId} is closed and both parties are notified. ${tally} ${rest}` };
}

/** What the owl tells you when you click it. Each one is true of the product. */
export const OWL_TIPS = [
  "The rules decide. The AI only argues and explains.",
  "Same facts, same ruling, every time.",
  "Routine cases close themselves. You see the ones that need a person.",
  "Every fact has an ID, so an advocate can only cite what's on record.",
  "Party history never changes a ruling. It only feeds the bad-faith check.",
  "A signal isn't proof. It's a reason to look closer.",
  "Fraud signals stay with you. Riders and drivers never see them.",
  "A reviewer can reopen any case, even one that closed itself.",
];
export const RUFFLED_LINE = "Okay, okay, I'm awake!";
/** How long a tip stays in the bubble before the greeting returns (ms). */
export const TIP_MS = 10000;

const RUFFLE_CLICKS = 5;
const RUFFLE_WINDOW_MS = 3000;

/** Records a click: five within three seconds ruffles the owl and starts the count again. */
export function registerPoke(times: readonly number[], now: number): { times: number[]; ruffled: boolean } {
  const recent = [...times.filter(time => now - time < RUFFLE_WINDOW_MS), now];
  return recent.length >= RUFFLE_CLICKS ? { times: [], ruffled: true } : { times: recent, ruffled: false };
}

/** The owl naps after this long with no activity (ms). */
export const NAP_AFTER_MS = 60000;

export function shouldNap(idleMs: number, { naps, watching }: { naps: boolean; watching: boolean }): boolean {
  return naps && !watching && idleMs >= NAP_AFTER_MS;
}

/** Where the owl looks while AI Review runs: down and to the right, at the progress bar. */
export const WATCH_LOOK = { x: .6, y: .75, following: true };

const WATCH_LINES = ["Reading the evidence…", "Hearing both sides…", "Checking the rules…"];
export const WATCH_LINE_MS = 3500;

/** What the owl says during AI Review. The batch answers all at once, so it has no count until then. */
export function watchLine({ done, total, tick }: { done: number; total: number; tick: number }): string {
  return done > 0 ? `${done} of ${total} ready…` : WATCH_LINES[tick % WATCH_LINES.length];
}

/** What the owl says when AI Review finishes; null if no case got a result. */
export function reviewedLine(rows: { id: string; status: string }[], ran: readonly string[]): string | null {
  const batch = rows.filter(row => ran.includes(row.id) && row.status !== "not_run");
  if (!batch.length) return null;
  const closed = batch.filter(row => row.status === "auto").length;
  const need = batch.length - closed;
  const closedText = `${closed} closed ${closed === 1 ? "itself" : "themselves"}`;
  if (!need) return closed === 1 ? "Done. It closed itself, so nothing needs you." : `Done. All ${closed} closed themselves, so nothing needs you.`;
  return closed ? `Done. ${need} ${need === 1 ? "needs" : "need"} you, ${closedText}.` : `Done. ${need === 1 ? "It needs" : `All ${need} need`} you.`;
}
