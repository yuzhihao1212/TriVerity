import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';

const p = await load('progressEstimate');
const done = (...agents) => agents.map((agent, index) => ({ step: index + 1, agent, status: 'completed' }));
const ALL = ['evidence_loader', 'evidence_collector', 'fraud_detector', 'rider_advocate', 'driver_advocate',
  'rider_rebuttal', 'driver_rebuttal', 'precedent_agent', 'judge'];

test('a fresh run estimates the sum of its stages, the longest member of each parallel stage once', () => {
  const view = p.progressEstimate({ steps: [], elapsed: 0 });
  // 0.5 (loader, minimum) + 4.8 + 3.3 (driver advocate) + 3.1 (driver reply) + 1.2 + 4.4 = 17.3
  assert.equal(view.estimate, 'About 18 s left · 0 s so far');
  assert.equal(view.count, '0 of 9 agents done');
  // Until the first agent event arrives, no agent is named as running.
  assert.equal(view.runningLabel, 'Connecting to the agents…');
});

test('mid-run, the running stage counts down from when the previous stage finished', () => {
  const view = p.progressEstimate({ steps: done('evidence_loader', 'evidence_collector'),
    finishedAt: { evidence_loader: 0.2, evidence_collector: 5 }, elapsed: 7 });
  // Stage 3 has run 2 s: max(0.5, 1.0, 1.3) + 3.1 + 1.2 + 4.4 = 10.0
  assert.equal(view.estimate, 'About 10 s left · 7 s so far');
  assert.deepEqual(view.running, ['fraud_detector', 'rider_advocate', 'driver_advocate']);
  assert.equal(view.runningLabel, 'Running: Fraud detector, Rider advocate, Driver advocate');
});

test('the shown estimate never goes up', () => {
  const view = p.progressEstimate({ steps: [], elapsed: 0, previousRemaining: 9 });
  assert.equal(view.remaining, 9);
  assert.equal(view.estimate, 'About 9 s left · 0 s so far');
});

test('a slow agent says so instead of counting down to zero', () => {
  const steps = done(...ALL.slice(0, 8));
  const finishedAt = { precedent_agent: 12 };
  assert.match(p.progressEstimate({ steps, finishedAt, elapsed: 18 }).estimate, /^About \d+ s left/);
  // Judge typical 4.4 s: overdue after max(6.6, 7.4) = 7.4 s.
  assert.equal(p.progressEstimate({ steps, finishedAt, elapsed: 20 }).estimate, 'Taking longer than usual · 20 s');
  assert.ok(p.progressEstimate({ steps, finishedAt, elapsed: 30 }).remaining > 0, 'never 0 s left while running');
});

test('near-instant agents do not trip the slow warning straight away', () => {
  const view = p.progressEstimate({ steps: done('evidence_loader', 'evidence_collector'),
    finishedAt: { evidence_collector: 5 }, elapsed: 6 });
  assert.equal(view.overdue, false);
});

test('the fill is capped at 96% until the Judge finishes, then 100%', () => {
  const nearly = p.progressEstimate({ steps: done(...ALL.slice(0, 8)), finishedAt: { precedent_agent: 12 }, elapsed: 16.9 });
  assert.ok(nearly.fill <= 96 && nearly.fill > 88, String(nearly.fill));
  const finished = p.progressEstimate({ steps: done(...ALL), elapsed: 17.2, complete: true });
  assert.equal(finished.fill, 100);
  assert.equal(finished.estimate, 'Finished in 18 s');
  assert.equal(finished.runningLabel, 'Completed');
  assert.equal(finished.completionText, 'Completed · all 9 agents finished in 18 s');
  assert.equal(p.progressEstimate({ steps: [], elapsed: 0 }).fill, 0);
});

test('the non-streaming fallback waits honestly', () => {
  const view = p.progressEstimate({ steps: [], elapsed: 4.2, streaming: false });
  assert.equal(view.estimate, 'Waiting for the complete result · 5 s');
  assert.deepEqual(view.running, []);
});

test('unknown agents get their raw name; follow mode tolerates 80 px from the bottom', () => {
  assert.equal(p.progressName('judge'), 'Judge');
  assert.equal(p.progressName('mystery_agent'), 'mystery_agent');
  assert.equal(p.nearLatest(2000, 800, 1120), true);
  assert.equal(p.nearLatest(2000, 800, 1119), false);
});
