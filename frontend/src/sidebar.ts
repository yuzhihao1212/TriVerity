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
