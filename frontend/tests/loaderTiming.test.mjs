import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';

const { LOADER_DELAY_MS, LOADER_MIN_MS, loaderHideDelay } = await load('loaderTiming');

test('loaders wait 300 ms before showing, then stay at least 500 ms', () => {
  assert.equal(LOADER_DELAY_MS, 300);
  assert.equal(LOADER_MIN_MS, 500);
  assert.equal(loaderHideDelay(null, 1000), 0);      // never shown: nothing to keep
  assert.equal(loaderHideDelay(1000, 1200), 300);    // shown 200 ms ago: keep 300 ms more
  assert.equal(loaderHideDelay(1000, 1500), 0);      // already shown long enough
  assert.equal(loaderHideDelay(1000, 4000), 0);
});
