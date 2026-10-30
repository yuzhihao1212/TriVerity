import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/consoleHeader.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const ch = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const own = [{ dispute_id: 'J-ABC123' }];

test('the access-code field shows only for the reviewer\'s own disputes', () => {
  assert.equal(ch.needsAccessCode('J-ABC123', own), true);
  assert.equal(ch.needsAccessCode('D001', own), false, 'samples never need it');
  assert.equal(ch.needsAccessCode('D001', []), false);
  assert.equal(ch.needsAccessCode(null, own), false);
  assert.equal(ch.needsAccessCode(undefined, own), false);
});

test('a refused own run points to the field: 401 (wrong code) or 404 (no code on the public demo)', () => {
  const error = status => Object.assign(new Error('x'), { status });
  assert.equal(ch.accessCodeProblem(error(401), true), true);
  assert.equal(ch.accessCodeProblem(error(404), true), true);
  assert.equal(ch.accessCodeProblem(error(401), false), false, 'samples never send a code');
  assert.equal(ch.accessCodeProblem(error(429), true), false);
  assert.equal(ch.accessCodeProblem(error(503), true), false);
  assert.equal(ch.accessCodeProblem(new Error('network'), true), false);
  assert.equal(ch.accessCodeProblem(null, true), false);
  assert.match(ch.accessCodeMessage(401), /not recognised.*Judge access code field above Run agents/);
  assert.match(ch.accessCodeMessage(404), /need a judge access code.*above Run agents/);
  assert.match(ch.ACCESS_CODE_HELP, /record decisions and appeals\. Running the sample disputes doesn't need it/);
});
