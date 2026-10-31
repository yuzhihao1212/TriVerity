import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';

const { amountAtStake, queueSummary, queueSegments, guidedDemoSteps } = await load('homeState');

test('queue summary counts cases, decisions, ready and closed; only decisions warn', () => {
  const rows = ['not_run', 'ready', 'decide', 'closed', 'reviewed', 'reopened'].map(status => ({ status }));
  assert.deepEqual(queueSummary(rows, true), [
    { text: '6 cases', warning: false },
    { text: '1 to decide', warning: true },
    { text: '1 ready', warning: false },
    { text: '1 closed', warning: false },
  ]);
});

test('zero counts are left out; the total always shows with correct grammar', () => {
  assert.deepEqual(queueSummary([], true), [{ text: '0 cases', warning: false }]);
  assert.deepEqual(queueSummary(['not_run', 'not_run'].map(status => ({ status })), true), [{ text: '2 cases', warning: false }]);
  assert.equal(queueSummary([{ status: 'ready' }], true)[0].text, '1 case');
});

test('appeals waiting appears only for positive counts when appeals are available', () => {
  const rows = [{ status: 'appeal_waiting' }];
  assert.deepEqual(queueSummary(rows, true).at(-1), { text: '1 appeal waiting', warning: true });
  assert.deepEqual(queueSummary([...rows, ...rows], true).at(-1), { text: '2 appeals waiting', warning: true });
  assert.equal(queueSummary(rows, false).length, 1, 'public demo hides unavailable appeals');
  assert.equal(queueSummary([], true).length, 1, 'zero appeals adds no segment');
});

test('guided demo always keeps all three numbered cases and prescribed copy', () => {
  assert.deepEqual(guidedDemoSteps([]).map(({ id, number, title, blurb }) => ({ id, number, title, blurb })), [
    { id: 'D001', number: 1, title: 'A Route Dispute', blurb: 'Rider says the trip was too long' },
    { id: 'D006', number: 2, title: 'A No-show Fee', blurb: 'Rider disputes a $4.00 fee' },
    { id: 'D007', number: 3, title: 'A Safety Flag', blurb: 'Threat in the chat' },
  ]);
  assert.deepEqual(guidedDemoSteps([]).map(step => step.label), ['Start here', null, null]);
});

test('demo advances only on closed cases, in demo order rather than queue order', () => {
  const rows = [{ id: 'D007', status: 'closed' }, { id: 'D006', status: 'ready' }, { id: 'D001', status: 'closed' }];
  const before = structuredClone(rows);
  assert.deepEqual(guidedDemoSteps(rows).map(({ done, next, label }) => ({ done, next, label })), [
    { done: true, next: false, label: null },
    { done: false, next: true, label: 'Next' },
    { done: true, next: false, label: null },
  ]);
  assert.deepEqual(rows, before, 'does not mutate the queue');
  for (const status of ['not_run', 'ready', 'decide', 'reviewed', 'reopened', 'appeal_waiting']) {
    assert.equal(guidedDemoSteps([{ id: 'D001', status }])[0].next, true, status);
    assert.equal(guidedDemoSteps([{ id: 'D001', status }])[0].done, false, status);
  }
});

test('all demo cases closed means no next step; reopening restores the earliest step', () => {
  const rows = ['D001', 'D006', 'D007'].map(id => ({ id, status: 'closed' }));
  assert.ok(guidedDemoSteps(rows).every(step => step.done && !step.next && step.label === null));
  rows[1].status = 'reopened';
  assert.deepEqual(guidedDemoSteps(rows).filter(step => step.next).map(step => step.id), ['D006']);
});

test('guided demo copy never reveals an outcome', () => {
  const words = /refund|upheld|caught|human|fair|stop/i;
  for (const step of guidedDemoSteps([])) assert.doesNotMatch(`${step.title} ${step.blurb}`, words, step.id);
});

test('amount at stake prefers the fare, then the no-show fee, and skips missing or zero amounts', () => {
  assert.equal(amountAtStake({ actual: 24.8, cancellation_fee: null }), '$24.80 fare');
  assert.equal(amountAtStake({ actual: null, cancellation_fee: 4 }), '$4.00 fee');
  assert.equal(amountAtStake({ actual: 0, cancellation_fee: 0 }), null);
  assert.equal(amountAtStake({}), null);
});

test('queue segments put every case in one segment, most urgent first, and drop empty ones', () => {
  const rows = ['not_run', 'ready', 'decide', 'closed', 'reviewed', 'reopened', 'not_run', 'appeal_waiting'].map(status => ({ status }));
  const segments = queueSegments(rows, true);
  assert.deepEqual(segments.map(s => [s.key, s.count, s.label]), [
    ['decide', 1, 'to decide'], ['appeals', 1, 'appeal waiting'], ['ready', 1, 'ready'],
    ['reviewed', 1, 'reviewed'], ['closed', 1, 'closed'], ['new', 3, 'new'],
  ]);
  assert.equal(segments.reduce((sum, s) => sum + s.count, 0), rows.length);
  const hidden = queueSegments(rows, false);
  assert.ok(!hidden.some(s => s.key === 'appeals'), 'public demo hides unavailable appeals');
  assert.equal(hidden.reduce((sum, s) => sum + s.count, 0), rows.length, 'the bar still adds up');
  assert.deepEqual(queueSegments([], true), []);
  assert.equal(queueSegments([{ status: 'appeal_waiting' }, { status: 'appeal_waiting' }], true)[0].label, 'appeals waiting');
});
