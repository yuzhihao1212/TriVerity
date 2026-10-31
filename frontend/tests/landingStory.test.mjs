import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { load } from './_load.mjs';

const { CASE_VIEWS, HEARING_ROUNDS, VALUE_MODEL, VALUE_STATS } = await load('landingStory');
const { customerResult } = await load('customerState');
const expected = JSON.parse(await readFile(new URL('../../data/expected_rulings.json', import.meta.url), 'utf8'));

test('the three views show the sample ruling and the lines each phone really shows', () => {
  assert.equal(expected.D001.decision, 'partial_refund');
  assert.equal(expected.D001.refund, 6.3);
  const outcome = { decision: expected.D001.decision, amount: expected.D001.refund };
  const [rider, driver, reviewer] = CASE_VIEWS;
  assert.equal(rider.line, customerResult('rider', outcome).line);
  assert.deepEqual(rider.next, customerResult('rider', outcome).next);
  assert.equal(driver.line, customerResult('driver', outcome).line);
  assert.deepEqual(driver.next, customerResult('driver', outcome).next);
  assert.ok(reviewer.line.includes('$6.30'));
});

test('the driver is never told the word refund', () => {
  const driver = CASE_VIEWS[1];
  assert.equal(/refund/i.test([driver.line, ...driver.next].join(' ')), false);
});

test('the hearing excerpt gives both sides a turn in each round', () => {
  assert.equal(HEARING_ROUNDS.length, 2);
  for (const round of HEARING_ROUNDS) assert.ok(round.rider && round.driver);
});

test('the value figures follow from the business-case model', () => {
  const { disputes, automated, minutes, hourly, aiCost } = VALUE_MODEL;
  const hours = minutes.map(m => disputes * automated * m / 60);
  assert.deepEqual(hours.map(Math.round), [325, 975]);
  assert.equal(VALUE_STATS[0].value, `${Math.round(hours[0])}–${Math.round(hours[1])} h`);
  const low = Math.round(hours[0] * hourly[0]), high = Math.round(hours[1] * hourly[1]);
  assert.equal(VALUE_STATS[1].value, `$${low.toLocaleString('en-US')}–${high.toLocaleString('en-US')}`);
  assert.equal(Math.round(disputes * aiCost), 10);
  assert.ok(VALUE_STATS[2].value.includes('$10'));
});

test('the hero replay runs in order inside its length and ends on D001’s real ruling', async () => {
  const { HEARING_REPLAY, REPLAY_LENGTH } = await load('landingStory');
  const times = HEARING_REPLAY.map(step => step.at);
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
  assert.ok(times.every(at => at > 0 && at <= REPLAY_LENGTH));
  const ruling = HEARING_REPLAY.at(-1);
  assert.equal(ruling.kind, 'ruling');
  assert.equal(expected.D001.decision, 'partial_refund');
  assert.ok(ruling.text.includes(`$${expected.D001.refund.toFixed(2)}`));
  assert.ok(HEARING_REPLAY.some(step => step.text.includes(expected.D001.policy_refs[0])));
});

test('the savings calculator scales the business-case model with volume', async () => {
  const { valueAt, VALUE_RANGE, VALUE_MODEL } = await load('landingStory');
  assert.deepEqual(valueAt(VALUE_MODEL.disputes).map(stat => stat.value), ['325–975 h', '$6,500–29,250', 'About $10']);
  assert.deepEqual(valueAt(10000).map(stat => stat.value), ['650–1,950 h', '$13,000–58,500', 'About $20']);
  assert.ok(VALUE_RANGE.min <= VALUE_MODEL.disputes && VALUE_MODEL.disputes <= VALUE_RANGE.max);
  assert.equal((VALUE_MODEL.disputes - VALUE_RANGE.min) % VALUE_RANGE.step, 0);
});
