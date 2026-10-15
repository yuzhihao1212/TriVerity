import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

// Use the existing TypeScript compiler: no test framework or runtime dependency.
const source = await readFile(new URL('../src/partyView.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { partyView, PARTY_DECISION_LABELS } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const resolution = {
  refund_amount: 6.30, rider_explanation: 'Rider message', driver_explanation: 'Driver message',
  explanation_source: 'fallback', risk: { signals: ['INTERNAL_SIGNAL'] },
  judge_evidence: ['INTERNAL_HISTORY'], explanation: 'INTERNAL_REASON',
  recommended_action: 'INTERNAL_PROPOSAL', rider_case: { summary: 'PRIVATE' },
};

for (const decision of ['partial_refund', 'full_refund', 'compensation', 'no_action', 'needs_review']) {
  for (const party of ['rider', 'driver']) {
    test(`${decision}: ${party} receives only party-safe fields`, () => {
      const result = partyView({ ...resolution, decision }, party);
      assert.deepEqual(Object.keys(result), ['decision', 'refund_amount', 'message', 'explanation_source']);
      assert.equal(result.message, resolution[`${party}_explanation`]);
      assert.equal(result.decision, decision);
      assert.equal(result.refund_amount, ['no_action', 'needs_review'].includes(decision) ? null : 6.30);
      assert.equal(result.explanation_source, 'fallback');
      assert.ok(PARTY_DECISION_LABELS[decision]);
      assert.doesNotMatch(JSON.stringify(result), /INTERNAL|PRIVATE/);
    });
  }
}

test('a refund decision without an amount does not invent one', () => {
  assert.equal(partyView({ ...resolution, decision: 'full_refund', refund_amount: null }, 'rider').refund_amount, null);
});
