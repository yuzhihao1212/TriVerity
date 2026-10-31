import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';

const { reportMenuGroups, reportStatus, caseReport, reportFileTitle } = await load('caseReport');
const dispute = {
  dispute_id: 'D002', type: 'no_show_charge', raised_at: '2026-10-20', rider_claim: 'The fee should be refunded.', driver_statement: '',
  trip: {}, fare: { cancellation_fee: 4, breakdown: [] }, chat_logs: [], rider_history: {}, driver_history: {},
};
const advocate = (source, summary) => ({ source, summary, evidence: [], evidence_ids: [], sources: [], policy_refs: [], rebuttal: null });
const condition = (rule, met, value) => ({ rule, met, label: 'Recorded condition', value, fact_ids: [] });
const resolution = {
  decision: 'needs_review', recommended_action: 'Escalate to a human reviewer: waiting time is missing.', refund_amount: null,
  confidence: 0.5, min_confidence: 0.6, conditions: [condition('NS-1', true, '87 m from pickup'), condition('NS-4', false, 'Waiting time missing')],
  policy_refs: ['NS-4: Missing data'], explanation: 'Waiting time is missing.', explanation_source: 'fallback',
  rider_explanation: 'A person will review your dispute.', driver_explanation: 'This dispute needs a reviewer.',
  rider_case: advocate('llm', 'The rider disputes the fee.'), driver_case: advocate('fallback', 'The driver says they waited.'),
  risk: { signals: [], rider_risk: 'low', driver_risk: 'low', summary: '' }, judge_evidence: [], agent_log: [],
};
const saved = { kind: 'decided', decision: 'full_refund', amount: 4, precedentId: 'R-009', reason: 'The pickup location was wrong.', at: '14:02' };
const hold = { disputeId: 'D002', why: 'Missing chat records', reason: 'Please obtain the missing records.', amount: null, at: '14:01' };
const sent = { decision: 'full_refund', amount: 4, at: '14:03', reviewer: saved,
  messages: { rider: 'Your $4.00 fee is refunded.', driver: 'The rider was refunded $4.00.' }, notes: { rider: 'Thank you.', driver: '' } };
const input = (patch = {}) => ({ dispute, resolution, saved: null, hold: null, sent: null, latest: null, reviewNumber: 1, ...patch });

test('every report status branch, with only messages sent in this review making it final', () => {
  for (const [patch, final, label] of [
    [{ sent, latest: sent, hold, saved }, true, 'Final'],
    [{ sent: { ...sent, correction: true } }, true, 'Final: Correction Sent'],
    [{ latest: sent, hold, saved }, false, 'Not Final: Reopened'],
    [{ hold, saved }, false, 'Not Final: On Hold'],
    [{ saved }, false, 'Not Final: Not Yet Sent'],
    [{}, false, 'Not Final: Awaiting Reviewer'],
    [{ resolution: { ...resolution, decision: 'no_action' } }, false, 'Not Final: Proposed Ruling'],
  ]) {
    const status = reportStatus(input(patch));
    assert.equal(status.final, final);
    assert.equal(status.label, label);
  }
  assert.equal(reportStatus(input({ sent })).note, 'Sent to the rider and driver: Full refund $4.00.');
  assert.match(reportStatus(input({ latest: sent })).note, /Earlier outcome sent.*Full refund \$4\.00/);
  assert.equal(reportStatus(input({ hold })).note, 'Waiting for a second reviewer. Nothing has been sent.');
  assert.match(reportStatus(input({ saved })).note, /Decided: Full refund \$4\.00/);
});

test('an undecided report has no reviewer or delivered messages and labels its actual text sources', () => {
  const report = caseReport(input());
  assert.equal(report.reviewer, null);
  assert.equal(report.messages, null);
  assert.equal(report.claims.driver, 'No statement recorded.');
  assert.equal(report.arguments[0].argument.author, 'Hy3');
  assert.equal(report.arguments[1].argument.author, 'Fallback text');
  assert.equal(report.arguments[0].reply.author, 'Not run');
  assert.equal(report.explanation.author, 'Fallback text');
  assert.deepEqual(report.sources.map(source => source.author), ['Not run', 'Hy3', 'Fallback text', 'Not run', 'Not run', 'Fallback text']);
  assert.equal(report.ruling.confidence.caption, 'Sent to a human reviewer, whatever the confidence');
});

test('the rules table preserves early-stop Not checked rows and the supplied note', () => {
  const report = caseReport(input());
  for (const rule of ['NS-2', 'NS-3']) assert.equal(report.rules.rows.find(row => row.rule === rule).result, 'Not checked');
  assert.match(report.rules.note, /NS-4/);
});

test('a sent report carries the immutable decision, amount, reason, time, precedent and messages', () => {
  const report = caseReport(input({ sent, saved: { ...saved, decision: 'no_action', reason: 'A different draft.' } }));
  assert.equal(report.status.final, true);
  assert.equal(report.reviewer.decision, 'full_refund');
  assert.equal(report.reviewer.outcome, 'Full refund $4.00');
  assert.equal(report.reviewer.amount, 4);
  assert.equal(report.reviewer.reason, saved.reason);
  assert.equal(report.reviewer.at, '14:02');
  assert.equal(report.reviewer.precedentId, 'R-009');
  assert.deepEqual(report.messages.messages, sent.messages);
  assert.deepEqual(report.messages.notes, sent.notes);
});

test('automatic final cases have messages without inventing a human reason or precedent', () => {
  const report = caseReport(input({ sent: { ...sent, reviewer: { kind: 'auto', decision: 'full_refund', precedentId: '' } } }));
  assert.equal(report.status.final, true);
  assert.equal(report.reviewer, null);
  assert.deepEqual(report.messages.messages, sent.messages);
});

test('a reopened report is not final and never calls earlier messages current', () => {
  const report = caseReport(input({ latest: sent, saved }));
  assert.equal(report.status.label, 'Not Final: Reopened');
  assert.equal(report.messages, null);
  assert.equal(report.reviewer.reason, saved.reason);
});

test('no_action never borrows a refund amount for the ruling, reviewer or sent outcome', () => {
  const noAction = { ...resolution, decision: 'no_action', refund_amount: 99 };
  const decision = { ...saved, decision: 'no_action', amount: 99 };
  for (const patch of [{ saved: decision }, { sent: { ...sent, decision: 'no_action', amount: 99, reviewer: decision } }]) {
    const report = caseReport(input({ resolution: noAction, ...patch }));
    assert.equal(report.ruling.amount, null);
    assert.equal(report.reviewer.amount, null);
    assert.doesNotMatch(report.ruling.outcome, /\$/);
    assert.doesNotMatch(report.reviewer.outcome, /\$/);
    assert.doesNotMatch(report.status.note, /\$/);
  }
});

test('unsent full-refund decisions use the charged fee and accepted decisions use the ruling amount', () => {
  assert.equal(caseReport(input({ saved: { ...saved, amount: undefined } })).reviewer.amount, 4);
  assert.equal(caseReport(input({ resolution: { ...resolution, decision: 'partial_refund', refund_amount: 2 }, saved: { ...saved, kind: 'accepted', decision: 'partial_refund', amount: undefined } })).reviewer.amount, 2);
});

test('evidence uses supplied IDs in numeric order, without changing its text or inventing IDs', () => {
  const result = { ...resolution, judge_evidence: ['Ten', 'Two', 'One', 'No ID'], judge_evidence_ids: ['TRIP-10', 'TRIP-2', 'GPS-1', ''] };
  const before = JSON.stringify(result);
  assert.deepEqual(caseReport(input({ resolution: result })).facts, [
    { id: 'GPS-1', text: 'One', source: 'GPS' }, { id: 'TRIP-2', text: 'Two', source: 'Trip' }, { id: 'TRIP-10', text: 'Ten', source: 'Trip' },
  ]);
  assert.equal(JSON.stringify(result), before);
});

test('safety and fraud rows stay ahead of route checks, with risk signals and similar cases intact', () => {
  const result = { ...resolution, policy_refs: ['RD-3: Route', 'SAFE-1: Safety', 'FRAUD-1: Risk'],
    conditions: [condition('RD-3', true, '+40%'), condition('SAFE-1', true, '1 threatening message'), condition('FRAUD-1', true, 'High risk')],
    risk: { ...resolution.risk, signals: ['A recorded risk signal.'] },
    precedents: { matches: [{ id: 'P-1', summary: 'An earlier case.', decision: 'no_action', similarity: 0.85, decided_by: 'human_review' }] } };
  const report = caseReport(input({ resolution: result }));
  assert.deepEqual(report.rules.rows.slice(0, 2).map(row => row.rule), ['SAFE-1', 'FRAUD-1']);
  assert.deepEqual(report.signals, result.risk.signals);
  assert.equal(report.precedents[0].similarity, '85%');
  assert.equal(report.precedents[0].outcome, 'No change to the charge');
});

test('hold details and missing optional policy/source data stay honest', () => {
  const report = caseReport(input({ hold, resolution: { ...resolution, conditions: null } }));
  assert.deepEqual(report.hold, hold);
  assert.equal(report.rules, null);
  assert.equal(report.raised, dispute.raised_at);
  assert.equal(report.reviewNumber, 1);
});

test('the print title preserves the exact case ID', () => {
  assert.equal(reportFileTitle('DISP-002'), 'TriVerity Case Report DISP-002');
});

test('the report menu puts the open case first, then final, then not final, and counts the rest', () => {
  const final = { final: true, label: 'Final', note: '' }, draft = { final: false, label: 'Not Final: On Hold', note: '' };
  const entries = [{ id: 'D001', status: final }, { id: 'D002', status: draft }, { id: 'D003', status: final }, { id: 'D004', status: null }, { id: 'D005', status: draft }];
  const groups = reportMenuGroups(entries, 'D002');
  assert.equal(groups.current.id, 'D002');
  assert.deepEqual(groups.final.map(entry => entry.id), ['D001', 'D003']);
  assert.deepEqual(groups.notFinal.map(entry => entry.id), ['D005']);
  assert.equal(groups.noResult, 1);
  // On Home, or on a case with no result, nothing is singled out.
  assert.equal(reportMenuGroups(entries, null).current, null);
  assert.equal(reportMenuGroups(entries, 'D004').current, null);
  assert.equal(reportMenuGroups(entries, 'D004').notFinal.length, 2);
  assert.equal(reportMenuGroups([], null).noResult, 0);
});


test('the report says when the rules closed a case with no person involved', () => {
  const auto = { decision: 'partial_refund', amount: 6.3, reviewer: { kind: 'auto' } };
  const closed = reportStatus({ resolution: { decision: 'partial_refund' }, sent: auto, latest: auto });
  assert.equal(closed.label, 'Final: Closed Automatically');
  assert.equal(closed.final, true);
  assert.match(closed.note, /no person involved/);
  const reopened = reportStatus({ resolution: { decision: 'partial_refund' }, latest: auto });
  assert.equal(reopened.final, false);
  assert.match(reopened.note, /no person involved/);
  const byPerson = { decision: 'partial_refund', amount: 6.3, reviewer: { kind: 'accepted' } };
  assert.doesNotMatch(reportStatus({ resolution: { decision: 'partial_refund' }, sent: byPerson }).note, /no person/);
});
