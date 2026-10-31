import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';

const p = await load('casePolicy');
const check = (rule, label, value, met) => ({ rule, label, value, met, fact_ids: [] });

const d002 = { decision: 'needs_review', policy_refs: ['NS-4: Missing'], conditions: [
  check('NS-1', 'Arrived', '87 m from pickup', true), check('NS-4', 'Available', 'Waiting time missing', false),
  check('SAFE-1', 'Threat', 'None', false), check('FRAUD-1', 'Risk', 'Low', false), check('PREC-1', 'Precedent', 'None', false), check('ESC-1', 'Confidence', 'Skipped', false),
] };

test('rules are listed in the order checked, and ones never reached say so', () => {
  const model = p.rulesForCase(d002);
  assert.equal(model.policy, 'No-show Fee Policy');
  assert.deepEqual(model.rows.map(row => [row.rule, row.status]), [['NS-1', 'met'], ['NS-4', 'applied'], ['NS-2', 'unchecked'], ['NS-3', 'unchecked']]);
  assert.equal(model.rows[1].result, 'Applied: Waiting time missing');
  assert.equal(model.rows[2].result, 'Not checked');
  assert.equal(model.rows[2].text, 'Fee only if the driver waited at least 5 min');
  assert.equal(model.note, 'The rules stopped at NS-4, so these 2 are yours to weigh.');
  assert.equal(model.otherChecks, '4 Other Checks: None Triggered');
  assert.equal(model.summary, 'No-show fee policy: 1 met, 1 applied, 2 not checked');
});

test('triggered safety rules come first and leave the quiet checks counted', () => {
  const model = p.rulesForCase({ decision: 'needs_review', policy_refs: ['RD-3: Detour', 'SAFE-1: Threat'], conditions: [
    check('RD-1', 'Within', '+40%', false), check('RD-3', 'Longer', '+40%', true), check('SAFE-1', 'Threat', '1 threatening message', true), check('FRAUD-1', 'Risk', 'Low', false),
  ] });
  assert.equal(model.rows[0].rule, 'SAFE-1');
  assert.equal(model.rows[0].result, 'Triggered: 1 threatening message');
  assert.equal(model.rows.find(row => row.rule === 'RD-1').status, 'not_met');
  assert.equal(model.otherChecks, '1 Other Check: None Triggered');
  assert.equal(model.note, null);
});

test('a ruled case never calls a failed check applied', () => {
  const model = p.rulesForCase({ decision: 'full_refund', policy_refs: ['NS-1: Arrival'], conditions: [check('NS-1', 'Arrived', '378 m', false)] });
  assert.equal(model.rows[0].status, 'not_met');
  assert.equal(model.note, null);
});

test('no panel without a known policy to show', () => {
  assert.equal(p.rulesForCase({ decision: 'needs_review', policy_refs: [], conditions: [] }), null);
  assert.equal(p.rulesForCase({ decision: 'needs_review', policy_refs: [], conditions: [check('SAFE-1', 'Threat', 'None', false)] }), null);
});

test('the full policy lists every rule exactly once', async () => {
  const { RULES } = await load('glossary');
  const listed = p.fullPolicy().flatMap(group => group.rules.map(item => item.rule));
  assert.deepEqual([...listed].sort(), Object.keys(RULES).sort());
});

test('a data rule with its data on record shows the value, not "Met" on a rule about missing data', () => {
  const model = p.rulesForCase({ decision: 'no_action', policy_refs: ['RD-1: Normal'], conditions: [check('RD-4', 'Available', 'Available', true)] });
  assert.equal(model.rows[0].result, 'Available');
});
