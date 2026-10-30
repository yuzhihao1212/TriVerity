/** Tooltip offset relative to its trigger, constrained to the viewport with a quiet gutter. */
export function tooltipLeft(triggerLeft: number, triggerWidth: number, tipWidth: number, viewportWidth: number): number {
  const gutter = 12;
  const centred = triggerLeft + (triggerWidth - tipWidth) / 2;
  const pageLeft = Math.max(gutter, Math.min(centred, viewportWidth - gutter - tipWidth));
  return pageLeft - triggerLeft;
}
