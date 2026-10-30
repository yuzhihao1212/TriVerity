import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';

const q = await load('caseQueue');
const ns = await load('notifyState');
const ds = await load('decisionState');
const hs = await load('homeState');

const ruled = { decision: 'partial_refund' };
const escalated = { decision: 'needs_review' };

test('status: a case the policy closed is auto-resolved; anything a person closed stays closed', () => {
  assert.equal(q.caseStatus(ruled, false, true, { autoClosed: true }), 'auto');
  assert.equal(q.caseStatus(ruled, false, true), 'closed');
  assert.equal(q.caseStatus(ruled, false, false), 'ready');
  assert.equal(q.caseStatus(escalated, false, false), 'decide');
  // Reopened, or an appeal waiting, takes over from the automatic close.
  assert.equal(q.caseStatus(ruled, false, false, { reopened: true, autoClosed: true }), 'reopened');
  assert.equal(q.caseStatus(ruled, false, true, { autoClosed: true, appealWaiting: true }), 'appeal_waiting');
  assert.equal(q.allowedActions('auto').reopen, true);
  assert.equal(q.allowedActions('auto').decide, false);
});

test('queue: auto-resolved sorts after reviewed, and next case skips it', () => {
  const rows = [{ id: 'A', status: 'auto' }, { id: 'B', status: 'reviewed' }, { id: 'C', status: 'decide' }];
  assert.deepEqual(q.sortQueue(rows).map(row => row.id), ['C', 'B', 'A']);
  assert.equal(q.nextCase([{ id: 'A', status: 'auto' }, { id: 'B', status: 'closed' }], null), null);
  assert.equal(q.tileCounts(rows).auto, 1);
});

test('guided demo: the next guided case skips one the policy already closed', () => {
  const rows = [{ id: 'D001', status: 'closed' }, { id: 'D006', status: 'auto' }, { id: 'D007', status: 'decide' }];
  assert.equal(hs.nextAfterClose(rows, 'D001', true).row.id, 'D007');   // with the guided demo on
  assert.equal(hs.nextAfterClose(rows, 'D001').row.id, 'D007');         // and off (GUIDED_DEMO = false)
});

test('home: auto-resolved has its own summary part and meter segment', () => {
  const rows = [{ status: 'auto' }, { status: 'auto' }, { status: 'decide' }];
  assert.ok(hs.queueSummary(rows, false).some(part => part.text === '2 auto-resolved'));
  assert.deepEqual(hs.queueSegments(rows, false).find(segment => segment.key === 'auto')?.count, 2);
});

const eligible = {
  decision: 'partial_refund', refund_amount: 6.3, rider_explanation: 'Refund of $6.30.', driver_explanation: 'The rider gets $6.30.',
  autonomy: { eligible: true, audit: false, reasons: [] },
};
const fare = { fare: { actual: 24.8, expected: 18.5 } };

test('auto close: an eligible ruling is sent with the ruling\'s messages and the notice, marked auto', () => {
  const record = ns.autoSentRecord('D001', eligible, fare, new Date('2026-10-30T09:00:00Z'));
  assert.equal(record.messages.rider, `Refund of $6.30. ${ns.AUTO_NOTICE}`);
  assert.equal(record.messages.driver, `The rider gets $6.30. ${ns.AUTO_NOTICE}`);
  assert.deepEqual([record.decision, record.amount, record.reviewer.kind], ['partial_refund', 6.3, 'auto']);
  assert.match(ns.AUTO_NOTICE, /appeal/);
  assert.equal(ns.reviewAction(record), 'auto-resolved by policy');
  assert.equal(ns.sentOutcome(record).source, 'ruling');
  // Audit samples, ineligible and escalated rulings go to a person: no record.
  assert.equal(ns.autoSentRecord('D001', { ...eligible, autonomy: { eligible: true, audit: true, reasons: [] } }, fare), null);
  assert.equal(ns.autoSentRecord('D001', { ...eligible, autonomy: { eligible: false, audit: false, reasons: [] } }, fare), null);
  assert.equal(ns.autoSentRecord('D001', { ...eligible, autonomy: undefined }, fare), null);
  assert.equal(ns.autoSentRecord('D001', { ...eligible, decision: 'needs_review' }, fare), null);
});

test('notice: a person\'s send never carries the automatic notice, even for an eligible ruling', () => {
  const outcome = { decision: 'partial_refund', amount: 6.3, source: 'ruling' };
  assert.equal(ns.generatedMessage('rider', eligible, outcome), 'Refund of $6.30.');
  // An "auto" saved decision is the ruling's own outcome, not an override.
  assert.equal(ns.finalOutcome(eligible, { kind: 'auto', decision: 'partial_refund' }, fare).source, 'ruling');
});

test('run all summary: only the cases that batch ran, audit samples counted for review', () => {
  const rows = [
    { id: 'D001', status: 'auto' }, { id: 'D002', status: 'decide' }, { id: 'D003', status: 'ready', audit: true },
    { id: 'MINE-1', status: 'decide' }, { id: 'D009', status: 'not_run' },
  ];
  assert.equal(hs.runAllSummary(rows, ['D001', 'D002', 'D003']), 'Run all: 3 cases · 1 auto-resolved · 2 for review · 1 audit sample');
  assert.equal(hs.runAllSummary(rows, []), null);
});

test('saved text: an automatic decision never claims a precedent', () => {
  const text = ds.savedText({ kind: 'auto', decision: 'partial_refund', precedentId: '' });
  assert.match(text, /Auto-resolved/);
  assert.match(text, /no precedent/);
});
