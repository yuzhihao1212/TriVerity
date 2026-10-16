// The headline Trip tiles count up once per case per session (FactLibrary TripBody). Pure maths
// here; the requestAnimationFrame loop lives in the component.

export const COUNT_UP_MS = 600;
export const EVIDENCE_SEEN_KEY = "triverity.evidenceIntroSeen";

export interface CountTarget { sign: string; value: number; decimals: number; suffix: string }

/** "+44%" -> { sign: "+", value: 44, decimals: 0, suffix: "%" }; null if it is not a number. */
export function parseCountTarget(text: string): CountTarget | null {
  const match = /^([+-]?)(\d+(?:\.\d+)?)(.*)$/.exec(text.trim());
  if (!match) return null;
  return { sign: match[1], value: Number(match[2]), decimals: match[2].split(".")[1]?.length ?? 0, suffix: match[3] };
}

/** Ease-out cubic: fast start, gentle landing. */
export function easeOut(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - (1 - clamped) ** 3;
}

/** The text shown `elapsed` ms into the count: the sign and suffix are there from the start. */
export function countUpText(target: CountTarget, elapsed: number, duration = COUNT_UP_MS): string {
  const value = elapsed >= duration ? target.value : target.value * easeOut(elapsed / duration);
  return `${target.sign}${value.toFixed(target.decimals)}${target.suffix}`;
}

/** Width in `ch` that fits every frame, so the digits never shift the tile. */
export function countUpWidth(text: string): number {
  return text.length;
}
