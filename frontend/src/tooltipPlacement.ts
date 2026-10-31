/** Tooltip offset relative to its trigger, constrained to the viewport with a quiet gutter. */
export function tooltipLeft(triggerLeft: number, triggerWidth: number, tipWidth: number, viewportWidth: number): number {
  const gutter = 12;
  const centred = triggerLeft + (triggerWidth - tipWidth) / 2;
  const pageLeft = Math.max(gutter, Math.min(centred, viewportWidth - gutter - tipWidth));
  return pageLeft - triggerLeft;
}

/** Above the trigger, or below it when there isn't room above. */
export function tooltipTop(triggerTop: number, triggerBottom: number, tipHeight: number, viewportHeight: number, gap = 8, margin = 8) {
  const above = triggerTop - gap - tipHeight;
  if (above >= margin) return above;
  return Math.max(margin, Math.min(triggerBottom + gap, viewportHeight - tipHeight - margin));
}
