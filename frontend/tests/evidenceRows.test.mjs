import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';
const r = await load('evidenceRows');
const trip = { expected_distance_km: 10.2, actual_distance_km: 14.7, expected_duration_min: 22, actual_duration_min: 35 };
const dispute = { trip, fare: { expected: 18.5, actual: 24.8 }, gps_points: Array.from({ length: 36 }, (_, m) => ({ lat: 1.3, lng: 103.8, timestamp: `2026-09-20T08:${String(m).padStart(2, '0')}:00+08:00` })) };
const fact = (text, source = 'trip', id) => ({ text, source, ...(id ? { id } : {}) });
const off = 'Off the planned route 08:05-08:32: 11.3 km driven, up to 2,704 m away';

test('change pill has an explicit sign, units, percent and decrease/neutral tones', () => {
  assert.deepEqual(r.changePill(10.2, 14.7, 'km'), { text: '+4.5 km · +44%', tone: 'danger' });
  assert.deepEqual(r.changePill(22, 35, 'min'), { text: '+13 min · +59%', tone: 'danger' });
  assert.deepEqual(r.changePill(18.5, 24.8, '$'), { text: '+$6.30 · +34%', tone: 'danger' });
  assert.deepEqual(r.changePill(10, 8, 'km'), { text: '−2 km · −20%', tone: 'ok' });
  assert.deepEqual(r.changePill(5, 5, 'min'), { text: '0 min · 0%', tone: 'neutral' });
  assert.deepEqual(r.changePill(0, 4, '$'), { text: '+$4.00', tone: 'danger' });
});

test('comparisons are structured for Trip, GPS and Fare; mismatched or missing data stays verbatim', () => {
  const input = fact('Route was +44% vs expected distance', 'trip', 'TRIP-1');
  const before = structuredClone(input);
  assert.deepEqual(r.alignedFact(input, dispute).comparison, { expected: '10.2 km', actual: '14.7 km', change: { text: '+4.5 km · +44%', tone: 'danger' } });
  assert.equal(r.alignedFact(fact('Trip took +59% vs expected duration'), dispute).label, 'Duration');
  assert.equal(r.alignedFact(fact('Fare: charged $24.80, expected $18.50', 'fare')).comparison.change.text, '+$6.30 · +34%');
  assert.equal(r.alignedFact(fact('GPS path 14.7 km over 36 points (+44% vs expected)', 'gps'), dispute).comparison.expected, '10.2 km');
  assert.equal(r.alignedFact(fact('Trip record: distance expected 10.2 km, actual 14.7 km')).comparison.actual, '14.7 km');
  assert.equal(r.alignedFact(input).comparison, undefined);
  assert.equal(r.alignedFact(fact('Route was +40% vs expected distance'), dispute).text, 'Route was +40% vs expected distance');
  assert.equal(r.alignedFact(fact('Fare was +6.30 vs expected fare', 'fare'), dispute).comparison.actual, '$24.80');
  assert.equal(r.alignedFact(fact('Fare was +8.00 vs expected fare', 'fare'), dispute).comparison, undefined);
  assert.equal(r.alignedFact(fact('Fare line: Base fare $3.10', 'fare')).text, '$3.10');
  assert.equal(r.alignedFact(fact('Trip record: distance expected 0.75 km, actual 1.125 km')).comparison.actual, '1.125 km');
  assert.equal(r.alignedFact(fact('Trip record: distance expected 0.75 km, actual 1.125 km')).comparison.change.text, '+0.375 km · +50%');
  assert.deepEqual(input, before);
});

test('non-comparison facts preserve their words, quotes, values and existing IDs', () => {
  const text = 'Threatening message: driver: "I know where you live, number 12"';
  assert.deepEqual(r.alignedFact(fact(text, 'chat', 'CHAT-4')), { label: 'Safety', text });
  assert.equal(r.alignedFact(fact('Driver waited 7 min at pickup')).label, 'Wait');
  assert.equal(r.alignedFact(fact('Rider history: account 820 days old, rating 4.8, 214 trips, 0 disputes in last 90 days', 'history')).text, 'account 820 days old, rating 4.8, 214 trips, 0 disputes in last 90 days');
  assert.deepEqual(r.alignedFact(fact('A future format 7.42')), { label: 'Recorded fact', text: 'A future format 7.42' });
});

test('related link says what the original holds and GPS stop links state their count', () => {
  assert.equal(r.relatedLinkLabel([fact('GPS path 14.7 km over 36 points (+44% vs expected)', 'gps')]), '↳ Also in GPS: route length from the GPS trace');
  assert.equal(r.relatedLinkLabel([fact('GPS stop: 6 min from 08:14', 'gps'), fact('GPS unexpected stops total 6 min', 'gps')], fact('Unexpected stop: 6 min at 08:14', 'gps')), '↳ 2 related GPS facts');
  assert.match(r.relatedLinkLabel([fact('Trip record: duration expected 22 min, actual 35 min', 'trip')]), /expected and actual trip times/);
});

test('GPS off-route sentences use most only over half of a known trip', () => {
  const row = r.gpsRow(off, [off], dispute);
  assert.equal(row.value, '27 min');
  assert.equal(row.small, 'of 35');
  assert.equal(row.sentence, 'Drove away from the planned route for most of the trip.');
  assert.equal(row.detail, '11.3 km off route · up to 2.7 km away');
  assert.equal(r.gpsRow('Off the planned route 08:05-08:11: 2.3 km driven, up to 300 m away', [], dispute).sentence, 'Drove away from the planned route for 6 of 35 minutes.');
  assert.equal(r.gpsRow(off, []).sentence, 'Drove away from the planned route for 27 minutes.');
  assert.equal(r.gpsRow('Off the planned route 23:55-00:05: 2.3 km driven, up to 300 m away', []).value, '10 min');
});

test('GPS dots group all off-plan readings first and sentences avoid device claims', () => {
  const row = r.gpsRow('GPS within 150 m of the planned route for 8 of 36 points', []);
  assert.equal(row.sentence, '28 of 36 GPS readings were off the planned route.');
  assert.equal(row.value, '78%');
  assert.equal(row.dots.length, 36);
  assert.deepEqual(row.dots, [...Array(28).fill(true), ...Array(8).fill(false)]);
  assert.match(row.threshold, /150 m/);
  assert.equal(r.gpsRow('GPS within 150 m of the planned route for 4 of 4 points', []).value, '0%');
  assert.equal(r.gpsRow('GPS within 150 m of the planned route for 0 of 0 points', []), null);
  assert.equal(r.gpsRow('GPS within 150 m of the planned route for 5 of 4 points', []), null);
});

test('stop sentence says middle only for a stop clear of both ends, keeping no-show locations', () => {
  const text = 'Unexpected stop: 6 min at 08:14';
  assert.equal(r.gpsRow(text, [text], dispute).sentence, 'Stopped for 6 minutes in the middle of the trip.');
  assert.equal(r.gpsRow(text, [text]).sentence, 'Stopped for 6 minutes.');
  assert.equal(r.gpsRow('Unexpected stop: 1 min at 08:00', [], dispute).sentence, 'Stopped for 1 minute.');
  assert.equal(r.gpsRow('Unexpected stop: 4 min at 08:31', [], dispute).sentence, 'Stopped for 4 minutes.');
  assert.equal(r.gpsRow('Driver stopped 7 min at 08:02, 16 m from pickup', [], dispute).sentence, 'Stopped for 7 minutes, 16 m from the pickup point.');
});

test('raw window disclosure always names its own window and calls it a detour only when matched', () => {
  const raw = 'GPS 08:05-08:32: 28 points, moved 10.32 km, speed avg 22 km/h, max 42 km/h';
  assert.equal(r.rawWindowLabel(raw, [off]), 'Raw readings during the detour (08:05–08:32)');
  assert.equal(r.rawWindowLabel(raw, []), 'Raw GPS readings (08:05–08:32)');
  assert.equal(r.rawWindowLabel('GPS 08:00-08:02: no points in this window', []), 'Raw GPS readings (08:00–08:02)');
  assert.equal(r.rawWindowLabel('GPS points rejected: 2', []), null);
});
