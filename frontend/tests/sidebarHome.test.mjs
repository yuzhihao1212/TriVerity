import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';

const s = await load('sidebar');

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return { data, getItem: key => data[key] ?? null, setItem: (key, value) => { data[key] = String(value); } };
}

test('home defaults to the collapsed rail, whatever the stored case-page choice', () => {
  for (const caseOpen of [true, false]) {
    const state = s.initialSidebarState(caseOpen);
    assert.equal(s.sidebarIsOpen(state, true), false);
    assert.equal(s.sidebarIsOpen(state, false), caseOpen);
  }
});

test('expanding on home never changes the stored case-page choice', () => {
  const storage = memoryStorage({ [s.SIDEBAR_KEY]: 'collapsed' });
  let state = s.initialSidebarState(s.readSidebarOpen(storage));
  const apply = next => { if (next.persist) s.writeSidebarOpen(storage, next.state.caseOpen); state = next.state; };
  apply(s.toggleSidebarState(state, true));          // expand on home
  assert.equal(s.sidebarIsOpen(state, true), true);
  assert.equal(s.sidebarIsOpen(state, false), false); // opening a case: still their collapsed choice
  assert.equal(storage.data[s.SIDEBAR_KEY], 'collapsed');
  apply(s.openSidebarState(state, true));            // a filter picked from the rail on home
  assert.equal(storage.data[s.SIDEBAR_KEY], 'collapsed');
});

test('toggling on a case page stores the choice; home keeps its own', () => {
  const storage = memoryStorage();
  let state = s.initialSidebarState(true);
  const next = s.toggleSidebarState(state, false);
  assert.equal(next.persist, true);
  s.writeSidebarOpen(storage, next.state.caseOpen);
  state = next.state;
  assert.equal(storage.data[s.SIDEBAR_KEY], 'collapsed');
  assert.equal(s.sidebarIsOpen(state, true), false);
  // "Show the current case" opens the case-page list and stores it only if it changed.
  assert.equal(s.openSidebarState(state, false).persist, true);
  assert.equal(s.openSidebarState(s.initialSidebarState(true), false).persist, false);
});
