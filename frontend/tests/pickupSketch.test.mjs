import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';
const p = await load('pickupSketch');
const r = await load('evidenceRows');

// D005: the driver waited 378 m north of pickup; D006: about 15 m away.
const d005 = { pickup_lat: 1.3521, pickup_lng: 103.8198, driver_arrival_lat: 1.3555, driver_arrival_lng: 103.8198 };
const d006 = { pickup_lat: 1.3521, pickup_lng: 103.8198, driver_arrival_lat: 1.3522, driver_arrival_lng: 103.8199 };
const waiting = Array.from({ length: 7 }, (_, m) => ({ lat: 1.3555, lng: 103.8198, timestamp: `2026-09-20T09:0${m}:00+08:00` }));

test('a car that never moved is parked; one that drove away is not', () => {
  assert.equal(p.isParked(waiting), true);
  assert.equal(p.isParked([...waiting, { lat: 1.36, lng: 103.83 }]), false);
  assert.equal(p.isParked([]), false);
});

test('D005: the driver is drawn outside the zone, above the pickup pin, to scale', () => {
  const layout = p.pickupLayout(d005, 720, 340);
  assert.ok(Math.abs(layout.distance - 378) < 1);
  assert.equal(layout.inside, false);
  assert.equal(layout.toScale, true);
  assert.ok(layout.driver.y < layout.pickup.y, 'north is up');
  assert.ok(Math.abs(layout.driver.x - layout.pickup.x) < 0.5, 'same longitude');
  const apart = Math.hypot(layout.driver.x - layout.pickup.x, layout.driver.y - layout.pickup.y);
  assert.ok(Math.abs(apart / layout.zoneRadius - layout.distance / p.PICKUP_LIMIT_M) < 0.01, 'zone and distance share one scale');
});

test('everything fits inside the box with its padding', () => {
  for (const [w, h] of [[720, 340], [293, 300]]) {
    const { pickup, driver, zoneRadius } = p.pickupLayout(d005, w, h, 48);
    for (const x of [pickup.x - zoneRadius, pickup.x + zoneRadius, driver.x]) assert.ok(x >= 47.9 && x <= w - 47.9);
    for (const y of [pickup.y - zoneRadius, pickup.y + zoneRadius, driver.y]) assert.ok(y >= 47.9 && y <= h - 47.9);
  }
});

test('D006: a driver almost on the pin is inside the zone and nudged apart, marked not to scale', () => {
  const layout = p.pickupLayout(d006, 720, 340);
  assert.ok(layout.distance < 20);
  assert.equal(layout.inside, true);
  assert.equal(layout.toScale, false);
  const apart = Math.hypot(layout.driver.x - layout.pickup.x, layout.driver.y - layout.pickup.y);
  assert.ok(apart >= layout.zoneRadius * 0.44);
});

test('no sketch without both locations', () => {
  assert.equal(p.pickupLayout({ ...d005, driver_arrival_lat: null }, 720, 340), null);
  assert.equal(p.pickupLayout(undefined, 720, 340), null);
});

test('reading marks spread from 0 to 1 by timestamp', () => {
  assert.deepEqual(p.readingMarks(waiting).map(v => Math.round(v * 6)), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(p.readingMarks([{ lat: 1, lng: 1 }]), []);
});

test('a GPS path of 0 km reads as readings from one spot', () => {
  assert.deepEqual(r.alignedFact({ text: 'GPS path 0.0 km over 7 points', source: 'gps' }), { label: 'Readings', text: '7 GPS readings, all from the same spot' });
  assert.equal(r.alignedFact({ text: 'GPS path 1.1 km over 8 points', source: 'gps' }).text, 'GPS path 1.1 km over 8 points');
});
