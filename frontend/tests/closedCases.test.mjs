import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';
const n = await load('notifyState'), q = await load('caseQueue'), r = await load('reviewProgress');
const result = { decision: 'partial_refund' };
const first = { at: '15:20', decision: 'partial_refund', amount: 6.3, messages: { rider: 'Refund $6.30.', driver: 'Rider refunded $6.30.' }, notes: { rider: 'Sorry for the trouble.', driver: '' }, reviewer: { kind: 'accepted', decision: 'partial_refund', precedentId: 'R-1' } };
const backend = () => { const map = new Map(); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) }; };

test('not run → ready → reviewed → closed → reopened → closed with a correction', () => {
  const store = n.createSentStore(null), key = 'D001|t1';
  assert.equal(q.caseStatus(null, false, false), 'not_run');
  assert.equal(q.caseStatus(result, false, false), 'ready');
  assert.equal(q.caseStatus(result, true, false), 'reviewed');
  store.set(key, first);
  assert.equal(q.caseStatus(result, true, !!store.get(key)), 'closed');
  assert.equal(store.reopen(key, '15:32'), true);
  assert.equal(q.caseStatus(result, false, !!store.get(key), {reopened:store.reopened(key)}), 'reopened');
  const correction = {...first, at:'15:40', amount:3, notes:{rider:'',driver:''}, messages:{rider:'Refund $3.00.',driver:'Rider refunded $3.00.'}, reviewer:{kind:'overridden',decision:'partial_refund',precedentId:'R-2',reason:'Corrected amount'}};
  store.set(key, correction);
  assert.equal(q.caseStatus(result, true, !!store.get(key)), 'closed');
  assert.match(n.sentText(store.get(key)), /^✓ Correction sent to rider and driver · 15:40/);
  assert.equal(n.sentOutcomeText(store.get(key)), 'Partial refund $3.00');
  assert.equal(n.reviewAction(store.get(key)), 'overridden');
  assert.equal(store.get(key).reviewer.reason, 'Corrected amount');
});

test('history is append-only, includes exact messages/notes, and cannot be mutated by its callers', () => {
  const storage = backend(), store = n.createSentStore(storage), key = 'D001|t1';
  const record = structuredClone(first);
  store.set(key, record);
  record.notes.rider = 'Changed after sending';
  store.set(key, {...first, amount:100}); // closed: no second send
  assert.equal(store.events(key).length, 1);
  assert.equal(store.events(key)[0].notes.rider, first.notes.rider);
  store.reopen(key, '15:32'); store.reopen(key, '15:33');
  store.set(key, {...first, at:'15:40', amount:3});
  const events = store.events(key);
  assert.deepEqual(events.map(e => [e.type,e.at]), [['sent','15:20'],['reopened','15:32'],['sent','15:40']]);
  assert.deepEqual(events[0].messages, first.messages);
  events[0].notes.rider = 'Changed on read';
  assert.equal(store.events(key)[0].notes.rider, first.notes.rider);
  assert.deepEqual(n.createSentStore(storage).events(key), store.events(key));
});

test('blocked storage retains history and reopen tombstones in memory, including after a failed write', () => {
  const blocked = {getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};
  const store = n.createSentStore(blocked);
  store.set('D001|t1', first); store.reopen('D001|t1','15:32');
  assert.equal(store.get('D001|t1'), null);
  assert.deepEqual(store.events('D001|t1').map(e=>e.type), ['sent','reopened']);
  const normal=backend(); normal.setItem(n.SENT_KEY,JSON.stringify({'D001|old':first}));
  const migrated=n.createSentStore({getItem:normal.getItem,setItem:blocked.setItem});
  assert.deepEqual(migrated.get('D001|old'), first);
  migrated.reopen('D001|old','15:32');
  assert.equal(migrated.get('D001|old'),null,'legacy closed record cannot override a memory reopen');
});

test('a new run keeps earlier history reachable and its resend is still a correction', () => {
  const storage=backend(),store=n.createSentStore(storage);
  store.set('D001|old', first); store.reopen('D001|old','15:32');
  assert.equal(store.get('D001|new'),null);
  assert.deepEqual(store.earlier('D001','D001|new').map(h=>h.key),['D001|old']);
  assert.equal(store.earlier('D002','D002|new').length,0);
  store.set('D001|new',{...first,at:'15:40'});
  assert.equal(store.get('D001|new').correction,true);
  assert.equal(n.createSentStore(storage).earlier('D001','D001|new')[0].events.length,2);
});

test('closed cases complete every step, reopening clears only Ruling and Notify even with blocked storage', () => {
  const storage=backend(),store=r.createReviewStore(storage);
  for(const tab of ['intake','evidence','hearing','ruling','notify'])store.add('k',tab);
  assert.equal(r.reviewSummary(r.reviewedSteps([],true)).text,'Review complete');
  store.set('k',r.REOPENED_STEPS);
  assert.deepEqual([...store.get('k')],['intake','evidence','hearing']);
  assert.equal(r.reviewSummary(store.get('k')).count,3);
  const blocked=r.createReviewStore({getItem:storage.getItem,setItem(){throw Error('full')}});
  blocked.add('k','ruling'); blocked.add('k','notify'); blocked.set('k',r.REOPENED_STEPS);
  assert.deepEqual([...blocked.get('k')],['intake','evidence','hearing']);
});

test('appeal waiting applies only to closed/reopened cases and disappears when appeals are unavailable', () => {
  for(const status of ['queued','pending']) {
    const waiting=q.pendingAppealIds([{dispute_id:'D003',status}]);
    assert.equal(q.caseStatus(result,true,true,{appealWaiting:waiting.has('D003')}),'appeal_waiting');
    assert.equal(q.caseStatus(result,true,false,{reopened:true,appealWaiting:true}),'appeal_waiting');
  }
  assert.equal(q.pendingAppealIds(null).size,0);
  assert.equal(q.pendingAppealIds([{dispute_id:'D003',status:'decided'}]).size,0);
  assert.equal(q.caseStatus(result,true,false,{appealWaiting:true}),'reviewed');
  assert.equal(q.caseStatus(result,true,true,{appealWaiting:false}),'closed');
});

test('queue groups Appeal waiting with Decide, Reopened with Reviewed, Closed last; Done counts Closed', () => {
  const rows=[{id:'closed',status:'closed'},{id:'new',status:'not_run'},{id:'review',status:'reviewed'},{id:'reopened',status:'reopened'},{id:'appeal',status:'appeal_waiting'},{id:'decide',status:'decide'},{id:'ready',status:'ready'}];
  assert.deepEqual(q.sortQueue(rows).map(r=>r.id),['appeal','decide','ready','review','reopened','new','closed']);
  assert.equal(q.nextCase(rows,'decide').id,'appeal');
  assert.equal(q.nextCase([{id:'a',status:'closed'}],null),null);
  assert.deepEqual(q.tileCounts(rows),{queue:7,ready:1,decide:1,done:1,appeals:1});
  assert.equal(Object.values(q.STATUS_WORDS).includes('Sent'),false);
  assert.equal(q.STATUS_ICONS.closed,'check');
});

test('closed controls are removed; an appeal-waiting reopened case stays editable', () => {
  const locked={run:false,decide:false,editNotes:false,send:false,reopen:true};
  const editable={run:true,decide:true,editNotes:true,send:true,reopen:false};
  assert.deepEqual(q.allowedActions('closed'),locked);
  assert.deepEqual(q.allowedActions('appeal_waiting',true),locked);
  for(const status of ['ready','reviewed','reopened'])assert.deepEqual(q.allowedActions(status),editable);
  assert.deepEqual(q.allowedActions('appeal_waiting',false),editable);
  assert.equal(n.sentOutcome({...first,decision:'needs_review',amount:6.3}).amount,null);
});

test('the current result survives a page refresh so a closed review cannot be re-run without reopening', () => {
  const storage=backend(),store=n.createSentStore(storage);
  const resolution={dispute_id:'D001',agent_log:[{started_at:'t1'}],rider_case:{},driver_case:{},risk:{},judge_evidence:[]};
  store.saveResult("D001",resolution);store.set('D001|t1',first);
  const restored=n.createSentStore(storage);
  assert.deepEqual(restored.results().D001,resolution);
  assert.equal(q.caseStatus(restored.results().D001,true,!!restored.get('D001|t1')),'closed');
  restored.reopen('D001|t1','15:32');
  assert.equal(n.createSentStore(storage).get('D001|t1'),null);
  const blocked=n.createSentStore({getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}});
  blocked.saveResult("D001",resolution);assert.deepEqual(blocked.results().D001,resolution);
  const bad=backend();bad.setItem(n.REVIEW_RESULTS_KEY,'{"D001":null,"D002":{}}');
  assert.deepEqual(n.createSentStore(bad).results(),{});
});

test('the header outcome chip follows the final decision, marked when the reviewer changed it', async () => {
  const { headerChips } = await load('stepVisuals');
  const dispute = { trip: { expected_distance_km: 10.2, actual_distance_km: 14.7 }, fare: { actual: 24.8 } };
  const resolution = { decision: 'partial_refund', refund_amount: 6.3, policy_refs: ['RD-3: …'] };
  const outcome = chips => chips.find(c => c.key === 'outcome').label;
  assert.equal(outcome(headerChips(dispute, resolution)), 'Partial refund $6.30');
  assert.equal(outcome(headerChips(dispute, resolution, { decision: 'full_refund', amount: 24.8, by: 'overridden' })), 'Full refund $24.80 · overridden');
  assert.equal(outcome(headerChips(dispute, resolution, { decision: 'no_action', amount: null, by: 'decided' })), 'No action · decided by reviewer');
});
