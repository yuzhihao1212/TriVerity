import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import { load } from './_load.mjs';

const { readGroupOpen, writeGroupOpen, SIDEBAR_GROUP_KEY } = await load('sidebar');

test('category folds are independent, persisted, and default open for missing or invalid values', () => {
  const store = new Map();
  const storage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  for (const group of ['route', 'no-show', 'other']) assert.equal(readGroupOpen(group, storage), true);
  writeGroupOpen('route', false, storage);
  assert.equal(store.get(SIDEBAR_GROUP_KEY + 'route'), 'collapsed');
  assert.equal(readGroupOpen('route', storage), false);
  assert.equal(readGroupOpen('no-show', storage), true);
  writeGroupOpen('route', true, storage);
  assert.equal(readGroupOpen('route', storage), true);
  store.set(SIDEBAR_GROUP_KEY + 'other', 'invalid');
  assert.equal(readGroupOpen('other', storage), true);
});

test('fold persistence survives blocked methods and unavailable browser storage', () => {
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(readGroupOpen('route', blocked), true);
  assert.doesNotThrow(() => writeGroupOpen('route', false, blocked));
  // Node has no window: the same catch also covers a throwing localStorage getter.
  assert.equal(readGroupOpen('route'), true);
  assert.doesNotThrow(() => writeGroupOpen('route', false));
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {
      get localStorage() { throw new Error('storage access denied'); },
    } });
    assert.equal(readGroupOpen('route'), true);
    assert.doesNotThrow(() => writeGroupOpen('route', false));
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else delete globalThis.window;
  }
});

const source = await readFile(new URL('../src/sidebar.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { readSidebarOpen, writeSidebarOpen, SIDEBAR_KEY } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('dispute list is collapsed by default, remembers the choice, and survives blocked storage', () => {
  const store = new Map();
  const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.equal(readSidebarOpen(storage), false);
  writeSidebarOpen(storage, false);
  assert.equal(store.get(SIDEBAR_KEY), 'collapsed');
  assert.equal(readSidebarOpen(storage), false);
  writeSidebarOpen(storage, true);
  assert.equal(readSidebarOpen(storage), true);
  const blocked = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
  assert.equal(readSidebarOpen(blocked), false);
  assert.doesNotThrow(() => writeSidebarOpen(blocked, false));
});

test('the collapsed rail has one icon per kind of case, with the open case marked', async () => {
  const { railShortcuts } = await load('disputeList');
  const cases = [{ type: 'route_deviation' }, { type: 'route_deviation' }, { type: 'no_show_charge' }];
  const open = { id: 'D002', summary: 'Wait Time Missing', type: 'no_show_charge' };
  const items = railShortcuts(cases, open);
  assert.deepEqual(items.map(item => [item.category, item.current]), [['route', false], ['no-show', true]]);
  assert.equal(items[0].label, 'Route cases: 2');
  assert.equal(items[1].label, 'No-show cases: 1. Current case: D002 · Wait Time Missing');
  assert.deepEqual(railShortcuts([{ type: 'route_deviation' }], open).map(item => item.category), ['route']);
});
