import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { load } from './_load.mjs';

const h = await load('hearingDisplay');
const { RULE_SUMMARIES, ruleSummary } = await load('ruleSummaries');

test('every rule in the policy file has one plain summary, and none for rules that do not exist', async () => {
  const policy = JSON.parse(await readFile(new URL('../../data/policies/ryde_mock_policy.json', import.meta.url), 'utf8'));
  const ids = Object.values(policy).flatMap(section => section && typeof section === 'object' && section.rules ? Object.keys(section.rules) : []);
  assert.ok(ids.length >= 14);
  for (const id of ids) assert.ok(ruleSummary(id), `missing summary for ${id}`);
  assert.deepEqual(Object.keys(RULE_SUMMARIES).sort(), [...new Set(ids)].sort());
  assert.equal(ruleSummary(' rd-3 '), 'Long detour that also took longer → extra fare refunded');
});

test('no cited rule reads "None: argues from the facts."', () => {
  assert.equal(h.NO_RULE_CITED, 'None: argues from the facts.');
});

test('names, rounds and the flow follow the plain wording, and the Ruling pill names the step only', () => {
  assert.equal(h.partyHeading('rider'), 'For the Rider');
  assert.equal(h.partyHeading('driver'), 'For the Driver');
  assert.equal(h.partyHeading('rider', true), "Rider's Reply");
  assert.equal(h.partyHeading('driver', true), "Driver's Reply");
  assert.equal(h.HEARING_ROUNDS.opening.title, '1 · Each Side Makes Its Case');
  assert.equal(h.HEARING_ROUNDS.replies.title, '2 · Each Side Replies');
  assert.deepEqual(h.HEARING_STEPS.map(step => [step.label, step.done]),
    [['Each Side Makes Its Case', true], ['Each Side Replies', true], ['Ruling: The Rules Decide', false]]);
  assert.equal(h.RULE_CHECK_LABELS.supports, 'Rule check: applies to these facts');
  assert.equal(h.RULE_CHECK_LABELS.does_not_apply, 'Rule check: does not apply');
});

test('a reply opens with the other side\'s bottom line, without its citation codes', () => {
  const driver = 'Traffic on the usual road made the detour faster (TRIP-2, GPS-1). The rider agreed at the time (CHAT-2).';
  assert.equal(h.replyQuote('driver', driver), 'Answering the driver: “Traffic on the usual road made the detour faster.”');
  assert.equal(h.replyQuote('rider', ''), null);
});

test('citation codes become markers; the words around them stay the AI\'s own', () => {
  const parts = h.citationParts('The route was 44% longer (TRIP-1, GPS-1) and CHAT-2 shows it.');
  assert.deepEqual(parts, [
    { text: 'The route was 44% longer' }, { ids: ['TRIP-1', 'GPS-1'] }, { text: ' and ' }, { ids: ['CHAT-2'] }, { text: ' shows it.' },
  ]);
  assert.deepEqual(h.citationParts('No codes here.'), [{ text: 'No codes here.' }]);
  assert.equal(h.withoutCitations('Longer (TRIP-1; GPS-2) route.'), 'Longer route.');
});

test('each fact appears once per card, the facts the argument names first', () => {
  const texts = ['Route was +44% vs expected distance', 'Trip took +59% vs expected duration', 'Route was +44% vs expected distance', 'Rider tone: negative'];
  const ids = ['TRIP-1', 'TRIP-2', 'TRIP-1', 'CHAT-3'];
  const facts = h.cardFacts(texts, ids, 'It took longer (TRIP-2).');
  assert.deepEqual(facts.map(fact => fact.id), ['TRIP-2', 'TRIP-1', 'CHAT-3']);
  assert.equal(new Set(facts.map(fact => fact.id)).size, facts.length);
  assert.equal(facts[1].text, 'Route 44% longer than expected');
  // Without aligned IDs, duplicates merge by text and no ID is guessed.
  const loose = h.cardFacts(['A claim', 'A claim', 'Another'], ['TRIP-1'], '');
  assert.deepEqual(loose.map(fact => [fact.id, fact.text]), [[null, 'A claim'], [null, 'Another']]);
});

test('"Only the rider cites this" marks facts the other side did not cite', () => {
  const other = { texts: ['Route was +44% vs expected distance'], ids: ['TRIP-1'] };
  const facts = h.cardFacts(['Route was +44% vs expected distance', 'Rider tone: negative'], ['TRIP-1', 'CHAT-3'], '', other);
  assert.deepEqual(facts.map(fact => [fact.id, fact.only]), [['TRIP-1', false], ['CHAT-3', true]]);
  assert.ok(h.cardFacts(['x'], ['TRIP-1'], '').every(fact => !fact.only));
});

test('a folded card still shows a rule that does not help, and facts only it cites and argues', () => {
  const fact = (id, only) => ({ id, text: `Fact ${id}`, icon: 'info', only });
  const flags = h.cardFlags('rider', [{ rule: 'NS-2', verdict: 'does_not_apply' }, { rule: 'NS-3', verdict: 'supports' }, { rule: 'NS-1', verdict: 'favours_other_side' }],
    [fact('HIST-1', true), fact('CHAT-1', true), fact('FARE-1', true), fact('GPS-1', true), fact('TRIP-1', false)], 'History (HIST-1), no contact (CHAT-1), fare (FARE-1), trip (TRIP-1).');
  assert.deepEqual(flags, [
    { kind: 'rule', rule: 'NS-2', text: 'does not apply to these facts' },
    { kind: 'rule', rule: 'NS-1', text: 'favours the other side' },
    { kind: 'fact', text: 'Only the rider cites: Fact CHAT-1' },
  ]);
});

test('the fold label says what is inside, and there is no fold with nothing in it', () => {
  assert.equal(h.cardFoldLabel('Argument', true, 4, 2), 'Full Argument and Evidence · 4 Facts · 2 Rules');
  assert.equal(h.cardFoldLabel('Reply', true, 1), 'Full Reply and Evidence · 1 Fact');
  assert.equal(h.cardFoldLabel('Reply', true, 0), 'Full Reply');
  assert.equal(h.cardFoldLabel('Argument', false, 2, 1), 'Evidence · 2 Facts · 1 Rule');
  assert.equal(h.cardFoldLabel('Argument', false, 0, 0), null);
  assert.equal(h.replyLabel('driver'), "Answering the Driver's Point");
});

