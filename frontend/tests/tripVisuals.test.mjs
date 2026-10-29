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

test('duration readout interpolates plotted distances and clamps at the endpoints', () => {
  const series = [{ minutes: 0, km: 0 }, { minutes: 10, km: 6 }, { minutes: 16, km: 6 }, { minutes: 30, km: 12 }];
  assert.equal(v.guideReadout(series, 5, 20, 8), '5 min · 3.0 km travelled · expected 2.0 km');
  assert.equal(v.kmAt(series, 23), 9);
  assert.equal(v.kmAt(series, -1), 0);
  assert.equal(v.kmAt(series, 99), 12);
  assert.equal(v.kmAt([], 5), null);
});

test('duration readout identifies a stop and does not extend the expected route past its end', () => {
  const series = [{ minutes: 0, km: 0 }, { minutes: 10, km: 6 }, { minutes: 16, km: 6 }, { minutes: 30, km: 12 }];
  assert.equal(v.guideReadout(series, 14, 20, 8), '14 min · 6.0 km travelled · expected 5.6 km · Stopped 6 min');
  assert.equal(v.guideReadout(series, 30, 20, 8), '30 min · 12.0 km travelled · expected 8.0 km');
  assert.equal(v.guideReadout([], 5, null, null), '5 min');
  assert.equal(v.guideReadout(series, 5, 0, null), '5 min · 3.0 km travelled');
});

test('fare and extra-distance readouts retain labels and use case amounts', () => {
  assert.equal(v.fareReadout({ label: 'Distance (14.7 km)', amount: 14.7 }), 'Distance (14.7 km): $14.70');
  assert.equal(v.distanceReadout(10.2, 14.7), '+4.5 km beyond the expected route');
  assert.equal(v.distanceReadout(10, 8.5), '1.5 km shorter than the expected route');
});

test('table rows and headlines expose comparison values including signed differences', () => {
  assert.deepEqual(v.comparisonRows(10.2, 14.7, 'km'), [
    { label: 'Expected', value: '10.2 km' }, { label: 'Actual', value: '14.7 km' },
    { label: 'Difference', value: '+4.5 km (+44%)' },
  ]);
  assert.equal(v.differenceLabel(22, 35, 'min'), '+13 min (+59%)');
  assert.equal(v.differenceLabel(18.5, 24.8, '$'), '+$6.30 (+34%)');
  assert.equal(v.differenceLabel(10, 8, 'km'), '−2 km (-20%)');
  assert.equal(v.differenceLabel(10, 10, 'km'), '0 km (0%)');
  assert.equal(v.differenceLabel(0, 4, 'km'), '+4 km');
  assert.equal(v.differenceLabel(10, 16.29, '$'), '+$6.29 (+63%)');
  assert.equal(v.comparisonRows(1.234, 2.345, 'km')[0].value, '1.234 km');
  assert.equal(v.differenceLabel(null, 4, 'km'), 'Difference unavailable');
  assert.equal(v.comparisonRows(null, 4, 'km')[0].value, 'Not provided');
});

test('fare table includes every segment at exactly the amounts plotted', () => {
  const lines = [{ label: 'Base', amount: 3 }, { label: 'Distance', amount: 7 }];
  const rows = v.comparisonRows(8, 12, '$', lines);
  assert.deepEqual(rows.slice(3), v.fareSegments(lines, 12).map(s => ({ label: s.label, value: `$${s.amount.toFixed(2)}` })));
  assert.deepEqual(v.comparisonRows(8, null, '$', lines).map(row => row.label), ['Expected', 'Actual', 'Difference']);
  assert.deepEqual(v.comparisonRows(8, 12, '$').at(-1), { label: 'Charged fare', value: '$12.00' });
});

test('km axis ticks include zero and a round ceiling at or above the data maximum', () => {
  assert.deepEqual(v.kmTicks(14.7), [0, 5, 10, 15]);
  assert.deepEqual(v.kmTicks(6), [0, 2, 4, 6]);
  assert.deepEqual(v.kmTicks(0), [0]);
  assert.deepEqual(v.kmTicks(NaN), [0]);
  const ticks = v.kmTicks(0.14);
  assert.ok(ticks.every(Number.isFinite));
  assert.ok(ticks.at(-1) >= 0.14);
});
