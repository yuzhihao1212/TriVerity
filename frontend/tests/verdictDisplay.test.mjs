import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';
const v = await load('verdictDisplay');
const base = { decision: 'partial_refund', confidence: .8, min_confidence: .6, policy_refs: ['RD-3: Detour'], refund_amount: 6.3 };

test('confidence caption and bar use the supplied threshold, including equality', () => {
  assert.equal(v.confidenceDisplay(base).caption, 'Above the 60% needed to decide automatically.');
  assert.equal(v.confidenceDisplay(base).tone, 'ok');
  const low = v.confidenceDisplay({ ...base, min_confidence: .9 });
  assert.equal(low.caption, 'Below 90%, so a human reviewer decides.');
  assert.equal(low.tone, 'warn');
  assert.equal(low.thresholdPercent, 90);
  const equal = v.confidenceDisplay({ ...base, min_confidence: .8 });
  assert.equal(equal.tone, 'ok');
  assert.match(equal.caption, /^At the 80%/);
  for (const threshold of [null, undefined, NaN, -1, 2]) {
    const missing = v.confidenceDisplay({ ...base, min_confidence: threshold });
    assert.equal(missing.tone, 'neutral');
    assert.equal(missing.thresholdPercent, null);
    assert.match(missing.caption, /unavailable/);
  }
  assert.equal(v.confidenceDisplay({ ...base, min_confidence: 0 }).thresholdPercent, 0);
  assert.equal(v.confidenceDisplay({ ...base, min_confidence: 1 }).thresholdPercent, 100);
});

test('escalations retain the rule-specific human review caption even above threshold', () => {
  const high = v.confidenceDisplay({ ...base, decision: 'needs_review', policy_refs: ['SAFE-1: Threat escalated to human review'] });
  assert.equal(high.caption, 'Sent to a human by SAFE-1, whatever the confidence');
  assert.equal(high.tone, 'ok');
  assert.doesNotMatch(high.caption, /automatically/);
});

test('conditions keep met and unmet results, order, original values and fact IDs', () => {
  const conditions = [
    { rule: 'RD-3', label: 'Long route', met: true, value: '44% longer', fact_ids: ['TRIP-1'] },
    { rule: 'RD-5', label: 'Stop of 10 min or more', met: false, value: '6 min', fact_ids: ['GPS-4'] },
  ];
  const rows = v.rulingConditions({ conditions });
  assert.equal(rows[0].symbol, '✓'); assert.equal(rows[0].tone, 'ok');
  assert.equal(rows[1].symbol, '⊖'); assert.equal(rows[1].tone, 'neutral');
  assert.equal(rows[1].status, 'Not met');
  assert.deepEqual(rows.map(({ symbol, tone, status, ...check }) => check), conditions);
  for (const old of [{}, { conditions: null }, { conditions: [] }]) assert.deepEqual(v.rulingConditions(old), []);
});

test('sum uses supplied fares only when the equation equals the approved refund', () => {
  const fare = { actual: 24.8, expected: 18.5 };
  assert.equal(v.refundSum(base, fare).text, 'Charged $24.80 − Expected $18.50 = $6.30');
  for (const missing of [undefined, {}, { actual: 24.8 }, { expected: 18.5 }, { actual: NaN, expected: 18.5 }]) assert.equal(v.refundSum(base, missing), null);
  assert.equal(v.refundSum({ ...base, refund_amount: 11.3, decision: 'compensation' }, fare), null);
  assert.equal(v.refundSum({ ...base, refund_amount: 4 }, fare), null);
  assert.equal(v.refundSum({ ...base, decision: 'needs_review' }, fare), null);
});

test('hero follows decision tone and never presents an escalation proposal as approved money', () => {
  for (const decision of ['partial_refund', 'full_refund', 'compensation']) {
    const hero = v.rulingHero({ ...base, decision });
    assert.equal(hero.tone, 'ok'); assert.equal(hero.amount, 6.3);
  }
  const noChange = v.rulingHero({ ...base, decision: 'no_action' });
  assert.equal(noChange.tone, 'neutral'); assert.equal(noChange.amount, null);
  const escalated = v.rulingHero({ ...base, decision: 'needs_review' });
  assert.equal(escalated.tone, 'warn'); assert.equal(escalated.amount, null);
  assert.doesNotMatch(escalated.headline, /\$/);
  assert.equal(v.rulingHero(base).label, 'Partial refund approved');
});

test('footer credits actual AI usage and is truthful for fallback and mixed runs', () => {
  const result = { explanation_source: 'llm', rider_case: { source: 'llm' }, driver_case: { source: 'llm' } };
  assert.deepEqual(v.rulingCredits(result), { source: 'llm', text: 'Hy3 wrote the arguments and this explanation.' });
  assert.equal(v.rulingCredits({ ...result, explanation_source: 'fallback' }).source, 'llm');
  assert.equal(v.rulingCredits({ explanation_source: 'fallback', rider_case: { source: 'fallback' }, driver_case: { source: 'fallback' } }).source, 'fallback');
});

test('rule tooltip placement stays inside a phone viewport at either edge', async () => {
  const { tooltipLeft } = await load('tooltipPlacement');
  for (const [left, width, tip, viewport] of [[25, 30, 280, 360], [300, 35, 280, 360], [150, 40, 260, 375]]) {
    const offset = tooltipLeft(left, width, tip, viewport);
    assert.ok(left + offset >= 12);
    assert.ok(left + offset + tip <= viewport - 12);
  }
});
