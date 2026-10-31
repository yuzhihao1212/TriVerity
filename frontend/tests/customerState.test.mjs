import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';

const s = await load('customerState');
const { CUSTOMER_COPY: copy } = await load('customerCopy');
const outcome = (decision, amount = 6.3) => ({ decision, amount });

test('customer result is party-specific for every outcome; driver never receives a Refund headline', () => {
  assert.equal(s.customerResult('rider', outcome('partial_refund')).line, "You're getting $6.30 back");
  assert.equal(s.customerResult('rider', outcome('full_refund', 24.8)).line, "You're getting $24.80 back");
  assert.equal(s.customerResult('rider', outcome('compensation', 5)).line, "You're getting a $5.00 credit");
  assert.equal(s.customerResult('rider', outcome('no_action')).line, 'The charge stays as it is');
  for (const decision of ['partial_refund', 'full_refund', 'compensation', 'no_action', 'needs_review']) {
    const driver = s.customerResult('driver', outcome(decision));
    assert.doesNotMatch(driver.line, /refund|getting|credit/i);
    assert.equal(driver.icon, decision === 'needs_review' ? 'pause' : 'check');
    assert.equal(driver.status, decision === 'needs_review' ? 'Under review' : 'Resolved');
    assert.ok(driver.next.length <= 2);
  }
  assert.match(s.customerResult('driver', outcome('partial_refund')).next[0], /\$6.30.*rider/);
  assert.equal(s.customerResult('rider', outcome('needs_review')).line, 'A human reviewer will decide');
  assert.equal(s.customerResult('rider', outcome('full_refund', 0)).line, copy.result.nothingDue, 'a known $0 is not "being confirmed"');
  assert.equal(s.customerResult('rider', outcome('full_refund', 0)).icon, 'check');
  for (const amount of [null, NaN, Infinity]) {
    assert.doesNotMatch(s.customerResult('rider', outcome('partial_refund', amount)).line, /NaN|Infinity|\$0/);
    assert.equal(s.customerResult('rider', outcome('partial_refund', amount)).line, copy.result.pendingAmount);
  }
});

test('customer name fallback and greeting never invent names', () => {
  for (const name of [undefined, null, '', '  ']) {
    assert.equal(s.customerName(name), null);
    assert.equal(copy.greeting(s.customerName(name)), 'Hi there,');
  }
  assert.equal(s.customerName(' Sam '), 'Sam');
  assert.equal(copy.greeting(s.customerName(' Sam ')), 'Hi Sam,');
});

test('quick notes fill in name and amount and only offer relevant outcome notes', () => {
  const rider = s.quickNotes('rider', outcome('partial_refund'), 'Sam');
  // No refund-timing note until the team confirms the refund time (customerCopy CONFIRMED).
  assert.deepEqual(rider.map(x => x.label), ['Sorry About Your Trip', 'When the Refund Arrives', 'Thanks for Telling Us']);
  assert.match(rider[0].text, /Sam/);
  assert.equal(s.quickNotes('rider', outcome('no_action')).some(x => x.id === 'sorry'), false);
  assert.equal(s.quickNotes('rider', outcome('needs_review')).some(x => x.id === 'timing'), false);
  assert.equal(s.quickNotes('rider', outcome('compensation')).some(x => x.id === 'timing'), false);
  assert.equal(s.quickNotes('driver', outcome('partial_refund')).some(x => /sorry/i.test(x.text)), false);
  assert.match(s.quickNotes('driver', outcome('partial_refund'), 'Jordan')[0].text, /Jordan/);
  assert.equal(s.quickNotes('driver', outcome('full_refund'), null, 'no_show_charge').some(x => x.id === 'route'), false);
  assert.equal(s.quickNotes('rider', outcome('partial_refund'))[0].text, "We're sorry about your trip. Thanks for your patience.");
  assert.equal(s.quickNotes('driver', outcome('needs_review')).some(x => x.id === 'appeal'), false);
});

test('chip insertion and removal preserve editable notes and enforce the full 280-character limit', () => {
  const text = 'Thank you, Sam.';
  const inserted = s.toggleQuickNote('My own words.', text);
  assert.deepEqual(inserted, { note: 'My own words. Thank you, Sam.', refused: false });
  assert.deepEqual(s.toggleQuickNote(inserted.note, text), { note: 'My own words.', refused: false });
  assert.equal(s.toggleQuickNote(`${text} My own words.`, text).note, 'My own words.');
  assert.equal(s.toggleQuickNote(`Before ${text} After`, text).note, 'Before After');
  assert.deepEqual(s.toggleQuickNote('', text), { note: text, refused: false });
  assert.equal(s.toggleQuickNote(text, text).note, '');
  assert.equal(s.toggleQuickNote('x'.repeat(280 - text.length - 1), text).note.length, 280);
  assert.deepEqual(s.toggleQuickNote('x'.repeat(280 - text.length), text), { note: 'x'.repeat(280 - text.length), refused: true });
});

test('rating radiogroup supports arrow keys, wrapping and Home/End', () => {
  assert.equal(s.ratingIndex(null, 'ArrowRight'), 0);
  assert.equal(s.ratingIndex(null, 'ArrowLeft'), 4);
  assert.equal(s.ratingIndex(4, 'ArrowRight'), 0);
  assert.equal(s.ratingIndex(0, 'ArrowLeft'), 4);
  assert.equal(s.ratingIndex(2, 'ArrowDown'), 3);
  assert.equal(s.ratingIndex(2, 'ArrowUp'), 1);
  assert.equal(s.ratingIndex(3, 'Home'), 0);
  assert.equal(s.ratingIndex(1, 'End'), 4);
  assert.equal(s.ratingIndex(null, 'Tab'), null);
});

test('feedback is session-scoped, isolated per party/case, editable and survives blocked storage in memory', () => {
  const data = new Map();
  const storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  const store = s.createFeedbackStore(storage);
  assert.equal(store.set('D001.rider', { rating: 4, comment: 'Helpful' }), true);
  assert.equal(store.get('D001.driver'), null);
  assert.equal(store.get('D006.rider'), null);
  assert.deepEqual(s.createFeedbackStore(storage).get('D001.rider'), { rating: 4, comment: 'Helpful' });
  store.set('D001.rider', { rating: 1, comment: 'Changed' });
  const read = store.get('D001.rider'); read.comment = 'Mutated';
  assert.equal(store.get('D001.rider').comment, 'Changed');
  assert.equal(s.createFeedbackStore().get('D001.rider'), null, 'new session has no feedback');
  const blocked = s.createFeedbackStore({ getItem() { throw Error(); }, setItem() { throw Error(); } });
  assert.equal(blocked.get('D001.rider'), null);
  blocked.set('D001.rider', { rating: 0, comment: '' });
  assert.deepEqual(blocked.get('D001.rider'), { rating: 0, comment: '' });
  for (const value of [null, {}, { rating: 5, comment: '' }, { rating: -1, comment: '' }, { rating: 0.5, comment: '' }, { rating: 0, comment: 'x'.repeat(281) }]) {
    assert.equal(s.validFeedback(value), false);
    assert.equal(store.set('bad', value), false);
  }
  const corrupt = s.createFeedbackStore({ getItem: () => 'broken', setItem() {} });
  assert.equal(corrupt.get('bad'), null);
});
