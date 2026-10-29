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

test('rule checks preserve advocate-relative meaning; favouring the other side is not an unmet condition', () => {
  const checks = d.suppliedRuleChecks([
    { party: 'rider', rules: [{ rule: 'NS-1', verdict: 'supports', decisive: true }, { rule: 'NS-2', verdict: 'favours_other_side', decisive: false }] },
    { party: 'driver', rules: [{ rule: 'RD-3', verdict: 'does_not_apply', decisive: false }, { rule: 'RD-5', verdict: 'favours_other_side', decisive: false }] },
  ]);
  assert.equal(checks[0].text, "Applies in the rider's favour");
  assert.equal(checks[1].text, "Applies in the driver's favour");
  assert.equal(checks[1].applies, true);
  assert.equal(checks[2].text, 'Does not apply');
  assert.equal(checks[2].applies, false);
  assert.equal(checks[3].text, "Applies in the rider's favour");
  assert.deepEqual(d.suppliedRuleChecks(undefined), []);
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
