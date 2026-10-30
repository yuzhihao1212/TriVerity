import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';

const m = await load('mascotState');

test('idle actions never repeat back to back, and wait 3.5–7 s', () => {
  for (const previous of [null, ...m.IDLE_ACTIONS]) {
    for (const r of [0, .2, .5, .8, .9999]) {
      const next = m.nextIdleAction(previous, r);
      assert.ok(m.IDLE_ACTIONS.includes(next));
      assert.notEqual(next, previous);
    }
  }
  assert.deepEqual([m.idleDelay(0), m.idleDelay(.9999)], [3500, 7000]);
});

test('eyes follow the cursor only when it is close, easing in near the owl', () => {
  assert.deepEqual(m.lookAt(500, 0), { x: 0, y: 0, following: false }, 'too far: look ahead');
  const near = m.lookAt(200, 0);
  assert.deepEqual([near.x, near.y, near.following], [1, 0, true]);
  const close = m.lookAt(0, 70);
  assert.deepEqual([close.x, close.y], [0, .5], 'within 140 px the pull eases in');
  assert.equal(m.lookAt(0, 0).x, 0);
  assert.ok(Math.hypot(m.lookAt(-150, 150).x, m.lookAt(-150, 150).y) <= 1.0001);
});

test('the 3D tilt leans toward the cursor and rests otherwise', () => {
  assert.deepEqual(m.tiltToward({ x: 1, y: 0, following: true }), { rx: -0, ry: 9 });
  assert.deepEqual(m.tiltToward({ x: 0, y: 1, following: true }), { rx: -9, ry: 0 });
  assert.deepEqual(m.tiltToward({ x: 1, y: 1, following: false }), { rx: 0, ry: 0 });
});

test('the cheer says what the reviewer did, then what is left', () => {
  const first = m.cheerLine({ caseId: 'D007', closedByYou: 1, left: 3 });
  assert.equal(first.title, 'Nice work!');
  assert.equal(first.detail, "D007 is closed and both parties are notified. That's your first case closed today. 3 disputes are still in your queue.");
  assert.match(m.cheerLine({ caseId: 'D008', closedByYou: 2, left: 1 }).detail, /That's 2 cases you've closed today\. 1 dispute is still in your queue\.$/);
  assert.match(m.cheerLine({ caseId: 'D002', closedByYou: 4, left: 0 }).detail, /Your queue is all clear\.$/);
  assert.notEqual(m.cheerLine({ caseId: 'x', closedByYou: 1, left: 0 }).title, m.cheerLine({ caseId: 'x', closedByYou: 2, left: 0 }).title);
});
