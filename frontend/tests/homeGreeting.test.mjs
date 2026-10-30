import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';

const hs = await load('homeState');
const rows = statuses => statuses.map(status => ({ status }));

test('the greeting follows the reviewer\'s clock', () => {
  assert.deepEqual([0, 11, 12, 17, 18, 23].map(hs.greeting),
    ['Good morning', 'Good morning', 'Good afternoon', 'Good afternoon', 'Good evening', 'Good evening']);
});

test('the line under it says what is waiting and what needs the reviewer, from the real queue', () => {
  assert.equal(hs.greetingLine([]), 'Your queue is empty.');
  assert.equal(hs.greetingLine(rows(Array(9).fill('not_run'))), "9 disputes are waiting. Routine ones can close themselves; you'll see the rest.");
  assert.equal(hs.greetingLine(rows(['decide', 'auto', 'not_run'])), '1 dispute needs your decision, out of 3 in your queue.');
  assert.equal(hs.greetingLine(rows(['decide', 'decide', 'closed'])), '2 disputes need your decision, out of 3 in your queue.');
  assert.equal(hs.greetingLine(rows(['auto', 'not_run', 'not_run'])), '2 disputes still to run, out of 3 in your queue.');
  assert.equal(hs.greetingLine(rows(['auto', 'closed'])), 'All 2 disputes in your queue have been handled.');
});
