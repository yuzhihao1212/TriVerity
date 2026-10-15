import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/aiMode.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { readAiMode, writeAiMode, aiQuery, AI_MODE_KEY } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('live by default; offline only when chosen; storage failures never throw', () => {
  const store = new Map();
  const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.equal(readAiMode(storage), 'live');
  writeAiMode(storage, 'offline');
  assert.equal(store.get(AI_MODE_KEY), 'offline');
  assert.equal(readAiMode(storage), 'offline');
  store.set(AI_MODE_KEY, 'something');
  assert.equal(readAiMode(storage), 'live');
  const blocked = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
  assert.equal(readAiMode(blocked), 'live');
  assert.doesNotThrow(() => writeAiMode(blocked, 'offline'));
});

test('only offline adds the query that turns the LLM off', () => {
  assert.equal(aiQuery('offline'), '?ai=off');
  assert.equal(aiQuery('live'), '');
});
