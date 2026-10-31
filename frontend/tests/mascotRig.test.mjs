import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { load } from './_load.mjs';

const m = await load('mascotState');
const css = await readFile(new URL('../src/mascot.css', import.meta.url), 'utf8');
const tsx = await readFile(new URL('../src/Mascot.tsx', import.meta.url), 'utf8');

test('every idle action that moves the owl has styles for it', () => {
  for (const action of m.IDLE_ACTIONS.filter(name => !name.includes('blink'))) {
    assert.match(css, new RegExp(`\\.act-${action}\\b`), action);
  }
  assert.match(css, /\.act-ruffled\b/);
});

test('every animation the owl names is defined', () => {
  const defined = new Set([...css.matchAll(/@keyframes ([\w-]+)/g)].map(match => match[1]));
  const used = [...css.matchAll(/animation:\s*([^;]+);/g)].flatMap(match => match[1].replace(/\([^)]*\)/g, '').split(',').map(part => part.trim().split(/\s+/)[0]));
  for (const name of used.filter(name => name !== 'none')) assert.ok(defined.has(name), `missing @keyframes ${name}`);
});

test('all owl motion is switched off for people who ask for reduced motion', () => {
  const firstMedia = css.indexOf('@media (prefers-reduced-motion: no-preference)');
  assert.ok(firstMedia > 0);
  const before = css.slice(0, firstMedia);
  assert.doesNotMatch(before, /animation:|transition: translate/);
  // Everything after the block is keyframes, which do nothing unless named inside it.
  assert.equal([...css.matchAll(/animation:/g)].filter(match => match.index < firstMedia).length, 0);
});

test('the wings sit behind the head, and the scarf band sits over it', () => {
  const wing = tsx.indexOf('owl-wing-l-pose'), head = tsx.indexOf('owl-head-pose'), band = tsx.indexOf('owl-band');
  assert.ok(wing > 0 && wing < head && head < band);
});

test('asleep, the owl sits lower with its wings folded in', () => {
  for (const part of ['owl-torso-pose', 'owl-head-pose', 'owl-wing-l-pose', 'owl-wing-r-pose']) {
    assert.match(css, new RegExp(`\\.is-asleep \\.${part} \\{`), part);
  }
  assert.match(tsx, /owl-closed-beak/);
});

test('nothing masks a fixed outline of the owl over parts that move', () => {
  assert.doesNotMatch(tsx, /mascot-light|maskImage/);
});
