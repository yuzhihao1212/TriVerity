import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';

const g = await load('firstVisitGuide');
const base = { done: false, presentation: false, running: false, canReview: true, toReview: false, aiLive: true };

test('the guide starts with running the queue, naming the button the reviewer can see', () => {
  const first = g.homeGuide(base);
  assert.deepEqual([first.step, first.target], [1, 'review']);
  assert.match(first.text, /AI Review/);
  assert.match(g.homeGuide({ ...base, aiLive: false }).text, /Review with Rules/);
});

test('once a case needs a person, the guide moves on, even with new cases left', () => {
  const next = g.homeGuide({ ...base, toReview: true });
  assert.deepEqual([next.step, next.target], [2, 'start']);
});

test('the guide stays out of the way when done, presenting, running or with nothing to do', () => {
  for (const change of [{ done: true }, { presentation: true }, { running: true }, { canReview: false }]) {
    assert.equal(g.homeGuide({ ...base, ...change }), null, JSON.stringify(change));
  }
});

test('the last step shows only on a case waiting for this reviewer to decide', () => {
  const ready = { done: false, presentation: false, hasResult: true, canDecide: true, decided: false };
  assert.equal(g.caseGuideShows(ready), true);
  for (const change of [{ done: true }, { presentation: true }, { hasResult: false }, { canDecide: false }, { decided: true }]) {
    assert.equal(g.caseGuideShows({ ...ready, ...change }), false, JSON.stringify(change));
  }
});

test('finishing the guide is remembered, and blocked storage never breaks it', () => {
  const saved = new Map();
  const store = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
  assert.equal(g.readGuideDone(store), false);
  g.writeGuideDone(store);
  assert.equal(g.readGuideDone(store), true);
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(g.readGuideDone(blocked), false);
  assert.doesNotThrow(() => g.writeGuideDone(blocked));
  assert.equal(g.readGuideDone(null), false);
});

test('the case head shrinks past Intake, but stays full during a run', () => {
  assert.equal(g.compactCaseHead('intake', false), false);
  for (const tab of ['evidence', 'hearing', 'ruling', 'notify']) assert.equal(g.compactCaseHead(tab, false), true, tab);
  assert.equal(g.compactCaseHead('ruling', true), false);
});
