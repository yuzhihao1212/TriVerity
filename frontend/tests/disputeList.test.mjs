import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/disputeList.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const dl = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

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
