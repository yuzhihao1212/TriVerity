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
});

const opening = (ids = [], evidence = [], rebuttal = null) => ({ evidence_ids: ids, evidence, rebuttal });
const reply = (ids, evidence) => ({ evidence_ids: ids, evidence });

test('comparison combines both rounds, deduplicates and groups shared and exclusive citations', () => {
  const result = comparisonGroups({
    rider_case: opening(['TRIP-1', 'FARE-1'], ['Longer route', 'Higher fare'], reply(['TRIP-1', 'CHAT-1'], ['Longer route', 'Rider asked why'])),
    driver_case: opening(['GPS-1'], ['Steady movement'], reply(['TRIP-1', 'GPS-1'], ['Longer route', 'Steady movement'])),
  });
  assert.deepEqual(result, [
    { title: 'Both sides cite', facts: [{ id: 'TRIP-1', text: 'Longer route' }], more: 0 },
    { title: 'Only the rider', facts: [{ id: 'FARE-1', text: 'Higher fare' }, { id: 'CHAT-1', text: 'Rider asked why' }], more: 0 },
    { title: 'Only the driver', facts: [{ id: 'GPS-1', text: 'Steady movement' }], more: 0 },
  ]);
});

test('comparison skips empty groups, including when neither side cites facts', () => {
  assert.deepEqual(comparisonGroups({ rider_case: opening(), driver_case: opening() }), []);
  assert.deepEqual(comparisonGroups({ rider_case: opening(['TRIP-1'], ['Longer route']), driver_case: opening() }), [
    { title: 'Only the rider', facts: [{ id: 'TRIP-1', text: 'Longer route' }], more: 0 },
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
