import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/chartIntro.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const ci = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('the whole intro takes 800-1000 ms', () => {
  assert.ok(ci.INTRO_TOTAL_MS >= 800 && ci.INTRO_TOTAL_MS <= 1000, `${ci.INTRO_TOTAL_MS} ms`);
  const ends = [
    ci.DISTANCE_LABEL_START + ci.DISTANCE.labelMs,
    ci.DURATION.traceStart + ci.DURATION.traceMs + ci.DURATION.labelMs,
    ci.FARE_EXTRA_START + ci.FARE.extraMs,
  ];
  assert.equal(ci.INTRO_TOTAL_MS, Math.max(...ends));
});

test('charts stagger left to right: Distance < Duration < Fare', () => {
  const { distance, duration, fare } = ci.CHART_STARTS;
  assert.ok(distance < duration && duration < fare);
  assert.equal(ci.DISTANCE.lineStart, distance);
  assert.equal(ci.DURATION.expectedStart, duration);
  assert.equal(ci.FARE.expectedStart, fare);
});

test('each chart sequences its own parts', () => {
  // Distance: the extra segment follows the shared part, then the label.
  assert.equal(ci.DISTANCE_EXTRA_START, ci.DISTANCE.lineStart + ci.DISTANCE.lineMs);
  assert.equal(ci.DISTANCE_LABEL_START, ci.DISTANCE_EXTRA_START + ci.DISTANCE.extraMs);
  // Duration: the expected line starts first; the trace is the longer draw.
  assert.ok(ci.DURATION.expectedStart < ci.DURATION.traceStart);
  assert.ok(ci.DURATION.traceMs > ci.DURATION.expectedMs);
  // Fare: expected bar, then the charged track, then the marker, then the "+$ above expected" note.
  assert.ok(ci.FARE.expectedStart < ci.FARE.chargedStart);
  assert.ok(ci.FARE_MARKER_START >= ci.FARE.chargedStart + ci.FARE.chargedMs);
  assert.ok(ci.FARE_EXTRA_START > ci.FARE_MARKER_START);
});

test('stopDelay is monotonic in x and clamped to the trace window', () => {
  const [left, right, trace, start] = [8, 232, 600, 250];
  let previous = -Infinity;
  for (let bandX = -50; bandX <= 300; bandX += 7) {
    const delay = ci.stopDelay(bandX, left, right, trace, start);
    assert.ok(delay >= previous, `monotonic at ${bandX}`);
    assert.ok(delay >= start && delay <= start + trace, `clamped at ${bandX}`);
    previous = delay;
  }
  assert.equal(ci.stopDelay(left, left, right, trace, start), start);
  assert.equal(ci.stopDelay(right, left, right, trace, start), start + trace);
  assert.equal(ci.stopDelay(120, left, right, trace, start), start + 300);
  // A degenerate chart (no width) or a bad x falls back to the trace start.
  assert.equal(ci.stopDelay(50, 10, 10, trace, start), start);
  assert.equal(ci.stopDelay(NaN, left, right, trace, start), start);
});

test('fare segments reveal back to back, proportionally, within their window', () => {
  const timings = ci.segmentTimings([3.1, 14.7, 7], 350, 350);
  assert.equal(timings[0].delay, 350);
  for (let i = 1; i < timings.length; i++) assert.ok(Math.abs(timings[i].delay - (timings[i - 1].delay + timings[i - 1].duration)) <= 1);
  const last = timings.at(-1);
  assert.ok(Math.abs(last.delay + last.duration - 700) <= 1);
  assert.ok(timings[1].duration > timings[2].duration && timings[2].duration > timings[0].duration);
  assert.deepEqual(ci.segmentTimings([], 0, 100), []);
  assert.deepEqual(ci.introVars(420, 150), { '--intro-delay': '420ms', '--intro-dur': '150ms' });
});

test('a case counts as new only the first time, per session', () => {
  const store = new Map();
  const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const seen = ci.createSeenCases(storage);
  assert.equal(seen.claim('D001'), true);
  assert.equal(seen.claim('D001'), false);
  assert.equal(seen.claim('D003'), true);
  assert.equal(seen.claim('D001'), false);
  // has() reads without marking: the component decides at render and marks once it plays.
  assert.equal(seen.has('J-NEW'), false);
  assert.equal(seen.has('J-NEW'), false);
  seen.mark('J-NEW');
  assert.equal(seen.has('J-NEW'), true);
  // A later page load in the same session (same sessionStorage) still remembers.
  assert.equal(ci.createSeenCases(storage).claim('D003'), false);
  // Blocked or corrupt storage: memory still prevents replays for this page load.
  const blocked = ci.createSeenCases({ getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } });
  assert.equal(blocked.claim('D001'), true);
  assert.equal(blocked.claim('D001'), false);
  const corrupt = ci.createSeenCases({ getItem: () => '{not json', setItem: () => {} });
  assert.equal(corrupt.claim('D001'), true);
  assert.equal(corrupt.claim('D001'), false);
  assert.equal(ci.createSeenCases(null).claim('D001'), true);
});
