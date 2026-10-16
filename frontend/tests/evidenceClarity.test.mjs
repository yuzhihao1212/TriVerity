import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';

const nf = await load('numberFormat');
const cu = await load('countUp');
const gps = await load('gpsStory');
const fare = await load('fareStory');
const hist = await load('historyStory');
const col = await load('collectionStory');
const cited = await load('citedEvidence');
const pres = await load('presentation');
const fv = await load('factVisuals');
const intro = await load('chartIntro');

// D001's real fact sentences (backend/app/services/evidence.py, AI off).
const D001_GPS = [
  'GPS path 14.7 km over 36 points (+44% vs expected)',
  'GPS within 150 m of the planned route for 8 of 36 points',
  'Off the planned route 08:05-08:32: 11.3 km driven, up to 2,704 m away',
  'Unexpected stop: 6 min at 08:14',
  'GPS unexpected stops total 6 min',
  'GPS stop: 6 min from 08:14',
];
const D001_FARE = [
  'Fare was +6.30 vs expected fare', 'Fare breakdown matches the charged fare',
  'Fare line: Base fare $3.10', 'Fare line: Distance (14.7 km) $14.70', 'Fare line: Time (35 min) $7.00',
  'Fare: surge multiplier x1', 'Fare: charged $24.80, expected $18.50',
];
const D001 = {
  type: 'route_deviation',
  trip: { expected_distance_km: 10.2, actual_distance_km: 14.7, expected_duration_min: 22, actual_duration_min: 35 },
  fare: { expected: 18.5, actual: 24.8, breakdown: [] },
};

// ---- 2. Decimals --------------------------------------------------------------------

test('the decimal formatter drops a trailing .0 and nothing else', () => {
  assert.equal(nf.trimDecimal('22.0'), '22');
  assert.equal(nf.trimDecimal('10.2'), '10.2');
  assert.equal(nf.trimDecimal('14.70'), '14.7');
  assert.equal(nf.trimDecimal('35'), '35');
  assert.equal(nf.trimDecimal(6), '6');
  assert.equal(nf.trimDecimal('+44%'), '+44%');
  assert.equal(nf.distanceText(2704), '2.7 km');
  assert.equal(nf.distanceText(150), '150 m');
  assert.equal(nf.thousands(3890), '3,890');
  assert.equal(fv.parseTripRecord('Trip record: duration expected 22.0 min, actual 35.0 min').detail, 'Expected 22 → actual 35 min');
  assert.equal(fv.parseTripRecord('Trip record: distance expected 10.2 km, actual 14.7 km').detail, 'Expected 10.2 → actual 14.7 km');
  assert.equal(fv.parseTile('Driver waited 6.0 min at pickup').value, '6 min');
});

// ---- 1. Count-up --------------------------------------------------------------------

test('count-up: sign and suffix from the start, eased, exact at the end', () => {
  const target = cu.parseCountTarget('+44%');
  assert.deepEqual(target, { sign: '+', value: 44, decimals: 0, suffix: '%' });
  assert.equal(cu.countUpText(target, 0), '+0%');
  assert.equal(cu.countUpText(target, cu.COUNT_UP_MS), '+44%');
  assert.equal(cu.countUpText(target, 10_000), '+44%');
  const mid = Number(cu.countUpText(target, cu.COUNT_UP_MS / 2).slice(1, -1));
  assert.ok(mid > 22 && mid < 44, 'ease-out is past halfway at half time');
  assert.equal(cu.countUpText(cu.parseCountTarget('-16%'), 0), '-0%');
  assert.equal(cu.parseCountTarget('n/a'), null);
  assert.ok(cu.COUNT_UP_MS >= 500 && cu.COUNT_UP_MS <= 700);
  assert.equal(cu.EVIDENCE_SEEN_KEY, 'triverity.evidenceIntroSeen');
});

test('intros are remembered under their own keys', () => {
  const store = new Map();
  const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const evidence = intro.createSeenCases(storage, cu.EVIDENCE_SEEN_KEY);
  const route = intro.createSeenCases(storage, gps.ROUTE_SEEN_KEY);
  assert.equal(evidence.claim('D001'), true);
  assert.equal(evidence.claim('D001'), false);
  assert.equal(route.claim('D001'), true, 'a separate key');
  assert.deepEqual(JSON.parse(store.get('triverity.evidenceIntroSeen')), ['D001']);
  assert.equal(intro.createSeenCases(storage).has('D001'), false, 'the chart intro key is untouched');
});

// ---- 3. GPS ---------------------------------------------------------------------------

test('gpsHeadline: off route and a stop, each alone, neither, and no-show', () => {
  assert.equal(gps.gpsHeadline(D001_GPS), 'The car left the planned route for 27 minutes and stopped for 6 minutes along the way.');
  assert.equal(gps.gpsHeadline(['Off the planned route 08:01-08:20: 13.0 km driven, up to 2,744 m away', 'GPS unexpected stops total 0 min']),
    'The car left the planned route for 19 minutes.');
  assert.equal(gps.gpsHeadline(['Off the planned route 08:00-08:10: 3.0 km driven, up to 900 m away', 'Off the planned route 08:20-08:25: 1.0 km driven, up to 400 m away']),
    'The car left the planned route for 15 minutes.', 'several periods are summed');
  assert.equal(gps.gpsHeadline(['GPS within 150 m of the planned route for 36 of 36 points', 'Unexpected stop: 6 min at 08:14']),
    'The car followed the planned route but stopped for 6 minutes.');
  assert.equal(gps.gpsHeadline(['GPS within 150 m of the planned route for 36 of 36 points']), 'The car stayed on the planned route.');
  assert.equal(gps.gpsHeadline(['Driver stopped 7 min at 08:02, 16 m from the pickup point']), 'The driver stopped for 7 minutes, 16 m from the pickup point.');
  assert.equal(gps.gpsHeadline(['GPS path 1.1 km over 8 points', 'GPS observed stops total 0 min']), null);
});

test('GPS details: km over 1,000 m, and 78% off route', () => {
  const off = gps.parseOffRoute('Off the planned route 08:05-08:32: 11.3 km driven, up to 2,704 m away');
  assert.deepEqual(gps.offRouteDetail(off), { range: '08:05–08:32', driven: '11.3 km', away: '2.7 km' });
  assert.deepEqual(gps.coverageSummary('GPS within 150 m of the planned route for 8 of 36 points'), { offPercent: 78, onRoute: 8, total: 36, metres: 150 });
  assert.equal(gps.stopFacts(D001_GPS).length, 1, 'one stop stated three ways');
});

test('off-route segmentation at 150 m, from the planned route', () => {
  const route = [{ lat: 1.3, lng: 103.8 }, { lat: 1.3, lng: 103.82 }];
  const points = [
    { lat: 1.3, lng: 103.8 },          // on the line
    { lat: 1.3010, lng: 103.81 },      // ~111 m north: on route
    { lat: 1.3020, lng: 103.81 },      // ~222 m north: off route
    { lat: 1.3, lng: 103.82 },         // on the line
  ];
  assert.deepEqual(gps.offRouteFlags(points, route), [false, false, true, false]);
  assert.deepEqual(gps.offRouteFlags(points, []), [false, false, false, false], 'no plan, nothing is off route');
  assert.deepEqual(gps.routeRuns([false, false, true, false]), [{ from: 0, to: 1, off: false }, { from: 1, to: 3, off: true }]);
  assert.ok(Math.abs(gps.distanceToRoute({ lat: 1.3020, lng: 103.81 }, route) - 222) < 3);
});

test('projection: fitted, centred, north up, lng scaled by cos(lat)', () => {
  const planned = [{ lat: 0, lng: 0 }, { lat: 0, lng: 2 }];
  const actual = [{ lat: 0, lng: 0 }, { lat: 1, lng: 2 }];
  const { planned: p, actual: a } = gps.projectRoutes(planned, actual, 400, 200, 0);
  const near = (pt, x, y) => assert.ok(Math.abs(pt.x - x) < 0.01 && Math.abs(pt.y - y) < 0.01, `${JSON.stringify(pt)} ≈ ${x},${y}`);
  near(p[0], 0, 200);
  near(p[1], 400, 200);
  near(a[1], 400, 0); // north is up
  const far = gps.projectRoutes([{ lat: 60, lng: 0 }, { lat: 60, lng: 2 }], [{ lat: 61, lng: 0 }], 400, 400, 0);
  const widthPx = far.planned[1].x - far.planned[0].x, heightPx = far.planned[0].y - far.actual[0].y;
  const cos = Math.cos((60 + 60 + 61) / 3 * Math.PI / 180);
  assert.ok(Math.abs(widthPx / heightPx - 2 * cos) < 1e-6, 'a degree of longitude is shorter by cos(lat)');
});

test('timeline maths: off-route stretch, stop pin, data gap, non-overlapping labels', () => {
  const points = ['08:00', '08:05', '08:10', '08:20'].map(clock => ({ lat: 0, lng: 0, timestamp: `2026-09-20T${clock}:00+08:00` }));
  const tl = gps.gpsTimeline(points, [false, true, true, false], [{ minutes: 5, time: '08:10', noShow: false }], [10]);
  assert.equal(tl.start, '08:00'); assert.equal(tl.end, '08:20');
  assert.deepEqual(tl.segments.map(s => s.off), [true]);
  assert.equal(tl.stops[0].at, 0.5);
  assert.equal(tl.stops[0].label, '08:10 · 5 min');
  assert.deepEqual(tl.gaps, [{ from: 0.5, to: 1, minutes: 10, label: 'GPS data gap: 10 min' }]);
  assert.equal(gps.gpsTimeline([points[0]], [false], []), null, 'needs two timestamps');
  assert.deepEqual(gps.labelRows([0.1, 0.15, 0.5, 0.52], 0.2), [0, 1, 0, 1]);
  assert.equal(gps.pointClock('2026-09-20T08:14:00+08:00'), '08:14');
});

// ---- 4. Fare --------------------------------------------------------------------------

test('fareHeadline: overcharged with supported reasons, as expected, under', () => {
  const over = fare.fareHeadline(D001, D001_FARE);
  assert.equal(`${over.lead}${over.rest}`, 'Charged $6.30 more than expected (+34%), because the trip was 4.5 km and 13 minutes longer than planned.');
  assert.equal(over.differenceCents, 630);
  const faster = fare.fareHeadline({ trip: { expected_distance_km: 10, actual_distance_km: 13, expected_duration_min: 25, actual_duration_min: 21 }, fare: { expected: 18, actual: 21 } }, []);
  assert.equal(faster.rest, ', because the trip was 3 km longer than planned.', 'only the reasons the trip data supports');
  assert.equal(fare.fareHeadline({ trip: {}, fare: { expected: 18.5, actual: 18.5 } }, []).lead, 'Charged $18.50, as expected.');
  assert.equal(fare.fareHeadline({ trip: {}, fare: { expected: 20, actual: 18 } }, []).lead, 'Charged $2.00 less than expected.');
  assert.equal(fare.fareHeadline({ trip: {}, fare: { breakdown: [] } }, []), null);
  const fromFacts = fare.fareHeadline({ trip: {}, fare: {} }, ['Fare: charged $24.80, expected $18.50']);
  assert.equal(fromFacts.lead, 'Charged $6.30 more than expected (+34%)');
  assert.doesNotMatch(`${over.lead}${over.rest}`, /distance cost|time cost/, 'the difference is never split');
});

test('fare checks: lines, surge, promo', () => {
  assert.deepEqual(fare.fareChecks(D001, D001_FARE).map(c => [c.label, c.tone]), [['Lines add up', 'ok'], ['No surge pricing', 'ok']]);
  const bad = fare.fareChecks({ fare: { surge_multiplier: 1.8 } }, ['Charged fare is +2.00 vs the itemised breakdown', 'Surge pricing applied: x1.8',
    'Surge breakdown inconsistent with the multiplier', 'Promo code SAVE5 applied (5.00 off)', 'Promo SAVE5 discount not reflected in the charge']);
  assert.deepEqual(bad.map(c => [c.label, c.tone]), [
    ["Lines don't add up: $2.00 unexplained", 'danger'], ["Surge x1.8 doesn't match the breakdown", 'warn'], ['Promo SAVE5 not applied to the charge', 'warn']]);
  assert.equal(bad[0].title, 'Charged fare is +2.00 vs the itemised breakdown', 'the original sentence is the title');
  const fine = fare.fareChecks({ fare: {} }, ['Surge pricing applied: x1.2', 'Surge breakdown consistent with the multiplier', 'Promo RYDE10 discount reflected in the charge']);
  assert.deepEqual(fine.map(c => [c.label, c.tone]), [['Surge x1.2', 'neutral'], ['Promo RYDE10 applied', 'ok']]);
  assert.deepEqual(fare.fareChecks({ fare: {} }, []), []);
});

test('fare total line and the link to the ruling', () => {
  assert.deepEqual(fare.fareTotalLine(24.8, 18.5), { charged: '$24.80', expected: '$18.50', difference: '+$6.30' });
  const rd3 = ['RD-3: A route more than 15% longer …'];
  assert.deepEqual(fare.fareRulingLink({ decision: 'partial_refund', refund_amount: 6.3, policy_refs: rd3 }, 630),
    { kind: 'refund', before: 'This difference is the ', strong: '$6.30 refund', after: ' the ruling approved', rule: 'RD-3' });
  assert.deepEqual(fare.fareRulingLink({ decision: 'no_action', refund_amount: null, policy_refs: ['RD-1: within tolerance'] }, 80),
    { kind: 'allowed', before: 'No refund: the policy allows this difference', rule: 'RD-1' });
  assert.equal(fare.fareRulingLink({ decision: 'needs_review', refund_amount: 6.9, policy_refs: rd3 }, 690).before, 'A reviewer decides; the difference is shown for context.');
  assert.equal(fare.fareRulingLink(null, 630), null);
  assert.equal(fare.fareRulingLink({ decision: 'partial_refund', refund_amount: 6.3, policy_refs: rd3 }, 0), null);
});

// ---- 5. History -----------------------------------------------------------------------

test('history formatting', () => {
  const rider = hist.parseHistory('Rider history: account 820 days old, rating 4.8, 214 trips, 0 disputes in last 90 days');
  assert.deepEqual(rider, { party: 'rider', days: 820, rating: 4.8, trips: 214, disputes: 0 });
  assert.deepEqual(hist.profile(rider), { tenure: '2.2 yrs on Ryde', rating: '4.8', ratingLabel: '4.8 rating out of 5', trips: '214 trips', disputes: '0 disputes (90d)' });
  assert.equal(hist.tenureText(1460), '4 yrs on Ryde');
  assert.equal(hist.tenureText(90), '3 months on Ryde');
  assert.equal(hist.tenureText(20), '1 month on Ryde');
  assert.equal(hist.profile({ days: 1460, rating: 4, trips: 3890, disputes: 1 }).trips, '3,890 trips');
  assert.equal(hist.profile({ rating: 4 }).rating, '4.0');
  const missing = hist.parseHistory('Rider history: account 210 days old, rating 3.9, 34 trips');
  assert.equal(hist.profile(missing).disputes, '— disputes (90d)');
  assert.equal(hist.profile({}).tenure, '—');
});

test('history tones come from the risk assessment only', () => {
  const risk = { rider_risk: 'low', driver_risk: 'high', signals: ['Driver has 4 disputes in the last 90 days', "Driver's rating is 4.1, below 4.3"] };
  assert.deepEqual(hist.historyRisk(risk, 'driver'), { tone: 'danger', label: 'High bad-faith risk', signals: risk.signals });
  assert.deepEqual(hist.historyRisk(risk, 'rider'), { tone: 'neutral', label: null, signals: [] });
  assert.equal(hist.historyRisk({ rider_risk: 'medium', driver_risk: 'low', signals: [] }, 'rider').label, 'Some bad-faith signals');
  assert.equal(hist.historyRisk(undefined, 'rider').tone, 'neutral', 'no result: neutral, whatever the counts');
});

// ---- 6. Audit trail -------------------------------------------------------------------

const call = (party, tool, reason = 'default plan', args = {}, round = 1, results = ['x']) => ({ round, tool, args, reason, source: tool.startsWith('gps') ? 'gps' : tool === 'fare_lines' ? 'fare' : tool === 'chat_window' ? 'chat' : 'trip', results, party });

test('collectionSummary: fallback, same, different, follow-up, none', () => {
  const fallback = { source: 'fallback', calls: ['rider', 'driver'].flatMap(p => [call(p, 'trip_record'), call(p, 'gps_stops'), call(p, 'fare_lines')]) };
  assert.deepEqual(col.collectionSummary(fallback), { lead: 'AI was off, so both sides got the standard lookups:', rest: ' trip details, GPS stops and fare breakdown.' });
  const same = { source: 'llm', calls: ['rider', 'driver'].map(p => call(p, 'trip_record', 'Check the distance')) };
  assert.deepEqual(col.collectionSummary(same), { lead: 'Both sides asked for', rest: ' trip details.' });
  const different = { source: 'llm', calls: [
    call('rider', 'gps_window', 'To show the car left the route between those times, which the rider says added distance', { start: '08:05', end: '08:32' }),
    call('driver', 'chat_window', 'The rider asked for this road; the chat should show it', { start: '08:00', end: '08:10' }),
    call('driver', 'trip_record', 'Duration', {}, 2),
  ] };
  const summary = col.collectionSummary(different);
  assert.equal(summary.lead, 'Each side asked for its own lookups.');
  assert.equal(summary.rest, ' Rider: GPS readings (08:05–08:32) (To show the car left the route between those times). Driver: chat messages (08:00–08:10) (The rider asked for this road). Then a follow-up lookup: trip details.');
  assert.deepEqual(col.collectionSummary({ source: 'llm', calls: [] }), { lead: 'No extra evidence was requested.', rest: '' });
  for (const value of [fallback, same, different]) {
    const text = JSON.stringify(col.collectionSummary(value));
    assert.doesNotMatch(text, /default plan|_/);
  }
});

test('lookup merging, names, reasons and targets', () => {
  const rounds = col.mergeLookups([call('rider', 'trip_record'), call('driver', 'trip_record'), call('rider', 'chat_window', 'x', { start: '08:05', end: '08:32' }), call('driver', 'fare_lines', 'y', {}, 2)]);
  assert.equal(rounds.length, 2);
  assert.equal(rounds[0].both.length, 1, 'identical lookups appear once');
  assert.deepEqual(rounds[0].rider.map(row => col.lookupName(row.calls[0])), ['Chat (08:05–08:32)']);
  assert.equal(rounds[0].driver.length, 0);
  assert.equal(rounds[1].driver.length, 1);
  assert.equal(col.lookupReason('default plan'), 'Standard lookup (AI off)');
  assert.equal(col.lookupReason(''), null);
  assert.equal(col.lookupName({ tool: 'some_new_tool', args: {} }), 'Some new tool');
  assert.deepEqual(col.lookupTarget({ source: 'trip', results: ['a', 'b'] }), { count: '2 facts', card: 'Trip card', id: 'evidence-source-trip' });
  assert.equal(col.shortReason('x'.repeat(120)).length, 80);
  assert.ok(col.shortReason('x'.repeat(120)).endsWith('…'));
  assert.deepEqual([col.roundLabel(0, 1), col.roundLabel(0, 2), col.roundLabel(1, 2)], [null, 'First lookups', 'Follow-up lookups']);
});

// ---- 7. Cited evidence ----------------------------------------------------------------

test('the categoriser files every computed fact sentence, and keeps "case" for leftovers', () => {
  const expect = {
    trip: ['Trip record: distance expected 10.2 km, actual 14.7 km', 'Trip record: duration expected 22.0 min, actual 35.0 min', 'Route was +44% vs expected distance',
      'Trip took +59% vs expected duration', 'Driver arrived 87 m from pickup point', 'Driver waited 6 min at pickup'],
    gps: [...D001_GPS, 'Off the planned route 3 times in total, 12.0 km driven off it', 'GPS data gap of 4 min', 'Driver stopped 7 min at 08:02, 16 m from the pickup point'],
    fare: [...D001_FARE, 'Surge pricing applied: x1.8', 'Promo code SAVE5 applied (5.00 off)', 'Charged fare is +2.00 vs the itemised breakdown',
      'Promo SAVE5 discount reflected in the charge', 'Promo SAVE5 discount not reflected in the charge', 'Surge breakdown consistent with the multiplier',
      'Surge breakdown inconsistent with the multiplier'],
    chat: ['Driver contacted rider via in-app chat', 'Disagreement in chat: rider: "Why this way?"', 'Agreement in chat: rider: "Ok"', 'Threatening message: driver: "x"',
      'Rider tone: negative (1 of 1 message)', 'Driver tone: neutral (1 of 1 message)', 'No driver contact attempt in chat log', 'App event 08:30 booking_confirmed'],
    history: ['Rider history: account 820 days old, rating 4.8, 214 trips, 0 disputes in last 90 days', 'Driver history: account 1460 days old, rating 4.7, 3890 trips, 2 disputes in last 90 days'],
    case: ['Rider claim: The driver took a much longer route.', 'Driver statement: I diverted because of traffic.'],
  };
  for (const [source, texts] of Object.entries(expect)) for (const text of texts) assert.equal(pres.sentenceSource(text), source, text);
  assert.deepEqual(pres.evidenceItems(['Some sentence'], ['FARE-2']), [{ text: 'Some sentence', id: 'FARE-2', source: 'fare' }], 'prefixed IDs stay unchanged');
});

const items = texts => pres.evidenceItems(texts);
const D001_TRIP = ['Route was +44% vs expected distance', 'Trip took +59% vs expected duration', 'Trip record: distance expected 10.2 km, actual 14.7 km'];

test('key facts: mentioned IDs first, else the first of each main source', () => {
  const withIds = pres.evidenceItems(['Route was +44% vs expected distance', 'Fare was +6.30 vs expected fare', 'Unexpected stop: 6 min at 08:14'], ['TRIP-1', 'FARE-1', 'GPS-4']);
  assert.deepEqual(cited.keyFacts(withIds, 'The stop (GPS-4) and the fare (FARE-1), again GPS-4', 'route_deviation').map(i => i.id), ['GPS-4', 'FARE-1']);
  const route = cited.keyFacts(items([...D001_FARE, ...D001_GPS, ...D001_TRIP, 'Rider claim: x']), 'no IDs here', 'route_deviation');
  assert.deepEqual(route.map(i => i.source), ['trip', 'gps', 'fare']);
  const noShow = cited.keyFacts(items(['Driver arrived 87 m from pickup point', 'No driver contact attempt in chat log', 'Driver stopped 7 min at 08:02, 16 m from the pickup point']), '', 'no_show_charge');
  assert.deepEqual(noShow.map(i => i.source), ['gps', 'trip', 'chat']);
  assert.ok(cited.keyFacts(items([...D001_GPS, ...D001_FARE, ...D001_TRIP]), '', 'route_deviation').length <= 3);
});

test('categories: fixed order, empty ones hidden, duplicates merged, nothing dropped', () => {
  const all = items(['Rider claim: x', ...D001_FARE, ...D001_GPS, ...D001_TRIP]);
  const cats = cited.categories(all);
  assert.deepEqual(cats.map(c => c.source), ['trip', 'gps', 'fare', 'case']);
  assert.equal(cats.reduce((sum, c) => sum + c.count, 0), all.length, 'every fact is counted');
  const gpsCat = cats.find(c => c.source === 'gps');
  assert.ok(gpsCat.groups.length < gpsCat.count, 'the stop is stated three ways: merged with "+N related"');
  assert.equal(cited.categorySummary(gpsCat), 'The car left the planned route for 27 minutes and stopped for 6 minutes along the way.');
  assert.equal(cited.categorySummary(cats.find(c => c.source === 'fare'), D001), 'Charged $6.30 more than expected (+34%), because the trip was 4.5 km and 13 minutes longer than planned.');
  // "GPS path … (+44% vs expected)" repeats the distance tile, so it merges under Trip's "+44%".
  assert.equal(cited.categorySummary(cats.find(c => c.source === 'trip')), '4 facts');
});

test('side differences: only one side cites it, or both cite the same facts', () => {
  const rider = items(['Rider claim: x', ...D001_TRIP, 'Fare was +6.30 vs expected fare']);
  const driver = items(['Driver statement: y', ...D001_TRIP]);
  const fromRider = cited.compareSides(rider, driver);
  assert.equal(fromRider.same, false);
  assert.deepEqual([...fromRider.only], ['Fare was +6.30 vs expected fare'], 'party statements are not compared');
  const same = cited.compareSides(items(['Rider claim: x', ...D001_TRIP]), driver);
  assert.deepEqual([same.same, same.count], [true, 3]);
});
