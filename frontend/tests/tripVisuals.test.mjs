import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/tripVisuals.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const v = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('progress over time adds up GPS distance and finds the stop', () => {
  const at = (min, lat) => ({ lat, lng: 103.8, timestamp: `2026-09-20T08:${String(min).padStart(2, '0')}:00+08:00` });
  const series = v.progress([at(0, 1.30), at(5, 1.31), at(6, 1.31), at(10, 1.31), at(12, 1.32)]);
  assert.equal(series.length, 5);
  assert.equal(series.at(-1).minutes, 12);
  assert.ok(Math.abs(series.at(-1).km - 2.22) < 0.05);              // two 0.01-degree legs of ~1.11 km
  assert.deepEqual(v.plateaus(series), [{ from: 5, to: 10 }]);       // stopped from 08:05 to 08:10
  assert.equal(v.progress([at(0, 1.3)]), null);
});

test('fare segments follow the itemised lines and add up to the charge', () => {
  const lines = [{ label: 'Base', amount: 3.1 }, { label: 'Distance', amount: 14.7 }, { label: 'Time', amount: 7 }];
  const segments = v.fareSegments(lines, 24.8);
  assert.deepEqual(segments.map(s => s.label), ['Base', 'Distance', 'Time']);
  assert.ok(Math.abs(segments.reduce((s, x) => s + x.amount, 0) - 24.8) < 1e-9);
  assert.deepEqual(v.fareSegments([], 19.3), [{ label: 'Charged fare', amount: 19.3 }]);
});

test('the km ruler uses round steps with about four ticks', () => {
  assert.equal(v.niceStep(14.7), 5);
  assert.equal(v.niceStep(11), 5);
  assert.equal(v.niceStep(6), 2);
  assert.equal(v.niceStep(3.2), 1);
  assert.equal(v.niceStep(40), 10);
});
