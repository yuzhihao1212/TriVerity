import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/routes.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { parseRoute, selectSample, missingCase, caseHash, HOME_HASH, scrollBehavior } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('empty, root and unknown hashes show the landing page', () => {
  for (const hash of ['', '#/', '#', '#/unknown', '#/console/D007/extra', '#console', '#/console/%ZZ']) {
    assert.deepEqual(parseRoute(hash), {page:'landing'}, hash);
  }
});

test('console and case links preserve the requested ID without running agents', () => {
  assert.deepEqual(parseRoute('#/console'), {page:'console'});
  assert.deepEqual(parseRoute('#/console/D007'), {page:'console', sampleId:'D007'});
  assert.deepEqual(parseRoute('#/console/DISP-002'), {page:'console', sampleId:'DISP-002'});
});

test('no ID shows home; a known ID opens that case; an unknown ID shows home with a note', () => {
  const samples = [{dispute_id:'D001'}, {dispute_id:'D007'}, {dispute_id:'DISP-002'}];
  assert.equal(selectSample(samples, parseRoute('#/console/D007').sampleId), samples[1]);
  assert.equal(selectSample(samples, parseRoute('#/console').sampleId), null, 'home, no auto-opened sample');
  assert.equal(selectSample(samples, parseRoute('#/console/D099').sampleId), null);
  assert.equal(missingCase(samples, 'D099'), 'D099');
  assert.equal(missingCase(samples, 'D007'), null);
  assert.equal(missingCase(samples, undefined), null);
  assert.equal(selectSample([], 'D007'), null);
  assert.equal(caseHash('DISP-002'), '#/console/DISP-002');
  assert.equal(HOME_HASH, '#/console');
});

test('auto-scrolls are smooth unless the viewer prefers reduced motion', () => {
  assert.equal(scrollBehavior(false), 'smooth');
  assert.equal(scrollBehavior(true), 'auto');
});
