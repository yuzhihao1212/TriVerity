import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';

const { nextAfterClose } = await load('homeState');
const { START_HERE } = await load('caseQueue');
const { createReviewTiming, REVIEW_OPENED_KEY, reviewedIn } = await load('reviewProgress');
const { AGENT_OPEN_KEY, readDetailOpen, writeDetailOpen } = await load('detailDisclosure');
const { AUDIT_OPEN_KEY } = await load('collectionStory');
const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};
const rows = [
  { id: 'urgent', status: 'decide' }, { id: 'D007', status: 'not_run' },
  { id: 'D001', status: 'closed' }, { id: 'D006', status: 'not_run' },
];

test('after closing a guided case, follow guided order before the urgent queue', () => {
  const next = nextAfterClose(rows, 'D001');
  assert.equal(next.row.id, 'D006');
  assert.equal(next.label, `Next: Case 2 · ${START_HERE[1].title} →`);
  const third = nextAfterClose(rows, 'D006');
  assert.equal(third.row.id, 'D007');
  assert.equal(third.label, `Next: Case 3 · ${START_HERE[2].title} →`);
});

test('skip closed or unavailable guided cases and fall back after the last guided case', () => {
  const closedSecond = rows.map(row => row.id === 'D006' ? { ...row, status: 'closed' } : row);
  assert.equal(nextAfterClose(closedSecond, 'D001').row.id, 'D007');
  assert.equal(nextAfterClose(rows.filter(row => row.id !== 'D006'), 'D001').row.id, 'D007');
  assert.equal(nextAfterClose(rows, 'D007').row.id, 'urgent');
  assert.equal(nextAfterClose(rows.map(row => ({ ...row, status: 'closed' })), 'D001'), null);
});

test('non-guided cases keep the normal queue order and label', () => {
  assert.deepEqual(nextAfterClose(rows, 'ordinary'), { row: rows[0], label: 'Next case: urgent →' });
  assert.equal(nextAfterClose([], 'ordinary'), null);
});

test('review duration rounds whole minutes and labels sub-minute reviews', () => {
  const start = Date.parse('2026-10-29T00:00:00Z');
  const duration = seconds => reviewedIn(start, new Date(start + seconds * 1000).toISOString());
  assert.equal(duration(0), 'Reviewed in under 1 min');
  assert.equal(duration(59), 'Reviewed in under 1 min');
  assert.equal(duration(60), 'Reviewed in 1 min');
  assert.equal(duration(89), 'Reviewed in 1 min');
  assert.equal(duration(90), 'Reviewed in 2 min');
  assert.equal(duration(210), 'Reviewed in 4 min');
  assert.equal(reviewedIn(null, new Date(start).toISOString()), null);
  assert.equal(reviewedIn(start, undefined), null);
  assert.equal(reviewedIn(start, '08:12'), null);
  assert.equal(reviewedIn(start, 'invalid'), null);
  assert.equal(reviewedIn(NaN, new Date(start).toISOString()), null);
  assert.equal(duration(-1), null);
  assert.equal(duration(60 * 60), 'Reviewed in 60 min');
  assert.equal(duration(60 * 60 + 60), null, 'not one sitting: omitted');
  assert.equal(duration(3 * 24 * 3600), null, 'opened days earlier: omitted');
});

test('first-open timing survives remounts, stays per ruling, and does not restart on a visit', () => {
  const saved = storage();
  const first = createReviewTiming(saved);
  assert.equal(first.openedAt('D001|run-1'), null);
  assert.equal(first.markOpened('D001|run-1', 1000), 1000);
  assert.equal(first.markOpened('D001|run-1', 9000), 1000);
  const remounted = createReviewTiming(saved);
  assert.equal(remounted.openedAt('D001|run-1'), 1000);
  assert.equal(remounted.markOpened('D001|run-2', 15000), 15000);
  assert.equal(remounted.openedAt('D006|run-1'), null);
});

test('timing omits unknown starts when storage is absent, blocked, full, or corrupt', () => {
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  const full = { getItem: () => null, setItem() { throw Error('full'); } };
  const corrupt = storage();
  corrupt.setItem(REVIEW_OPENED_KEY, '{bad');
  for (const backend of [null, blocked, full, corrupt]) {
    const timing = createReviewTiming(backend);
    assert.equal(timing.markOpened('case', 1000), null);
    assert.equal(timing.openedAt('case'), null);
    assert.equal(reviewedIn(timing.openedAt('case'), new Date(90000).toISOString()), null);
  }
});

test('both detail toggles start folded, remember explicit open/closed choices, and survive storage errors', () => {
  const saved = storage();
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  for (const key of [AGENT_OPEN_KEY, AUDIT_OPEN_KEY]) {
    assert.equal(readDetailOpen(key, saved), false);
    writeDetailOpen(key, true, saved);
    assert.equal(readDetailOpen(key, saved), true);
    writeDetailOpen(key, false, saved);
    assert.equal(readDetailOpen(key, saved), false);
    saved.setItem(key, 'invalid');
    assert.equal(readDetailOpen(key, saved), false);
    assert.equal(readDetailOpen(key, blocked), false);
    assert.doesNotThrow(() => writeDetailOpen(key, true, blocked));
    assert.equal(readDetailOpen(key), false);
    assert.doesNotThrow(() => writeDetailOpen(key, true));
  }
  writeDetailOpen(AGENT_OPEN_KEY, true, saved);
  assert.equal(readDetailOpen(AUDIT_OPEN_KEY, saved), false, 'the two choices are independent');
});
