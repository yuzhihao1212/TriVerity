import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';

const c = await load('customerCopy');
const s = await load('customerState');
const ns = await load('notifyState');
const none = { refundTime: null, ratingUnaffected: false, appealWindowDays: null };
const all = { refundTime: '3–5 working days', ratingUnaffected: true, appealWindowDays: 7 };
const outcome = (decision, amount = 6.3) => ({ decision, amount });

test('with a claim left out, nothing is promised: no refund time, rating line or appeal deadline', () => {
  const copy = c.confirmedCopy(none);
  assert.equal(copy.refundNext, 'The refund goes back to your original payment method.');
  assert.equal(copy.rating, null);
  assert.equal(copy.refundTiming, null);
  assert.equal(copy.appealWindow, 'If you disagree, you can appeal.');
  for (const text of [copy.refundNext, copy.appealWindow, copy.appealNote, copy.autoNotice]) {
    assert.doesNotMatch(text, /working days|\d+ days|rating/);
  }
});

test('the demo shows all three promises on the phones', () => {
  assert.deepEqual(c.CONFIRMED, all);
  const copy = c.confirmedCopy(all);
  assert.deepEqual(s.customerResult('driver', outcome('partial_refund')).next,
    ['$6.30 of this fare went back to the rider.', "Your earnings for this trip have been adjusted; your rating isn't affected."]);
  assert.deepEqual(s.customerResult('driver', outcome('no_action')).next, ["Your earnings for this trip don't change.", "Your rating isn't affected."]);
  assert.deepEqual(s.customerResult('rider', outcome('partial_refund')).next, ['Back on your card in 3–5 working days.']);
  assert.equal(ns.AUTO_NOTICE, copy.autoNotice);
});

test('each claim comes back, worded as before, once its value is confirmed', () => {
  const copy = c.confirmedCopy(all);
  assert.equal(copy.refundNext, 'Back on your card in 3–5 working days.');
  assert.equal(copy.rating, "Your rating isn't affected.");
  assert.equal(copy.appealWindow, 'You can appeal within 7 days.');
  assert.equal(copy.refundTiming('$6.30'), 'Your $6.30 refund should reach your card within 3–5 working days.');
  assert.match(copy.appealNote, /Appeal case within 7 days\.$/);
  assert.match(copy.autoNotice, /appeal within 7 days\.$/);
});
