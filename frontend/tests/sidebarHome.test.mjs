import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';

const s = await load('sidebar');

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return { data, getItem: key => data[key] ?? null, setItem: (key, value) => { data[key] = String(value); } };
}

test('the panel starts collapsed and stays as it was last left', () => {
  const storage = memoryStorage();
  assert.equal(s.readSidebarOpen(storage), false);
  s.writeSidebarOpen(storage, true);
  assert.equal(s.readSidebarOpen(storage), true);
  s.writeSidebarOpen(storage, false);
  assert.equal(s.readSidebarOpen(storage), false);
});

test('a choice saved before this change is still honoured', () => {
  assert.equal(s.readSidebarOpen(memoryStorage({ [s.SIDEBAR_KEY]: 'open' })), true);
  assert.equal(s.readSidebarOpen(memoryStorage({ [s.SIDEBAR_KEY]: 'collapsed' })), false);
});
