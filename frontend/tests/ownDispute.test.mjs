import assert from 'node:assert/strict';
import test from 'node:test';

import { load } from './_load.mjs';

const own = await load('ownDispute');

const memory = () => {
  const store = new Map();
  return { store, getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
};

const route = (trip, fare = {}) => ({
  dispute_id: 'X', type: 'route_deviation', rider_claim: 'The driver took a very long way round and I was late for my appointment',
  trip, fare: { breakdown: [], ...fare }, chat_logs: [], rider_history: {}, driver_history: {},
});
const noShow = trip => ({ ...route(trip), type: 'no_show_charge' });

test('own disputes get short IDs that keep counting across reloads', () => {
  const storage = memory();
  assert.equal(own.nextOwnDisputeId(storage), 'J-01');
  assert.equal(own.nextOwnDisputeId(storage), 'J-02');
  assert.equal(storage.store.get(own.OWN_COUNT_KEY), '2');
  storage.store.set(own.OWN_COUNT_KEY, '41');          // an earlier session's count
  assert.equal(own.nextOwnDisputeId(storage), 'J-42');
});

test('blocked storage still gives new IDs, never a repeat', () => {
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const first = own.nextOwnDisputeId(blocked);
  const second = own.nextOwnDisputeId(null);
  assert.match(first, /^J-\d{2,}$/);
  assert.notEqual(first, second);
});

test('route disputes are named from the trip numbers, like the samples', () => {
  assert.equal(own.autoLabel(route({ expected_distance_km: 10, actual_distance_km: 13.8, expected_duration_min: 20, actual_duration_min: 31 })),
    'Route 38% longer, 11 min slower');
  assert.equal(own.autoLabel(route({ expected_distance_km: 10, actual_distance_km: 12, expected_duration_min: 20, actual_duration_min: 16 })),
    'Route 20% longer, 4 min faster');
  assert.equal(own.autoLabel(route({ expected_distance_km: 10, actual_distance_km: 12 })), 'Route 20% longer');
  assert.equal(own.autoLabel(route({}, { expected: 12, actual: 15.5 })), 'Charged $3.50 more');
});

test('no-show disputes are named from the wait and the stopping distance', () => {
  const pickup = { pickup_lat: 1.3521, pickup_lng: 103.8198 };
  const away = { ...pickup, driver_arrival_lat: 1.3521 + 380 / 111_320, driver_arrival_lng: 103.8198 };
  assert.equal(own.autoLabel(noShow(away)), 'Driver stopped 380 m away');
  assert.equal(own.autoLabel(noShow({ ...away, driver_wait_min: 6 })), '6-min wait, 380 m from pickup');
  assert.equal(own.autoLabel(noShow({ driver_wait_min: 4 })), 'Driver waited 4 min');
});

test('without numbers the name is the first words of the claim, short and within the API limit', () => {
  const label = own.autoLabel(route({}));
  assert.equal(label, 'The driver took a very long way…');
  assert.ok(label.length <= 60);
  assert.equal(own.autoLabel({ ...route({}), rider_claim: 'Charged twice' }), 'Charged twice');
});
