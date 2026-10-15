import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const source=await readFile(new URL('../src/services/sse.ts',import.meta.url),'utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
const {createSseParser,readResolveStream,withResolveFallback}=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const step={step:1,agent:'rider_advocate',status:'completed',message:'[llm] Rider’s café evidence',duration_ms:1200};
const result={decision:'no_action',agent_log:[step],rider_case:{},driver_case:{}};
const frame=(event,data)=>`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
function response(chunks,headers={'Content-Type':'text/event-stream'}){
 return new Response(new ReadableStream({start(controller){for(const chunk of chunks)controller.enqueue(typeof chunk==='string'?new TextEncoder().encode(chunk):chunk);controller.close()}}),{headers});
}

test('SSE parser preserves split chunks and multi-line data; ignores comments and unknown events',()=>{
 const seen=[],parser=createSseParser(event=>seen.push(event));
 const text='\uFEFF: connected\r\nevent: step\r\ndata: {"step":\r\ndata: 1}\r\n\r\nevent: unknown\ndata: not-json\n\nevent: result\ndata: {}\n\n';
 for(const char of text)parser.push(char);
 parser.end();
 assert.deepEqual(seen,[{event:'step',data:'{"step":\n1}'},{event:'result',data:'{}'}]);
});

test('event/data fields reset per frame and incomplete trailing data is not dispatched',()=>{
 const seen=[],parser=createSseParser(event=>seen.push(event));
 parser.push('event: step\ndata: first\n\ndata: no-event-name\n\nevent: result\ndata: unfinished');parser.end();
 assert.deepEqual(seen,[{event:'step',data:'first'}]);
 const cr=createSseParser(event=>seen.push(event));cr.push('event: step\rdata: second\r\r');cr.end();
 assert.equal(seen[1].data,'second');
});

test('reader decodes byte-split UTF-8, forwards steps, then returns the one complete result',async()=>{
 const seen=[],encoded=new TextEncoder().encode(frame('step',step)+frame('result',result));
 const got=await readResolveStream(response([...encoded].map(byte=>Uint8Array.of(byte))),item=>seen.push(item));
 assert.deepEqual(seen,[step]);assert.deepEqual(got,result);
});

test('a completed step is delivered before the result is made available',async()=>{
 let controller,notify;
 const arrived=new Promise(resolve=>notify=resolve);
 const res=new Response(new ReadableStream({start(c){controller=c}}),{headers:{'content-type':'text/event-stream'}});
 const pending=readResolveStream(res,notify);
 controller.enqueue(new TextEncoder().encode(frame('step',step)));
 assert.deepEqual(await arrived,step);
 controller.enqueue(new TextEncoder().encode(frame('result',result)));controller.close();
 assert.deepEqual(await pending,result);
});

test('error events, malformed JSON, invalid payloads, missing results and HTTP failures reject',async()=>{
 for(const text of [frame('error',{status:503,detail:'Busy'}),'event: result\ndata: nope\n\n',frame('step',{}),frame('result',{}),frame('step',step),'event: result\ndata: {}']){
  await assert.rejects(readResolveStream(response([text]),()=>{}));
 }
 await assert.rejects(readResolveStream(new Response('bad',{status:429}),()=>{}));
 await assert.rejects(readResolveStream(response(['{}'],{'content-type':'application/json'}),()=>{}));
 const failed=new Response(new ReadableStream({start(c){c.error(new TypeError('network lost'))}}),{headers:{'content-type':'text/event-stream'}});
 await assert.rejects(readResolveStream(failed,()=>{}));
});

test('success never posts again; a failed stream retries normal resolve exactly once',async()=>{
 let normal=0,notified=0;
 const fallback=async()=>{normal++;return result};
 assert.equal(await withResolveFallback(async()=>result,fallback,()=>notified++),result);
 assert.equal(normal,0);assert.equal(notified,0);
 assert.equal(await withResolveFallback(async()=>{throw Error('stream failed')},fallback,()=>notified++),result);
 assert.equal(normal,1);assert.equal(notified,1);
 await assert.rejects(withResolveFallback(async()=>{throw Error('stream failed')},async()=>{normal++;throw Error('ordinary error')},()=>notified++),/ordinary error/);
 assert.equal(normal,2);assert.equal(notified,2);
});
