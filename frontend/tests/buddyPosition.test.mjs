import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';

const b = await load('buddyPosition');
const viewport = { width: 1200, height: 800 };
const owl = { width: 200, height: 56 };

test('a dragged owl stays whole on screen, even past an edge or in a tiny window', () => {
  assert.deepEqual(b.clampSpot({ right: -50, bottom: 5000 }, owl, viewport), { right: 16, bottom: 800 - 56 - 16 });
  assert.deepEqual(b.clampSpot({ right: 300.4, bottom: 200.6 }, owl, viewport), { right: 300, bottom: 201 });
  assert.deepEqual(b.clampSpot({ right: 400, bottom: 400 }, owl, { width: 100, height: 40 }), { right: 16, bottom: 16 });
});

test('the panel opens on the roomier side of the owl', () => {
  const lowRight = b.panelBox({ left: 980, top: 700, ...owl }, viewport);
  assert.deepEqual(lowRight, { below: false, left: 200 - 340, width: 340, maxHeight: 700 - 8 - 16 });
  const highLeft = b.panelBox({ left: 40, top: 60, ...owl }, viewport);
  assert.deepEqual(highLeft, { below: true, left: 0, width: 340, maxHeight: 800 - 60 - 56 - 8 - 16 });
});

test('on a narrow screen the panel fits the width and stays inside it', () => {
  const phone = { width: 320, height: 640 };
  const box = b.panelBox({ left: 200, top: 520, width: 68, height: 56 }, phone);
  assert.equal(box.width, 320 - 32);
  assert.equal(200 + box.left, 16);
});

test('a saved spot survives a reload, and junk or blocked storage falls back to the corner', () => {
  const saved = new Map();
  const store = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
  b.writeSpot(store, { right: 120, bottom: 300 });
  assert.deepEqual(b.readSpot(store), { right: 120, bottom: 300 });
  saved.set('triverity.buddySpot', '{"right":"x"}');
  assert.equal(b.readSpot(store), null);
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(b.readSpot(blocked), null);
  assert.doesNotThrow(() => b.writeSpot(blocked, { right: 1, bottom: 1 }));
});
