import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

// factVisuals.ts imports only a type from presentation.ts, which transpiling erases.
const source = await readFile(new URL('../src/factVisuals.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const fv = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const { factParts, factTone, groupFacts, fareReceipt, centsToMoney, parseRouteCoverage, parseStop, parseTile, parseChat, displaySource } = fv;

const raw = parts => parts.map(part => part.kind === 'text' ? part.text : part.raw).join('');
const values = parts => parts.filter(part => part.kind === 'value').map(part => [part.text, part.value, part.tone]);

const EXAMPLES = {
  'Route was +44% vs expected distance': ['warn', [['+44%', 'percent', 'warn']]],
  'Trip took +59% vs expected duration': ['warn', [['+59%', 'percent', 'warn']]],
  'GPS path 14.7 km over 36 points (+44% vs expected)': ['warn', [['14.7 km', 'distance', 'neutral'], ['+44%', 'percent', 'warn']]],
  'GPS within 150 m of the planned route for 8 of 36 points': ['neutral', [['150 m', 'distance', 'neutral']]],
  'Unexpected stop: 6 min at 08:14': ['warn', [['6 min', 'minutes', 'warn'], ['08:14', 'clock', 'neutral']]],
  'GPS unexpected stops total 6 min': ['warn', [['6 min', 'minutes', 'warn']]],
  'GPS stop: 6 min from 08:14': ['warn', [['6 min', 'minutes', 'warn'], ['08:14', 'clock', 'neutral']]],
  'Fare was +6.30 vs expected fare': ['warn', [['+$6.30', 'money', 'warn']]],
  'Fare breakdown matches the charged fare': ['ok', []],
  'Fare line: Base fare $3.10': ['neutral', [['$3.10', 'money', 'neutral']]],
  'Driver contacted rider via in-app chat': ['ok', []],
};

test('factParts finds the values and tone of every example sentence, losing no text', () => {
  for (const [text, [tone, expected]] of Object.entries(EXAMPLES)) {
    const result = factParts(text);
    assert.equal(result.tone, tone, text);
    assert.equal(factTone(text), tone, text);
    assert.deepEqual(values(result.parts), expected, text);
    assert.equal(raw(result.parts), text, `round-trips: ${text}`);
  }
});

test('more backend formats: ranges, speeds, zero and negative deviations, quoted chat', () => {
  assert.deepEqual(values(factParts('Off the planned route 08:05-08:32: 11.3 km driven, up to 2,704 m away').parts),
    [['08:05-08:32', 'clock', 'neutral'], ['11.3 km', 'distance', 'neutral'], ['2,704 m', 'distance', 'neutral']]);
  assert.deepEqual(values(factParts('GPS 08:00-08:10: 9 points, moved 2.10 km, speed avg 42 km/h, max 60 km/h').parts).map(v => v[1]),
    ['clock', 'distance', 'speed', 'speed']);
  assert.equal(factTone('Route was +0% vs expected distance'), 'neutral');
  assert.equal(factTone('GPS unexpected stops total 0 min'), 'neutral');
  assert.equal(factTone('Fare was -1.20 vs expected fare'), 'neutral');
  assert.equal(factParts('Fare was -1.20 vs expected fare').parts[1].text, '-$1.20');
  const threat = 'Threatening message: driver: "Pay me $50 in 5 min or else"';
  const parsed = factParts(threat);
  assert.equal(parsed.tone, 'warn');
  assert.deepEqual(values(parsed.parts), [], 'numbers inside a quoted message are not computed values');
  assert.equal(raw(parsed.parts), threat);
});

test('an unknown sentence falls back to plain text, unchanged', () => {
  const text = 'Something new the backend may say one day';
  assert.deepEqual(factParts(text), { tone: 'neutral', parts: [{ kind: 'text', text }] });
  assert.equal(parseTile(text), null);
  assert.equal(parseStop(text), null);
  assert.equal(parseChat(text), null);
  const [group] = groupFacts([{ text, source: 'case' }]);
  assert.deepEqual(group, { primary: { text, source: 'case' }, related: [], source: 'case' });
});

const D001 = [
  { id: 'TRIP-1', source: 'trip', text: 'Route was +44% vs expected distance' },
  { id: 'TRIP-2', source: 'trip', text: 'Trip took +59% vs expected duration' },
  { source: 'case', text: 'Trip record: distance expected 10.2 km, actual 14.7 km' },
  { id: 'GPS-1', source: 'gps', text: 'GPS path 14.7 km over 36 points (+44% vs expected)' },
  { id: 'GPS-2', source: 'gps', text: 'GPS within 150 m of the planned route for 8 of 36 points' },
  { id: 'GPS-3', source: 'gps', text: 'Unexpected stop: 6 min at 08:14' },
  { id: 'GPS-4', source: 'gps', text: 'GPS unexpected stops total 6 min' },
  { source: 'gps', text: 'GPS stop: 6 min from 08:14' },
  { id: 'FARE-1', source: 'fare', text: 'Fare was +6.30 vs expected fare' },
  { source: 'fare', text: 'Fare line: Base fare $3.10' },
  { source: 'chat', text: 'Driver contacted rider via in-app chat' },
];

test('duplicates collapse into one row, and every fact stays reachable exactly once', () => {
  const groups = groupFacts(D001);
  const flattened = groups.flatMap(group => [group.primary, ...group.related]);
  assert.equal(flattened.length, D001.length);
  assert.deepEqual(new Set(flattened), new Set(D001));
  const stop = groups.find(group => group.primary.id === 'GPS-3');
  assert.deepEqual(stop.related.map(f => f.text), ['GPS stop: 6 min from 08:14', 'GPS unexpected stops total 6 min']);
  assert.equal(stop.source, 'gps');
  const distance = groups.find(group => group.primary.id === 'TRIP-1');
  assert.deepEqual(distance.related.map(f => f.text).sort(),
    ['GPS path 14.7 km over 36 points (+44% vs expected)', 'Trip record: distance expected 10.2 km, actual 14.7 km']);
  assert.equal(distance.source, 'trip');
  assert.equal(groups.find(group => group.primary.id === 'TRIP-2').related.length, 0);
  // A different percentage, or two different stops, never merge.
  assert.equal(groupFacts([D001[0], { source: 'gps', text: 'GPS path 14.7 km over 36 points (+40% vs expected)' }]).length, 2);
  const twoStops = groupFacts([{ source: 'gps', text: 'Unexpected stop: 6 min at 08:14' }, { source: 'gps', text: 'Unexpected stop: 3 min at 08:20' },
    { source: 'gps', text: 'GPS unexpected stops total 9 min' }]);
  assert.equal(twoStops.length, 3);
});

test('fare receipt: the lines sum to the charged total and the difference reads +$6.30', () => {
  const facts = [
    { source: 'fare', text: 'Fare was +6.30 vs expected fare' },
    { source: 'fare', text: 'Fare breakdown matches the charged fare' },
    { source: 'fare', text: 'Fare line: Base fare $3.10' },
    { source: 'fare', text: 'Fare line: Distance (14.7 km) $14.70' },
    { source: 'fare', text: 'Fare line: Time (35 min) $7.00' },
    { source: 'fare', text: 'Fare: surge multiplier x1' },
    { source: 'fare', text: 'Fare: charged $24.80, expected $18.50' },
  ];
  const receipt = fareReceipt(facts);
  assert.deepEqual(receipt.lines.map(line => [line.label, line.cents]), [['Base fare', 310], ['Distance (14.7 km)', 1470], ['Time (35 min)', 700]]);
  assert.equal(receipt.totalCents, 2480);
  assert.equal(centsToMoney(receipt.totalCents), '$24.80');
  assert.equal(receipt.charged.cents, receipt.totalCents);
  assert.equal(receipt.charged.expectedCents, 1850);
  assert.equal(receipt.difference.text, '+$6.30 vs expected');
  assert.equal(receipt.difference.tone, 'warn');
  assert.equal(receipt.note.ok, true);
  assert.deepEqual(receipt.others.map(f => f.text), ['Fare: surge multiplier x1']);
  // Nothing dropped.
  const used = [...receipt.lines.map(l => l.fact), receipt.charged.fact, receipt.difference.fact, receipt.note.fact, ...receipt.others];
  assert.equal(used.length, facts.length);
  const mismatch = fareReceipt([{ source: 'fare', text: 'Charged fare is +2.00 vs the itemised breakdown' }]);
  assert.equal(mismatch.note.ok, false);
  assert.equal(mismatch.totalCents, null);
  // Floating-point sums stay exact in cents.
  assert.equal(fareReceipt([{ source: 'fare', text: 'Fare line: A $0.10' }, { source: 'fare', text: 'Fare line: B $0.20' }]).totalCents, 30);
});

test('a promo discount sits between the lines and the charge, and its echoes merge', () => {
  const facts = [
    { source: 'fare', text: 'Fare line: Base fare $3.00' },
    { source: 'fare', text: 'Fare line: Distance (11.2 km) $11.20' },
    { source: 'fare', text: 'Fare line: Time (27 min) $5.40' },
    { source: 'fare', text: 'Fare line: Surge x1.2 $3.80' },
    { source: 'fare', text: 'Surge pricing applied: x1.2' },
    { source: 'fare', text: 'Promo code RYDE10 applied (1.50 off)' },
    { source: 'case', text: 'Fare: surge multiplier x1.2' },
    { source: 'case', text: 'Fare: promo RYDE10 ($1.50 off)' },
    { source: 'case', text: 'Fare: charged $21.90, expected $15.00' },
  ];
  const groups = groupFacts(facts);
  assert.equal(groups.length, facts.length - 2);
  assert.deepEqual(groups.find(g => g.primary.text.startsWith('Surge')).related.map(f => f.text), ['Fare: surge multiplier x1.2']);
  assert.deepEqual(groups.find(g => g.primary.text.startsWith('Promo')).related.map(f => f.text), ['Fare: promo RYDE10 ($1.50 off)']);
  assert.ok(groups.every(g => g.source === 'fare'));
  const receipt = fareReceipt(groups.map(g => g.primary));
  assert.deepEqual(receipt.discount && [receipt.discount.code, receipt.discount.cents], ['RYDE10', 150]);
  assert.equal(receipt.totalCents, 2340 - 150);
  assert.equal(receipt.totalCents, receipt.charged.cents);
});

test('GPS on-route percentage and stops', () => {
  assert.deepEqual(parseRouteCoverage('GPS within 150 m of the planned route for 8 of 36 points'), { meters: 150, onRoute: 8, total: 36, percent: 22 });
  assert.equal(parseRouteCoverage('GPS within 150 m of the planned route for 0 of 0 points').percent, 0);
  assert.deepEqual(parseStop('Unexpected stop: 6 min at 08:14'), { minutes: 6, time: '08:14' });
  assert.deepEqual(parseStop('Driver stopped 4 min at 08:02, 87 m from the pickup point'), { minutes: 4, time: '08:02', where: '87 m from the pickup point' });
  assert.equal(factTone('Driver stopped 4 min at 08:02, 87 m from the pickup point'), 'neutral');
});

test('trip tiles, chat bubbles and display sources', () => {
  assert.deepEqual(parseTile('Route was +44% vs expected distance'), { key: 'distance', label: 'Distance', value: '+44%', detail: 'vs expected distance', tone: 'warn' });
  assert.equal(parseTile('Driver arrived 87 m from pickup point').value, '87 m');
  assert.deepEqual(parseChat('Threatening message: driver: "I know where you live"'),
    { label: 'Threatening message', sender: 'driver', message: 'I know where you live', tone: 'warn' });
  assert.equal(parseChat('Disagreement in chat: rider: "Why this way?"').label, 'Disagreement');
  assert.equal(displaySource({ source: 'case', text: 'Trip record: no-show fee charged $4.00' }), 'trip');
  assert.equal(displaySource({ source: 'case', text: 'Rider tone: negative (1 of 1 message)' }), 'chat');
  assert.equal(displaySource({ source: 'case', text: 'App event 08:01 arrived' }), 'case');
  assert.equal(displaySource({ source: 'case', text: 'Fare: charged $24.80, expected $18.50' }), 'fare');
  assert.equal(displaySource({ source: 'case', text: 'Off the planned route 08:05-08:32: 11.3 km driven, up to 2,704 m away' }), 'gps');
  assert.equal(displaySource({ source: 'gps', text: 'Trip record: whatever' }), 'gps');
});
