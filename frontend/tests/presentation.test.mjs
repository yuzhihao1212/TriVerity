import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/presentation.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { comparison, money, evidenceItems, policyIds, outputSources } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('comparison preserves values, scales bars independently per metric and computes signed change', () => {
  const result = comparison(10, 15);
  assert.equal(result.expected, 10); assert.equal(result.actual, 15);
  assert.ok(Math.abs(result.expectedWidth - 100 * 10 / 15) < 1e-10); assert.equal(result.actualWidth, 100);
  assert.equal(result.percent, 50); assert.equal(result.delta, 5);
  assert.equal(comparison(20, 10).percent, -50);
});

test('zero baseline and missing values do not invent percentages or amounts', () => {
  assert.equal(comparison(0, 5).percent, null);
  assert.equal(comparison(0, 0).expectedWidth, 0);
  assert.equal(comparison(null, 5).delta, null);
  assert.equal(comparison(10, null).actualWidth, 0);
  assert.equal(comparison(), null);
  assert.equal(comparison(NaN, Infinity), null);
  assert.equal(comparison(-1, -2), null);
  assert.equal(money(undefined), 'Not provided'); assert.equal(money(NaN), 'Not provided');
  assert.equal(money(0), '$0.00'); assert.equal(money(6.3), '$6.30');
});

test('evidence preserves every text and only uses explicitly aligned valid IDs', () => {
  const texts = ['Route was +44% vs expected distance', 'Unexpected stop: 6 min', 'Rider claim: disputed'];
  const valid = evidenceItems(texts, ['TRIP-1', 'GPS-2', 'UNKNOWN-1']);
  assert.deepEqual(valid.map(x => x.text), texts);
  assert.deepEqual(valid.map(x => x.source), ['trip', 'gps', 'case']);
  assert.deepEqual(valid.map(x => x.id), ['TRIP-1', 'GPS-2', undefined]);
  assert.ok(evidenceItems(texts, ['TRIP-1', 'GPS-2']).every(x => !x.id));
  assert.equal(evidenceItems(['Fare was +1.00'])[0].source, 'fare');
  assert.equal(evidenceItems(['No driver contact attempt in chat log'])[0].source, 'chat');
  assert.equal(evidenceItems(['Rider history: rating 4.8'])[0].source, 'history');
  assert.equal(evidenceItems(['unknown'], ['GPS-0'])[0].id, undefined);
});

test('policy chips deduplicate IDs while full references stay with the original result', () => {
  assert.deepEqual(policyIds(['RD-3: full text', 'SAFE-1: text', 'RD-3: text']), ['RD-3', 'SAFE-1']);
  assert.deepEqual(policyIds([]), []);
});

test('source display distinguishes skipped replies from fallback explanations', () => {
  const result = outputSources({ rider_case: {source:'fallback',rebuttal:null},
    driver_case: {source:'llm',rebuttal:{source:'llm',text:'Reply'}}, explanation_source:'fallback' });
  assert.deepEqual(result.map(x=>x.source), ['fallback','llm',null,'llm','fallback']);
  assert.equal(outputSources({ rider_case:{source:'llm',rebuttal:{source:'fallback',text:''}},
    driver_case:{source:'llm'}, explanation_source:'llm' })[2].source, null);
});

test('fact index includes exact aligned references and rejects conflicting IDs', async () => {
  const { factIndex } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
  const rider = { evidence:['GPS path 14.7 km','Unexpected stop: 6 min'], evidence_ids:['GPS-1','GPS-2'],
    rebuttal:{evidence:['Unexpected stop: 6 min'],evidence_ids:['GPS-2']} };
  const driver = { evidence:['GPS path 14.7 km'],evidence_ids:['GPS-1'],rebuttal:null };
  assert.deepEqual(factIndex({rider_case:rider,driver_case:driver}).map(x=>x.id), ['GPS-1','GPS-2']);
  assert.deepEqual(factIndex({rider_case:rider,driver_case:{...driver,evidence:['Conflicting path']}}).map(x=>x.id), ['GPS-2']);
  assert.deepEqual(factIndex({rider_case:{...rider,evidence_ids:[],rebuttal:null},driver_case:{...driver,evidence_ids:[]}}), []);
});

test('filtering preserves case order and never mutates or chooses a different case', async () => {
  const { filterDisputes } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
  const cases = [{id:'D001',type:'route_deviation'},{id:'D005',type:'no_show_charge'}];
  assert.equal(filterDisputes(cases,'all'),cases);
  assert.deepEqual(filterDisputes(cases,'no_show_charge'),[cases[1]]);
  assert.deepEqual(filterDisputes([], 'route_deviation'), []);
  assert.equal(cases.length,2);
});

test('presentation preference tolerates blocked storage and persists only a boolean', async () => {
  const { readPresentationPreference, writePresentationPreference } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
  let value = null;
  const storage = {getItem:()=>value,setItem:(key,next)=>{assert.equal(key,'triverity.presentation');value=next}};
  assert.equal(readPresentationPreference(storage), false);
  writePresentationPreference(storage,true); assert.equal(readPresentationPreference(storage),true);
  writePresentationPreference(storage,false); assert.equal(readPresentationPreference(storage),false);
  const blocked = {getItem:()=>{throw new Error('blocked')},setItem:()=>{throw new Error('blocked')}};
  assert.equal(readPresentationPreference(blocked),false);
  assert.doesNotThrow(()=>writePresentationPreference(blocked,true));
});
