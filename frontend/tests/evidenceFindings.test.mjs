// The Evidence findings: each source gets one honest line, and anything flagged comes first.
import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';

const f = await load('evidenceFindings');
const dispute = {
  trip: { expected_distance_km: 8, actual_distance_km: 11.2, expected_duration_min: 18, actual_duration_min: 27 },
  fare: { expected: 15, actual: 21.9, breakdown: [] }, chat_logs: [],
};

test('a threat in the chat is flagged and comes first', () => {
  const findings = f.caseFindings([
    { source: 'trip', facts: [] }, { source: 'fare', facts: [] },
    { source: 'chat', facts: ['Threatening message: driver: "Complain and you\'ll regret it."'] }, { source: 'history', facts: [] },
  ], dispute);
  assert.deepEqual(findings.map(x => x.source), ['chat', 'trip', 'fare', 'history']);
  assert.equal(findings[0].flagged, true);
  assert.equal(findings[0].line, 'Driver message flagged as threatening');
});

test('without a flag the page keeps its usual order', () => {
  const order = f.caseFindings([{ source: 'trip', facts: [] }, { source: 'chat', facts: [] }], dispute).map(x => x.source);
  assert.deepEqual(order, ['trip', 'chat']);
});

test('each source says what was found, in one line', () => {
  assert.equal(f.findingLine('trip', [], dispute).line, 'The trip was 3.2 km and 9 minutes longer than expected');
  assert.match(f.findingLine('fare', [], dispute).line, /^Charged \$6\.90 more than expected/);
  assert.equal(f.findingLine('history', [], dispute).line, 'Background only');
  assert.equal(f.findingLine('chat', ['Disagreement in chat: rider: "No"'], dispute).line, 'Rider objected in chat');
  assert.equal(f.findingLine('chat', ['Agreement in chat: rider: "Ok"'], dispute).line, 'Rider agreed in chat');
});

test('missing data still gives a true line', () => {
  assert.equal(f.findingLine('chat', [], { ...dispute, chat_logs: [] }).line, 'No chat exchange was recorded');
  assert.equal(f.findingLine('gps', [], dispute).line, 'GPS records for this trip');
  assert.equal(f.findingLine('fare', [], { ...dispute, fare: { cancellation_fee: 5 } }).line, 'No-show fee of $5.00');
  assert.equal(f.findingLine('fare', [], { ...dispute, fare: {} }).line, 'Recorded fare items and checks');
  assert.equal(f.findingLine('case', []).line, 'Recorded case details');
  assert.equal(f.findingLine('trip', [], { trip: {} }).line, 'Recorded trip details');
});

test('the arrow keys move through the list and wrap', () => {
  assert.equal(f.nextFinding(0, 4, 'ArrowDown'), 1);
  assert.equal(f.nextFinding(3, 4, 'ArrowDown'), 0);
  assert.equal(f.nextFinding(0, 4, 'ArrowUp'), 3);
  assert.equal(f.nextFinding(2, 4, 'Home'), 0);
  assert.equal(f.nextFinding(0, 4, 'End'), 3);
  assert.equal(f.nextFinding(1, 4, 'Enter'), null);
});
