import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const source=await readFile(new URL('../src/progress.ts',import.meta.url),'utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
const {stepSource,stepMessage,duration,callsByRound}=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('live sources use known agent names and explicit markers, never guess unknown AI',()=>{
 assert.equal(stepSource({agent:'rider_advocate',message:'[llm] Argument'}),'llm');
 assert.equal(stepSource({agent:'driver_rebuttal',message:'[fallback] no reply'}),'fallback');
 assert.equal(stepSource({agent:'fraud_detector',message:'[llm] quoted untrusted words'}),'code');
 assert.equal(stepSource({agent:'future_agent',message:'[llm] unknown'}),null);
 assert.equal(stepSource({agent:'judge',message:'No source marker'}),null);
 assert.equal(stepMessage({agent:'rider_advocate',message:'[llm] First line\nSecond line'}),'First line');
 assert.equal(stepMessage({agent:'future_agent',message:'[llm] untouched'}),'[llm] untouched');
});

test('timings distinguish missing from zero and reject invalid durations',()=>{
 for(const value of [undefined,null,-1,NaN,Infinity])assert.equal(duration(value),null);
 assert.equal(duration(0),'0.0 s');assert.equal(duration(35),'<0.1 s');assert.equal(duration(1234),'1.2 s');
});

test('collector calls group by numeric round, retain party/arguments/results and preserve input',()=>{
 const a={round:2,tool:'chat_window',party:'driver',args:{from:'08:10',to:'08:18'},results:['Contacted rider']};
 const b={round:1,tool:'trip_record',args:{},results:[]},c={...a,party:'rider'};
 const input=[a,b,c];
 assert.deepEqual(callsByRound(input),[{round:1,calls:[b]},{round:2,calls:[a,c]}]);
 assert.deepEqual(input,[a,b,c]);assert.deepEqual(callsByRound([]),[]);
});
