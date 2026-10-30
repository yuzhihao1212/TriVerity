export const SIDEBAR_KEY = "triverity.sidebar";

export const SIDEBAR_GROUP_KEY = "triverity.sidebar.group.";
type Group = import("./disputeList").Category;

/** Access to localStorage itself may throw, as well as getItem/setItem. */
export function readGroupOpen(group: Group, storage?: Pick<Storage, "getItem">): boolean {
  try { return (storage ?? window.localStorage).getItem(SIDEBAR_GROUP_KEY + group) !== "collapsed"; }
  catch { return true; }
}

export function writeGroupOpen(group: Group, open: boolean, storage?: Pick<Storage, "setItem">): void {
  try { (storage ?? window.localStorage).setItem(SIDEBAR_GROUP_KEY + group, open ? "open" : "collapsed"); }
  catch { /* Keep the in-memory choice when storage is unavailable. */ }
}

/** Whether the dispute list is open; open unless the viewer collapsed it. */
export function readSidebarOpen(storage: Pick<Storage, "getItem">): boolean {
  try { return storage.getItem(SIDEBAR_KEY) !== "collapsed"; } catch { return true; }
}

export function writeSidebarOpen(storage: Pick<Storage, "setItem">, open: boolean): void {
  try { storage.setItem(SIDEBAR_KEY, open ? "open" : "collapsed"); } catch { /* Still applies for this session if storage is blocked. */ }
}

/**
 * Two open/collapsed choices: the stored one for case pages, and an in-memory one for the
 * home page, which starts as the collapsed rail (the home list already shows every case).
 * Toggling on home never touches the stored case-page choice.
 */
export interface SidebarState { caseOpen: boolean; homeOpen: boolean }

export const initialSidebarState = (caseOpen: boolean): SidebarState => ({ caseOpen, homeOpen: false });

export function sidebarIsOpen(state: SidebarState, onHome: boolean): boolean {
  return onHome ? state.homeOpen : state.caseOpen;
}

/** The next state, and whether the case-page choice changed (so the caller stores it). */
export function toggleSidebarState(state: SidebarState, onHome: boolean): { state: SidebarState; persist: boolean } {
  return onHome ? { state: { ...state, homeOpen: !state.homeOpen }, persist: false }
    : { state: { ...state, caseOpen: !state.caseOpen }, persist: true };
}

/** Open the list on whichever page is showing (e.g. "show the current case", a filter picked from the rail). */
export function openSidebarState(state: SidebarState, onHome: boolean): { state: SidebarState; persist: boolean } {
  return onHome ? { state: { ...state, homeOpen: true }, persist: false } : { state: { ...state, caseOpen: true }, persist: !state.caseOpen };
}
