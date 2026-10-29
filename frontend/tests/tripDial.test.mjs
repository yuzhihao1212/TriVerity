import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';

const { dialMinutes, dialCentre, fareChange } = await load('tripDial');

test('the dial is a clock hour, or whole half-hours for longer trips', () => {
  assert.equal(dialMinutes(35), 60);
  assert.equal(dialMinutes(60), 60);
  assert.equal(dialMinutes(61), 90);
  assert.equal(dialMinutes(95), 120);
  assert.equal(dialMinutes(Number.NaN), 60);
});

test('the dial centre shows the difference in whole minutes', () => {
  assert.deepEqual(dialCentre(22, 35), { value: '+13', caption: 'min longer' });
  assert.deepEqual(dialCentre(30, 24.4), { value: '−6', caption: 'min shorter' });
  assert.deepEqual(dialCentre(20, 20.2), { value: '0', caption: 'min · on time' });
  assert.deepEqual(dialCentre(null, 35), { value: '35', caption: 'min' });
  assert.equal(dialCentre(22, null), null);
});

test('the fare badge names the direction, the amount and the percentage', () => {
  assert.deepEqual(fareChange(18.5, 24.8), { direction: 'up', text: '+$6.30 · +34%' });
  assert.deepEqual(fareChange(20, 15), { direction: 'down', text: '−$5.00 · −25%' });
  assert.deepEqual(fareChange(12.3, 12.3), { direction: 'same', text: 'No change' });
  assert.deepEqual(fareChange(0, 4), { direction: 'up', text: '+$4.00' });
  assert.equal(fareChange(null, 4), null);
});
