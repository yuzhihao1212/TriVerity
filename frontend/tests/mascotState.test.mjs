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

test('five quick clicks ruffle the owl and start the count again; slow clicks never do', () => {
  let times = [];
  for (const now of [0, 100, 200, 300]) {
    const poke = m.registerPoke(times, now);
    assert.equal(poke.ruffled, false);
    times = poke.times;
  }
  const fifth = m.registerPoke(times, 400);
  assert.equal(fifth.ruffled, true);
  assert.deepEqual(fifth.times, []);
  let slow = [];
  for (let n = 0; n < 8; n += 1) {
    const poke = m.registerPoke(slow, n * 1000);
    assert.equal(poke.ruffled, false);
    slow = poke.times;
  }
});

test('the owl naps only after a quiet minute, when allowed and not watching a run', () => {
  assert.equal(m.shouldNap(59999, { naps: true, watching: false }), false);
  assert.equal(m.shouldNap(60000, { naps: true, watching: false }), true);
  assert.equal(m.shouldNap(90000, { naps: false, watching: false }), false, 'Presentation mode stays awake');
  assert.equal(m.shouldNap(90000, { naps: true, watching: true }), false);
});

test('during AI Review the owl has no count until the batch answers', () => {
  const lines = new Set([0, 1, 2, 3].map(tick => m.watchLine({ done: 0, total: 9, tick })));
  assert.equal(lines.size, 3);
  for (const line of lines) assert.doesNotMatch(line, /\d/);
  assert.equal(m.watchLine({ done: 3, total: 9, tick: 5 }), '3 of 9 ready…');
});

test('the owl reports how AI Review went, counting only the cases that ran and got a result', () => {
  const row = (id, status) => ({ id, status });
  const rows = [row('A', 'auto'), row('B', 'decide'), row('C', 'auto'), row('D', 'not_run'), row('E', 'decide')];
  assert.equal(m.reviewedLine(rows, ['A', 'B', 'C', 'D']), 'Done. 1 needs you, 2 closed themselves.');
  assert.equal(m.reviewedLine(rows, ['A', 'B', 'E']), 'Done. 2 need you, 1 closed itself.');
  assert.equal(m.reviewedLine(rows, ['A', 'C']), 'Done. All 2 closed themselves, so nothing needs you.');
  assert.equal(m.reviewedLine(rows, ['A']), 'Done. It closed itself, so nothing needs you.');
  assert.equal(m.reviewedLine(rows, ['B']), 'Done. It needs you.');
  assert.equal(m.reviewedLine(rows, ['B', 'E']), 'Done. All 2 need you.');
  assert.equal(m.reviewedLine(rows, ['D']), null);
});

test('the tips are short enough for the bubble, and none repeats', () => {
  assert.equal(new Set(m.OWL_TIPS).size, m.OWL_TIPS.length);
  for (const tip of m.OWL_TIPS) assert.ok(tip.length <= 80, tip);
});

test('the entrance runs in order: fly, land, blink, wave, bubble, type, done', () => {
  const { fly, land, blink, wave, bubble, type, done } = m.ARRIVAL;
  const steps = [fly, land, blink, wave, bubble, type, done];
  assert.deepEqual(steps, [...steps].sort((a, b) => a - b));
  assert.ok(done - wave >= m.ACTION_MS.wave, 'the wave finishes before the entrance ends');
});

test('the entrance waits longer while the landing intro is still fading', () => {
  assert.ok(m.arrivalDelay(true) > m.arrivalDelay(false));
  assert.ok(m.arrivalDelay(false) > 0);
});

test('the greeting types out one character per step, never past its end', () => {
  const line = '9 disputes are waiting.';
  assert.equal(m.typedLength(line, 0), 0);
  assert.equal(m.typedLength(line, m.TYPE_MS * 5), 5);
  assert.equal(m.typedLength(line, 1e6), line.length);
  assert.equal(m.typedLength(line, -50), 0);
});
