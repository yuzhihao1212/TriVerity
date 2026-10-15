import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/workflow.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { WORKFLOW_TABS, agentLabel, agentTab, agentsForTab, agentSource, tabLocked, navigateTab, savedTab, tabProgress } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const result = {
  rider_case:{source:'fallback',summary:'Rider argument',rebuttal:{source:'fallback',text:''}},
  driver_case:{source:'llm',summary:'Driver argument',rebuttal:{source:'llm',text:'Driver reply'}},
  explanation_source:'fallback', judge_evidence:['Trip took +20%'], rider_explanation:'Rider message', driver_explanation:'Driver message',
};

test('only Intake is unlocked before a run; cached results unlock all steps', () => {
  assert.deepEqual(WORKFLOW_TABS.map(tab=>tab.id), ['intake','evidence','hearing','ruling','notify']);
  assert.deepEqual(WORKFLOW_TABS.map(tab=>tabLocked(tab.id,false)), [false,true,true,true,true]);
  assert.ok(WORKFLOW_TABS.every(tab=>!tabLocked(tab.id,true)));
});

test('keyboard navigation skips locked tabs and wraps unlocked tabs', () => {
  for(const key of ['ArrowLeft','ArrowRight','Home','End']) assert.equal(navigateTab('intake',key,false),'intake');
  assert.equal(navigateTab('intake','ArrowLeft',true),'notify');
  assert.equal(navigateTab('notify','ArrowRight',true),'intake');
  assert.equal(navigateTab('hearing','Home',true),'intake');
  assert.equal(navigateTab('hearing','End',true),'notify');
  assert.equal(navigateTab('evidence','ArrowRight',true),'hearing');
  assert.equal(navigateTab('evidence','Tab',true),'evidence');
});

test('remembered tabs are per-case state and cannot unlock a case without its result', () => {
  assert.equal(savedTab('hearing',true),'hearing');
  assert.equal(savedTab('notify',false),'intake');
  assert.equal(savedTab(undefined,true),'intake');
});

test('agent mapping preserves every stage entry and its order', () => {
  const agents=['evidence_loader','evidence_collector','rider_advocate','driver_advocate','rider_rebuttal','driver_rebuttal','fraud_detector','judge'];
  const entries=agents.map((agent,step)=>({agent,step,status:'completed',message:'Recorded'}));
  assert.deepEqual(agentsForTab(entries,'evidence').map(e=>e.agent),agents.slice(0,2));
  assert.deepEqual(agentsForTab(entries,'hearing').map(e=>e.agent),agents.slice(2,6));
  assert.deepEqual(agentsForTab(entries,'ruling').map(e=>e.agent),agents.slice(6));
  assert.equal(agentsForTab(entries,'intake').length,0);
  assert.equal(agentsForTab(entries,'notify').length,0);
  assert.equal(agentLabel('evidence_collector'),'Evidence collector');
});

test('an absent collector is optional; unknown agents remain visible by raw name', () => {
  const loader={agent:'evidence_loader',step:1,status:'completed',message:'Facts computed'};
  assert.deepEqual(agentsForTab([loader],'evidence'),[loader]);
  assert.deepEqual(agentsForTab([],'evidence'),[]);
  assert.equal(agentLabel('future_agent'),'future_agent');
  assert.equal(agentLabel('__proto__'),'__proto__');
  assert.equal(agentLabel('toString'),'toString');
  assert.equal(agentTab('future_agent'),'evidence');
  assert.equal(agentsForTab([{...loader,agent:'future_agent'}],'evidence').length,1);
});

test('agent badges use actual output sources and never guess a collector source', () => {
  assert.equal(agentSource('rider_advocate',result),'fallback');
  assert.equal(agentSource('driver_advocate',result),'llm');
  assert.equal(agentSource('rider_rebuttal',result),'fallback');
  assert.equal(agentSource('driver_rebuttal',result),'llm');
  assert.equal(agentSource('judge',result),'fallback');
  assert.equal(agentSource('fraud_detector',result),null);
  assert.equal(agentSource('evidence_collector',result),null);
  assert.equal(agentSource('evidence_collector',{...result,evidence_collection:{source:'unknown'}}),null);
  assert.equal(agentSource('evidence_collector',{...result,evidence_collection:{source:'llm'}}),'llm');
});

test('progress labels describe saved data, not fabricated execution progress', () => {
  assert.equal(tabProgress('evidence'),'Locked');
  assert.equal(tabProgress('evidence',result),'1 fact');
  assert.equal(tabProgress('hearing',result),'2 arguments');
  assert.equal(tabProgress('notify',result),'2 messages');
  assert.equal(tabProgress('ruling',result),'Decision ready');
});
