import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/consoleIntroTiming.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { INTRO_STEPS, INTRO_TOTAL_MS, REDUCED_MOTION_MS, TRI_LETTERS, TRI_LETTER_MS, triLetterDelay, shouldPlayIntro } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('the intro lasts 1.5-2.0 s in total and ends with the fade', () => {
  assert.ok(INTRO_TOTAL_MS >= 1500 && INTRO_TOTAL_MS <= 2000, `total ${INTRO_TOTAL_MS} ms`);
  assert.equal(INTRO_TOTAL_MS, INTRO_STEPS.fade.end);
});

test('steps run in order, each with a positive duration', () => {
  const { tri, verity, dot, fade } = INTRO_STEPS;
  for (const step of [tri, verity, dot, fade]) assert.ok(step.start >= 0 && step.end > step.start);
  // "Verity" overlaps the end of "Tri", but never starts before it or ends before it.
  assert.ok(verity.start > tri.start && verity.start < tri.end && verity.end >= tri.end);
  assert.ok(dot.start >= verity.end);
  assert.ok(fade.start >= dot.end);
  assert.ok(fade.start >= 1500 && fade.end < 2000);
});

test('the staggered "Tri" letters all land by the end of their step', () => {
  const delays = TRI_LETTERS.map((_, i) => triLetterDelay(i));
  assert.deepEqual([...delays].sort((a, b) => a - b), delays);
  assert.ok(delays[1] > delays[0]);
  assert.equal(delays.at(-1) + TRI_LETTER_MS, INTRO_STEPS.tri.end);
});

test('reduced motion takes 150 ms or less and skips the intro', () => {
  assert.ok(REDUCED_MOTION_MS <= 150);
  const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
  assert.equal(shouldPlayIntro(click, true), false);
  assert.equal(shouldPlayIntro(click, false), true);
});

test('modified, non-primary or already-handled clicks keep native link behaviour', () => {
  const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
  for (const key of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey']) assert.equal(shouldPlayIntro({ ...click, [key]: true }, false), false, key);
  assert.equal(shouldPlayIntro({ ...click, button: 1 }, false), false);
  assert.equal(shouldPlayIntro({ ...click, defaultPrevented: true }, false), false);
});
