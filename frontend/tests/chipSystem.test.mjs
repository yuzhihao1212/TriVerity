import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function load(file) {
  const source = await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const chip = await load('chipStyle.ts');
const tone = await load('outcomeTone.ts');

test('chip classes: one base class, a size, and exactly one tone', () => {
  assert.equal(chip.chipClass(), 'chip tone-neutral');
  assert.equal(chip.chipClass({ tone: 'ok' }), 'chip tone-ok');
  assert.equal(chip.chipClass({ tone: 'warn', size: 'sm' }), 'chip sm tone-warn');
  assert.equal(chip.chipClass({ tone: 'brand', size: 'md', className: 'chip-button' }), 'chip tone-brand chip-button');
  for (const t of chip.CHIP_TONES) {
    const classes = chip.chipClass({ tone: t, size: 'sm' }).split(' ');
    assert.deepEqual(classes, ['chip', 'sm', `tone-${t}`], t);
  }
  assert.deepEqual([...chip.CHIP_TONES], ['neutral', 'ok', 'warn', 'danger', 'brand', 'outline', 'ai']);
});

test('existing helper tones map onto chip tones without changing their meaning', () => {
  for (const t of ['neutral', 'ok', 'warn', 'danger', 'brand', 'outline', 'ai']) assert.equal(chip.chipTone(t), t);
  assert.equal(chip.chipTone('accent'), 'brand');   // "Agents working" stays brand
  assert.equal(chip.chipTone('high'), 'danger');
  assert.equal(chip.chipTone('medium'), 'warn');
  assert.equal(chip.chipTone('low'), 'neutral');
  assert.equal(chip.chipTone(undefined), 'neutral');
  assert.equal(chip.chipTone('something-new'), 'neutral');
});

test('source badges: AI blue, Rules and Fallback neutral grey', () => {
  assert.equal(chip.sourceTone('llm'), 'ai');
  assert.equal(chip.sourceTone('fallback'), 'neutral');
  assert.equal(chip.sourceTone('code'), 'neutral');
});

test('fact value chips: plain or within tolerance is an outline, deviations warn, threats danger', () => {
  assert.equal(chip.valueChipTone('ok'), 'outline');
  assert.equal(chip.valueChipTone('neutral'), 'outline');
  assert.equal(chip.valueChipTone('warn'), 'warn');
  assert.equal(chip.valueChipTone('danger'), 'danger');
});

test('risk levels: danger only when high', () => {
  assert.equal(tone.riskTone('low'), 'neutral');
  assert.equal(tone.riskTone('medium'), 'warn');
  assert.equal(tone.riskTone('high'), 'danger');
});

test('every decision keeps the tone it had before, and is a valid chip tone', () => {
  const before = { partial_refund: 'ok', full_refund: 'ok', compensation: 'ok', needs_review: 'warn', no_action: 'neutral' };
  for (const [decision, expected] of Object.entries(before)) {
    assert.equal(tone.decisionTone(decision), expected, decision);
    assert.equal(chip.chipTone(tone.decisionTone(decision)), expected, decision);
  }
});
