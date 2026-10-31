/** The landing page's sections, in page order, as the side rail names them. */
export const LANDING_SECTIONS = [
  { id: "results", label: "Results" },
  { id: "problem", label: "The Problem" },
  { id: "flow", label: "How It Works" },
  { id: "views", label: "Who It Serves" },
  { id: "trust", label: "Trust" },
  { id: "rollout", label: "Rollout" },
  { id: "proof", label: "Under the Hood" },
  { id: "try", label: "Try a Case" },
] as const;

export type LandingSectionId = typeof LANDING_SECTIONS[number]["id"];

export interface SectionBox { top: number; height: number }

/**
 * Where the reader is: the last section whose top has passed the reading line, and how far
 * through it they are (0–1). -1 while still above the first section. At the very bottom of
 * the page the last section counts as read, since it may never reach the line.
 */
export function readingPosition(boxes: readonly SectionBox[], line: number, atEnd: boolean): { index: number; fraction: number } {
  if (!boxes.length) return { index: -1, fraction: 0 };
  if (atEnd) return { index: boxes.length - 1, fraction: 1 };
  let index = -1;
  boxes.forEach((box, i) => { if (box.top <= line) index = i; });
  if (index < 0) return { index, fraction: 0 };
  const { top, height } = boxes[index];
  return { index, fraction: height > 0 ? Math.min(1, Math.max(0, (line - top) / height)) : 1 };
}

/** How much of the rail to fill (0–1): it reaches each dot as its section starts. */
export function railFill(index: number, fraction: number, count: number): number {
  if (index < 0 || count < 2) return 0;
  return Math.min(1, (index + fraction) / (count - 1));
}
