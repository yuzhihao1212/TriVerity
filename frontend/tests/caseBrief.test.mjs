import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';

const b = await load('caseBrief');
const route = { type: 'route_deviation', trip: { expected_distance_km: 10.2, actual_distance_km: 14.7 },
  fare: { expected: 18.5, actual: 24.8 }, rider_claim: 'The driver took a detour.', driver_statement: 'The road was closed.' };
const noShow = { ...route, type: 'no_show_charge', trip: { driver_wait_min: 7 }, fare: { cancellation_fee: 4 } };
const ruling = { decision: 'partial_refund', refund_amount: 6.3, confidence: 0.8, policy_refs: ['RD-3: Unjustified detour'],
  risk: { rider_risk: 'low', driver_risk: 'low' }, rider_case: { source: 'llm', rebuttal: null },
  driver_case: { source: 'llm', rebuttal: null }, explanation_source: 'llm', evidence_collection: { source: 'llm' } };
const line = value => [value.facts, value.outcome].filter(Boolean).join(' · ');

test('route headline gives the fare and route difference, never the AI proposal', () => {
  assert.equal(line(b.caseHeadline(route, ruling)), 'The rider disputes a $24.80 fare. Trip data shows the route was 44% longer than expected.');
  assert.equal(b.caseHeadline(route, ruling).outcome, null);
  assert.equal(b.caseHeadline(route, ruling).tone, 'neutral');
  assert.equal(line(b.caseHeadline(route)), 'The rider disputes a $24.80 fare. Trip data shows the route was 44% longer than expected.');
});

test('no-show headline gives the fee and wait; a decided no_action explains that no refund is due', () => {
  const result = b.caseHeadline(noShow, { ...ruling, decision: 'no_action', refund_amount: null });
  assert.equal(line(result), 'The rider disputes a $4.00 no-show fee. The driver waited 7 minutes at pickup.');
  assert.equal(b.caseHeadline(noShow, ruling, { decision: 'no_action', amount: null, by: null }).outcome, 'Decided: no change to the charge.');
  assert.equal(b.caseHeadline(route, ruling, { decision: 'no_action', amount: null, by: null }).outcome, 'Decided: no change to the charge.');
});

test('all outcomes use explicit wording and omit inappropriate or unknown amounts', () => {
  for (const [decision, amount, expected] of [
    ['partial_refund', 6.3, 'partial refund $6.30'], ['full_refund', 24.8, 'full refund $24.80'],
    ['compensation', 5, 'compensation $5.00'], ['partial_refund', null, 'partial refund'],
    ['full_refund', NaN, 'full refund'], ['compensation', -1, 'compensation'],
    ['no_action', 6.3, 'no change to the charge'], ['needs_review', 6.3, 'a human reviewer will decide'],
  ]) assert.equal(b.caseOutcome('route_deviation', decision, amount), expected);
  assert.equal(b.caseHeadline(route, { ...ruling, decision: 'needs_review' }).outcome, null, 'an escalation is not shown before a decision');
});

test('final reviewer decisions replace the proposal without borrowing its amount', () => {
  const final = { decision: 'partial_refund', amount: 2.5, by: 'overridden' };
  assert.equal(b.caseHeadline(route, ruling, final).outcome, 'Decided: partial refund $2.50 (overridden).');
  assert.equal(b.caseHeadline(route, ruling, { ...final, amount: null }).outcome, 'Decided: partial refund (overridden).');
  assert.equal(b.caseHeadline(noShow, ruling, { decision: 'no_action', amount: null, by: 'decided' }).outcome, 'Decided: no change to the charge.');
});

test('sent overrides survive reload even when only the amount changed; current choices win', () => {
  const sent = { decision: 'partial_refund', amount: 2.5, reviewer: { kind: 'overridden' } };
  assert.deepEqual(b.headerFinalOutcome(ruling, route, null, sent), { decision: 'partial_refund', amount: 2.5, by: 'overridden' });
  assert.deepEqual(b.headerFinalOutcome(ruling, route, null, { ...sent, reviewer: { kind: 'decided' } }),
    { decision: 'partial_refund', amount: 2.5, by: 'decided' });
  assert.deepEqual(b.headerFinalOutcome(ruling, route, null, { ...sent, amount: 6.3, reviewer: { kind: 'accepted' } }),
    { decision: 'partial_refund', amount: 6.3, by: null }, 'an accepted, sent ruling is shown as decided');
  assert.deepEqual(b.headerFinalOutcome(ruling, route, { kind: 'accepted', decision: 'partial_refund' }, null),
    { decision: 'partial_refund', amount: 6.3, by: null });
  assert.equal(b.headerFinalOutcome(ruling, route, null, null), null, 'undecided: no outcome');
  assert.deepEqual(b.headerFinalOutcome(ruling, route, { kind: 'overridden', decision: 'full_refund' }, sent),
    { decision: 'full_refund', amount: 24.8, by: 'overridden' });
});

test('missing and invalid facts are skipped, zero is retained, and shorter routes are explicit', () => {
  const empty = { type: 'route_deviation', trip: {}, fare: {}, rider_claim: '' };
  assert.equal(line(b.caseHeadline(empty)), '');
  assert.equal(line(b.caseHeadline({ ...empty, trip: { expected_distance_km: 0, actual_distance_km: 3 } })), '');
  assert.equal(line(b.caseHeadline({ ...empty, fare: { actual: NaN }, trip: { expected_distance_km: 2, actual_distance_km: Infinity } })), '');
  assert.equal(line(b.caseHeadline({ ...noShow, trip: { driver_wait_min: 0 }, fare: { cancellation_fee: 0 } })),
    'The rider disputes a $0.00 no-show fee. The driver waited 0 minutes at pickup.');
  assert.equal(b.caseHeadline({ ...route, trip: { expected_distance_km: 10, actual_distance_km: 9.2 } }).facts,
    'The rider disputes a $24.80 fare. Trip data shows the route was 8% shorter than expected.');
  assert.match(b.caseHeadline({ ...route, trip: { expected_distance_km: 10, actual_distance_km: 10 } }).facts, /route matched the expected distance\.$/);
});

test('what happened uses trip/fare facts, never either party’s allegation', () => {
  assert.equal(b.whatHappened(route), 'Trip was 14.7 km against 10.2 km expected; rider paid $24.80 against $18.50 expected.');
  assert.equal(b.whatHappened(noShow), 'Driver waited 7 min at pickup; rider was charged a $4.00 no-show fee.');
  assert.equal(b.whatHappened({ ...noShow, trip: {} }), 'Rider was charged a $4.00 no-show fee.');
  assert.equal(b.whatHappened({ ...route, trip: {}, fare: {} }), null);
  assert.equal(b.whatHappened({ ...route, trip: { expected_distance_km: 10 }, fare: { expected: 18 } }),
    'Expected trip distance was 10 km; expected fare was $18.00.');
});

test('brief shows full claims and first policy ID and confidence', () => {
  assert.deepEqual(b.caseBriefRows(route, ruling).map(row => row.label), ['What happened', 'Rider says', 'Driver says'],
    'the proposal waits until the Ruling step is reviewed');
  const rows = b.caseBriefRows(route, ruling, { showProposal: true });
  assert.deepEqual(rows.map(row => row.label), ['What happened', 'Rider says', 'Driver says', 'Proposed ruling']);
  assert.deepEqual(rows[1], { label: 'Rider says', text: route.rider_claim });
  assert.equal(rows[3].text, 'partial refund $6.30 · RD-3 · 80% confidence');
  assert.equal(b.caseBriefRows(noShow, { ...ruling, decision: 'no_action', policy_refs: [' NS-1: Fee valid', 'NS-2: Other'], confidence: 0.95 }, { showProposal: true }).at(-1).text,
    'no change to the charge · NS-1 · 95% confidence');
});

test('brief omits missing rows and proposal metadata, and does not match rule IDs in prose', () => {
  const empty = { ...route, trip: {}, fare: {}, rider_claim: ' ', driver_statement: null };
  assert.deepEqual(b.caseBriefRows(empty), []);
  assert.deepEqual(b.caseBriefRows(empty, { ...ruling, policy_refs: [], confidence: NaN }, { showProposal: true }), [{ label: 'Proposed ruling', text: 'partial refund $6.30' }]);
  assert.equal(b.caseBriefRows(empty, { ...ruling, policy_refs: ['Prose mentions NS-1', 'SAFE-1: Safety'], confidence: 0 }, { showProposal: true }).at(-1).text,
    'partial refund $6.30 · SAFE-1 · 0% confidence');
  assert.deepEqual(b.checksBeforeDeciding(ruling), []);
  assert.deepEqual(b.checksBeforeDeciding(), []);
});

test('checks combine safety/escalation, high fraud risk and fallback in at most three items', () => {
  const result = { ...ruling, decision: 'needs_review', triage: { tier: 'safety' },
    risk: { rider_risk: 'high', driver_risk: 'high' }, explanation_source: 'fallback' };
  assert.deepEqual(b.checksBeforeDeciding(result), ['Safety concern: review first.', 'High fraud risk flagged for the rider and driver.',
    'An AI step used fallback template text; check its wording.']);
  assert.deepEqual(b.caseBriefRows(route, result).at(-1).items, b.checksBeforeDeciding(result));
  assert.deepEqual(b.checksBeforeDeciding({ ...ruling, decision: 'needs_review' }), ['Escalated: a human reviewer must decide.']);
  assert.deepEqual(b.checksBeforeDeciding({ ...ruling, risk: { rider_risk: 'low', driver_risk: 'high' } }), ['High fraud risk flagged for the driver.']);
});

test('fallback checks use recorded AI sources without labelling absent replies as fallback', () => {
  for (const patch of [
    { evidence_collection: { source: 'fallback' } }, { explanation_source: 'fallback' },
    { rider_case: { source: 'fallback' } }, { driver_case: { source: 'fallback' } },
    { rider_case: { source: 'llm', rebuttal: { source: 'fallback', text: 'Template reply' } } },
    { driver_case: { source: 'llm', rebuttal: { source: 'fallback', text: 'Template reply' } } },
  ]) assert.match(b.checksBeforeDeciding({ ...ruling, ...patch }).at(-1), /fallback template text/);
  assert.deepEqual(b.checksBeforeDeciding({ ...ruling, evidence_collection: undefined }), []);
  assert.deepEqual(b.checksBeforeDeciding({ ...ruling, rider_case: { source: 'llm', rebuttal: { source: 'fallback', text: '' } } }), []);
});

test('cost remains visible with distinct explanations for live reruns, first runs and offline runs', () => {
  assert.deepEqual(b.runCostText(false, true), { note: 'Uses AI · about $0.002',
    detail: 'This case already has a saved result. Re-running calls the AI agents again and uses real tokens (about $0.002 per run).' });
  assert.equal(b.runCostText(false, false).detail, 'Running calls the AI agents and uses real tokens (about $0.002 per run).');
  for (const hasResult of [false, true]) assert.deepEqual(b.runCostText(true, hasResult), { note: 'AI offline · free',
    detail: 'AI is offline: the ruling is the same; arguments and explanations use template text. No tokens are used.' });
});
