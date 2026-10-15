export const SIDEBAR_KEY = "triverity.sidebar";

/** Whether the dispute list is open; open unless the viewer collapsed it. */
export function readSidebarOpen(storage: Pick<Storage, "getItem">): boolean {
  try { return storage.getItem(SIDEBAR_KEY) !== "collapsed"; } catch { return true; }
}

export function writeSidebarOpen(storage: Pick<Storage, "setItem">, open: boolean): void {
  try { storage.setItem(SIDEBAR_KEY, open ? "open" : "collapsed"); } catch { /* Still applies for this session if storage is blocked. */ }
}
