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
  assert.deepEqual(pick(ns.finalOutcome(ruling, { ...saved('overridden', 'partial_refund'), amount: 8 }, D001)), ['partial_refund', 8, false, 'override'], 'amount chosen when overriding');
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

test('the generated message is read-only wording: the ruling when accepted, plain wording for an override', () => {
  const accepted = ns.finalOutcome(ruling, saved('accepted', 'partial_refund'), D001);
  assert.equal(ns.generatedMessage('rider', ruling, accepted), ruling.rider_explanation);
  assert.equal(ns.generatedMessage('driver', ruling, accepted), ruling.driver_explanation);
  const partial = ns.finalOutcome(ruling, saved('overridden', 'partial_refund'), D001, 2.5);
  assert.match(ns.generatedMessage('rider', ruling, partial), /partial refund of \$2\.50/);
  const none = ns.finalOutcome(ruling, saved('overridden', 'no_action'), D001);
  assert.doesNotMatch(ns.generatedMessage('rider', ruling, none), /\$6\.30/, 'never contradicts the final outcome');
  for (const decision of ['partial_refund', 'full_refund', 'compensation', 'no_action']) for (const party of ['rider', 'driver']) {
    assert.deepEqual(ns.privacyWarnings(ns.generatedMessage(party, ruling, ns.finalOutcome(ruling, saved('overridden', decision), D001, 1))), [], `${decision} ${party}`);
  }
});

// ---- 1. Reviewer notes ---------------------------------------------------------------------

test('reviewer notes: at most 280 characters, a live counter, empty by default', () => {
  assert.equal(ns.NOTE_LIMIT, 280);
  assert.equal(ns.noteCounter(''), '0 / 280');
  assert.equal(ns.noteCounter('x'.repeat(120)), '120 / 280');
  assert.equal(ns.cleanNote('  Sorry for the trouble on this trip.  '), 'Sorry for the trouble on this trip.');
  assert.equal(ns.cleanNote('x'.repeat(300)).length, 280);
  assert.equal(ns.cleanNote('   '), '', 'whitespace is no note');
  assert.match(ns.NOTE_PLACEHOLDER, /^Optional/);
});

test('the privacy check runs on the notes only; the generated message is never checked or blocked', () => {
  const none = { amountMissing: false, sendAnyway: false };
  const clean = ns.noteWarnings({ rider: '', driver: '' });
  assert.deepEqual(clean, { rider: [], driver: [] });
  assert.equal(ns.sendBlock({ ...none, warnings: clean }), null, 'no notes: nothing to block, whatever the generated message says');
  const flagged = ns.noteWarnings({ rider: 'Your fraud risk is high', driver: '' });
  assert.deepEqual(flagged, { rider: ['fraud', 'risk'], driver: [] });
  assert.equal(ns.sendBlock({ ...none, warnings: flagged }), 'privacy');
  assert.equal(ns.sendBlock({ ...none, warnings: flagged, sendAnyway: true }), null, '"Send anyway"');
  assert.equal(ns.sendBlock({ ...none, warnings: ns.noteWarnings({ rider: 'Sorry for the trouble on this trip.', driver: '' }) }), null);
  assert.equal(ns.sendBlock({ amountMissing: true, warnings: clean, sendAnyway: true }), 'amount', 'the partial-refund amount still comes first');
});

test('"Clear note" empties the note, which removes its warning and its phone block', () => {
  let notes = { rider: 'Your fraud risk is high', driver: 'Thanks' };
  notes = { ...notes, rider: '' }; // the "Clear note" action
  assert.deepEqual(ns.noteWarnings(notes).rider, []);
  assert.equal(ns.cleanNote(notes.rider), '', 'an empty note shows no "Note from your reviewer" block');
  assert.equal(ns.hasNote({ notes }), true, 'the other note stays');
});

// ---- 2. Appeals only after sending ---------------------------------------------------------

test('phones: a preview with appeals disabled before sending, delivered and appealable after', () => {
  assert.deepEqual(ns.phoneState('rider', null), { delivered: false, tag: 'Preview', canAppeal: false, caption: 'Available to the rider after sending' });
  assert.equal(ns.phoneState('driver', null).caption, 'Available to the driver after sending');
  assert.deepEqual(ns.phoneState('driver', { at: '08:42' }), { delivered: true, tag: 'Delivered 08:42', canAppeal: true, caption: null });
  assert.equal(ns.DELIVERED_ANNOUNCEMENT, 'Messages delivered; parties can now appeal');
});

// ---- 3. Closing card --------------------------------------------------------------------------

test('the closing card says "Messages sent" unless every step is reviewed', () => {
  assert.equal(ns.closingTitle('D001', rp.reviewSummary(['ruling', 'notify'])), 'Messages sent for D001');
  assert.equal(ns.closingTitle('D001', rp.reviewSummary(['evidence', 'hearing', 'ruling', 'notify'])), 'Review complete for D001');
  assert.equal(ns.closingTitle('D001', null), 'Messages sent for D001');
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
  const record = { at: '08:42', messages: { rider: 'a', driver: 'b' }, notes: { rider: 'Sorry for the trouble on this trip.', driver: '' }, decision: 'partial_refund', amount: 6.3 };
  assert.equal(store.get('D001|t1'), null);
  store.set('D001|t1', record);
  assert.deepEqual(ns.createSentStore(storage).get('D001|t1'), record, 'another mount reads the message and notes from sessionStorage');
  assert.equal(store.get('D001|t2'), null, 'a new run (new key) starts unsent');
  const blocked = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
  const memory = ns.createSentStore(blocked);
  memory.set('k', record);
  assert.deepEqual(memory.get('k'), record);
  assert.equal(ns.sentText(record), '✓ Sent to rider and driver · 08:42 · with a reviewer note');
  assert.equal(ns.sentText({ ...record, notes: { rider: '', driver: '' } }), '✓ Sent to rider and driver · 08:42 · as generated');
  assert.equal(ns.sentText({ ...record, notes: { rider: '', driver: 'Thanks' } }), '✓ Sent to rider and driver · 08:42 · with a reviewer note');
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

test('caseStatus: not run, ready, decide, reviewed, closed', () => {
  assert.equal(q.caseStatus(null, false, false), 'not_run');
  assert.equal(q.caseStatus({ decision: 'partial_refund' }, false, false), 'ready');
  assert.equal(q.caseStatus({ decision: 'needs_review' }, false, false), 'decide');
  assert.equal(q.caseStatus({ decision: 'needs_review' }, true, false), 'reviewed');
  assert.equal(q.caseStatus({ decision: 'no_action' }, true, true), 'closed');
  assert.deepEqual(Object.values(q.STATUS_WORDS), ['New', 'Ready', 'Decide', 'Reviewed', 'Closed', 'Reopened', 'Appeal waiting']);
  for (const status of Object.keys(q.STATUS_WORDS)) assert.ok(q.STATUS_ICONS[status], `${status} has an icon (always with its word)`);
});

const rows = [
  { id: 'D001', status: 'closed' }, { id: 'D002', status: 'not_run' }, { id: 'D003', status: 'ready' },
  { id: 'D004', status: 'decide', tier: 'high' }, { id: 'D005', status: 'reviewed' }, { id: 'D007', status: 'decide', tier: 'safety' },
  { id: 'D008', status: 'ready' },
];

test('queue order: Decide (safety first), Ready, Reviewed, Not run, Closed', () => {
  assert.deepEqual(q.sortQueue(rows).map(r => r.id), ['D007', 'D004', 'D003', 'D008', 'D005', 'D002', 'D001']);
  assert.deepEqual(rows.map(r => r.id), ['D001', 'D002', 'D003', 'D004', 'D005', 'D007', 'D008'], 'the input is not reordered');
});

test('next case: the next not-done case in queue order, none when all are closed', () => {
  assert.equal(q.nextCase(rows, 'D007').id, 'D004');
  assert.equal(q.nextCase(rows, 'D001').id, 'D007');
  assert.equal(q.nextCase([{ id: 'D001', status: 'closed' }, { id: 'D002', status: 'closed' }], 'D001'), null);
  assert.equal(q.nextCase([{ id: 'D001', status: 'ready' }], 'D001'), null, 'never the current case');
});

test('tile counts', () => {
  assert.deepEqual(q.tileCounts(rows), { queue: 7, ready: 2, decide: 2, done: 1, appeals: 0 });
  assert.deepEqual(q.tileCounts([]), { queue: 0, ready: 0, decide: 0, done: 0, appeals: 0 });
  assert.deepEqual(q.START_HERE.map(s => [s.id, s.title]), [['D001', 'A route dispute'], ['D006', 'A no-show fee'], ['D007', 'A safety flag']]);
});

test('an appeal from a phone gets a reviewer line, flagged when it is a safety appeal', () => {
  assert.equal(ns.appealSummary({ party: 'rider', priority: 'standard' }), 'Rider appealed');
  assert.equal(ns.appealSummary({ party: 'driver', priority: 'safety' }), 'Driver appealed · safety, review first');
});
