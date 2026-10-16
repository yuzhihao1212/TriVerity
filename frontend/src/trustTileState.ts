export interface TrustTileState {
  openId: string | null;
  trigger: "hover" | "focus" | "pinned" | null;
}
export type TrustTileAction = { type: "hover" | "leave" | "focus" | "blur" | "toggle"; id: string } | { type: "escape" };
export const CLOSED_TRUST_TILE: TrustTileState = { openId: null, trigger: null };

/** A single open tile, with an explicit close that wins over lingering hover/focus. */
export function trustTileState(state: TrustTileState, action: TrustTileAction): TrustTileState {
  if (action.type === "escape") return CLOSED_TRUST_TILE;
  if (action.type === "toggle") return state.openId === action.id ? CLOSED_TRUST_TILE : { openId: action.id, trigger: "pinned" };
  if (action.type === "focus") return { openId: action.id, trigger: "focus" };
  if (action.type === "hover") return state.openId === action.id && state.trigger !== "hover"
    ? state : { openId: action.id, trigger: "hover" };
  if (state.openId === action.id && ((action.type === "leave" && state.trigger === "hover")
    || (action.type === "blur" && state.trigger === "focus"))) return CLOSED_TRUST_TILE;
  return state;
}
