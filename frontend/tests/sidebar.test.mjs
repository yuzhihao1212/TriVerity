import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/sidebar.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { readSidebarOpen, writeSidebarOpen, SIDEBAR_KEY } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('dispute list is open by default, remembers a collapse, and survives blocked storage', () => {
  const store = new Map();
  const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.equal(readSidebarOpen(storage), true);
  writeSidebarOpen(storage, false);
  assert.equal(store.get(SIDEBAR_KEY), 'collapsed');
  assert.equal(readSidebarOpen(storage), false);
  writeSidebarOpen(storage, true);
  assert.equal(readSidebarOpen(storage), true);
  const blocked = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
  assert.equal(readSidebarOpen(blocked), true);
  assert.doesNotThrow(() => writeSidebarOpen(blocked, false));
});
