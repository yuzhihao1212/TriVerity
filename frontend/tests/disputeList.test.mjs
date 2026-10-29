import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

// disputeList.ts re-exports decisionTone from outcomeTone.ts: transpile both and link them.
const transpile = async (file, replace = {}) => {
  let { outputText } = ts.transpileModule(await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  for (const [from, to] of Object.entries(replace)) outputText = outputText.replaceAll(`from "${from}"`, `from "${to}"`);
  return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
};
const dl = await import(await transpile('disputeList.ts', { './outcomeTone': await transpile('outcomeTone.ts') }));

test('category groups count cases, preserve queue order and do not mutate input', () => {
  const cases = [
    { id: 'N2', type: 'no_show_charge' }, { id: 'R3', type: 'route_deviation' },
    { id: 'R1', type: 'route_deviation' }, { id: 'N1', type: 'no_show_charge' },
    { id: 'R2', type: 'route_deviation' },
  ];
  const before = structuredClone(cases);
  const groups = dl.groupByCategory(cases);
  assert.deepEqual(groups.map(({ label, count }) => [label, count]), [['Route', 3], ['No-show', 2]]);
  assert.deepEqual(groups.map(group => group.items.map(item => item.id)), [['R3', 'R1', 'R2'], ['N2', 'N1']]);
  assert.deepEqual(cases, before);
  for (const type of ['route_deviation', 'no_show_charge']) {
    const filtered = dl.groupByCategory(cases, type);
    assert.equal(filtered.length, 1);
    assert.ok(filtered[0].items.every(item => item.type === type));
  }
});

test('unknown dispute types share Other; empty categories and queues are omitted', () => {
  const cases = [{ type: 'unknown', id: 'X' }, { type: 'route_deviation', id: 'R' }, { type: 'toString', id: 'Y' }];
  const groups = dl.groupByCategory(cases);
  assert.deepEqual(groups.map(group => [group.label, group.count]), [['Route', 1], ['Other', 2]]);
  assert.deepEqual(groups[1].items.map(item => item.id), ['X', 'Y']);
  assert.deepEqual(dl.groupByCategory([]), []);
  assert.deepEqual(dl.groupByCategory(cases, 'no_show_charge'), []);
});

test('decisionTone: refunds and compensation ok, escalation warn, no action neutral', () => {
  assert.equal(dl.decisionTone('partial_refund'), 'ok');
  assert.equal(dl.decisionTone('full_refund'), 'ok');
  assert.equal(dl.decisionTone('compensation'), 'ok');
  assert.equal(dl.decisionTone('needs_review'), 'warn');
  assert.equal(dl.decisionTone('no_action'), 'neutral');
  // Every decision has a short visible label, so status is never colour alone.
  for (const decision of ['partial_refund', 'full_refund', 'compensation', 'needs_review', 'no_action']) assert.ok(dl.STATUS_LABELS[decision]);
  assert.equal(dl.STATUS_LABELS.needs_review, 'Escalated');
});

test('filter labels: short for the chip, long for the menu and names', () => {
  assert.equal(dl.filterShortLabel('route_deviation'), 'Route');
  assert.equal(dl.filterShortLabel('no_show_charge'), 'No-show');
  assert.equal(dl.filterShortLabel('all'), null);
  assert.equal(dl.filterLabel('route_deviation'), 'Route deviation');
  assert.equal(dl.filterLabel('no_show_charge'), 'No-show charge');
  assert.equal(dl.filterLabel('all'), 'All disputes');
  assert.equal(dl.filterLabel('bogus'), 'All disputes');
  assert.equal(dl.filterButtonLabel('all'), 'Filter disputes');
  assert.equal(dl.filterButtonLabel('route_deviation'), 'Filter disputes: Route deviation');
  assert.deepEqual(dl.FILTER_OPTIONS.map(o => o.label), ['All disputes', 'Route deviation', 'No-show charge']);
  assert.equal(dl.isFilter('no_show_charge'), true);
  assert.equal(dl.isFilter('toString'), false);
});

test('the item name keeps the type and status audible', () => {
  const d001 = { dispute_id: 'D001', type: 'route_deviation' };
  assert.equal(dl.disputeItemName(d001, '6-min stop, long detour'), 'D001, Route deviation: 6-min stop, long detour');
  assert.equal(dl.disputeItemName(d001, '6-min stop, long detour', 'partial_refund'), 'D001, Route deviation: 6-min stop, long detour. Ruling: Partial refund');
  assert.equal(dl.disputeItemName({ dispute_id: 'D002', type: 'no_show_charge' }, 'Wait time missing', 'needs_review'), 'D002, No-show charge: Wait time missing. Ruling: Escalated');
  assert.equal(dl.disputeItemName({ dispute_id: 'X', type: 'new_type' }, 'S'), 'X, new_type: S');
});

test('menu keyboard: arrows wrap, Home and End jump, other keys keep the index', () => {
  assert.equal(dl.menuIndex(0, 'ArrowDown', 3), 1);
  assert.equal(dl.menuIndex(2, 'ArrowDown', 3), 0);
  assert.equal(dl.menuIndex(0, 'ArrowUp', 3), 2);
  assert.equal(dl.menuIndex(1, 'Home', 3), 0);
  assert.equal(dl.menuIndex(0, 'End', 3), 2);
  assert.equal(dl.menuIndex(-1, 'ArrowDown', 3), 0, 'from no focus, down goes to the first item');
  assert.equal(dl.menuIndex(1, 'x', 3), 1);
  assert.equal(dl.menuIndex(0, 'ArrowDown', 0), -1);
});
