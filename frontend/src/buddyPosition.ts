// Where the case owl sits once the reviewer has moved it, and where its panel opens from there.
// The spot is measured from the bottom-right corner, like the default CSS, so an unmoved owl and a
// moved one share one coordinate system. Pure, apart from the saved spot.

const SPOT_KEY = "triverity.buddySpot";
/** Kept clear of every viewport edge, for the owl and its panel alike. */
export const EDGE = 16;
const GAP = 8;
const PANEL_WIDTH = 340;

export interface BuddySpot { right: number; bottom: number }
export interface Size { width: number; height: number }
export interface Box { left: number; top: number; width: number; height: number }

type Store = Pick<Storage, "getItem" | "setItem"> | null;

export function readSpot(store: Store): BuddySpot | null {
  try {
    const spot = JSON.parse(store?.getItem(SPOT_KEY) ?? "null");
    return Number.isFinite(spot?.right) && Number.isFinite(spot?.bottom) ? { right: spot.right, bottom: spot.bottom } : null;
  } catch { return null; }
}
export function writeSpot(store: Store, spot: BuddySpot): void {
  try { store?.setItem(SPOT_KEY, JSON.stringify(spot)); } catch { /* Storage may be blocked: the owl just goes back to its corner next visit. */ }
}

/** Keeps the whole owl on screen, however it was dragged or however small the window became. */
export function clampSpot(spot: BuddySpot, owl: Size, viewport: Size): BuddySpot {
  const clamp = (value: number, max: number) => Math.round(Math.min(Math.max(value, EDGE), Math.max(EDGE, max)));
  return { right: clamp(spot.right, viewport.width - owl.width - EDGE), bottom: clamp(spot.bottom, viewport.height - owl.height - EDGE) };
}

/** The spot for an owl whose box is `owl`, so a drag can start from wherever it sits now. */
export function spotOf(owl: Box, viewport: Size): BuddySpot {
  return { right: viewport.width - owl.left - owl.width, bottom: viewport.height - owl.top - owl.height };
}

export interface PanelBox { below: boolean; left: number; width: number; maxHeight: number }

/**
 * The panel opens on the roomier side of the owl: above it in the lower half of the screen, below it
 * in the upper half; lined up with its left edge on the left half, its right edge on the right half,
 * then nudged to stay on screen. `left` is relative to the owl.
 */
export function panelBox(owl: Box, viewport: Size): PanelBox {
  const below = owl.top + owl.height / 2 < viewport.height / 2;
  const width = Math.min(PANEL_WIDTH, viewport.width - 2 * EDGE);
  const wanted = owl.left + owl.width / 2 < viewport.width / 2 ? owl.left : owl.left + owl.width - width;
  const left = Math.min(Math.max(wanted, EDGE), viewport.width - EDGE - width) - owl.left;
  const room = below ? viewport.height - owl.top - owl.height : owl.top;
  return { below, left: Math.round(left), width, maxHeight: Math.round(room - GAP - EDGE) };
}
