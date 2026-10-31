// The AI Review queue: its order, its three lists, the button's label and the honest note.
import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';

const q = await load('caseQueue');
const hs = await load('homeState');
const ad = await load('agentDisplay');
const cb = await load('caseBrief');
const presentation = await load('presentation');

const row = (id, status, raisedAt, tier = null) => ({ id, status, raisedAt, tier });

test('safety comes first, then whoever raised their dispute earliest', () => {
  const ordered = q.oldestFirst([row('new', 'decide', '2026-09-25'), row('old', 'ready', '2026-09-18'), row('threat', 'decide', '2026-09-22', 'safety')]);
  assert.deepEqual(ordered.map(r => r.id), ['threat', 'old', 'new']);
});

test('an undated case goes after every dated one', () => {
  assert.deepEqual(q.oldestFirst([row('undated', 'decide', null), row('dated', 'decide', '2026-09-30')]).map(r => r.id), ['dated', 'undated']);
});

test('each case lands in exactly one list', () => {
  const groups = q.queueGroups([row('a', 'auto'), row('b', 'closed'), row('c', 'decide'), row('d', 'ready'), row('e', 'not_run'), row('f', 'reviewed'), row('g', 'reopened'), row('h', 'appeal_waiting')]);
  assert.deepEqual(groups.resolved.map(r => r.id), ['a', 'b']);
  assert.deepEqual(groups.fresh.map(r => r.id), ['e']);
  assert.equal(groups.review.length, 5);
});

test('next case follows the order on screen, not status alone', () => {
  const rows = [row('later', 'decide', '2026-09-25'), row('earlier', 'ready', '2026-09-18'), row('done', 'auto', '2026-09-01')];
  assert.equal(q.nextCase(rows, null).id, 'earlier');
  assert.equal(q.nextCase(rows, 'earlier').id, 'later');
});

test('the button names what it will do', () => {
  assert.equal(hs.reviewButtonLabel('live', { fresh: 9 }), 'AI Review');
  assert.equal(hs.reviewButtonLabel('offline', { fresh: 9 }), 'Review with Rules');
  assert.equal(hs.reviewButtonLabel('live', { running: true, total: 9 }), 'Reviewing 9 Cases…');
  assert.equal(hs.reviewButtonLabel('offline', { running: true, total: 1 }), 'Reviewing 1 Case…');
});

test('the button stays after a review: new cases are counted, otherwise it offers a re-run', () => {
  assert.equal(hs.reviewButtonLabel('live', { fresh: 2, anyRun: true }), 'AI Review · 2 New');
  assert.equal(hs.reviewButtonLabel('offline', { fresh: 2, anyRun: true }), 'Review with Rules · 2 New');
  assert.equal(hs.reviewButtonLabel('live', { anyRun: true }), 'Re-run AI Review');
  assert.equal(hs.reviewButtonLabel('offline', { anyRun: true }), 'Re-run with Rules');
});

test('a re-run only touches cases waiting on a person with nothing saved', () => {
  const rows = ['decide', 'ready', 'reviewed', 'reopened', 'appeal_waiting', 'auto', 'closed', 'not_run'].map(status => ({ id: status, status }));
  assert.deepEqual(hs.rerunnable(rows, []).map(r => r.id), ['decide', 'ready']);
  assert.deepEqual(hs.rerunnable(rows, ['decide']).map(r => r.id), ['ready']);
});

test('the resolved fold holds for the tab and survives blocked storage', () => {
  const map = new Map();
  const storage = { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
  assert.equal(hs.readFolded(storage), false);
  hs.writeFolded(storage, true);
  assert.equal(hs.readFolded(storage), true);
  assert.equal(hs.readFolded(null), false);
  assert.doesNotThrow(() => hs.writeFolded({ setItem() { throw new Error('blocked'); } }, true));
});

test('the note appears only when the review did not use AI throughout', () => {
  assert.equal(hs.reviewNote('live', 9, 0), null);
  assert.equal(hs.reviewNote('live', 9, 2), '2 cases used template text because AI was unavailable.');
  assert.equal(hs.reviewNote('live', 9, 1), '1 case used template text because AI was unavailable.');
  assert.equal(hs.reviewNote('offline', 9, 9), 'AI is off: arguments use template text.');
  assert.equal(hs.reviewNote('live', 0, 0), null);
});

test('tiles split attention from policy and leave out new and closed cases', () => {
  assert.deepEqual(hs.reviewTiles([{ status: 'decide' }, { status: 'ready' }, { status: 'auto' }, { status: 'not_run' }, { status: 'closed' }]), { attention: 2, policy: 1 });
});

test('dates read as written, and bad ones show nothing', () => {
  assert.equal(hs.shortDate('2026-09-02'), '2 Sep');
  assert.equal(hs.shortDate(null), null);
  assert.equal(hs.shortDate('soon'), null);
  assert.equal(hs.shortDate('2026-13-01'), null);
  assert.equal(hs.todayIso(new Date(2026, 9, 3)), '2026-10-03');
});

test('a reply round that produced nothing never reads as answered', () => {
  const entry = { agent: 'rider_rebuttal', status: 'completed', message: '[fallback] x', duration_ms: 1 };
  assert.equal(ad.agentLineParts(entry, { rider_case: { source: 'fallback', rebuttal: null } }).action, 'No reply was generated for the rider');
  assert.match(ad.agentLineParts(entry, { rider_case: { source: 'llm', rebuttal: { text: 'Reply', source: 'llm' } } }).action, /^Answered/);
});

test('switched-off AI is not reported as a failure', () => {
  const result = { decision: 'no_action', risk: {}, explanation_source: 'fallback', rider_case: { source: 'fallback' }, driver_case: { source: 'fallback' } };
  assert.ok(cb.usedFallback(result));
  assert.ok(cb.checksBeforeDeciding(result).some(line => /fallback template/.test(line)));
  assert.ok(cb.checksBeforeDeciding(result, true).includes('AI is off: this case uses template text.'));
});

test('why it is here gives the reason without the ruling', () => {
  const triage = reasons => ({ triage: { tier: 'safety', score: 94, reasons } });
  assert.equal(cb.whyHere({}, triage(['Threatening message in chat (SAFE-1)', 'High bad-faith risk (FRAUD-1)', '$6.90 proposed refund at stake'])),
    'Threatening message in chat · High bad-faith risk');
  assert.equal(cb.whyHere({}, triage(['Arrival or waiting evidence missing (NS-4)', 'Confidence 40%'])), 'Arrival or waiting evidence missing');
});

test('why it is here: nothing to say on a case the policy closes, a plain line when no reason is left', () => {
  assert.equal(cb.whyHere({}, { autonomy: { eligible: true, audit: false } }), null);
  assert.equal(cb.whyHere({}, { autonomy: { eligible: true, audit: true } }), 'Selected for a spot check');
  assert.equal(cb.whyHere({}, { autonomy: { eligible: false }, triage: { reasons: [] } }), 'Needs a person to confirm');
});

test('before a run only a threat can be known', () => {
  assert.equal(cb.whyHere({ safety_flag: true }), 'Threatening message in chat');
  assert.equal(cb.whyHere({ safety_flag: false }), null);
});

test('the brief shows the whole claim and says when the driver gave no statement', () => {
  const claim = 'A long claim '.repeat(30).trim();
  const rows = cb.caseBriefRows({ type: 'route_deviation', rider_claim: claim, driver_statement: null, trip: {}, fare: {} });
  assert.equal(rows.find(row => row.label === 'Rider says').truncate, undefined);
  assert.equal(rows.find(row => row.label === 'Driver says').text, 'No statement provided');
});

test('title case keeps small words low, except first and last, and leaves hyphens and units alone', () => {
  const { titleCase } = presentation;
  assert.equal(titleCase('threat in chat'), 'Threat in Chat');
  assert.equal(titleCase('6-min stop, long detour'), '6-min Stop, Long Detour');
  assert.equal(titleCase('in plain words'), 'In Plain Words');
  assert.equal(titleCase('rule they rely on'), 'Rule They Rely On');
  assert.equal(titleCase('driver stopped 378 m away'), 'Driver Stopped 378 m Away');
  assert.equal(titleCase("organisers' case: lobby no-show"), "Organisers' Case: Lobby No-show");
  assert.equal(titleCase('re-run AI review'), 'Re-run AI Review');
});

test('AI Review says what it will do first: the cost, and that routine cases close', () => {
  const live = hs.reviewConfirm('live', { count: 9, fresh: true });
  assert.equal(live.title, 'Review 9 cases with Hy3?');
  assert.match(live.body, /^Uses AI tokens, up to about \$0\.02\./);
  assert.match(live.body, /Routine cases will close automatically and notify the rider and driver/);
  assert.equal(live.action, 'Run AI Review');
  const off = hs.reviewConfirm('offline', { count: 1, fresh: true });
  assert.equal(off.title, 'Review 1 case with rules only?');
  assert.match(off.body, /^No AI and no cost\./);
  assert.match(off.body, /close automatically/);
  assert.equal(off.action, 'Review with Rules');
});

test('a re-run warns about the cost but not closing, and never rounds a cost down to nothing', () => {
  const rerun = hs.reviewConfirm('live', { count: 1, fresh: false });
  assert.equal(rerun.title, 'Re-run the 1 open case?');
  assert.match(rerun.body, /up to about \$0\.01/);
  assert.match(rerun.body, /Resolved cases and saved decisions stay as they are/);
  assert.doesNotMatch(rerun.body, /close automatically/);
  assert.equal(rerun.action, 'Re-run');
  assert.match(hs.reviewConfirm('offline', { count: 3, fresh: false }).body, /^No AI and no cost\./);
});

