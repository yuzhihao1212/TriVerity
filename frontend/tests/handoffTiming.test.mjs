import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';

const h = await load('handoffTiming');

test('the hand-off spins 1.5 s, then the tick draws and holds before the case slides in', () => {
  const plan = h.handoffPlan(false);
  assert.equal(plan.ready, 1500);
  assert.equal(plan.leave - plan.ready, 1400, 'tick draws 0.8 s and holds 0.6 s');
  assert.ok(plan.done > plan.leave);
});

test('with reduced motion it goes straight to the still tick, briefly', () => {
  const plan = h.handoffPlan(true);
  assert.equal(plan.ready, 0);
  assert.equal(plan.leave, plan.done);
  assert.ok(plan.leave <= 1000);
});

test('it plays once per case, and not for the case the console opened on', () => {
  assert.equal(h.shouldHandoff({ openedOnLoad: false, seen: false }), true);
  assert.equal(h.shouldHandoff({ openedOnLoad: false, seen: true }), false);
  assert.equal(h.shouldHandoff({ openedOnLoad: true, seen: false }), false);
});

test('screen readers hear which case is loading, then that it is ready', () => {
  assert.equal(h.handoffAnnouncement('loading', 'D007'), 'Loading case D007');
  assert.equal(h.handoffAnnouncement('ready', 'D007'), 'Ready for review');
});
