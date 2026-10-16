import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';

const ns = await load('notifyState');
const q = await load('caseQueue');
const rp = await load('reviewProgress');

const D001 = { fare: { expected: 18.5, actual: 24.8 } };
const NO_SHOW = { fare: { cancellation_fee: 4 } };
const ruling = { decision: 'partial_refund', refund_amount: 6.3, rider_explanation: 'You will be refunded $6.30.', driver_explanation: 'The rider has been refunded $6.30.' };
const saved = (kind, decision) => ({ kind, decision, precedentId: 'R-001' });

// ---- 8a. The gate -------------------------------------------------------------------

test('Notify opens only after a decision, or after opening Ruling in the public demo', () => {
  assert.equal(ns.notifyGate({ saved: false, unavailable: false, rulingVisited: false }), 'locked');
  assert.equal(ns.notifyGate({ saved: false, unavailable: false, rulingVisited: true }), 'locked', 'opening Ruling is not a decision');
  assert.equal(ns.notifyGate({ saved: true, unavailable: false, rulingVisited: false }), 'open');
  assert.equal(ns.notifyGate({ saved: false, unavailable: true, rulingVisited: false }), 'locked');
  assert.equal(ns.notifyGate({ saved: false, unavailable: true, rulingVisited: true }), 'open', 'public demo (403): opening Ruling is enough');
});

// ---- 8c. Locked outcome and amount -----------------------------------------------------

test('the outcome and amount come from the final decision', () => {
  const pick = o => [o.decision, o.amount, o.needsAmount, o.source];
  assert.deepEqual(pick(ns.finalOutcome(ruling, saved('accepted', 'partial_refund'), D001)), ['partial_refund', 6.3, false, 'ruling']);
  assert.deepEqual(pick(ns.finalOutcome(ruling, null, D001)), ['partial_refund', 6.3, false, 'ruling'], 'no decision recorded (demo): the ruling');
  assert.deepEqual(pick(ns.finalOutcome(ruling, saved('overridden', 'no_action'), D001)), ['no_action', null, false, 'override']);
  assert.deepEqual(pick(ns.finalOutcome(ruling, saved('overridden', 'full_refund'), D001)), ['full_refund', 24.8, false, 'override']);
  assert.deepEqual(pick(ns.finalOutcome(ruling, saved('overridden', 'compensation'), D001)), ['compensation', 5, false, 'override'], 'RD-5 credit');
  assert.deepEqual(pick(ns.finalOutcome(ruling, saved('overridden', 'partial_refund'), D001)), ['partial_refund', null, true, 'override']);
  assert.deepEqual(pick(ns.finalOutcome(ruling, saved('overridden', 'partial_refund'), D001, 2.4)), ['partial_refund', 2.4, true, 'override']);
  assert.deepEqual(pick(ns.finalOutcome({ decision: 'needs_review', refund_amount: 6.9 }, saved('decided', 'full_refund'), NO_SHOW)), ['full_refund', 4, false, 'override'], 'no-show: the fee');
  assert.equal(ns.finalOutcome({ decision: 'needs_review', refund_amount: 6.9 }, null, D001).amount, null, 'escalated, undecided: no amount');
  assert.equal(ns.finalOutcome(ruling, saved('accepted', 'partial_refund'), D001).label, 'Partial refund approved');
});

test('partial-refund validation: required, $0.01 up to the fare charged (REF-1)', () => {
  assert.deepEqual(ns.validateAmount('2.40', 24.8), { ok: true, value: 2.4 });
  assert.deepEqual(ns.validateAmount('$24.80', 24.8), { ok: true, value: 24.8 });
  for (const bad of ['', '0', '0.001', '24.81', 'abc', '-1', '1.234']) {
    const result = ns.validateAmount(bad, 24.8);
    assert.equal(result.ok, false, bad);
    assert.match(result.message, /between \$0\.01 and \$24\.80.*REF-1/, bad);
  }
  assert.match(ns.validateAmount('', 24.8).message, /^A partial refund needs an amount/);
  assert.equal(ns.maxRefund(D001), 24.8);
  assert.equal(ns.maxRefund(NO_SHOW), 4);
  assert.equal(ns.maxRefund({ fare: {} }), null);
});

test('suggested wording: the ruling when accepted, plain wording for an override', () => {
  const accepted = ns.finalOutcome(ruling, saved('accepted', 'partial_refund'), D001);
  assert.equal(ns.suggestedMessage('rider', ruling, accepted), ruling.rider_explanation);
  assert.equal(ns.suggestedMessage('driver', ruling, accepted), ruling.driver_explanation);
  const partial = ns.finalOutcome(ruling, saved('overridden', 'partial_refund'), D001, 2.4);
  assert.match(ns.suggestedMessage('rider', ruling, partial), /partial refund of \$2\.40/);
  const none = ns.finalOutcome(ruling, saved('overridden', 'no_action'), D001);
  assert.doesNotMatch(ns.suggestedMessage('rider', ruling, none), /\$6\.30/, 'never contradicts the final outcome');
  for (const decision of ['partial_refund', 'full_refund', 'compensation', 'no_action']) for (const party of ['rider', 'driver']) {
    assert.deepEqual(ns.privacyWarnings(ns.suggestedMessage(party, ruling, ns.finalOutcome(ruling, saved('overridden', decision), D001, 1))), [], `${decision} ${party}`);
  }
});

// ---- 8d. Privacy ------------------------------------------------------------------------

test('privacyWarnings flags internal terms, evidence IDs and internal rule IDs', () => {
  assert.deepEqual(ns.privacyWarnings('Your refund of $6.30 is on its way.'), []);
  assert.deepEqual(ns.privacyWarnings('We checked for Fraud.'), ['fraud']);
  assert.deepEqual(ns.privacyWarnings('No bad-faith pattern; no bad faith either'), ['bad faith']);
  assert.deepEqual(ns.privacyWarnings('Your risk score is low'), ['risk score']);
  assert.deepEqual(ns.privacyWarnings('Some risk signals'), ['risk', 'signals']);
  assert.deepEqual(ns.privacyWarnings('Your history and previous disputes'), ['previous disputes', 'history']);
  assert.deepEqual(ns.privacyWarnings('Similar to a precedent'), ['precedent']);
  assert.deepEqual(ns.privacyWarnings('See GPS-4 and FARE-12'), ['evidence IDs']);
  assert.deepEqual(ns.privacyWarnings('Escalated under SAFE-1 and FRAUD-1'), ['internal rule IDs']);
  assert.deepEqual(ns.privacyWarnings('Refunded under RD-3'), [], 'a policy rule a party may see');
  assert.deepEqual(ns.privacyWarnings('The historic district'), [], 'whole words only');
});

// ---- 8e/f. Sent state and the Notify tick ---------------------------------------------------

test('sent records per review key survive blocked storage, and read back', () => {
  const map = new Map();
  const storage = { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
  const store = ns.createSentStore(storage);
  const record = { at: '08:42', edited: true, messages: { rider: 'a', driver: 'b' }, decision: 'partial_refund', amount: 6.3 };
  assert.equal(store.get('D001|t1'), null);
  store.set('D001|t1', record);
  assert.deepEqual(ns.createSentStore(storage).get('D001|t1'), record, 'another mount reads it from sessionStorage');
  assert.equal(store.get('D001|t2'), null, 'a new run (new key) starts unsent');
  const blocked = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
  const memory = ns.createSentStore(blocked);
  memory.set('k', record);
  assert.deepEqual(memory.get('k'), record);
  assert.equal(ns.sentText(record), '✓ Sent to rider and driver · 08:42 · edited by reviewer');
  assert.equal(ns.sentText({ ...record, edited: false }), '✓ Sent to rider and driver · 08:42 · as suggested');
  assert.equal(ns.clockText(new Date(2026, 9, 16, 8, 5)), '08:05');
  assert.match(ns.SEND_TOOLTIP, /no real message/);
});

test('Notify is ticked by Approve & send, not by opening it; a new run resets it', () => {
  assert.equal(rp.openCounts('notify'), false);
  assert.equal(rp.openCounts('notify', { decisionsUnavailable: true }), false);
  const store = rp.createReviewStore(null);
  assert.equal(store.add('D001|t1', 'notify'), true, 'onSent');
  assert.equal(store.get('D001|t1').has('notify'), true);
  assert.equal(store.get('D001|t2').has('notify'), false);
});

// ---- 9. Queue ----------------------------------------------------------------------------

test('caseStatus: not run, ready, decide, reviewed, sent', () => {
  assert.equal(q.caseStatus(null, false, false), 'not_run');
  assert.equal(q.caseStatus({ decision: 'partial_refund' }, false, false), 'ready');
  assert.equal(q.caseStatus({ decision: 'needs_review' }, false, false), 'decide');
  assert.equal(q.caseStatus({ decision: 'needs_review' }, true, false), 'reviewed');
  assert.equal(q.caseStatus({ decision: 'no_action' }, true, true), 'sent');
  assert.deepEqual(Object.values(q.STATUS_WORDS), ['Not run', 'Ready', 'Decide', 'Reviewed', 'Sent']);
  for (const status of Object.keys(q.STATUS_WORDS)) assert.ok(q.STATUS_ICONS[status], `${status} has an icon (always with its word)`);
});

const rows = [
  { id: 'D001', status: 'sent' }, { id: 'D002', status: 'not_run' }, { id: 'D003', status: 'ready' },
  { id: 'D004', status: 'decide', tier: 'high' }, { id: 'D005', status: 'reviewed' }, { id: 'D007', status: 'decide', tier: 'safety' },
  { id: 'D008', status: 'ready' },
];

test('queue order: Decide (safety first), Ready, Reviewed, Not run, Sent', () => {
  assert.deepEqual(q.sortQueue(rows).map(r => r.id), ['D007', 'D004', 'D003', 'D008', 'D005', 'D002', 'D001']);
  assert.deepEqual(rows.map(r => r.id), ['D001', 'D002', 'D003', 'D004', 'D005', 'D007', 'D008'], 'the input is not reordered');
});

test('next case: the next not-done case in queue order, none when all are sent', () => {
  assert.equal(q.nextCase(rows, 'D007').id, 'D004');
  assert.equal(q.nextCase(rows, 'D001').id, 'D007');
  assert.equal(q.nextCase([{ id: 'D001', status: 'sent' }, { id: 'D002', status: 'sent' }], 'D001'), null);
  assert.equal(q.nextCase([{ id: 'D001', status: 'ready' }], 'D001'), null, 'never the current case');
});

test('tile counts', () => {
  assert.deepEqual(q.tileCounts(rows), { queue: 7, ready: 2, decide: 2, done: 1 });
  assert.deepEqual(q.tileCounts([]), { queue: 0, ready: 0, decide: 0, done: 0 });
  assert.deepEqual(q.START_HERE.map(s => [s.id, s.title]), [['D001', 'Detour caught'], ['D006', 'Fee upheld'], ['D007', 'Escalated']]);
});
