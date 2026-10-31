import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';
const v = await load('verdictDisplay');
const base = { decision: 'partial_refund', confidence: .8, min_confidence: .6, policy_refs: ['RD-3: Detour'], refund_amount: 6.3 };

test('confidence caption and bar use the supplied threshold, including equality', () => {
  assert.equal(v.confidenceDisplay(base).caption, 'Above the 60% minimum: the rules decide, and a person confirms.');
  // Within the auto-resolve limits it says so; an audit sample still gets a person.
  assert.equal(v.confidenceDisplay({ ...base, autonomy: { eligible: true, audit: false, reasons: [] } }).caption, 'High enough, and within the limits, to close automatically.');
  assert.match(v.confidenceDisplay({ ...base, autonomy: { eligible: true, audit: true, reasons: [] } }).caption, /a person confirms/);
  assert.equal(v.confidenceDisplay(base).tone, 'ok');
  const low = v.confidenceDisplay({ ...base, min_confidence: .9 });
  assert.equal(low.caption, 'Below the 90% minimum, so a human reviewer decides.');
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
  assert.equal(high.tone, 'neutral'); // escalated: no pass/fail colour
  assert.doesNotMatch(high.caption, /rules decide/);
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

test('checklist groups the deciding checks first, then the rest, keeping engine order', () => {
  const rd3 = { rule: 'RD-3', label: 'Long route', met: true, value: '+44%', fact_ids: ['TRIP-1'] };
  const rd5 = { rule: 'RD-5', label: 'Stop of 10 min or more', met: false, value: '6 min', fact_ids: ['GPS-4'] };
  const safe = { rule: 'SAFE-1', label: 'Threat', met: false, value: 'None', fact_ids: [] };
  const groups = v.rulingConditionGroups({ ...base, conditions: [rd5, rd3, safe] });
  assert.deepEqual(groups.map(g => g.key), ['deciding', 'others', 'overlays']);
  assert.deepEqual(groups.map(g => g.title), ['Decided the Case', 'Also Checked', 'Safety, Fraud, Precedent and Confidence Checks']);
  assert.deepEqual(groups[0].checks.map(c => c.rule), ['RD-3']);
  // What didn't apply stays in an open group; only the escalation checks fold.
  assert.deepEqual(groups[1].checks.map(c => [c.rule, c.symbol]), [['RD-5', '⊖']]);
  assert.deepEqual(groups[2].checks.map(c => [c.rule, c.symbol]), [['SAFE-1', '⊖']]);
  // Escalated: the overlays decide; the base refund rule moves to "Also Checked".
  const threat = { ...safe, met: true, value: '1 threatening message' };
  const escalated = v.rulingConditionGroups({ ...base, decision: 'needs_review', policy_refs: ['RD-3: x', 'SAFE-1: y'], conditions: [rd3, threat] });
  assert.deepEqual(escalated.map(g => g.checks.map(c => c.rule)), [['SAFE-1'], ['RD-3']]);
  // Nothing deciding: one group, titled without "also".
  assert.deepEqual(v.rulingConditionGroups({ ...base, policy_refs: [], conditions: [rd5] }).map(g => g.title), ['Checked by the rules']);
  for (const old of [{}, { conditions: null }, { conditions: [] }]) assert.deepEqual(v.rulingConditionGroups({ ...base, ...old }), []);
});

test('the plain summary follows the rule that applied, with a neutral fallback for anything else', () => {
  assert.match(v.rulingSummary(base), /much longer than planned and also took longer/);
  assert.equal(v.rulingSummary({ ...base, policy_refs: ['REF-1: x'] }), 'The rules approve a partial refund.');
  assert.match(v.rulingSummary({ decision: 'no_action', policy_refs: ['RD-1: x'] }), /normal distance tolerance/);
  assert.match(v.rulingSummary({ decision: 'no_action', policy_refs: ['RD-2: x'] }), /took no longer/);
  assert.match(v.rulingSummary({ decision: 'no_action', policy_refs: ['NS-1: a', 'NS-2: b', 'NS-3: c'] }), /every no-show fee condition/);
  assert.match(v.rulingSummary({ decision: 'full_refund', policy_refs: ['NS-1: a'] }), /fee is refunded/);
  assert.match(v.rulingSummary({ decision: 'compensation', policy_refs: ['RD-3: a', 'RD-5: b'] }), /credit for the lost time/);
  assert.match(v.rulingSummary({ decision: 'needs_review', policy_refs: ['SAFE-1: a'] }), /human/);
  assert.doesNotMatch(v.rulingSummary({ decision: 'no_action', policy_refs: [] }), /route|no-show/i);
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
  assert.deepEqual(v.rulingCredits(result), { lead: 'Decided by the rules.', ai: true, text: 'Hy3 wrote the arguments and explanation.' });
  assert.match(v.rulingCredits({ ...result, explanation_source: 'fallback' }).text, /Hy3 wrote some of the text/);
  assert.equal(v.rulingCredits({ explanation_source: 'fallback', rider_case: { source: 'fallback' }, driver_case: { source: 'fallback' } }).ai, false);
  assert.match(v.rulingCredits({ ...result, rider_case: { source: 'llm', rebuttal: { source: 'fallback' } } }).text, /Hy3 wrote some of the text/);
});

test('rule tooltip placement stays inside a phone viewport at either edge', async () => {
  const { tooltipLeft } = await load('tooltipPlacement');
  for (const [left, width, tip, viewport] of [[25, 30, 280, 360], [300, 35, 280, 360], [150, 40, 260, 375]]) {
    const offset = tooltipLeft(left, width, tip, viewport);
    assert.ok(left + offset >= 12);
    assert.ok(left + offset + tip <= viewport - 12);
  }
});

const check = (rule, label, value, met) => ({ rule, label, value, met, fact_ids: [] });
const noShowGap = {
  decision: 'needs_review', policy_refs: ['NS-4: Missing'], recommended_action: "Escalate to a human reviewer: the driver's waiting time is missing.",
  counterfactuals: [{ change: "the driver's waiting time had been recorded", outcome: 'an automatic ruling', rules: [] }],
  conditions: [check('NS-1', 'Driver arrived within 100 m of pickup', '87 m from pickup', true), check('NS-4', 'Arrival location and waiting time available', 'Waiting time missing', false), check('SAFE-1', 'Threat', 'None', false)],
};

test('a case with a missing fact says what is missing, and what that would change', () => {
  const brief = v.rulingBrief(noShowGap);
  assert.equal(brief.reason, "The system can't rule on this case, because the driver's waiting time is missing.");
  assert.equal(brief.missing.fact, "The driver's waiting time");
  assert.equal(brief.missing.changeLine, "If the driver's waiting time had been recorded, the outcome would be an automatic ruling.");
  assert.deepEqual(brief.known.map(item => item.rule), ['NS-1']);
});

test('a case escalated by a trigger names the trigger and keeps the proposed action', () => {
  const brief = v.rulingBrief({
    decision: 'needs_review', policy_refs: ['RD-3: Detour', 'SAFE-1: Threat', 'FRAUD-1: Risk'], recommended_action: 'Escalate to a human reviewer (proposed: Refund $6.90, the fare charged above the expected fare.)',
    conditions: [check('RD-4', 'Route distances available', 'Available', true), check('RD-3', 'Route longer', '+40%', true), check('SAFE-1', 'Threat', '1 threatening message', true), check('FRAUD-1', 'Risk', 'Driver: high', true), check('PREC-1', 'Precedent', 'Not enough', false)],
  });
  assert.equal(brief.reason, "The system can't close this case, because of a threatening message in the chat and a high bad-faith risk.");
  assert.equal(brief.proposed, 'Refund $6.90, the fare charged above the expected fare');
  assert.deepEqual(brief.triggers.map(item => item.rule), ['SAFE-1', 'FRAUD-1']);
  assert.deepEqual(brief.known.map(item => item.rule), ['RD-3']);
  assert.equal(brief.missing, null);
});

test('a ruled case keeps its deciding checks, met or not, and drops availability checks', () => {
  const brief = v.rulingBrief({ decision: 'full_refund', policy_refs: ['NS-1: Arrival'], recommended_action: 'Refund the no-show fee.',
    conditions: [check('NS-1', 'Driver arrived within 100 m of pickup', '378 m', false), check('NS-4', 'Waiting time available', 'Available', true), check('SAFE-1', 'Threat', 'None', false)] });
  assert.deepEqual(brief.known.map(item => item.rule), ['NS-1']);
  assert.equal(brief.reason, 'A no-show fee condition was not met, so the fee is refunded.');
});

test('each side only asks for something when the AI wrote it', () => {
  const side = (summary, source = 'llm') => ({ summary, source });
  const result = { decision: 'needs_review', rider_case: side('Refund the fee, as no wait was recorded (GPS-1). More detail.'), driver_case: side('Keep the fee. More detail.') };
  assert.deepEqual(v.rulingSides(result), { rider: 'Refund the fee, as no wait was recorded.', driver: 'Keep the fee.' });
  assert.equal(v.rulingSides({ ...result, driver_case: side('Keep the fee.', 'fallback') }), null);
  assert.equal(v.rulingSides({ ...result, decision: 'no_action' }), null);
});

test('with AI Live on, a result with no AI in it says so', () => {
  const side = { source: 'fallback' };
  const all = { explanation_source: 'fallback', rider_case: side, driver_case: side };
  assert.equal(v.rulingCredits(all, true).warn, true);
  assert.match(v.rulingCredits(all, true).text, /AI wasn't available.*Re-run to try Hy3/);
  assert.equal(v.rulingCredits(all, false).text, 'Arguments and explanation use standard text, not AI.');
  assert.ok(!v.rulingCredits(all, false).warn);
});

test('a bad-faith escalation lists the high-risk party\'s reasons, and only theirs', () => {
  const fraud = { decision: 'needs_review', policy_refs: ['RD-3: Detour', 'FRAUD-1: Risk'], recommended_action: 'Escalate to a human reviewer (proposed: Refund $6.30.)',
    conditions: [check('FRAUD-1', 'Risk', 'Rider: high; driver: medium', true)],
    risk: { rider_risk: 'high', driver_risk: 'medium', signals: ['Rider has 3 disputes in the last 90 days', "Rider's rating is 4, below 4.3", 'Driver has 3 disputes in the last 90 days'] } };
  assert.deepEqual(v.rulingBrief(fraud).riskReasons, ['Rider has 3 disputes in the last 90 days', "Rider's rating is 4, below 4.3"]);
  // Signals alone are not an escalation: they only explain FRAUD-1 when it fired.
  assert.deepEqual(v.rulingBrief({ ...noShowGap, risk: fraud.risk }).riskReasons, []);
  assert.deepEqual(v.rulingBrief({ ...fraud, risk: undefined }).riskReasons, []);
});

test('a rule tooltip sits above its term, or below when there is no room, and stays on screen', async () => {
  const { tooltipTop } = await load('tooltipPlacement');
  assert.equal(tooltipTop(300, 320, 80, 800), 212);
  assert.equal(tooltipTop(40, 60, 80, 800), 68);
  assert.equal(tooltipTop(40, 60, 900, 800), 8);
});

test('the credit line says who decided: the rules, the rules sending it to a person, or a reviewer', () => {
  const sides = { explanation_source: 'llm', rider_case: { source: 'llm' }, driver_case: { source: 'llm' } };
  assert.equal(v.rulingCredits({ ...sides, decision: 'partial_refund' }).lead, 'Decided by the rules.');
  assert.equal(v.rulingCredits({ ...sides, decision: 'needs_review' }).lead, 'Sent to a person by the rules.');
  assert.equal(v.rulingCredits({ ...sides, decision: 'needs_review' }, false, true).lead, 'Decided by a reviewer.');
});

test('the presentation stamp is a short word per outcome, never the headline', () => {
  assert.equal(v.stampWord('needs_review'), 'Escalated');
  assert.equal(v.stampWord('partial_refund'), 'Partial Refund');
  assert.equal(v.stampWord('no_action'), 'Charge Stands');
});
