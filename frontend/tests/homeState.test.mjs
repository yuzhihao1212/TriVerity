import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';

const { queueSummary, guidedDemoSteps } = await load('homeState');

test('queue summary counts cases, decisions, ready and closed; only decisions warn', () => {
  const rows = ['not_run', 'ready', 'decide', 'closed', 'reviewed', 'reopened'].map(status => ({ status }));
  assert.deepEqual(queueSummary(rows, true), [
    { text: '6 cases', warning: false },
    { text: '1 to decide', warning: true },
    { text: '1 ready', warning: false },
    { text: '1 closed', warning: false },
  ]);
});

test('empty and single-case summaries have neutral zero counts and correct grammar', () => {
  assert.deepEqual(queueSummary([], true), [
    { text: '0 cases', warning: false },
    { text: '0 to decide', warning: false },
    { text: '0 ready', warning: false },
    { text: '0 closed', warning: false },
  ]);
  assert.equal(queueSummary([{ status: 'ready' }], true)[0].text, '1 case');
});

test('appeals waiting appears only for positive counts when appeals are available', () => {
  const rows = [{ status: 'appeal_waiting' }];
  assert.deepEqual(queueSummary(rows, true).at(-1), { text: '1 appeal waiting', warning: true });
  assert.deepEqual(queueSummary([...rows, ...rows], true).at(-1), { text: '2 appeals waiting', warning: true });
  assert.equal(queueSummary(rows, false).length, 4, 'public demo hides unavailable appeals');
  assert.equal(queueSummary([], true).length, 4, 'zero appeals adds no segment');
});

test('guided demo always keeps all three numbered cases and prescribed copy', () => {
  assert.deepEqual(guidedDemoSteps([]).map(({ id, number, title, blurb }) => ({ id, number, title, blurb })), [
    { id: 'D001', number: 1, title: 'Detour caught', blurb: 'Refund for a detour' },
    { id: 'D006', number: 2, title: 'Fee upheld', blurb: 'A fair no-show fee' },
    { id: 'D007', number: 3, title: 'Knows when to stop', blurb: 'Goes to a human' },
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
