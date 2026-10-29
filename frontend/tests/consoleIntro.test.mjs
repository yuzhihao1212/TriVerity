import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/consoleIntroTiming.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { INTRO_STEPS, INTRO_TOTAL_MS, INTRO_WORD, LETTER_MS, REDUCED_MOTION_MS, letterDelay, shouldPlayIntro, introPlayed, markIntroPlayed } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('the intro lasts 4-5 s in total and ends with the flight into the top bar', () => {
  assert.ok(INTRO_TOTAL_MS >= 4000 && INTRO_TOTAL_MS <= 5000, `total ${INTRO_TOTAL_MS} ms`);
  assert.ok(INTRO_TOTAL_MS >= INTRO_STEPS.fly.end);
});

test('steps run in order, each with a positive duration', () => {
  const { letters, stop, swirl, dissolve, credit, fly, fade } = INTRO_STEPS;
  for (const step of [letters, stop, swirl, dissolve, credit, fly, fade]) assert.ok(step.start >= 0 && step.end > step.start);
  // The full stop lands once the word has formed; the dots leave only after it.
  assert.ok(stop.start >= letters.end && swirl.start >= stop.end);
  // The letters dissolve only once the dots have started to leave, so the word never shows without them.
  assert.ok(dissolve.start > swirl.start && dissolve.end < swirl.end);
  assert.ok(credit.start > swirl.start && credit.end >= swirl.end);
  assert.ok(fly.start - credit.end >= 300, 'the finished credit holds for at least 0.3 s');
  assert.equal(fade.start, fly.start, 'the console appears as the mark starts to fly');
  assert.ok(fade.end <= fly.end);
});

test('the letters fade in one after another and all land by the end of their step', () => {
  const delays = [...INTRO_WORD].map((_, i) => letterDelay(i));
  assert.deepEqual([...delays].sort((a, b) => a - b), delays);
  assert.equal(delays.at(-1) + LETTER_MS, INTRO_STEPS.letters.end);
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

test('the intro plays once per tab and treats blocked storage as not played', () => {
  const store = new Map();
  const storage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  assert.equal(introPlayed(storage), false);
  markIntroPlayed(storage);
  assert.equal(introPlayed(storage), true);
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(introPlayed(blocked), false);
  assert.doesNotThrow(() => markIntroPlayed(blocked));
  assert.equal(introPlayed(null), false);
});
