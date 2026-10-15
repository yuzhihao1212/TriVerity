import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/routes.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { parseRoute, selectSample } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

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

test('sample selection uses the server list; unknown IDs select its first case', () => {
  const samples = [{dispute_id:'D001'}, {dispute_id:'D007'}, {dispute_id:'DISP-002'}];
  assert.equal(selectSample(samples, parseRoute('#/console/D007').sampleId), samples[1]);
  assert.equal(selectSample(samples, parseRoute('#/console/UNKNOWN').sampleId), samples[0]);
  assert.equal(selectSample(samples), samples[0]);
  assert.equal(selectSample([], 'D007'), null);
});
