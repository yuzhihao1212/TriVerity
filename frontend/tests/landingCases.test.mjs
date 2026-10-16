import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { load } from './_load.mjs';

const { CASES } = await load('landingCases');
const { decisionTone } = await load('outcomeTone');
const expected = JSON.parse(await readFile(new URL('../../data/expected_rulings.json', import.meta.url), 'utf8'));

test('featured cases retain their order and link directly to the matching console case', () => {
  assert.deepEqual(CASES.map(c => c.id), ['D001', 'D007', 'DISP-002']);
  for (const c of CASES) assert.equal(c.href, `#/console/${c.id}`);
});
test('case outcomes use the shared decision tone mapping and the sample rulings', () => {
  assert.deepEqual(CASES.map(c => c.tone), ['ok', 'warn', 'neutral']);
  for (const c of CASES) {
    assert.equal(c.tone, decisionTone(c.decision));
    assert.equal(c.decision, expected[c.id].decision);
  }
  assert.equal(CASES[0].refundAmount, expected.D001.refund);
});
test('only the actual refund card shows money; every card has a descriptive spoken name', () => {
  assert.deepEqual(CASES.map(c => c.outcome), ['Partial refund $6.30', 'Escalated to a human', 'Fee upheld']);
  for (const c of CASES) {
    assert.ok(c.accessibleName.startsWith(`Open case ${c.id}: ${c.title}. `));
    assert.ok(c.accessibleName.includes(c.evidenceSummary));
    assert.ok(c.accessibleName.includes('Outcome: '));
    if (c.decision !== 'partial_refund') {
      assert.equal(c.refundAmount, undefined);
      assert.equal(c.accessibleName.includes('$'), false);
    }
  }
});
