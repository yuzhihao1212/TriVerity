import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';
const display = await load('evidenceDisplay');
const agents = await load('agentDisplay');
const gps = await load('gpsStory');
const { groupFacts } = await load('factVisuals');
const { fareHeadline } = await load('fareStory');
const { FALLBACK_EXPLANATION } = await load('collectionStory');
const trip = { expected_distance_km: 10.2, actual_distance_km: 14.7, expected_duration_min: 22, actual_duration_min: 35 };
const coverage = 'GPS within 150 m of the planned route for 8 of 36 points';
const window = 'GPS 08:05-08:32: 28 points, moved 10.32 km, speed avg 22 km/h, max 42 km/h, status in_trip';
const off = 'Off the planned route 08:05-08:32: 11.3 km driven, up to 2,704 m away';

test('GPS readings sentence computes the off-route count and percentage, including zero', () => {
  assert.equal(display.gpsReadingsSentence(coverage), '28 of 36 GPS readings (78%) were more than 150 m from the planned route.');
  assert.equal(display.gpsReadingsSentence('GPS within 150 m of the planned route for 4 of 4 points'), '0 of 4 GPS readings (0%) were more than 150 m from the planned route.');
  for (const value of ['', 'GPS unavailable', 'GPS within 150 m of the planned route for 0 of 0 points', 'GPS within 150 m of the planned route for 5 of 4 points']) assert.equal(display.gpsReadingsSentence(value), null);
});

test('GPS summary and distance labels distinguish route distance from point-to-point distance', () => {
  assert.equal(display.gpsSummaryLine(window), '28 GPS points · average 22 km/h · top 42 km/h · 10.3 km between GPS points');
  assert.equal(display.gpsFactLine(off), 'Off route 08:05–08:32: 11.3 km by route, up to 2.7 km from the planned path.');
  assert.deepEqual(display.distanceLabels(11.25, 10.32), { byRoute: '11.3 km by route', betweenPoints: '10.3 km between GPS points' });
  assert.deepEqual(display.distanceLabels(null, NaN), { byRoute: null, betweenPoints: null });
  assert.equal(display.gpsSummaryLine('GPS 08:00-08:10: 2 points, moved 0.00 km, closest to pickup 16 m'), '2 GPS points · 0.0 km between GPS points · 16 m from pickup at the closest point');
  assert.equal(display.gpsSummaryLine('GPS 08:00-08:10: no points in this window'), null);
});

test('Trip takeaway and number lines use measured values first without policy thresholds', () => {
  assert.equal(display.tripTakeaway(trip), 'The trip was 4.5 km and 13 minutes longer than expected.');
  assert.equal(display.tripNumberLine(trip, 'distance'), '14.7 km driven vs 10.2 km expected · +4.5 km (+44%)');
  assert.equal(display.tripNumberLine(trip, 'duration'), '35 min vs 22 min expected · +13 min (+59%)');
  assert.equal(display.tripFactLine('Route was +44% vs expected distance', trip), display.tripNumberLine(trip, 'distance'));
  assert.equal(display.tripTakeaway({ expected_distance_km: 10, actual_distance_km: 8, expected_duration_min: 22, actual_duration_min: 20 }), 'The trip was 2 km and 2 minutes shorter than expected.');
  assert.equal(display.tripTakeaway({ driver_wait_min: 7 }), 'The driver waited 7 minutes at pickup.');
  assert.equal(display.tripNumberLine({}, 'distance'), null);
  assert.equal(display.tripNumberLine({ actual_distance_km: NaN, expected_distance_km: 0 }, 'distance'), null);
  assert.doesNotMatch(display.tripTakeaway({}), /NaN|undefined|null/);
  assert.doesNotMatch(display.tripTakeaway({ expected_distance_km: 1, actual_distance_km: 1 }), /time/);
});

test('chat exchange preserves both parties, chronological order, times and exact message text', () => {
  const messages = [
    { sender: 'driver', message: 'Traffic on the usual road, this is faster.', timestamp: '2026-09-20T08:12:30+08:00' },
    { sender: 'rider', message: 'Why are we going this way?', timestamp: '2026-09-20T08:12:00+08:00' },
  ];
  const before = structuredClone(messages);
  const exchange = display.chatExchange(messages);
  assert.deepEqual(exchange.map(m => m.sender), ['rider', 'driver']);
  assert.deepEqual(messages, before);
  assert.equal(display.chatTime(exchange[0].timestamp), '08:12');
  assert.equal(display.chatTime(null), null);
  assert.equal(display.chatTakeaway(exchange), 'The rider and driver exchanged 2 messages.');
  assert.equal(display.chatTakeaway([]), 'No chat exchange was recorded.');
  assert.equal(display.chatTakeaway([messages[0]]), 'The chat record contains 1 message from the driver.');
});

test('windowed chat facts can supply the exchange, but a tone annotation never invents a reply', () => {
  const facts = [
    { source: 'chat', id: 'CHAT-1', text: 'Chat 08:12 rider: "Wrong way"' },
    { source: 'chat', id: 'CHAT-2', text: 'Chat 08:13 driver: "Avoiding traffic"' },
    { source: 'chat', id: 'CHAT-3', text: 'Rider tone: negative (1 of 1 message)' },
  ];
  assert.equal(display.chatExchange([], groupFacts(facts)).length, 2);
  const matched = display.chatFactsForMessages(display.chatExchange([], groupFacts(facts)), facts);
  assert.deepEqual(matched.map(f => f?.id), ['CHAT-1', 'CHAT-2']);
  assert.equal(display.chatFactsForMessages([{sender:'rider',message:'Something else'}], facts)[0], undefined);
  assert.equal(display.chatExchange([{ sender: 'rider', message: 'Wrong way' }], groupFacts(facts)).length, 2, 'a reply from lookup facts is also shown, without duplicating the rider');
  assert.equal(display.isChatAnalysis(facts[2].text), true);
  assert.deepEqual(display.chatExchange([], groupFacts([{ source: 'chat', text: 'Disagreement in chat: rider: "Wrong way"' }])), []);
  assert.equal(display.relatedFactsLabel([{ source: 'fare' }]), '1 related fact: fare');
  assert.equal(display.relatedFactsLabel([{ source: 'gps' }, { source: 'fare' }]), '2 related facts: GPS, fare');
});

test('timeline uses recorded off-route boundaries and labels every transition', () => {
  const points = Array.from({ length: 36 }, (_, m) => ({ lat: 1.3 + m / 1000, lng: 103.8, timestamp: `2026-09-20T08:${String(m).padStart(2, '0')}:00+08:00` }));
  const timeline = gps.labelledTimeline(points, [{ lat: 1.3, lng: 103.8 }, { lat: 1.4, lng: 103.8 }], [off, 'Unexpected stop: 6 min at 08:14']);
  assert.deepEqual(gps.timelineTicks(timeline).map(t => t.label), ['08:00', '08:05', '08:32', '08:35']);
  assert.equal(gps.timelineClock(timeline, timeline.stops[0].at), '08:14');
  assert.equal(timeline.stops[0].width, 6 / 35);
  assert.deepEqual(timeline.segments.map(s => s.off), [false, true, false]);
  assert.equal(gps.labelledTimeline([], [], []), null);
});

test('headings are per step and folded agent lines lead with their action', () => {
  assert.equal(agents.stepHeading('evidence'), 'Who prepared this evidence');
  assert.equal(agents.stepHeading('hearing'), 'Who argued each side');
  assert.equal(agents.stepHeading('ruling'), 'Who checked and explained the ruling');
  for (const step of ['intake', 'notify']) assert.ok(agents.stepHeading(step));
  const loader = { agent: 'evidence_loader', status: 'completed', message: 'Computed 15 facts from case data.', duration_ms: 200 };
  assert.equal(agents.agentActionLine(loader), 'Calculated 15 facts from the trip, GPS and fare records · by code, instant');
  assert.equal(agents.agentActionLine({ agent: 'evidence_collector', status: 'completed', message: "[llm] rider's request: 7 tool calls; driver's request: 7 tool calls", duration_ms: 4700 }), 'Looked up 7 more records for each side · by AI (Tencent Hy3), 4.7 s');
  assert.equal(agents.agentActionLine({ ...loader, status: 'skipped' }), 'This step was not run.');
  assert.doesNotMatch(agents.agentActionLine({ agent: 'unknown', status: 'completed', message: '', duration_ms: null }), /undefined|NaN|unknown/);
  assert.match(agents.SOURCE_KEY, /Code = calculated by fixed rules, no AI/);
});

test('Evidence display sentences contain no proposed outcome, policy verdict or internal status', () => {
  const fare = fareHeadline({ trip, fare: { expected: 18.5, actual: 24.8 } }, []);
  const text = [display.gpsReadingsSentence(coverage), display.gpsFactLine(off), display.gpsSummaryLine(window),
    display.tripTakeaway(trip), display.tripNumberLine(trip, 'distance'), display.tripNumberLine(trip, 'duration'),
    display.chatTakeaway([]), fare.lead, fare.rest, FALLBACK_EXPLANATION,
    agents.stepHeading('evidence'), agents.agentActionLine({ agent: 'evidence_loader', message: 'Computed 15 facts', status: 'completed' })].join(' ');
  assert.doesNotMatch(text, /refund|ruling|approved|\b(?:RD|NS|REF|SAF|GEN)-\d+\b|status in_trip|15% policy/i);
});
