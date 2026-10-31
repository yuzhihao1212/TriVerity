// The owl's questions on a case: answers come only from the rules and records, and never recommend.
import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';

const { buddyAnswers } = await load('buddyAnswers');

const llm = summary => ({ summary, source: 'llm' });
const fraud = {
  decision: 'needs_review', confidence: .8, refund_amount: null,
  recommended_action: 'Escalate to a human reviewer (proposed: Refund $6.30, the fare charged above the expected fare.)',
  policy_refs: ['FRAUD-1: high risk', 'RD-3: long detour'],
  conditions: [
    { rule: 'RD-3', label: 'Route more than 15% longer', value: '+44% vs planned distance', met: true, fact_ids: ['TRIP-1', 'TRIP-2'] },
    { rule: 'RD-4', label: 'Planned and actual data available', value: 'Available', met: true, fact_ids: [] },
    { rule: 'FRAUD-1', label: 'Either party has high bad-faith risk', value: 'Rider: high; driver: low', met: true, fact_ids: ['HIST-1'] },
  ],
  counterfactuals: [{ change: 'the route had been at most 15% longer', outcome: 'no change to the charge', decision: 'no_action', rules: ['RD-1'] }],
  risk: { rider_risk: 'high', driver_risk: 'low', signals: ['Rider has 3 disputes in the last 90 days', "Rider's rating is 4, below 4.3", 'Driver has one note'] },
  rider_case: llm('Refund the extra fare. More detail.'), driver_case: llm('The charge should stand. More detail.'),
};
const dispute = { rider_claim: 'Long route.', driver_statement: 'Traffic.', fare: { actual: 24.8, expected: 18.5 } };
const refund = {
  ...fraud, decision: 'partial_refund', refund_amount: 6.3, recommended_action: 'Refund $6.30',
  policy_refs: ['RD-3: long detour'], conditions: fraud.conditions.slice(0, 2),
};
const gap = {
  ...fraud, recommended_action: 'Escalate to a human reviewer: wait time is missing.',
  policy_refs: ['NS-4: data missing'], conditions: [{ rule: 'NS-4', label: 'Wait time missing', value: 'Not recorded', met: false, fact_ids: ['TRIP-3'] }],
};
const answers = (resolution, stage = 'open', tab = 'ruling') => buddyAnswers({ resolution, dispute, stage, tab });
const pick = (list, id) => list.find(item => item.id === id);

test('an escalated case explains why it reached the reviewer, with the signals behind it', () => {
  const why = pick(answers(fraud), 'why');
  assert.equal(why.question, 'Why is this case with me?');
  assert.match(why.lead, /high bad-faith risk/);
  assert.deepEqual(why.points, ['Rider has 3 disputes in the last 90 days', "Rider's rating is 4, below 4.3"]);
  assert.match(why.note, /isn't proof/);
  assert.deepEqual(why.rules, ['FRAUD-1']);
  assert.deepEqual(why.facts, ['HIST-1']);
});

test('the main rule shows its result on this case and what the rules propose', () => {
  const rule = pick(answers(fraud), 'rule');
  assert.match(rule.lead, /^RD-3: /);
  assert.ok(rule.points.includes('On this case: +44% vs planned distance'));
  assert.ok(rule.points.some(point => point.startsWith('The rules propose: Refund $6.30')));
  assert.deepEqual(rule.facts, ['TRIP-1', 'TRIP-2']);
});

test('a decided refund shows its sum and asks why the rules decided', () => {
  const list = answers(refund);
  assert.equal(pick(list, 'why').question, 'Why did the rules decide this?');
  assert.ok(pick(list, 'rule').points.some(point => point.includes('$24.80') && point.includes('$6.30')));
});

test('missing data comes first and names the fact; otherwise it says nothing is missing', () => {
  const list = answers(gap);
  assert.equal(list[0].id, 'missing');
  assert.equal(list[0].lead, 'Wait time.');
  assert.equal(pick(answers(fraud), 'missing').lead, 'Nothing the rules need is missing.');
});

test('what would change it comes from the recorded counterfactuals only', () => {
  assert.equal(pick(answers(fraud), 'change').lead, 'If the route had been at most 15% longer, the outcome would be no change to the charge.');
  assert.deepEqual(pick(answers(fraud), 'change').rules, ['RD-1']);
  assert.equal(pick(answers({ ...fraud, counterfactuals: [] }), 'change').lead, 'No other outcome is recorded for this case.');
});

test('each side is labelled as a position, using AI arguments or else their own words', () => {
  const ai = pick(answers(fraud), 'sides');
  assert.match(ai.lead, /not verified facts/);
  assert.equal(ai.points[0], 'Rider: Refund the extra fare.');
  const off = pick(answers({ ...fraud, rider_case: { summary: 'Template', source: 'fallback' } }), 'sides');
  assert.deepEqual(off.points, ['Rider: Long route.', 'Driver: Traffic.']);
  const silent = buddyAnswers({ resolution: { ...fraud, rider_case: { summary: 'x', source: 'fallback' } }, dispute: { ...dispute, driver_statement: null }, stage: 'open', tab: 'ruling' });
  assert.equal(pick(silent, 'sides').points[1], 'Driver: No statement recorded.');
});

test('what happens next follows the state of the case', () => {
  assert.equal(pick(answers(fraud), 'after').question, 'What happens after I decide?');
  assert.match(pick(answers(fraud, 'held'), 'after').lead, /on hold/);
  assert.match(pick(answers(fraud, 'closed'), 'after').lead, /closed/);
  assert.equal(pick(answers(fraud, 'closed'), 'why').question, 'Why did it need a person?');
});

test('the order follows the step the reviewer is on', () => {
  assert.equal(answers(fraud, 'open', 'ruling')[0].id, 'why');
  assert.equal(answers(fraud, 'open', 'hearing')[0].id, 'sides');
  assert.equal(answers(fraud, 'open', 'notify')[0].id, 'after');
  for (const tab of ['evidence', 'hearing', 'ruling', 'notify']) assert.equal(answers(fraud, 'open', tab).length, 6);
});

test('no question or answer tells the reviewer what to decide', () => {
  const advice = /\b(you should|should accept|should override|i recommend|we recommend|recommended)\b/i;
  for (const resolution of [fraud, refund, gap]) for (const stage of ['open', 'held', 'closed']) for (const item of answers(resolution, stage)) {
    assert.doesNotMatch([item.question, item.lead, ...item.points, item.note ?? ''].join(' '), advice);
  }
});
