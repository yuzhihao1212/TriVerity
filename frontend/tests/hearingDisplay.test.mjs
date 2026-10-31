import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';

const { bottomLine, comparisonGroups } = await load('hearingDisplay');

test('bottom line splits at the first sentence and preserves evidence citations', () => {
  assert.deepEqual(bottomLine('The fare is $24.80 (FARE-1). The detour needs explaining (GPS-1).'), {
    first: 'The fare is $24.80 (FARE-1).', rest: 'The detour needs explaining (GPS-1).',
  });
  assert.deepEqual(bottomLine('The route was longer. (TRIP-1, GPS-1) Here is why.'), {
    first: 'The route was longer. (TRIP-1, GPS-1)', rest: 'Here is why.',
  });
  assert.deepEqual(bottomLine('“Was it justified?” More detail.'), { first: '“Was it justified?”', rest: 'More detail.' });
});

test('a long first sentence stays whole rather than being truncated', () => {
  const first = `${'The rider cites the recorded distance and duration, '.repeat(8)}which support the claim.`;
  assert.ok(first.length > 200);
  assert.deepEqual(bottomLine(`${first} Further reasoning.`), { first, rest: 'Further reasoning.' });
});

test('empty and single-sentence arguments need no disclosure', () => {
  assert.deepEqual(bottomLine('  '), { first: '', rest: '' });
  assert.deepEqual(bottomLine(' No terminal punctuation '), { first: 'No terminal punctuation', rest: '' });
  assert.deepEqual(bottomLine('One sentence!'), { first: 'One sentence!', rest: '' });
  assert.deepEqual(bottomLine('The detour, e.g. via the expressway, added approx. 4 km vs. the quoted route (GPS-1). Then more.'), {
    first: 'The detour, e.g. via the expressway, added approx. 4 km vs. the quoted route (GPS-1).', rest: 'Then more.',
  });
  assert.deepEqual(bottomLine('Only an abbreviation, i.e.'), { first: 'Only an abbreviation, i.e.', rest: '' });
});

const opening = (ids = [], evidence = [], rebuttal = null) => ({ evidence_ids: ids, evidence, rebuttal });
const reply = (ids, evidence) => ({ evidence_ids: ids, evidence });

test('comparison combines both rounds, deduplicates and groups shared and exclusive citations', () => {
  const result = comparisonGroups({
    rider_case: opening(['TRIP-1', 'FARE-1'], ['Longer route', 'Higher fare'], reply(['TRIP-1', 'CHAT-1'], ['Longer route', 'Rider asked why'])),
    driver_case: opening(['GPS-1'], ['Steady movement'], reply(['TRIP-1', 'GPS-1'], ['Longer route', 'Steady movement'])),
  });
  assert.deepEqual(result, [
    { title: 'Both Sides Cite', facts: [{ id: 'TRIP-1', text: 'Longer route' }], more: 0 },
    { title: 'Only the Rider', facts: [{ id: 'FARE-1', text: 'Higher fare' }, { id: 'CHAT-1', text: 'Rider asked why' }], more: 0 },
    { title: 'Only the Driver', facts: [{ id: 'GPS-1', text: 'Steady movement' }], more: 0 },
  ]);
});

test('comparison skips empty groups, including when neither side cites facts', () => {
  assert.deepEqual(comparisonGroups({ rider_case: opening(), driver_case: opening() }), []);
  assert.deepEqual(comparisonGroups({ rider_case: opening(['TRIP-1'], ['Longer route']), driver_case: opening() }), [
    { title: 'Only the Rider', facts: [{ id: 'TRIP-1', text: 'Longer route' }], more: 0 },
  ]);
});

test('comparison never assigns mismatched or conflicting text to an ID', () => {
  const groups = comparisonGroups({
    rider_case: opening(['TRIP-1'], ['Extra claim', 'Longer route']),
    driver_case: opening(['GPS-1'], ['Stopped'], reply(['GPS-1'], ['Moving'])),
  });
  assert.deepEqual(groups.map(group => group.facts[0].text), [null, null]);
});

test('a long group shows four facts, known text first, then "and N more"; unknown text stays null', () => {
  const ids = ['TRIP-1', 'TRIP-2', 'GPS-1', 'GPS-2', 'FARE-1', 'FARE-2'];
  const result = comparisonGroups({
    rider_case: opening(ids, []), driver_case: opening(ids, []),
    judge_evidence: [], evidence_ids: [],
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].facts.length, 4);
  assert.equal(result[0].more, 2);
  assert.ok(result[0].facts.every(fact => fact.text === null));
});

test('three columns keep rider/both/driver order and count all unique IDs across both rounds', async () => {
  const { hearingComparison } = await load('hearingDisplay');
  const input = {
    rider_case: opening(['TRIP-1', 'FARE-1', 'TRIP-1'], ['Long route', 'Fare', 'Long route'], reply(['CHAT-1'], ['Question'])),
    driver_case: opening(['GPS-1'], ['Stopped'], reply(['TRIP-1', 'GPS-1'], ['Long route', 'Stopped'])),
  };
  const before = structuredClone(input);
  const view = hearingComparison(input);
  assert.deepEqual(view.columns.map(column => column.key), ['rider', 'both', 'driver']);
  assert.deepEqual(view.columns.map(column => column.title), ['Only the Rider', 'Both Cited', 'Only the Driver']);
  assert.deepEqual(view.counts, { rider: 2, both: 1, driver: 1 });
  assert.deepEqual(view.columns.map(column => column.facts.map(fact => fact.id)), [['FARE-1', 'CHAT-1'], ['TRIP-1'], ['GPS-1']]);
  assert.deepEqual(input, before);
});

test('empty columns remain visible; no-citation results never claim the parties argue from different evidence', async () => {
  const { hearingComparison } = await load('hearingDisplay');
  const empty = hearingComparison({ rider_case: opening(), driver_case: opening() });
  assert.equal(empty.columns.length, 3);
  assert.deepEqual(empty.counts, { rider: 0, both: 0, driver: 0 });
  assert.equal(empty.hasCitations, false);
  assert.doesNotMatch(empty.overlapEmpty, /different evidence/);
  const separate = hearingComparison({ rider_case: opening(['TRIP-1'], ['Route']), driver_case: opening(['GPS-1'], ['Stop']) });
  assert.deepEqual(separate.counts, { rider: 1, both: 0, driver: 1 });
  assert.match(separate.overlapEmpty, /No fact cited by both sides/);
});

test('all-shared citations retain all facts for expansion and exact total counts beyond the four-card preview', async () => {
  const { hearingComparison } = await load('hearingDisplay');
  const ids = Array.from({ length: 9 }, (_, index) => `TRIP-${index + 1}`);
  const view = hearingComparison({ rider_case: opening(ids, []), driver_case: opening(ids, []) });
  assert.deepEqual(view.counts, { rider: 0, both: 9, driver: 0 });
  assert.equal(view.columns[1].facts.length, 9);
  assert.deepEqual(view.columns[1].facts.map(fact => fact.id), ids);
  assert.ok(view.columns[1].facts.every(fact => fact.text === null));
});

test('short citation phrases use only existing facts, preserve quotes and stay free of outcomes', async () => {
  const { hearingFact } = await load('hearingDisplay');
  assert.deepEqual(hearingFact('Off the planned route 08:05-08:32: 11.3 km driven, up to 2,704 m away', 'GPS-3'), { text: 'Off route for 27 min, up to 2.7 km away', icon: 'route' });
  assert.equal(hearingFact('Trip record: no-show fee charged $4.00', 'TRIP-4').text, 'No-show fee: $4.00');
  assert.equal(hearingFact('Trip record: distance expected 10.2 km, actual 14.7 km', 'TRIP-3').text, 'Distance: 10.2 → 14.7 km');
  assert.equal(hearingFact('Unexpected stop: 6 min at 08:14', 'GPS-4').text, 'Stopped 6 min at 08:14');
  assert.equal(hearingFact('Driver tone: neutral (2 of 2 messages)', 'CHAT-4').text, "Driver's tone was neutral");
  assert.equal(hearingFact('Route was +44% vs expected distance', 'TRIP-1').text, 'Route 44% longer than expected');
  assert.equal(hearingFact('Trip took -20% vs expected duration', 'TRIP-2').text, 'Trip 20% shorter than expected');
  const quote = 'Why this way? This is the wrong direction.';
  assert.equal(hearingFact(`Disagreement in chat: rider: "${quote}"`, 'CHAT-2').text, `Rider said: “${quote}”`);
  assert.equal(hearingFact('Unknown wording 9.75', 'GPS-9').text, 'Unknown wording 9.75');
  assert.equal(hearingFact(null, 'GPS-9').text, 'Fact text unavailable. See Evidence.');
});
