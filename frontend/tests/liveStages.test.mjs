import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';

const s = await load('liveStages');
const states = stages => stages.map(stage => `${stage.id}:${stage.state}`);

test('the nine agents fall into four stages in run order', () => {
  assert.deepEqual(s.LIVE_STAGES.map(stage => stage.title), ['Gather the Evidence', 'Argue Both Sides', 'Answer Each Other', 'Check the Policy']);
  assert.equal(s.LIVE_STAGES.flatMap(stage => stage.agents).length, 9);
});

test('a stage is done when all its agents finish, active once one starts, else pending', () => {
  const fresh = s.liveStages({ finished: new Set(), running: ['evidence_loader'] });
  assert.deepEqual(states(fresh), ['gather:active', 'argue:pending', 'answer:pending', 'decide:pending']);
  const mid = s.liveStages({
    finished: new Set(['evidence_loader', 'evidence_collector', 'fraud_detector', 'rider_advocate', 'driver_advocate']),
    running: ['rider_rebuttal', 'driver_rebuttal'],
  });
  assert.deepEqual(states(mid), ['gather:done', 'argue:done', 'answer:active', 'decide:pending']);
  // One advocate finished, the other still running: the stage stays active.
  const partial = s.liveStages({ finished: new Set(['evidence_loader', 'evidence_collector', 'rider_advocate']), running: ['driver_advocate', 'fraud_detector'] });
  assert.equal(partial[1].state, 'active');
});

test('stage times are wall time since the previous stage ended, never invented', () => {
  const finished = new Set(['evidence_loader', 'evidence_collector', 'fraud_detector', 'rider_advocate', 'driver_advocate']);
  const stages = s.liveStages({ finished, running: [], finishedAt: {
    evidence_loader: 0.05, evidence_collector: 4.9, fraud_detector: 4.95, rider_advocate: 7.6, driver_advocate: 7.8 } });
  assert.deepEqual(stages.map(stage => stage.time), ['4.9 s', '2.9 s', null, null]);
  const instant = s.liveStages({ finished: new Set(['evidence_loader', 'evidence_collector']), running: [], finishedAt: { evidence_loader: 0.01, evidence_collector: 0.05 } });
  assert.equal(instant[0].time, 'instant');
  // A missing receipt time (standard resolve) shows no time rather than a guess.
  assert.equal(s.liveStages({ finished: new Set(['evidence_loader', 'evidence_collector']), running: [] })[0].time, null);
});

test('the headline says what is happening now and never names an outcome', () => {
  const mid = s.liveStages({ finished: new Set(['evidence_loader', 'evidence_collector']), running: ['rider_advocate'] });
  assert.equal(s.liveHeadline(mid, { complete: false, connecting: false }), 'Arguing both sides…');
  assert.equal(s.liveHeadline(mid, { complete: false, connecting: true }), 'Connecting to the agents…');
  assert.equal(s.liveHeadline(mid, { complete: true, connecting: false }), 'All agents finished');
  const all = s.liveStages({ finished: new Set(s.LIVE_STAGES.flatMap(stage => stage.agents)), running: [] });
  for (const text of [...all.map(stage => stage.live), s.liveHeadline(all, { complete: false, connecting: false })]) {
    assert.doesNotMatch(text, /refund|uphold|upheld|approved|denied|compensation/i);
  }
});
