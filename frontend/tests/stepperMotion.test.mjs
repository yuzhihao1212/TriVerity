import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';

const m = await load('stepperMotion');
const sv = await load('stepVisuals');
const TABS = ['intake', 'evidence', 'hearing', 'ruling', 'notify'].map(id => ({ id }));

test('the line ends at the current step: position only, never how much is reviewed or unlocked', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(i => m.lineFraction(i, 5)), [0, 0.25, 0.5, 0.75, 1]);
  assert.equal(m.lineFraction(-1, 5), 0);
  assert.equal(m.lineFraction(9, 5), 1);
  // Everything reviewed, but on Hearing: the line stops at Hearing.
  const states = sv.stepStates({ active: 'hearing', hasResult: true, busy: false, reviewed: ['evidence', 'hearing', 'ruling', 'notify'] });
  assert.deepEqual(states.map(s => s.joined), [false, true, true, false, false]);
});

test('after a run, steps 2-5 unlock in order, 180 ms apart, once the completion card has landed', () => {
  const schedule = m.unlockSchedule(TABS);
  assert.deepEqual(schedule.map(item => item.tab), ['evidence', 'hearing', 'ruling', 'notify']);
  assert.equal(schedule[0].at, m.COMPLETION_MS);
  assert.deepEqual(schedule.map(item => item.at - schedule[0].at), [0, 180, 360, 540]);
});

test('the position line names the step', () => {
  assert.equal(m.positionText(1, 5, 'Evidence'), 'Step 2 of 5 · Evidence');
  assert.equal(m.positionText(4, 5, 'Notify parties'), 'Step 5 of 5 · Notify parties');
});

test('moves: forward and back, none for the same step; a running move is settled before the next', () => {
  const first = m.nextMove(null, 0, 1, 1);
  assert.deepEqual(first, { settle: null, move: { from: 0, to: 1, kind: 'forward', id: 1 } });
  // A fast second click while the first is animating: settle the first, then start from where it ended.
  const second = m.nextMove(first.move, 1, 2, 2);
  assert.deepEqual(second.settle, first.move);
  assert.deepEqual(second.move, { from: 1, to: 2, kind: 'forward', id: 2 });
  assert.equal(m.nextMove(null, 3, 1, 3).move.kind, 'back');
  assert.equal(m.nextMove(null, 2, 2, 4).move, null);
  assert.equal(m.nextMove(null, -1, 2, 5).move, null);
});
