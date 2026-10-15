import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/glossary.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { RULES, ruleText } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const policy = JSON.parse(await readFile(new URL('../../data/policies/ryde_mock_policy.json', import.meta.url), 'utf8'));

test('rule tooltips match the policy file exactly', () => {
  const fromPolicy = Object.assign({}, ...Object.values(policy).filter(s => s && typeof s === 'object').map(s => s.rules ?? {}));
  assert.deepEqual(RULES, fromPolicy);
});

test('rule lookup tolerates case and spaces', () => {
  assert.equal(ruleText(' rd-3 '), RULES['RD-3']);
  assert.equal(ruleText('XX-9'), undefined);
});
