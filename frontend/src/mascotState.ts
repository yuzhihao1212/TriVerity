// The owl mascot (Mascot.tsx): where its pupils look, which idle action it plays next, and what it
// says. Pure functions, so the behaviour is testable without a browser.

/** Idle actions, played one at a time every few seconds while nothing else is happening. */
export const IDLE_ACTIONS = ["blink", "double-blink", "hop", "tilt", "wiggle", "glance"] as const;
export type IdleAction = typeof IDLE_ACTIONS[number];
/** How long each action's class stays on (ms); blinks are handled by the lids, not a class. */
export const ACTION_MS: Record<IdleAction, number> = { blink: 180, "double-blink": 460, hop: 620, tilt: 900, wiggle: 700, glance: 1400 };

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
