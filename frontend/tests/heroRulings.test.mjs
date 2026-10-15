import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/heroRulings.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { HERO_RULINGS, HERO_ROTATE_MS, nextHeroIndex } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('three example rulings covering both dispute types and an escalation, every 2.5 s', () => {
  assert.equal(HERO_ROTATE_MS, 2500);
  assert.deepEqual(HERO_RULINGS.map(r => r.id), ['D001', 'D006', 'D007']);
  assert.deepEqual([...new Set(HERO_RULINGS.map(r => r.kind))].sort(), ['No-show', 'Route']);
  assert.deepEqual(HERO_RULINGS.map(r => r.tone), ['ok', 'neutral', 'warn']);
  for (const r of HERO_RULINGS) assert.ok(r.label.startsWith(`Example ${r.id}`), r.id);
});

test('rotation wraps round and never breaks on an empty list', () => {
  assert.deepEqual([0, 1, 2].map(i => nextHeroIndex(i, 3)), [1, 2, 0]);
  assert.equal(nextHeroIndex(5, 0), 0);
});
