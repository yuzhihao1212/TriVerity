import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/trustTileState.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { trustTileState: reduce, CLOSED_TRUST_TILE: closed } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const action = (type, id = 'a') => ({ type, id });

test('hover reveals until leaving, keyboard focus until blur; irrelevant exits do not close another tile', () => {
  let state = reduce(closed, action('hover'));
  assert.equal(state.openId, 'a');
  assert.deepEqual(reduce(state, action('leave')), closed);
  state = reduce(closed, action('focus'));
  assert.equal(reduce(state, action('leave')).openId, 'a');
  assert.deepEqual(reduce(state, action('blur')), closed);
  assert.equal(reduce(state, action('blur', 'b')).openId, 'a');
});

test('click/tap toggles a single pinned tile, remains open after leaving and closes on the second tap', () => {
  let state = reduce(closed, action('toggle'));
  assert.equal(state.trigger, 'pinned');
  assert.deepEqual(reduce(state, action('leave')), state);
  assert.deepEqual(reduce(state, action('blur')), state);
  state = reduce(state, action('toggle', 'b'));
  assert.equal(state.openId, 'b');
  assert.deepEqual(reduce(state, action('toggle', 'b')), closed);
});

test('explicit close beats current hover/focus; a fresh interaction can reveal it again', () => {
  for (const type of ['hover', 'focus', 'toggle']) {
    const state = reduce(closed, action(type));
    assert.deepEqual(reduce(state, action('escape')), closed);
    assert.deepEqual(reduce(state, action('toggle')), closed);
    assert.equal(reduce(reduce(state, action('escape')), action('focus', 'b')).openId, 'b');
  }
  const focused = reduce(closed, action('focus'));
  assert.deepEqual(reduce(focused, action('hover')), focused);
});

// Read literal data through the TypeScript AST; no React, image assets, timers
// or browser globals need to run just to validate the copy.
const landing = await readFile(new URL('../src/Landing.tsx', import.meta.url), 'utf8');
const file = ts.createSourceFile('Landing.tsx', landing, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function literal(name) {
  let initializer;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name) initializer = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.ok(initializer, `${name} must be a literal array`);
  const { outputText } = ts.transpileModule(`export const data = ${initializer.getText(file)};`, { compilerOptions: { module: ts.ModuleKind.ESNext } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`).then(module => module.data);
}
const tiles = await literal('TRUST_TILES'), results = await literal('LANDING_RESULTS');

test('six typed tiles retain order, documented fairness/injection proofs and the demo note', () => {
  assert.deepEqual(tiles.map(t => t.icon), ['scales','magnifier','person','shield','books','lock']);
  assert.equal(tiles.length, 6);
  assert.ok(tiles.every(t => t.title && t.detail));
  assert.equal(tiles[2].proof, '500/500 fairness checks');
  assert.match(tiles[2].detail, /histories removed or swapped/);
  assert.equal(tiles[5].proof, '0 of 68 live runs swayed');
  assert.match(tiles[5].detail, /23.*17.*68/);
  assert.equal(tiles[4].note, 'Disabled in the public demo.');
});

test('trust copy does not repeat the headline numbers from measured results', () => {
  const copy = tiles.map(t => [t.title,t.proof,t.detail,t.note].filter(Boolean).join(' ')).join(' ');
  for (const result of results) {
    const headlineNumber = result.value.replace(/\s*s$/, '');
    assert.ok(!copy.includes(headlineNumber), `headline measure ${result.value} belongs in Results only`);
  }
  // 500/500 is intentionally a different, sourced fairness measure, even
  // though the Results footnote also names the 500-dispute simulation.
  assert.match(copy, /500\/500/);
});
