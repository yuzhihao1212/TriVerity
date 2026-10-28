import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';

const { appealLine, decidedAppealLine, originalDecisionText } = await load('appealState');
const { FINAL_LABELS } = await load('decisionState');

test('appeal heading identifies the filing party and appeal', () => {
  assert.equal(appealLine({ id: 'A-001', party: 'rider' }), 'Rider appealed · A-001');
  assert.equal(appealLine({ id: 'A-002', party: 'driver' }), 'Driver appealed · A-002');
});

test('original decision uses each shared final label, and supports escalated originals', () => {
  for (const [decision, label] of Object.entries(FINAL_LABELS)) {
    assert.equal(originalDecisionText(decision), `Original decision: ${label}`);
  }
  assert.equal(originalDecisionText('needs_review'), 'Original decision: Needs review');
});

test('decided appeal shows the reviewer outcome and the saved precedent', () => {
  assert.equal(decidedAppealLine({ id: 'A-002', reviewer_decision: 'full_refund', precedent_id: 'R-009' }),
    'Appeal A-002 decided: Full refund · saved as precedent R-009');
  for (const [decision, label] of Object.entries(FINAL_LABELS)) {
    assert.equal(decidedAppealLine({ id: 'A-003', reviewer_decision: decision, precedent_id: 'R-010' }),
      `Appeal A-003 decided: ${label} · saved as precedent R-010`);
  }
});

test('nullable decision metadata never appears as null or undefined', () => {
  assert.equal(decidedAppealLine({ id: 'A-002', reviewer_decision: 'compensation', precedent_id: null }),
    'Appeal A-002 decided: Compensation');
  assert.equal(decidedAppealLine({ id: 'A-002', reviewer_decision: null, precedent_id: null }), 'Appeal A-002 decided');
});
