// Regression tests for the pre-Demo-Day audit fixes (F01, F02, F03, F04, F05):
// the refund cap on a $0 fare, internal IDs in a party's note, the amount editor for older
// decisions, the Notify gate after a reopen or a hold, and the automatic close on a re-run.
import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';

const ns = await load('notifyState');
const ds = await load('decisionState');
const q = await load('caseQueue');
const gl = await load('glossary');

const NO_WARNINGS = { rider: [], driver: [] };
const memoryStorage = () => { const map = new Map(); return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) }; };
const D001 = { fare: { expected: 18.5, actual: 24.8 } };
const ZERO_FARE = { fare: { expected: 0, actual: 0 } };
const ruling = { decision: 'partial_refund', refund_amount: 6.3, rider_explanation: 'You get $6.30 back.', driver_explanation: 'The rider gets $6.30.' };
const sentRecord = (amount = 6.3) => ({
  at: '08:42', timestamp: '2026-10-30T01:00:00.000Z', disputeId: 'D001',
  messages: { rider: 'You get $6.30 back.', driver: 'The rider gets $6.30.' }, notes: { rider: '', driver: '' },
  decision: 'partial_refund', amount, reviewer: { kind: 'auto', decision: 'partial_refund', precedentId: '' },
});

// ---- F01: a $0 fare gives up its refund cap ----------------------------------------

test('F01: a known $0.00 fare caps the refund at 0; a missing fare still means no cap', () => {
  assert.equal(ns.maxRefund(ZERO_FARE), 0, 'a known 0 is a cap of 0');
  assert.equal(ns.maxRefund({ fare: { cancellation_fee: 0 } }), 0, 'a no-show fee of 0 too');
  assert.equal(ns.maxRefund(D001), 24.8);
  assert.equal(ns.maxRefund({ fare: { cancellation_fee: 4 } }), 4, 'the no-show fee');
  assert.equal(ns.maxRefund({ fare: {} }), null, 'no fare known: no cap');
  assert.equal(ns.maxRefund({ fare: { actual: null } }), null);
  assert.equal(ns.maxRefund({ fare: { actual: Number.NaN } }), null, 'not a finite number');
  assert.equal(ns.maxRefund({ fare: { actual: '24.80' } }), null, 'not a number');
});

test('F01: no positive refund is accepted on a $0.00 fare, in Notify or on the Ruling step', () => {
  const max = ns.maxRefund(ZERO_FARE);
  // Notify and the Ruling panel share this check.
  for (const text of ['', '1', '1.00', '0.01', '24.80', '$0.50']) {
    const check = ds.checkPartialAmount(text, max, 6.3);
    assert.equal(check.state, 'high', text);
    assert.equal(check.value, null, text);
    assert.match(check.message, /nothing to refund/, text);
  }
});

test('F01: a negative fare is not a usable cap, so it never becomes a negative refund', () => {
  assert.equal(ns.maxRefund({ fare: { actual: -1 } }), null);
  const full = ns.finalOutcome(ruling, { kind: 'overridden', decision: 'full_refund', precedentId: 'R-001' }, { fare: { actual: -1 } });
  assert.equal(full.amount, null);
});

test('F01: a full refund on a $0.00 fare is $0.00, never the ruling\'s amount', () => {
  const full = ns.finalOutcome(ruling, { kind: 'overridden', decision: 'full_refund', precedentId: 'R-001' }, ZERO_FARE);
  assert.equal(full.amount, 0);
  assert.match(ns.generatedMessage('rider', ruling, full), /nothing to refund/);
  assert.doesNotMatch(ns.generatedMessage('rider', ruling, full), /\$6\.30/);
});

// ---- F02: internal IDs can reach a party's note ---------------------------------------

test('F02: every internal ID format is caught, in any case', () => {
  assert.deepEqual(ns.privacyWarnings('Applied RD-3; earlier case P-063.'), ['internal rule IDs', 'internal case IDs']);
  assert.deepEqual(ns.privacyWarnings('applied rd-3'), ['internal rule IDs']);
  assert.deepEqual(ns.privacyWarnings('see ref-1'), ['internal rule IDs']);
  assert.deepEqual(ns.privacyWarnings('under NS-2 and ESC-1'), ['internal rule IDs']);
  assert.deepEqual(ns.privacyWarnings('it was prec-1 again'), ['internal rule IDs']);
  assert.deepEqual(ns.privacyWarnings('gps-4 shows it'), ['evidence IDs']);
  assert.deepEqual(ns.privacyWarnings('see chat-2 and hist-9'), ['evidence IDs']);
  assert.deepEqual(ns.privacyWarnings('compared with R-001'), ['internal case IDs']);
  assert.deepEqual(ns.privacyWarnings('earlier case P-063'), ['internal case IDs']);
  assert.deepEqual(ns.privacyWarnings('Sorry for the trouble on this trip.'), [], 'a plain note');
});

test('F02: ordinary phrases that look a little like an ID are left alone', () => {
  for (const plain of ['R-1 rated', 'P-1 visa', 'r-12', 'A-1 service', 'Step 1', '$6.30', '08:05']) {
    assert.deepEqual(ns.privacyWarnings(plain), [], plain);
  }
  assert.deepEqual(ns.privacyWarnings('R-1000'), ['internal case IDs'], 'IDs past three digits');
});

test('F02: the rule prefixes come from the policy\'s own rule IDs', () => {
  const prefixes = ns.rulePrefixes();
  for (const prefix of ['ESC', 'FRAUD', 'NS', 'PREC', 'RD', 'REF', 'SAFE']) {
    assert.ok(prefixes.includes(prefix), `${prefix} from glossary RULES`);
  }
  for (const id of Object.keys(gl.RULES)) {
    assert.deepEqual(ns.privacyWarnings(`decided under ${id}`), ['internal rule IDs'], id);
  }
  assert.deepEqual([...ns.rulePrefixes({})].sort(), ['ESC', 'FRAUD', 'NS', 'PREC', 'RD', 'REF', 'SAFE'], 'the fallback list');
});

test('F02: the dispute\'s own public case ID is not internal data', () => {
  assert.deepEqual(ns.privacyWarnings('Your case D001 is closed.', 'D001'), [], 'the ID the phone shows');
  assert.deepEqual(ns.privacyWarnings('Case J-2026-0042 was reviewed.', 'J-2026-0042'), []);
  assert.deepEqual(ns.privacyWarnings('Case R-001 was reviewed.', 'R-001'), [], 'even when it reads like a precedent');
  assert.deepEqual(ns.privacyWarnings('Case R-001 was reviewed.'), ['internal case IDs'], 'flagged when it is not this case');
  assert.deepEqual(ns.noteWarnings({ rider: 'Case D001 under RD-3', driver: '' }, 'D001'), { rider: ['internal rule IDs'], driver: [] });
});

test('F02: internal data blocks sending, and "Send Anyway" cannot clear it', () => {
  const warnings = { rider: ['internal rule IDs'], driver: [] };
  assert.equal(ns.sendBlock({ amountMissing: false, warnings }), 'privacy');
  assert.equal(ns.sendBlock({ amountMissing: false, warnings, sendAnyway: true }), 'privacy', 'no override for an ID');
  assert.ok(ns.hasInternalData(warnings));
  assert.ok(ns.isInternalData('evidence IDs') && ns.isInternalData('internal case IDs'));
  assert.equal(ns.hasInternalData(NO_WARNINGS), false);
  assert.equal(ns.sendBlock({ amountMissing: false, warnings: NO_WARNINGS, sendAnyway: true }), null);
});

// ---- Re-check after the fixes (R01, F02 variants, R02, F05 reload, R03) ----------------

test('R01: only the whole case ID is public, never a piece of a longer ID', () => {
  assert.deepEqual(ns.privacyWarnings('See GPS-4 for the stop.', 'GPS'), ['evidence IDs']);
  assert.deepEqual(ns.privacyWarnings('Earlier case P-063.', 'P-06'), ['internal case IDs']);
  assert.deepEqual(ns.privacyWarnings('Earlier case P-063.', 'P-0'), ['internal case IDs']);
  assert.deepEqual(ns.privacyWarnings('Case D0012 again', 'D001'), [], 'not an internal ID either way');
  assert.deepEqual(ns.privacyWarnings('Case GPS, about GPS-4.', 'GPS'), ['evidence IDs']);
  for (const note of ['Your case D001 is closed.', 'Case (D001).', 'Case d001, closed', 'D001: closed']) {
    assert.deepEqual(ns.privacyWarnings(note, 'D001'), [], note);
  }
  assert.deepEqual(ns.privacyWarnings('Case J-MVUVRVW1 was reviewed.', 'J-MVUVRVW1'), []);
  assert.deepEqual(ns.privacyWarnings('Case RD-3 is closed.', 'RD-3'), [], 'its own ID, even when it reads like a rule');
  assert.deepEqual(ns.privacyWarnings('Case RD-3 under RD-31.', 'RD-3'), ['internal rule IDs']);
});

test('F02: an ID is still an ID in another spelling', () => {
  const rule = ['Applied RD\u20133', 'Applied RD\u20143', 'Applied RD\u22123', 'Applied RD3', 'applied rd3', 'Applied RD 3', 'Applied RD.3', 'Applied RD_3',
    'Applied RD - 3', 'Applied RD-\n3', 'Applied RD\n3', 'Applied \uFF32\uFF24\uFF0D\uFF13', 'Applied R\u200BD-3', 'Applied RD\u00AD3'];
  for (const note of rule) assert.deepEqual(ns.privacyWarnings(note, 'D001'), ['internal rule IDs'], JSON.stringify(note));
  for (const note of ['Earlier case P063', 'Earlier case p063', 'Earlier case P 063', 'Earlier case R\u2013001']) {
    assert.deepEqual(ns.privacyWarnings(note, 'D001'), ['internal case IDs'], note);
  }
  for (const note of ['See GPS4', 'See gps\u20134', 'See CHAT 2', 'See HIST-\n1']) assert.deepEqual(ns.privacyWarnings(note, 'D001'), ['evidence IDs'], note);
});

test('F02: everyday wording stays clean', () => {
  for (const note of ['R-1 rated', 'P-1 visa', 'A-1 service', 'Step 1', '$6.30 back', 'Pick-up at 08:05', 'Your trip 1 of 2', 'The fare 2 weeks ago',
    'Chat 2 days ago', 'Your GPS 4 minutes later', 'GPS was off', 'Safe trip', 'Ref 1', 'Sorry for the trouble.']) {
    assert.deepEqual(ns.privacyWarnings(note, 'D001'), [], note);
  }
});

test('R02: everyday words warn but can be sent; IDs and assessments never can', () => {
  const soft = ns.noteWarnings({ rider: 'Please check your journey history in the app.', driver: 'Poor mobile signals; contact us if you feel at risk.' }, 'D001');
  assert.deepEqual(soft, { rider: ['history'], driver: ['risk', 'signals'] });
  assert.equal(ns.hasInternalData(soft), false);
  assert.equal(ns.sendBlock({ amountMissing: false, warnings: soft }), 'privacy', 'still warned about first');
  assert.equal(ns.sendBlock({ amountMissing: false, warnings: soft, sendAnyway: true }), null);
  for (const note of ['Your fraud score', 'Your risk score', 'bad faith', 'precedents apply', 'your previous disputes', 'History says RD-3']) {
    const hard = ns.noteWarnings({ rider: note, driver: '' }, 'D001');
    assert.ok(ns.hasInternalData(hard), note);
    assert.equal(ns.sendBlock({ amountMissing: false, warnings: hard, sendAnyway: true }), 'privacy', note);
  }
  assert.equal(ns.sendBlock({ amountMissing: false, held: true, warnings: soft, sendAnyway: true }), 'held', 'a hold outranks it');
  assert.equal(ns.sendBlock({ amountMissing: true, warnings: soft, sendAnyway: true }), 'amount', 'so does a missing amount');
});

const fakeStorage = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) };
};

test('F05: holds and "a person took this on" survive a reload', () => {
  const hold = { disputeId: 'D004', why: 'Safety concern', reason: 'Needs a second look.', amount: null, at: '10:00' };
  const storage = fakeStorage();
  ds.writeHeld(storage, { holds: { D004: hold }, everHeld: ['D004', 'D001'] });
  const back = ds.readHeld(storage);
  assert.deepEqual(back.holds, { D004: hold });
  assert.deepEqual(back.everHeld.sort(), ['D001', 'D004']);
  const store = ns.createSentStore(fakeStorage());
  assert.equal(ns.staysWithReviewer(store, 'D004', 'k2', back.everHeld.includes('D004')), true, 'a restored hold keeps auto-close away');
  assert.equal(ns.staysWithReviewer(store, 'D002', 'k3', back.everHeld.includes('D002')), false);
});

test('F05: bad or blocked storage means no holds, never a crash', () => {
  const empty = { holds: {}, everHeld: [] };
  assert.deepEqual(ds.readHeld(null), empty);
  assert.deepEqual(ds.readHeld(fakeStorage()), empty);
  assert.deepEqual(ds.readHeld(fakeStorage({ [ds.HELD_KEY]: 'not json' })), empty);
  assert.deepEqual(ds.readHeld(fakeStorage({ [ds.HELD_KEY]: JSON.stringify({ holds: { D1: { disputeId: 'D2' } }, everHeld: 'D1' }) })), empty);
  assert.doesNotThrow(() => ds.writeHeld({ getItem: () => null, setItem() { throw new Error('blocked'); } }, empty));
  assert.doesNotThrow(() => ds.readHeld({ getItem() { throw new Error('blocked'); }, setItem() {} }));
});

const eligibleRuling = (decision, refund_amount) => ({ decision, refund_amount, autonomy: { eligible: true, audit: false },
  rider_explanation: "You're getting $0.00 back.", driver_explanation: 'The rider is getting $0.00 back.',
  rider_message: { found: 'x', next: 'y' }, driver_message: { found: 'x', next: 'y' } });

test('R03: a known $0 refund says nothing is due, on every route to the parties', () => {
  const ruling = eligibleRuling('full_refund', 0);
  const record = ns.autoSentRecord('D005', ruling, { fare: { cancellation_fee: 0 } });
  assert.ok(record, 'a known $0 can still close itself');
  for (const party of ['rider', 'driver']) {
    assert.doesNotMatch(record.messages[party], /\$0\.00|getting/, party);
    assert.equal(record.parts, undefined, 'the ruling\'s own parts would repeat "$0.00 back"');
  }
  assert.match(record.messages.rider, /nothing to refund/);
  const overridden = ns.finalOutcome(ruling, { kind: 'overridden', decision: 'full_refund', precedentId: 'R-1' }, { fare: { actual: 0 } });
  assert.equal(overridden.amount, 0);
  assert.match(ns.generatedMessage('rider', ruling, overridden), /nothing to refund/);
  assert.doesNotMatch(ns.generatedMessage('driver', ruling, overridden), /\$0\.00/);
});

test('R03: a refund with no fare on record can be neither promised nor closed automatically', () => {
  assert.equal(ns.autoSentRecord('D005', eligibleRuling('full_refund', null), { fare: {} }), null, 'stays with a reviewer');
  assert.ok(ns.autoSentRecord('D005', eligibleRuling('full_refund', 4), { fare: { cancellation_fee: 4 } }), 'a known refund still closes itself');
  assert.ok(ns.autoSentRecord('D006', eligibleRuling('no_action', null), { fare: { cancellation_fee: 4 } }), 'no refund needs no amount');
  const ruling = eligibleRuling('full_refund', null);
  assert.equal(ns.isUnknownRefund(ns.finalOutcome(ruling, null, { fare: {} })), true, 'Notify blocks an accepted ruling');
  assert.equal(ns.isUnknownRefund(ns.finalOutcome(ruling, { kind: 'overridden', decision: 'full_refund', precedentId: 'R-1' }, { fare: {} })), true);
  assert.equal(ns.isUnknownRefund(ns.finalOutcome(eligibleRuling('no_action', null), null, { fare: {} })), false);
  // A partial override with no amount yet is the amount editor's job, not this block.
  assert.equal(ns.isUnknownRefund(ns.finalOutcome(ruling, { kind: 'overridden', decision: 'partial_refund', precedentId: 'R-1' }, { fare: {} })), false);
  const reason = 'The fare record is missing here.';
  const check = ds.overrideAmountCheck('full_refund', '', null, null);
  assert.equal(check.value, null);
  assert.equal(ds.overrideError({ choice: 'full_refund', check: null, reason, amount: check }), check.message, 'the override form refuses it');
  assert.equal(ds.overrideError({ choice: 'full_refund', check: null, reason, amount: ds.overrideAmountCheck('full_refund', '', 0, null) }), null, 'a known $0 is allowed');
});

// ---- F03: the amount editor for older decisions ---------------------------------------

test('F03: a legacy amount gets the $0.50 minimum and the second-approval limit', () => {
  assert.equal(ds.checkPartialAmount('0.20', 24.8, 6.3).state, 'low', 'the $0.50 minimum');
  assert.equal(ds.secondApprovalLimit(6.3), 9.45, '1.5x the ruling\'s refund');
  assert.equal(ds.checkPartialAmount('9.45', 24.8, 6.3).state, 'ok', 'within the limit');
  const over = ds.checkPartialAmount('9.46', 24.8, 6.3);
  assert.equal(over.state, 'second');
  assert.equal(over.value, 9.46);
  // Over the limit it goes for a second approval; it is never sent to the parties.
  assert.equal(ns.sendBlock({ amountMissing: false, needsSecondApproval: true, warnings: NO_WARNINGS }), 'second');
  assert.equal(ds.secondApprovalLimit(null), 10, 'the $10 cap when the ruling gives no refund');
  assert.equal(ds.checkPartialAmount('10.01', 24.8, null).state, 'second');
  assert.equal(ds.checkPartialAmount('25.00', 24.8, 6.3).state, 'high', 'the fare cap still comes first');
  assert.equal(ds.MIN_PARTIAL, 0.5);
});

// ---- F04: a reopened or held case can send without a new decision -----------------------

test('F04: a reopened case stays locked until a decision is saved in this review', () => {
  assert.equal(ns.notifyGate({ saved: false, unavailable: false, rulingVisited: true }), 'locked', 'a reopen clears the Ruling tick');
  assert.equal(ns.notifyGate({ saved: true, unavailable: false, rulingVisited: false }), 'open');
  assert.equal(ns.notifyGate({ saved: false, unavailable: true, rulingVisited: true }), 'open', 'the public-demo exception is unchanged');
  assert.equal(ns.notifyGate({ saved: false, unavailable: true, rulingVisited: false }), 'locked');
});

test('F04: what was sent before a reopen is history, never today\'s approval', () => {
  const store = ns.createSentStore(memoryStorage());
  const key = 'D001|run1';
  store.set(key, sentRecord());
  assert.equal(store.get(key)?.amount, 6.3);
  assert.equal(store.reopen(key, '09:00', '2026-10-30T01:05:00.000Z'), true);
  assert.equal(store.get(key), null, 'a reopened case is not a closed one');
  assert.equal(store.latest(key)?.amount, 6.3, 'what was sent stays readable as `previous`');
  assert.equal(store.reopened(key), true);
  assert.equal(store.reviewerReopened('D001'), true);
  // The old $6.30 must not be delivered again: there is no saved decision for this review.
  assert.equal(ns.notifyGate({ saved: false, unavailable: false, rulingVisited: false }), 'locked');
});

test('F04: a case on hold keeps Notify locked and refuses to send', () => {
  assert.equal(ns.notifyGate({ saved: false, unavailable: false, rulingVisited: true, held: true }), 'locked');
  assert.equal(ns.notifyGate({ saved: true, unavailable: false, rulingVisited: false, held: true }), 'locked', 'a hold outranks a saved decision');
  assert.equal(ns.sendBlock({ amountMissing: false, warnings: NO_WARNINGS }), null);
  assert.equal(ns.sendBlock({ amountMissing: false, warnings: NO_WARNINGS, held: true }), 'held');
  assert.equal(ns.sendBlock({ amountMissing: false, warnings: NO_WARNINGS, held: true, sendAnyway: true }), 'held');
});

test('F04: a reopened case is never shown as Auto-resolved', () => {
  // A reopen leaves no closed record, so caseStatus cannot call it auto.
  assert.equal(q.caseStatus({ decision: 'partial_refund' }, false, false, { reopened: true }), 'reopened');
  assert.equal(q.caseStatus({ decision: 'partial_refund' }, false, false, { reopened: true, autoClosed: true }), 'reopened', 'the reopen wins');
  assert.equal(q.caseStatus({ decision: 'partial_refund' }, false, true, { autoClosed: true }), 'auto', 'a case the policy did close');
  assert.equal(q.tileCounts([{ status: 'reopened' }]).auto, 0, 'one status per case, so never both');
});

// ---- F05: re-running a reopened case closes it automatically again -----------------------

test('F05: a re-run gets a new review key, but the reopen is remembered by dispute', () => {
  const store = ns.createSentStore(memoryStorage());
  const first = 'D001|run1', second = 'D001|run2';
  store.set(first, sentRecord());
  store.reopen(first, '09:00');
  assert.equal(store.events(second).length, 0, 'the new run starts with no history');
  assert.equal(store.reopened(second), false, 'the new key has no reopen event (the bug)');
  assert.equal(store.reviewerReopened('D001'), true, 'but the dispute was reopened, across runs');
  assert.equal(store.reviewerReopened('D002'), false, 'another dispute is untouched');
  assert.equal(store.reviewerReopened('D00'), false, 'a prefix of the ID is not the ID');
});

test('F05: the reopen is remembered after a reload, not just in memory', () => {
  const storage = memoryStorage();
  const first = ns.createSentStore(storage);
  first.set('D001|run1', sentRecord());
  first.reopen('D001|run1', '09:00');
  assert.equal(ns.createSentStore(storage).reviewerReopened('D001'), true, 'read back from storage');
});

test('F05: a case put on hold, or reopened, never closes itself on a later run', () => {
  const store = ns.createSentStore(memoryStorage());
  assert.equal(ns.staysWithReviewer(store, 'D008', 'D008|run2', false), false, 'an untouched case may close');
  assert.equal(ns.staysWithReviewer(store, 'D008', 'D008|run2', true), true, 'held, or held earlier this session');
  store.set('D001|run1', sentRecord());
  assert.equal(ns.staysWithReviewer(store, 'D001', 'D001|run1', false), true, 'it already has history');
  assert.equal(ns.staysWithReviewer(store, 'D001', 'D001|run2', false), false, 'a closed case may close again on a new run');
  store.reopen('D001|run1', '09:00');
  assert.equal(ns.staysWithReviewer(store, 'D001', 'D001|run2', false), true, 'reopened, across runs');
});

test('F05: auto-close is otherwise unchanged: audit sampling, limits and eligibility', () => {
  const eligible = { ...ruling, autonomy: { eligible: true, audit: false, reasons: [] } };
  assert.ok(ns.autoSentRecord('D009', eligible, D001), 'an eligible ruling still closes itself');
  assert.equal(ns.autoSentRecord('D009', { ...eligible, autonomy: { eligible: true, audit: true, reasons: [] } }, D001), null, 'audit sample');
  assert.equal(ns.autoSentRecord('D009', { ...eligible, autonomy: { eligible: false, audit: false, reasons: [] } }, D001), null, 'outside the limits');
  assert.equal(ns.autoSentRecord('D009', { ...eligible, decision: 'needs_review' }, D001), null, 'escalated');
  assert.equal(ns.autoSentRecord('D009', { ...eligible, autonomy: undefined }, D001), null, 'the switch is off');
});
