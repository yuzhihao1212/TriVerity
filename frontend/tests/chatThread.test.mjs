import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';

const c = await load('chatThread');
const d001 = [
  { sender: 'rider', timestamp: '2026-09-20T08:12:00+08:00', message: 'Why are we going this way? This is the wrong direction.' },
  { sender: 'driver', timestamp: '2026-09-20T08:12:30+08:00', message: 'Traffic on the usual road, this is faster.' },
];
const d001Facts = [
  { id: 'CHAT-1', text: 'Driver contacted rider via in-app chat' },
  { id: 'CHAT-2', text: 'Disagreement in chat: rider: "Why are we going this way? This is the wrong direction."' },
  { id: 'CHAT-3', text: 'Rider tone: negative (1 of 1 message)' },
  { id: 'CHAT-4', text: 'Driver tone: neutral (1 of 1 message)' },
];

test('the summary sentence comes from the case\'s own messages and chat checks', () => {
  assert.equal(c.chatSummary(d001, d001Facts), 'The rider objected at 08:12; the driver replied: “Traffic on the usual road, this is faster.”');
  const d006 = [
    { sender: 'driver', timestamp: '2026-09-21T19:02:00+08:00', message: "I've arrived at the pickup point." },
    { sender: 'driver', timestamp: '2026-09-21T19:06:00+08:00', message: 'Still waiting, are you coming?' },
    { sender: 'rider', timestamp: '2026-09-21T19:07:00+08:00', message: 'Ok, 5 more minutes.' },
  ];
  assert.equal(c.chatSummary(d006, [{ text: 'Agreement in chat: rider: "Ok, 5 more minutes."' }]),
    'The driver messaged twice; the rider agreed at 19:07: “Ok, 5 more minutes.”');
  assert.equal(c.chatSummary(d001.slice(0, 1), d001Facts.slice(1, 2)), 'The rider objected at 08:12; the driver did not reply in the chat.');
  const threat = [{ sender: 'driver', timestamp: '2026-09-22T22:41:00+08:00', message: "Complain and you'll regret it." }];
  assert.equal(c.chatSummary(threat, [{ text: 'Threatening message: driver: "Complain and you\'ll regret it."' }]), 'A driver message at 22:41 was flagged as threatening.');
  // Nothing to add beyond the messages: the card keeps its existing line.
  assert.equal(c.chatSummary(d001, [{ text: 'Driver contacted rider via in-app chat' }]), null);
});

test('the fold line counts every chat fact', () => {
  assert.equal(c.showFactsLabel(4, false), 'Show 4 Facts');
  assert.equal(c.showFactsLabel(1, false), 'Show 1 Fact');
  assert.equal(c.showFactsLabel(4, true), 'Hide 4 Facts');
});

test('tone chips come from the real tone facts, and none appear without them', () => {
  assert.deepEqual(c.toneChips(d001Facts).map(chip => chip.label), ['rider negative', 'driver neutral']);
  assert.deepEqual(c.toneChips([{ text: 'Driver tone: neutral (5 of 5 messages)' }]).map(chip => chip.label), ['driver neutral']);
  assert.deepEqual(c.toneChips(d001Facts.slice(0, 2)), []);
});

test('opened rows: contact, the disagreement pointing at its message, then each tone', () => {
  const rows = c.chatFactRows([d001Facts[3], d001Facts[2], d001Facts[1], d001Facts[0]], d001);
  assert.deepEqual(rows.map(row => [row.fact.id, row.label]), [['CHAT-1', 'Contact'], ['CHAT-2', 'Disagreement'], ['CHAT-3', 'Rider tone'], ['CHAT-4', 'Driver tone']]);
  assert.equal(rows[1].text, null);
  assert.equal(rows[1].messageIndex, 0);
  assert.equal(rows[1].messageLabel, "The rider's message at 08:12");
  assert.deepEqual(rows[2].tone, { value: 'negative', detail: '1 of 1 message' });
  // A quoted message that isn't in the thread is shown as text, never dropped.
  const missing = c.chatFactRows([d001Facts[1]], []);
  assert.match(missing[0].text, /wrong direction/);
});

test('a CHAT citation opens the fold only for its own facts; a click toggles it', () => {
  const ids = ['CHAT-1', 'CHAT-2', 'CHAT-3', 'CHAT-4'];
  assert.equal(c.foldOpenAfter(false, { type: 'reveal', id: 'CHAT-3' }, ids), true);
  assert.equal(c.foldOpenAfter(false, { type: 'reveal', id: 'TRIP-1' }, ids), false);
  assert.equal(c.foldOpenAfter(true, { type: 'reveal', id: 'TRIP-1' }, ids), true);
  assert.equal(c.foldOpenAfter(false, { type: 'toggle' }, ids), true);
  assert.equal(c.foldOpenAfter(true, { type: 'toggle' }, ids), false);
});
