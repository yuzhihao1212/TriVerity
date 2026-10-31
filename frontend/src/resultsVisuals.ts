// SVG geometry in a shared 100 × 100 viewBox. Counts retain their measurement context.
export const RESULTS_BOX = 100;
export const SAMPLE_IDS = ["D001", "D002", "D003", "D004", "D005", "D006", "D007", "D008", "DISP-002"] as const;
export const SAMPLE_TICKS = SAMPLE_IDS.map((id, index) => ({
  id, x: 18 + (index % 3) * 32, y: 18 + Math.floor(index / 3) * 32, radius: 11,
}));
export const REPEAT_DOTS = Array.from({ length: 100 }, (_, index) => ({
  x: 9.5 + (index % 10) * 9, y: 9.5 + Math.floor(index / 10) * 9,
  radius: 2.7, row: Math.floor(index / 10),
}));

export function ringGeometry(radius: number, achieved: number, total: number) {
  const circumference = 2 * Math.PI * radius;
  const ratio = achieved / total;
  return { radius, circumference, ratio, accentLength: circumference * ratio, offset: circumference * (1 - ratio) };
}
export const AUTOMATION_RING = { ...ringGeometry(38, 390, 500), x: 50, y: 50, width: 12 };
export const STOPWATCH = {
  ...ringGeometry(34, 17, 60), x: 50, y: 56, width: 8, handLength: 25, handAngle: 360 * 17 / 60,
  button: { x: 42, y: 4, width: 16, height: 8 }, stem: { x: 50, y1: 12, y2: 22 },
};
// Cost: a small coin in front of a smaller one, about a fifth of a cent each.
export const COINS = [
  { x: 64, y: 38, radius: 22 },
  { x: 42, y: 58, radius: 30 },
] as const;
// Injection: a shield with a tick; none of the 68 live runs got through.
export const SHIELD = {
  outline: "M50 8 L84 20 V47 C84 69 70 85 50 93 C30 85 16 69 16 47 V20 Z",
  tick: "M35 50 L45 60 L66 38",
  bounds: { left: 16, right: 84, top: 8, bottom: 93 },
} as const;
