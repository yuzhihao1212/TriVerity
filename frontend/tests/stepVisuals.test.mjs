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
const sv = await import(await transpile('stepVisuals.ts', { './workflow': workflowUrl, './outcomeTone': await transpile('outcomeTone.ts') }));
const wf = await import(workflowUrl);

const log = (agent, message = '', duration_ms = 1) => ({ step: 0, agent, status: 'completed', message, duration_ms });
const byTab = states => Object.fromEntries(states.map(s => [s.tab, s]));

const phases = states => states.map(s => `${s.tab}:${s.phase}`).join(' ');

test('step states with no result: Intake is current, the rest locked', () => {
  const states = byTab(sv.stepStates({ active: 'intake', hasResult: false, busy: false }));
  assert.deepEqual(states.intake, { tab: 'intake', phase: 'available', reviewed: false, current: true, locked: false, working: false, next: false, joined: false });
  assert.equal(sv.stepStatusText(states.intake), 'current step');
  for (const tab of ['evidence', 'hearing', 'ruling', 'notify']) {
    assert.equal(states[tab].phase, 'locked');
    assert.equal(sv.stepStatusText(states[tab]), 'locked');
    assert.equal(states[tab].joined, false);
  }
});

test('during a run the working ring follows the agents along the stepper', () => {
  let states = sv.stepStates({ active: 'intake', hasResult: false, busy: true, liveSteps: [] });
  assert.deepEqual(states.filter(s => s.working).map(s => s.tab), ['evidence']);
  assert.equal(sv.stepStatusText(byTab(states).evidence), 'agents working');
  // The fraud detector logs early but belongs to Ruling: the agents are still on Evidence.
  states = sv.stepStates({ active: 'intake', hasResult: false, busy: true, liveSteps: [log('evidence_loader'), log('fraud_detector')] });
  assert.deepEqual(states.filter(s => s.working).map(s => s.tab), ['evidence']);
  states = sv.stepStates({ active: 'intake', hasResult: false, busy: true,
    liveSteps: ['evidence_loader', 'evidence_collector', 'fraud_detector', 'rider_advocate', 'driver_advocate'].map(a => log(a)) });
  assert.deepEqual(states.filter(s => s.working).map(s => s.tab), ['hearing']);
  states = sv.stepStates({ active: 'intake', hasResult: false, busy: true,
    liveSteps: ['evidence_loader', 'evidence_collector', 'rider_rebuttal', 'driver_rebuttal', 'judge'].map(a => log(a)) });
  assert.ok(states.every(s => !s.working), 'the ring stops once the last step finishes');
  // Working is not "reviewed": nothing is ticked and the locked steps stay locked (tab semantics unchanged).
  assert.ok(states.every(s => !s.reviewed && !s.joined && !s.next));
  assert.equal(byTab(states).ruling.locked, true);
});

test('with a ruling and nothing reviewed: Intake ticked, the rest available, Next = Evidence', () => {
  let states = sv.stepStates({ active: 'intake', hasResult: true, busy: false });
  assert.equal(phases(states), 'intake:reviewed evidence:available hearing:available ruling:available notify:available');
  assert.deepEqual(states.filter(s => s.next).map(s => s.tab), ['evidence']);
  assert.ok(states.every(s => !s.joined), 'no connector filled yet');
  assert.equal(sv.stepStatusText(byTab(states).hearing), 'not reviewed yet');
  // The Next hint is hidden on the current step.
  states = sv.stepStates({ active: 'evidence', hasResult: true, busy: false });
  assert.ok(states.every(s => !s.next));
});

test('after visiting Evidence: Intake and Evidence ticked, Next = Hearing, line filled to Evidence', () => {
  const states = sv.stepStates({ active: 'intake', hasResult: true, busy: false, reviewed: ['evidence'] });
  assert.equal(phases(states), 'intake:reviewed evidence:reviewed hearing:available ruling:available notify:available');
  assert.deepEqual(states.filter(s => s.next).map(s => s.tab), ['hearing']);
  assert.deepEqual(states.map(s => s.joined), [false, true, false, false, false]);
  // The line runs to the FURTHEST reviewed step, even across a gap.
  const gap = sv.stepStates({ active: 'notify', hasResult: true, busy: false, reviewed: ['ruling'] });
  assert.deepEqual(gap.map(s => s.joined), [false, true, true, true, false]);
  assert.deepEqual(gap.filter(s => s.next).map(s => s.tab), ['evidence']);
  // All reviewed: no Next hint anywhere.
  const all = sv.stepStates({ active: 'ruling', hasResult: true, busy: false, reviewed: ['evidence', 'hearing', 'ruling', 'notify'] });
  assert.ok(all.every(s => s.reviewed && !s.next));
  assert.equal(sv.stepStatusText(byTab(all).ruling), 'reviewed');
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
  assert.equal(sv.toolTooltip({ reason: 'default plan', results: ['a', 'b'] }), 'Standard lookup (AI off) · 2 results');
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

test('distance tone is a warning only when the deviation counted against the driver', () => {
  const tone = resolution => sv.distanceTone(resolution);
  // Before a ruling the rules have not decided.
  assert.equal(tone(undefined), 'neutral');
  // D001-like: +44%, partial refund under RD-3.
  assert.equal(tone({ decision: 'partial_refund', refund_amount: 6.3, policy_refs: ['RD-3: A route more than 15% longer than expected that also took longer is treated as an unjustified detour; the fare above the expected fare is refunded.'] }), 'warn');
  // D003-like: +8%, within tolerance (RD-1), no action.
  assert.equal(tone({ decision: 'no_action', refund_amount: null, policy_refs: ['RD-1: A route up to 15% longer than expected is within normal tolerance; no refund is due.'] }), 'neutral');
  // D004-like: no action under RD-2 (congestion): neutral.
  assert.equal(tone({ decision: 'no_action', refund_amount: null, policy_refs: ['RD-2: A longer route that did not take longer…'] }), 'neutral');
  // D007-like: escalated, but the route rule RD-3 counted against the driver.
  assert.equal(tone({ decision: 'needs_review', refund_amount: 6.9, policy_refs: ['RD-3: …', 'SAFE-1: …'] }), 'warn');
  // RD-1 is matched as a rule ID, not a prefix of RD-10.
  assert.equal(sv.distanceTone({ decision: 'needs_review', policy_refs: ['RD-10: hypothetical'] }), 'warn');
  assert.equal(sv.distanceTone({ decision: 'needs_review', policy_refs: ['SAFE-1: threat'] }), 'neutral');
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
  assert.deepEqual(sv.statusBadge('failed'), { label: 'Failed', tone: 'danger', icon: 'cross' });
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
