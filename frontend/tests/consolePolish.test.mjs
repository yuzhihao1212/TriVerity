import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

// Transpile each TS module and link their relative imports through data URLs.
const transpile = async (file, replace = {}) => {
  let { outputText } = ts.transpileModule(await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  for (const [from, to] of Object.entries(replace)) outputText = outputText.replaceAll(`from "${from}"`, `from "${to}"`);
  return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
};
const outcomeUrl = await transpile('outcomeTone.ts');
const workflowUrl = await transpile('workflow.ts');
const stepUrl = await transpile('stepVisuals.ts', { './workflow': workflowUrl, './outcomeTone': outcomeUrl });
const { humanizeAgentMessage, stripTag } = await import(await transpile('agentText.ts', { './outcomeTone': outcomeUrl, './stepVisuals': stepUrl }));
const ot = await import(outcomeUrl);
const ds = await import(await transpile('decisionState.ts', { './outcomeTone': outcomeUrl }));

const SNAKE = /\b[a-z]+(?:_[a-z]+)+\b/;
const BARE_SIMILARITY = /(?<![\d.])0\.\d{2}(?!\d)/;
const clean = text => { assert.doesNotMatch(text, SNAKE, `no snake_case: ${text}`); assert.doesNotMatch(text, BARE_SIMILARITY, `no 0.xx: ${text}`); assert.doesNotMatch(text, /^\s*\[(llm|fallback)\]/i, `no tag: ${text}`); };

// Real formats from backend/app/services/orchestrator.py.
const D001 = {
  decision: 'partial_refund', confidence: 0.8,
  precedents: { matches: [
    { id: 'P-063', similarity: 0.8849, decision: 'partial_refund' },
    { id: 'P-056', similarity: 0.7012, decision: 'partial_refund' },
    { id: 'P-070', similarity: 0.66, decision: 'no_action' },
  ] },
  evidence_collection: { source: 'fallback', calls: [{ round: 1, tool: 'trip_record', args: {}, reason: 'default plan', source: 'fallback', results: [], party: 'rider' }] },
};

test('the judge line reads "Partial refund · 80% confident"', () => {
  const text = humanizeAgentMessage('judge', '[fallback] partial_refund (80% confidence)', D001);
  assert.equal(text, 'Partial refund · 80% confident');
  // During a live run there is no result yet: the same facts come from the message.
  assert.equal(humanizeAgentMessage('judge', 'needs_review (62% confidence)'), 'A human reviewer will decide · 62% confident');
  assert.equal(humanizeAgentMessage('judge', '[llm] no_action (91% confidence)', { ...D001, decision: 'no_action', confidence: 0.912 }), 'No change to the charge · 91% confident');
});

test('the precedent agent lists matches as percentages and labels, or says there are none', () => {
  const message = 'Consistent with 3 similar past rulings (P-063, P-056, P-070). Retrieved: P-063 (0.88, partial_refund), P-056 (0.70, partial_refund), P-070 (0.66, no_action).';
  const text = humanizeAgentMessage('precedent_agent', message, D001);
  assert.equal(text, 'Consistent with 3 similar past rulings (P-063, P-056, P-070). 3 similar past rulings: P-063 (88% match, partial refund), P-056 (70% match, partial refund), P-070 (66% match, no change to the charge).');
  clean(text);
  // Without a report (live progress), the message itself is parsed.
  const live = humanizeAgentMessage('precedent_agent', message);
  assert.match(live, /P-063 \(88% match, partial refund\)/);
  clean(live);
  const none = humanizeAgentMessage('precedent_agent', 'No closely similar past ruling in the knowledge base. Retrieved: none.', { ...D001, precedents: { matches: [] } });
  assert.equal(none, 'No closely similar past ruling in the knowledge base. No similar past rulings.');
  assert.equal(humanizeAgentMessage('precedent_agent', 'No closely similar past ruling in the knowledge base. Retrieved: none.'), 'No closely similar past ruling in the knowledge base. No similar past rulings.');
});

test('the collector shows no raw text beside its chips, otherwise "N lookups for each side"', () => {
  const message = "[fallback] rider's request: 3 tool calls (trip_record, gps_stops, fare_lines); driver's request: 3 tool calls (trip_record, gps_stops, fare_lines)";
  assert.equal(humanizeAgentMessage('evidence_collector', message, D001), '');
  assert.equal(humanizeAgentMessage('evidence_collector', message), '3 lookups for each side');
  assert.equal(humanizeAgentMessage('evidence_collector', "[llm] rider's request: 2 tool calls (gps_window(08:00, 08:10), chat_window(08:00, 08:20)); driver's request: 1 tool calls (trip_record)", { ...D001, evidence_collection: null }),
    'Rider: 2 lookups · Driver: 1 lookup');
});

test('advocates, rebuttals and the rest: the tag goes, snake_case becomes words', () => {
  assert.equal(humanizeAgentMessage('rider_advocate', '[llm] Rider disputes the charge: the route was longer.'), 'Rider disputes the charge: the route was longer.');
  assert.equal(humanizeAgentMessage('rider_rebuttal', '[fallback] no rebuttal'), 'no rebuttal');
  assert.equal(humanizeAgentMessage('driver_advocate', '[fallback] Driver argues no_action under RD-2; see trip_record.'), 'Driver argues no change to the charge under RD-2; see trip record.');
  assert.equal(humanizeAgentMessage('fraud_detector', 'Rider: low risk; Driver: high risk (2 signals)'), 'Rider: low risk; Driver: high risk (2 signals)');
  assert.equal(humanizeAgentMessage('evidence_loader', 'Computed 15 facts from case data.'), 'Computed 15 facts from case data.');
  assert.equal(humanizeAgentMessage('mystery_agent', 'similarity 0.88 to past_case'), 'similarity 88% to past case');
  assert.equal(stripTag('  [LLM]  hello'), 'hello');
  // Evidence IDs survive untouched, so EvidenceText can still link them.
  assert.match(humanizeAgentMessage('rider_advocate', '[llm] The route was longer (TRIP-2, GPS-5).'), /TRIP-2, GPS-5/);
  for (const [agent, message] of [['judge', '[fallback] partial_refund (80% confidence)'], ['rider_advocate', '[llm] uses full_refund and gps_stops']]) clean(humanizeAgentMessage(agent, message, D001));
});

test('one outcome-tone mapping for every decision', () => {
  assert.deepEqual(['partial_refund', 'full_refund', 'compensation', 'needs_review', 'no_action'].map(ot.decisionTone), ['ok', 'ok', 'ok', 'warn', 'neutral']);
  assert.equal(ot.decisionLabel('partial_refund'), 'Partial refund');
  assert.equal(ot.decisionLabel('toString'), 'toString', 'no prototype lookups');
  assert.equal(ot.decisionLabel('some_new_decision'), 'some new decision');
});

test('decision bar: idle, saving, accepted, overridden, escalated, unavailable', () => {
  const base = { decision: 'partial_refund', refund: 6.3, busy: false, saved: null, unavailable: false };
  let bar = ds.decisionBar(base);
  assert.deepEqual([bar.state, bar.label, bar.amount, bar.tone, bar.actions, bar.disabled], ['idle', 'Partial refund', '$6.30', 'ok', ['accept', 'override'], false]);
  bar = ds.decisionBar({ ...base, busy: true });
  assert.deepEqual([bar.state, bar.actions, bar.disabled], ['saving', ['accept', 'override'], true], 'both buttons disabled while saving');
  bar = ds.decisionBar({ ...base, saved: { kind: 'accepted', decision: 'partial_refund', precedentId: 'R-001' } });
  assert.deepEqual([bar.state, bar.note, bar.actions], ['accepted', '✓ Accepted · saved as precedent R-001', []]);
  bar = ds.decisionBar({ ...base, saved: { kind: 'overridden', decision: 'full_refund', precedentId: 'R-002' } });
  assert.deepEqual([bar.state, bar.note], ['overridden', '✓ Overridden: full refund · saved as precedent R-002']);
  bar = ds.decisionBar({ ...base, decision: 'needs_review', refund: 6.9 });
  assert.deepEqual([bar.state, bar.label, bar.amount, bar.tone, bar.actions], ['escalated', 'Escalated: needs your decision', null, 'warn', ['decide']], 'no Accept for escalated cases');
  bar = ds.decisionBar({ ...base, decision: 'needs_review', saved: { kind: 'decided', decision: 'no_action', precedentId: 'R-003' } });
  assert.equal(bar.note, '✓ Decided: no change to the charge · saved as precedent R-003');
  bar = ds.decisionBar({ ...base, unavailable: true });
  assert.deepEqual([bar.state, bar.note, bar.actions], ['unavailable', 'Decisions need your judge access code on the public demo', []]);
  bar = ds.decisionBar({ ...base, decision: 'no_action', refund: null });
  assert.deepEqual([bar.label, bar.amount, bar.tone], ['No change to the charge', null, 'neutral']);
  // A saved decision wins over a later "unavailable" (e.g. a 403 on another case).
  assert.equal(ds.decisionBar({ ...base, unavailable: true, saved: { kind: 'accepted', decision: 'partial_refund', precedentId: 'R-1' } }).state, 'accepted');
});

test('free-text agent messages keep money and distances as written', () => {
  for (const text of ['A $0.50 promo was applied.', 'The driver stopped 0.38 km away.', 'Surge x1.25 on a 0.75 km trip.']) {
    assert.equal(humanizeAgentMessage('rider_advocate', `[llm] ${text}`, null), text);
  }
});

test('override choices: no compensation, never needs review, a partial refund can change amount', () => {
  assert.deepEqual(ds.overrideChoices('partial_refund'), ['partial_refund', 'full_refund', 'no_action', 'investigate']);
  assert.deepEqual(ds.overrideChoices('no_action'), ['partial_refund', 'full_refund', 'investigate']);
  assert.deepEqual(ds.overrideChoices('needs_review'), ['partial_refund', 'full_refund', 'no_action', 'investigate']);
});

test('partial refund limits: $0.50 minimum, the fare is the cap (REF-1), 1.5x the ruling needs a second reviewer', () => {
  const check = text => ds.checkPartialAmount(text, 24.8, 6.3);
  assert.deepEqual([check('').state, check('abc').state, check('0.20').state], ['empty', 'empty', 'low']);
  assert.equal(check('30').state, 'high');
  assert.match(check('30').message, /\$24\.80 fare charged \(rule REF-1\)/);
  assert.deepEqual([check('8').state, check('8').value], ['ok', 8]);
  assert.deepEqual([check('9.45').state, check('9.46').state], ['ok', 'second']);
  assert.equal(check('$24.80').state, 'second');
  // No refund in the ruling: $10 (the auto-resolve cap), so a $0 ruling can't become a big refund alone.
  assert.deepEqual([ds.checkPartialAmount('10', 24.8, null).state, ds.checkPartialAmount('10.01', 24.8, null).state], ['ok', 'second']);
  assert.match(ds.checkPartialAmount('20', 24.8, null).message, /More than \$10\.00 when the ruling gives no refund/);
  assert.deepEqual([ds.secondApprovalLimit(6.3), ds.secondApprovalLimit(null), ds.secondApprovalLimit(0)], [9.45, 10, 10]);
});

test('override form: what blocks confirming, in order', () => {
  const ok = ds.checkPartialAmount('8', 24.8, 6.3);
  const reason = 'The chat shows the driver agreed to wait.';
  assert.match(ds.overrideError({ choice: null, check: null, reason, amount: null }), /Choose what should happen/);
  assert.match(ds.overrideError({ choice: 'partial_refund', check: null, reason, amount: ds.checkPartialAmount('', 24.8, 6.3) }), /Enter the refund amount/);
  assert.match(ds.overrideError({ choice: 'investigate', check: null, reason, amount: null }), /what needs checking/);
  assert.match(ds.overrideError({ choice: 'no_action', check: null, reason: 'short', amount: null }), /at least \d+ characters/);
  assert.equal(ds.overrideError({ choice: 'partial_refund', check: null, reason, amount: ok }), null);
  assert.equal(ds.overrideError({ choice: 'investigate', check: 'Safety concern', reason, amount: null }), null);
});

test('decision lines and the bar while a case is on hold', () => {
  assert.equal(ds.rulingLine('partial_refund', 6.3), '$6.30 back to the rider');
  assert.equal(ds.rulingLine('no_action', null), 'No change to the charge');
  assert.equal(ds.overrideLine('partial_refund', 8, 24.8), '$8.00 back to the rider');
  assert.equal(ds.overrideLine('full_refund', null, 24.8), '$24.80 back to the rider');
  const hold = { disputeId: 'D001', why: 'Safety concern', reason: 'Check the chat.', amount: null, at: '14:02' };
  const bar = ds.decisionBar({ decision: 'partial_refund', refund: 6.3, busy: false, saved: null, unavailable: false, hold });
  assert.deepEqual([bar.state, bar.tone, bar.actions.length], ['held', 'warn', 0]);
  assert.equal(bar.note, 'On hold for a second reviewer · Safety concern');
});

test('the limit follows the amount, not the button: a full refund above it needs a second reviewer too', () => {
  // D007: ruling proposes $6.90, so one reviewer may give up to $10.35; the full fare is $21.90.
  const full = ds.overrideAmountCheck('full_refund', '', 21.9, 6.9);
  assert.deepEqual([full.value, full.state], [21.9, 'second']);
  assert.match(full.message, /More than 1\.5× the ruling's \$6\.90/);
  assert.equal(ds.overrideAmountCheck('full_refund', '', 8, 6.9).state, 'ok', 'a small fare stays within the limit');
  assert.equal(ds.overrideAmountCheck('full_refund', '', 24.8, null).state, 'second', 'no refund in the ruling: $10 cap');
  assert.equal(ds.overrideAmountCheck('partial_refund', '12', 21.9, 6.9).state, 'second');
  assert.equal(ds.overrideAmountCheck('no_action', '', 21.9, 6.9), null, 'giving less back never needs a second reviewer');
  assert.equal(ds.overrideAmountCheck('investigate', '', 21.9, 6.9), null);
});

test('the sticky decision bar steps aside once enough of the decision panel is on screen', () => {
  assert.equal(ds.panelShowing(475, 697, 900), true);
  assert.equal(ds.panelShowing(1430, 1652, 900), false);
  assert.equal(ds.panelShowing(870, 1092, 900), false);
  assert.equal(ds.panelShowing(860, 1082, 900), true);
  assert.equal(ds.panelShowing(-300, -100, 900), false);
  assert.equal(ds.panelShowing(0, 0, 900), false);
});
