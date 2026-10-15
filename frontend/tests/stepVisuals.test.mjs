import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

// stepVisuals.ts imports workflow.ts at runtime; transpile both and point the import at the data URL.
const transpile = async (file, replace = {}) => {
  let { outputText } = ts.transpileModule(await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  for (const [from, to] of Object.entries(replace)) outputText = outputText.replaceAll(`from "${from}"`, `from "${to}"`);
  return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
};
const workflowUrl = await transpile('workflow.ts');
const sv = await import(await transpile('stepVisuals.ts', { './workflow': workflowUrl }));
const wf = await import(workflowUrl);

const log = (agent, message = '', duration_ms = 1) => ({ step: 0, agent, status: 'completed', message, duration_ms });
const byTab = states => Object.fromEntries(states.map(s => [s.tab, s]));

test('step states with no result: Intake is current, the rest locked and not done', () => {
  const states = byTab(sv.stepStates({ active: 'intake', hasResult: false, busy: false }));
  assert.deepEqual(states.intake, { tab: 'intake', done: false, current: true, locked: false, inProgress: false });
  for (const tab of ['evidence', 'hearing', 'ruling', 'notify']) {
    assert.equal(states[tab].locked, true);
    assert.equal(states[tab].done, false);
    assert.equal(sv.stepStatusText(states[tab]), 'locked');
  }
});

test('step states while busy fill step by step as live steps arrive', () => {
  let states = byTab(sv.stepStates({ active: 'intake', hasResult: false, busy: true, liveSteps: [] }));
  assert.equal(states.intake.done, true);
  assert.equal(states.evidence.inProgress, true);
  assert.equal(sv.stepStatusText(states.evidence), 'in progress');
  // The fraud detector logs early but belongs to Ruling: Evidence waits for the collector.
  states = byTab(sv.stepStates({ active: 'intake', hasResult: false, busy: true, liveSteps: [log('evidence_loader'), log('fraud_detector')] }));
  assert.equal(states.evidence.done, false);
  assert.equal(states.ruling.done, false);
  states = byTab(sv.stepStates({ active: 'intake', hasResult: false, busy: true,
    liveSteps: ['evidence_loader', 'evidence_collector', 'fraud_detector', 'rider_advocate', 'driver_advocate'].map(a => log(a)) }));
  assert.equal(states.evidence.done, true);
  assert.equal(states.hearing.done, false);
  assert.equal(states.hearing.inProgress, true);
  assert.equal(states.evidence.inProgress, false);
  states = byTab(sv.stepStates({ active: 'intake', hasResult: false, busy: true,
    liveSteps: ['evidence_loader', 'evidence_collector', 'rider_rebuttal', 'driver_rebuttal', 'judge'].map(a => log(a)) }));
  assert.ok(Object.values(states).every(s => s.done && !s.inProgress));
  // Busy without a previous result keeps steps 2-5 locked (tab semantics unchanged).
  assert.equal(states.ruling.locked, true);
});

test('step states with a result: all complete and unlocked, the selected one current', () => {
  const states = sv.stepStates({ active: 'hearing', hasResult: true, busy: false });
  assert.ok(states.every(s => s.done && !s.locked && !s.inProgress));
  assert.deepEqual(states.filter(s => s.current).map(s => s.tab), ['hearing']);
  // A re-run over a saved result: unlocked steps not yet redone are "not started" (available).
  const rerun = byTab(sv.stepStates({ active: 'evidence', hasResult: true, busy: true, liveSteps: [log('evidence_loader')] }));
  assert.equal(rerun.hearing.locked, false);
  assert.equal(rerun.hearing.done, false);
  assert.equal(sv.stepStatusText(rerun.hearing), 'not started');
});

test('tool names map to friendly names and fall back to sentence case', () => {
  assert.equal(sv.toolName('trip_record'), 'Trip record');
  assert.equal(sv.toolName('gps_stops'), 'GPS stops');
  assert.equal(sv.toolName('fare_lines'), 'Fare lines');
  assert.equal(sv.toolName('driver_location_history'), 'Driver location history');
  assert.equal(sv.toolName(''), 'Unknown tool');
  assert.equal(sv.toolName('constructor'), 'Constructor', 'no prototype lookups');
  assert.equal(sv.toolIcon('gps_window'), 'pin');
  assert.equal(sv.toolIcon('mystery'), 'generic');
  assert.equal(sv.toolTooltip({ reason: 'default plan', results: ['a', 'b'] }), 'default plan · 2 results');
  assert.equal(sv.toolTooltip({ reason: '', results: ['a'] }), 'No reason recorded. · 1 result');
});

test('tool calls split into Rider and Driver columns, or one column without parties', () => {
  const call = (tool, party) => ({ round: 1, tool, args: {}, reason: 'r', source: 'fallback', results: [], party });
  const columns = sv.callColumns([call('trip_record', 'rider'), call('gps_stops', 'driver'), call('fare_lines', 'rider')]);
  assert.deepEqual(columns.map(c => [c.title, c.calls.map(x => x.tool)]),
    [['Rider’s side', ['trip_record', 'fare_lines']], ['Driver’s side', ['gps_stops']]]);
  assert.deepEqual(sv.callColumns([call('trip_record', null), call('gps_stops', 'rider')]).map(c => c.key), ['all']);
  assert.deepEqual(sv.callColumns([]), []);
});

test('a leading [fallback] or [llm] tag is stripped, and only a leading one', () => {
  assert.equal(sv.stripSourceTag('[fallback] partial_refund (80% confidence)'), 'partial_refund (80% confidence)');
  assert.equal(sv.stripSourceTag('[llm] Rider argues X'), 'Rider argues X');
  assert.equal(sv.stripSourceTag('Computed 15 facts from case data.'), 'Computed 15 facts from case data.');
  assert.equal(sv.stripSourceTag('Quote: [fallback] stays'), 'Quote: [fallback] stays');
});

const D001 = {
  dispute_id: 'D001', type: 'route_deviation', rider_claim: '', chat_logs: [], rider_history: {}, driver_history: {},
  trip: { expected_distance_km: 10.2, actual_distance_km: 14.7 },
  fare: { expected: 18.5, actual: 24.8, breakdown: [] },
};

test('header chips come from the case, and are skipped when their data is missing', () => {
  assert.deepEqual(sv.headerChips(D001).map(c => c.label), ['+44% distance', '$24.80 charged']);
  const ruled = sv.headerChips(D001, { decision: 'partial_refund', refund_amount: 6.3 });
  assert.deepEqual(ruled.map(c => [c.label, c.tone]), [['+44% distance', 'accent'], ['$24.80 charged', 'neutral'], ['Partial refund $6.30', 'ok']]);
  const noShow = { ...D001, type: 'no_show_charge', trip: { driver_wait_min: 7 }, fare: { cancellation_fee: 4, breakdown: [] } };
  assert.deepEqual(sv.headerChips(noShow).map(c => c.label), ['Driver waited 7 min', '$4.00 no-show fee']);
  assert.deepEqual(sv.headerChips({ ...D001, trip: {}, fare: { breakdown: [] } }), []);
  assert.deepEqual(sv.headerChips({ ...D001, trip: { expected_distance_km: 0, actual_distance_km: 3 } }).map(c => c.key), ['charged'], 'no divide by zero');
  assert.equal(sv.headerChips({ ...D001, trip: { expected_distance_km: 10, actual_distance_km: 9.2 } })[0].label, '-8% distance');
});

test('the outcome label for each decision', () => {
  const cases = [
    ['partial_refund', 6.3, 'Partial refund $6.30', 'ok'],
    ['full_refund', 4, 'Full refund $4.00', 'ok'],
    ['compensation', 5, 'Compensation $5.00', 'ok'],
    ['partial_refund', null, 'Partial refund', 'ok'],
    ['no_action', null, 'No action', 'neutral'],
    // An escalated case's proposed amount is not an outcome yet.
    ['needs_review', 6.9, 'Escalated to a human', 'warn'],
  ];
  for (const [decision, refund, label, tone] of cases) assert.deepEqual(sv.outcomeChip(decision, refund), { key: 'outcome', label, tone }, decision);
});

test('status pill keeps the previous exact wording as its detail', () => {
  assert.deepEqual(sv.statusPill({ busy: false, streaming: true, hasResult: true }), { label: 'Ruling ready', tone: 'ok', pulse: false, detail: 'Saved result · no new request' });
  assert.equal(sv.statusPill({ busy: true, streaming: true, hasResult: true }).label, 'Agents working · live');
  assert.equal(sv.statusPill({ busy: true, streaming: false, hasResult: false }).detail, 'Agents working · standard resolve');
  assert.equal(sv.statusPill({ busy: false, streaming: true, hasResult: false }).label, 'Ready for intake');
});

test('agent roles, icons and badges', () => {
  assert.equal(wf.agentRole('evidence_loader'), 'Computes facts from the case data');
  assert.equal(wf.agentRole('evidence_collector'), 'Requests extra evidence for each side');
  for (const agent of Object.keys(wf.AGENT_LABELS)) assert.ok(wf.agentRole(agent), `${agent} has a role`);
  assert.equal(wf.agentRole('new_agent'), null);
  assert.equal(sv.agentIcon('judge'), 'scales');
  assert.equal(sv.agentIcon('driver_rebuttal'), 'wheel');
  assert.equal(sv.agentIcon('toString'), 'generic');
  assert.equal(sv.agentBadge('fraud_detector', null), 'code');
  assert.equal(sv.agentBadge('judge', 'fallback'), 'fallback');
  assert.equal(sv.agentBadge('mystery', null), null);
  assert.deepEqual(sv.statusBadge('completed'), { label: 'Completed', tone: 'ok', icon: 'check' });
  assert.deepEqual(sv.statusBadge('failed'), { label: 'Failed', tone: 'warn', icon: 'cross' });
  assert.equal(sv.statusBadge('skipped').label, 'Skipped');
});

test('durations: text and share of the slowest agent', () => {
  assert.equal(sv.durationText(0), '<0.1 s');
  assert.equal(sv.durationText(4200), '4.2 s');
  assert.equal(sv.durationText(null), null);
  const entries = [log('a', '', 1000), log('b', '', 4000), log('c', '', null)];
  assert.equal(sv.durationShare(1000, entries), 0.25);
  assert.equal(sv.durationShare(4000, entries), 1);
  assert.equal(sv.durationShare(null, entries), 0);
  assert.equal(sv.durationShare(5, [log('a', '', 0)]), 0);
});

test('Evidence flow counts come from the loader message and the facts list', () => {
  const resolution = { judge_evidence: Array(23).fill('f'), risk: {}, decision: 'no_action', refund_amount: null };
  const entries = [log('evidence_loader', 'Computed 15 facts from case data.'), log('evidence_collector', "[fallback] rider's request: ...")];
  assert.deepEqual(sv.stepFlow('evidence', entries, resolution), { edges: ['15 facts', '+8 facts'], result: '23 facts total' });
  assert.deepEqual(sv.stepFlow('evidence', [entries[0]], resolution), { edges: ['15 facts'], result: '23 facts total' });
  // No count in the message: arrows stay, labels go, nothing is invented.
  assert.deepEqual(sv.stepFlow('evidence', [log('evidence_loader', 'Loaded.'), entries[1]], resolution), { edges: [null, null], result: '23 facts total' });
  const ruling = { ...resolution, decision: 'partial_refund', refund_amount: 6.3, risk: { rider_risk: 'low', driver_risk: 'high' }, precedents: { matches: [{}, {}, {}] } };
  assert.deepEqual(sv.stepFlow('ruling', [log('fraud_detector'), log('precedent_agent'), log('judge')], ruling),
    { edges: ['Risk: rider low, driver high', '3 past rulings retrieved'], result: null });
  assert.equal(sv.stepFlow('hearing', [log('rider_advocate'), log('driver_advocate')], resolution), null);
});
