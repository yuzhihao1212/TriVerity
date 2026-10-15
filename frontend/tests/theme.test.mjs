import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/theme.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { readTheme, writeTheme, resolveTheme, THEME_KEY } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('a saved choice wins; otherwise the system setting decides', () => {
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme(null, true), 'dark');
  assert.equal(resolveTheme(null, false), 'light');
});

test('only light or dark is read back; storage failures never throw', () => {
  const store = new Map();
  const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.equal(readTheme(storage), null);
  writeTheme(storage, 'dark');
  assert.equal(store.get(THEME_KEY), 'dark');
  assert.equal(readTheme(storage), 'dark');
  store.set(THEME_KEY, 'purple');
  assert.equal(readTheme(storage), null);
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(readTheme(blocked), null);
  assert.doesNotThrow(() => writeTheme(blocked, 'light'));
});
