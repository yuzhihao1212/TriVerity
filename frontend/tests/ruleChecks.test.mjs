import assert from 'node:assert/strict';
import test from 'node:test';

import { load } from './_load.mjs';

const { VERDICT, checksFor, missingReplyText } = await load('ruleChecks');

const reviews = [
  { party: 'rider', rules: [
    { rule: 'RD-1', verdict: 'supports', decisive: true },
    { rule: 'RD-3', verdict: 'supports', decisive: false },
    { rule: 'NS-2', verdict: 'does_not_apply', decisive: false },
  ], evidence_cited: 3, summary: '' },
  { party: 'driver', rules: [{ rule: 'RD-2', verdict: 'favours_other_side', decisive: false }], evidence_cited: 1, summary: '' },
];

test('checks are looked up per party and rule', () => {
  assert.equal(checksFor(reviews, 'rider').get('RD-3').verdict, 'supports');
  assert.equal(checksFor(reviews, 'driver').get('RD-2').verdict, 'favours_other_side');
  assert.equal(checksFor(reviews, 'driver').get('RD-1'), undefined);
});

test('a missing review gives no checks', () => {
  assert.equal(checksFor(undefined, 'rider').size, 0);
});

test('every verdict has a label', () => {
  for (const verdict of ['supports', 'favours_other_side', 'does_not_apply']) assert.ok(VERDICT[verdict].label);
});

test('a missing reply says whether the round was skipped or the AI reply was dropped', () => {
  assert.match(missingReplyText({ source: 'llm' }, { source: 'llm' }), /didn't pass our output checks/);
  assert.match(missingReplyText({ source: 'llm' }, { source: 'fallback' }), /runs only when both opening arguments use AI/);
  assert.match(missingReplyText({ source: 'fallback' }, { source: 'llm' }), /runs only when both opening arguments use AI/);
});
