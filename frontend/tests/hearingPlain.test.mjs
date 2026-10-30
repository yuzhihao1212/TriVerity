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
  assert.equal(h.partyHeading('rider'), 'For the rider');
  assert.equal(h.partyHeading('driver'), 'For the driver');
  assert.equal(h.partyHeading('rider', true), "Rider's reply");
  assert.equal(h.partyHeading('driver', true), "Driver's reply");
  assert.equal(h.HEARING_ROUNDS.opening.title, '1 · Each side makes its case');
  assert.equal(h.HEARING_ROUNDS.replies.title, '2 · Each side replies');
  assert.deepEqual(h.HEARING_STEPS.map(step => [step.label, step.done]),
    [['Each side makes its case', true], ['Each side replies', true], ['Ruling: the rules decide', false]]);
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
