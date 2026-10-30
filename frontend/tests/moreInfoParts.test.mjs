import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';

const ns = await load('notifyState');
const parts = (who) => ({ greeting: `Hi there, thanks (${who}).`, found: `Found for the ${who}.`, next: `Next for the ${who}.` });
const resolution = {
  decision: 'partial_refund', refund_amount: 6.3, rider_explanation: 'Rider full text.', driver_explanation: 'Driver full text.',
  rider_message: parts('rider'), driver_message: parts('driver'), autonomy: { eligible: true, audit: false, reasons: [] },
};

test('More info gets the parts when the party gets the ruling\'s own message', () => {
  assert.deepEqual(ns.messageParts('rider', resolution, { source: 'ruling' }), parts('rider'));
  assert.deepEqual(ns.messageParts('driver', resolution, { source: 'ruling' }), parts('driver'));
});

test('falls back to the whole message: a reviewer override, or an older result without parts', () => {
  assert.equal(ns.messageParts('rider', resolution, { source: 'override' }), null);
  assert.equal(ns.messageParts('rider', { rider_explanation: 'x', driver_explanation: 'y' }, { source: 'ruling' }), null);
  assert.equal(ns.sentParts(() => null), undefined);
});

test('an automatic close keeps the parts and adds the notice, with the demo appeal window, to what happens now', () => {
  const record = ns.autoSentRecord('D001', resolution, { fare: { actual: 24.8, expected: 18.5 } });
  assert.equal(record.parts.rider.found, 'Found for the rider.');
  assert.equal(record.parts.rider.next, `Next for the rider. ${ns.AUTO_NOTICE}`);
  assert.match(ns.AUTO_NOTICE, /appeal/);
  assert.match(ns.AUTO_NOTICE, /appeal within 7 days\.$/);
  // Older results without parts still close, with the whole message only.
  const old = ns.autoSentRecord('D001', { ...resolution, rider_message: undefined, driver_message: undefined }, { fare: {} });
  assert.equal(old.parts, undefined);
  assert.equal(old.messages.rider, `Rider full text. ${ns.AUTO_NOTICE}`);
});
