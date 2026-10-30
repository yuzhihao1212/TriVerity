import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';

const d = await load('rulingDetails');
const base = {
  risk: { signals: [] }, policy_refs: ['RD-3: A detour that took longer'],
  precedents: { matches: [] }, counterfactuals: [],
};

test('condition count text uses supplied counts, including zero met; missing results never invent counts', () => {
  assert.equal(d.conditionCountText({ met: 2, total: 3, main: 'the route was 44% longer than planned' }), '2 of 3 rule conditions met: the route was 44% longer than planned');
  assert.equal(d.conditionCountText({ met: 0, total: 1 }), '0 of 1 rule condition met');
  assert.equal(d.conditionCountText(null), 'Condition counts unavailable in this result');
  assert.equal(d.conditionCountText({ met: 0, total: 0 }), 'Condition counts unavailable in this result');
  assert.equal(d.reviewRows({ ...base, recommended_action: 'Refund $6.30, the fare charged above the expected fare.' })[0].answer,
    'RD-3 applied: Refund $6.30, the fare charged above the expected fare.');
  assert.match(d.reviewRows({ ...base, recommended_action: '' })[0].answer, /^RD-3 applied$/);
  assert.equal(d.whyAnswer([], ''), 'Condition counts unavailable in this result');
});

test('risk row moves first only when signals exist, with amber status and the real first signal', () => {
  assert.deepEqual(d.reviewRows(base).map(row => row.id), ['why', 'risk', 'precedents', 'changes']);
  assert.equal(d.reviewRows(base)[1].answer, 'No risk signals');
  assert.equal(d.reviewRows(base)[1].tone, 'ok');
  const risk = d.reviewRows({ ...base, risk: { signals: ['Repeated disputes', 'Another signal'] } });
  assert.deepEqual(risk.map(row => row.id), ['risk', 'why', 'precedents', 'changes']);
  assert.equal(risk[0].answer, '2 signals: Repeated disputes');
  assert.equal(risk[0].tone, 'warn');
  assert.equal(base.risk.signals.length, 0);
});

test('checklist uses recorded engine conditions; old results never infer checks from advocate rules', () => {
  const conditions = [
    { rule: 'RD-3', label: 'Route more than 15% longer than planned', met: true, value: '44% longer', fact_ids: ['TRIP-1'] },
    { rule: 'RD-5', label: 'Stop of 10 min or more', met: false, value: '6 min', fact_ids: ['GPS-4'] },
  ];
  const result = { ...base, conditions };
  assert.deepEqual(d.suppliedConditions(result), conditions);
  const withAvailability = { ...result, conditions: [
    { rule: 'RD-4', label: 'Distances available', met: true, value: 'Available', fact_ids: [] }, ...conditions,
  ] };
  const why = 'Decided by RD-3 · Route more than 15% longer than planned? Yes (44% longer)';
  assert.equal(d.reviewRows(withAvailability)[0].answer, why);
  assert.equal(d.reviewRows(result)[0].answer, why);
  for (const old of [base, { ...base, conditions: null }, { ...base, conditions: [] }, {
    ...base, argument_review: [{ party: 'rider', rules: [{ rule: 'RD-3', verdict: 'supports', decisive: true }] }],
  }]) assert.deepEqual(d.suppliedConditions(old), []);
  // No recorded check matches the applied rule: fall back to the rule and its action.
  assert.equal(d.reviewRows({ ...base, recommended_action: 'Refund $6.30.', conditions: [{ ...conditions[1] }] })[0].answer, 'RD-3 applied: Refund $6.30.');
});

test('the deciding checks read the right way round, whichever way the rule points', () => {
  const ns1 = { rule: 'NS-1', label: 'Driver arrived within 100 m of pickup', met: false, value: '378 m from pickup', fact_ids: ['GPS-1'] };
  const safe = { rule: 'SAFE-1', label: 'Threatening message in the chat log', met: false, value: 'No threatening messages detected', fact_ids: [] };
  // D005: a full refund because a condition was NOT met; the count "0 of 2 met" would mislead.
  const d005 = { ...base, decision: 'full_refund', policy_refs: ['NS-1: Arrival'], conditions: [ns1, safe] };
  assert.equal(d.reviewRows(d005)[0].answer, 'Decided by NS-1 · Driver arrived within 100 m of pickup? No (378 m from pickup)');
  assert.deepEqual(d.conditionGroups(d005).others.map(c => c.rule), ['SAFE-1']);
  // D007: escalated by the overlays, not by the base rule that would have refunded.
  const rd3 = { rule: 'RD-3', label: 'Route more than 15% longer', met: true, value: '+40%', fact_ids: [] };
  const threat = { ...safe, met: true, value: '1 threatening message' };
  const fraud = { rule: 'FRAUD-1', label: 'Either party has high bad-faith risk', met: true, value: 'Rider: low; driver: high', fact_ids: [] };
  const d007 = { ...base, decision: 'needs_review', policy_refs: ['RD-3: x', 'SAFE-1: y', 'FRAUD-1: z'], conditions: [rd3, threat, fraud] };
  assert.deepEqual(d.conditionGroups(d007).deciding.map(c => c.rule), ['SAFE-1', 'FRAUD-1']);
  assert.equal(d.decidingAnswer(d007), 'Decided by SAFE-1 and FRAUD-1 · Threatening message in the chat log? Yes (1 threatening message)');
  // D002: escalated because data is missing (a base check not met).
  const ns4 = { rule: 'NS-4', label: 'Arrival location and waiting time available', met: false, value: 'Waiting time missing', fact_ids: [] };
  assert.deepEqual(d.conditionGroups({ ...base, decision: 'needs_review', policy_refs: ['NS-4: x'], conditions: [ns4] }).deciding, [ns4]);
  assert.equal(d.decidingAnswer({ ...base, conditions: null }), null);
});

test('precedent summary counts real outcomes and labels human decisions without inventing overrides', () => {
  assert.equal(d.precedentSummary(undefined), 'No similar cases in this result');
  assert.equal(d.precedentSummary({ matches: [] }), 'No similar cases in this result');
  const report = { matches: [
    { decision: 'partial_refund', decided_by: 'policy' },
    { decision: 'partial_refund', decided_by: 'policy' },
    { decision: 'full_refund', decided_by: 'human_review' },
  ] };
  assert.equal(d.precedentSummary(report), '3 similar cases: 2 partial refunds, 1 full refund (reviewer decision)');
  assert.equal(d.precedentSummary({ matches: [{ decision: 'no_action', decided_by: 'policy' }] }), '1 similar case: 1 unchanged charge');
  assert.doesNotMatch(d.precedentSummary(report), /overridden/);
});

test('counterfactual closed answer is the first supplied alternative, with an honest absent state', () => {
  const item = { change: 'the driver waited less than five minutes', outcome: 'full refund', rules: ['NS-2'] };
  assert.equal(d.counterfactualLine(item), 'If the driver waited less than five minutes → full refund');
  assert.equal(d.reviewRows({ ...base, counterfactuals: [item, { change: 'something else', outcome: 'no change' }] })[3].answer, d.counterfactualLine(item));
  assert.equal(d.reviewRows(base)[3].answer, 'No alternative conditions supplied in this result');
});

test('priority uses supplied triage; risk signals make its chip amber without inventing high priority', () => {
  assert.deepEqual(d.priorityChip(base), { text: 'Priority: normal', tone: 'neutral' });
  assert.deepEqual(d.priorityChip({ ...base, risk: { signals: ['Signal'] } }), { text: 'Priority: normal · risk signal', tone: 'warn' });
  assert.deepEqual(d.priorityChip({ ...base, triage: { tier: 'safety' } }), { text: 'Priority: safety', tone: 'warn' });
  assert.equal(d.priorityChip({ ...base, triage: { tier: 'standard' } }).text, 'Priority: normal');
});

test('debug requires the exact query parameter debug=1', () => {
  for (const search of ['?debug=1', '?x=2&debug=1', '?debug=1&theme=dark']) assert.equal(d.debugEnabled(search), true, search);
  for (const search of ['', '?debug=0', '?debug=true', '?otherdebug=1', '?x=debug%3D1', '#/console/D001?debug=1', '?debug=10']) assert.equal(d.debugEnabled(search), false, search);
});

test('applied rule IDs preserve supplied order without repeated chips', () => {
  assert.deepEqual(d.appliedRuleIds(['RD-3: Detour', 'REF-1: Amount capped', 'RD-3: Again']), ['RD-3', 'REF-1']);
});
