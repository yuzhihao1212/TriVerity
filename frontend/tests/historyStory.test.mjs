import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';
const { historyLine, historySentence, parseHistory } = await load('historyStory');

test('History option B uses one line per party in the same measure order', () => {
  const rider = parseHistory('Rider history: account 820 days old, rating 4.8, 214 trips, 0 disputes in last 90 days');
  const driver = parseHistory('Driver history: account 1460 days old, rating 4.7, 3890 trips, 2 disputes in last 90 days');
  assert.equal(historyLine(rider), '2.2 yrs · ★ 4.8 · 214 trips · 0 disputes (90 d)');
  assert.equal(historyLine(driver), '4 yrs · ★ 4.7 · 3,890 trips · 2 disputes (90 d)');
  assert.equal(historySentence(rider), '2.2 yrs on Ryde, rated 4.8 out of 5, 214 trips, 0 disputes in the last 90 days.');
  assert.equal(historySentence(driver), '4 yrs on Ryde, rated 4.7 out of 5, 3,890 trips, 2 disputes in the last 90 days.');
  assert.equal(historyLine({ ...rider, party: 'driver' }), historyLine(rider), 'party has no effect on treatment');
  assert.equal(historySentence({ ...driver, party: 'rider' }), historySentence(driver));
  for (const text of [historySentence(rider), historySentence(driver)]) {
    assert.equal(text.split(/\.(?:\s|$)/).filter(Boolean).length, 1);
    assert.doesNotMatch(text, /better|worse|risk|high|low/i);
  }
});

test('missing history measures are omitted, while recorded zeroes and single values are preserved', () => {
  assert.equal(historyLine({ rating: 4.8, trips: 214 }), '★ 4.8 · 214 trips');
  assert.equal(historySentence({ rating: 4.8, trips: 214 }), 'rated 4.8 out of 5, 214 trips.');
  assert.equal(historyLine({ days: 0, trips: 0, disputes: 0 }), '0 days · 0 trips · 0 disputes (90 d)');
  assert.equal(historyLine({ days: 1, trips: 1, disputes: 1 }), '1 day · 1 trip · 1 dispute (90 d)');
  assert.equal(historyLine({}), '');
  assert.equal(historySentence({ days: null, rating: null, trips: undefined, disputes: null }), '');
  assert.equal(historyLine({ days: NaN, rating: Infinity, trips: -1, disputes: -3 }), '');
});
