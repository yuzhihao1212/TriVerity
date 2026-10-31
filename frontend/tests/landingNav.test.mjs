import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { load } from './_load.mjs';

const { LANDING_SECTIONS, railFill, readingPosition } = await load('landingNav');

test('every rail entry points at a landing section, in page order', async () => {
  const source = await readFile(new URL('../src/Landing.tsx', import.meta.url), 'utf8');
  // A section sets its id directly, or a chapter sets it from its own id.
  const at = id => Math.max(source.indexOf(`id="section-${id}"`), source.indexOf(`<Chapter id="${id}"`));
  const positions = LANDING_SECTIONS.map(section => at(section.id));
  assert.ok(positions.every(position => position > 0));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
});

test('the reading position follows the line through each section', () => {
  const boxes = [{ top: 100, height: 200 }, { top: 300, height: 400 }, { top: 700, height: 300 }];
  assert.deepEqual(readingPosition(boxes, 50, false), { index: -1, fraction: 0 });
  assert.deepEqual(readingPosition(boxes, 200, false), { index: 0, fraction: 0.5 });
  assert.deepEqual(readingPosition(boxes, 400, false), { index: 1, fraction: 0.25 });
  assert.deepEqual(readingPosition(boxes, 400, true), { index: 2, fraction: 1 });
  assert.deepEqual(readingPosition([], 400, true), { index: -1, fraction: 0 });
});

test('the rail fills to each dot as its section starts, and never past the end', () => {
  assert.equal(railFill(-1, 0, 5), 0);
  assert.equal(railFill(0, 0, 5), 0);
  assert.equal(railFill(2, 0, 5), 0.5);
  assert.equal(railFill(1, 0.5, 5), 0.375);
  assert.equal(railFill(4, 1, 5), 1);
});
