import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

// reviewProgress.ts imports workflow.ts at runtime; transpile both and point the import at the data URL.
const transpile = async (file, replace = {}) => {
  let { outputText } = ts.transpileModule(await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  for (const [from, to] of Object.entries(replace)) outputText = outputText.replaceAll(`from "${from}"`, `from "${to}"`);
  return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
};
const workflowUrl = await transpile('workflow.ts');
const rp = await import(await transpile('reviewProgress.ts', { './workflow': workflowUrl }));
const sv = await import(await transpile('stepVisuals.ts', { './workflow': workflowUrl, './outcomeTone': await transpile('outcomeTone.ts') }));

const memoryStorage = () => { const map = new Map(); return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), map }; };
const run = startedAt => ({ agent_log: [{ step: 1, agent: 'evidence_loader', status: 'completed', message: '', started_at: startedAt }] });

test('opening Evidence and Hearing counts; Ruling only when recording is unavailable; Notify never', () => {
  assert.equal(rp.openCounts('evidence'), true);
  assert.equal(rp.openCounts('hearing'), true);
  assert.equal(rp.openCounts('intake'), false);
  assert.equal(rp.openCounts('ruling'), false, 'Ruling needs an accepted or overridden decision');
  assert.equal(rp.openCounts('ruling', { decisionsUnavailable: true }), true, '403 fallback: opening the tab counts');
  assert.equal(rp.openCounts('notify', { decisionsUnavailable: true }), false, 'Notify needs both phones seen');
});

test('the Ruling tick on a decision, the Notify tick on seen, and "Review complete"', () => {
  const store = rp.createReviewStore(memoryStorage());
  const key = rp.reviewKey('D003', run('2026-10-16T05:00:00'));
  store.add(key, 'evidence');
  store.add(key, 'hearing');
  assert.equal(rp.reviewSummary(store.get(key)).text, 'Reviewed 3 of 5 steps');
  store.add(key, 'ruling'); // onDecided after a successful save
  let states = sv.stepStates({ active: 'ruling', hasResult: true, busy: false, reviewed: store.get(key) });
  assert.equal(states.find(s => s.tab === 'ruling').phase, 'reviewed');
  assert.equal(rp.reviewSummary(store.get(key)).text, 'Reviewed 4 of 5 steps');
  assert.equal(store.add(key, 'notify'), true); // onSeen once both phones were half in view
  assert.equal(store.add(key, 'notify'), false, 'adding twice changes nothing');
  const summary = rp.reviewSummary(store.get(key));
  assert.deepEqual(summary, { count: 5, total: 5, complete: true, text: 'Review complete' });
  states = sv.stepStates({ active: 'notify', hasResult: true, busy: false, reviewed: store.get(key) });
  assert.ok(states.every(s => s.reviewed && !s.next));
});

test('"Reviewed N of 5": Intake always counts once a ruling exists', () => {
  assert.equal(rp.reviewSummary([]).text, 'Reviewed 1 of 5 steps');
  assert.equal(rp.reviewSummary(['evidence']).text, 'Reviewed 2 of 5 steps');
  assert.equal(rp.reviewSummary(['intake', 'evidence']).count, 2, 'Intake is not counted twice');
  assert.equal(rp.reviewSummary(['evidence', 'hearing', 'ruling', 'notify']).complete, true);
});

test('progress is kept per case, and a new run resets it', () => {
  const storage = memoryStorage();
  const store = rp.createReviewStore(storage);
  const d003 = rp.reviewKey('D003', run('2026-10-16T05:00:00'));
  const d001 = rp.reviewKey('D001', run('2026-10-16T05:01:00'));
  store.add(d003, 'evidence');
  store.add(d001, 'hearing');
  assert.deepEqual([...store.get(d003)], ['evidence']);
  assert.deepEqual([...store.get(d001)], ['hearing'], 'switching cases keeps each case apart');
  // A re-run gives the case a new ruling, a new key and an empty review.
  const rerun = rp.reviewKey('D003', run('2026-10-16T05:09:00'));
  assert.notEqual(rerun, d003);
  assert.deepEqual([...store.get(rerun)], []);
  // A reload in the same tab session still has the old progress.
  assert.deepEqual([...rp.createReviewStore(storage).get(d003)], ['evidence']);
  assert.equal(rp.reviewKey('X', { agent_log: [] }), 'X|');
});

test('the session store survives blocked or corrupt storage', () => {
  const blocked = rp.createReviewStore({ getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
  assert.equal(blocked.add('k', 'evidence'), true);
  assert.deepEqual([...blocked.get('k')], ['evidence']);
  const corrupt = rp.createReviewStore({ getItem: () => '[not an object', setItem: () => {} });
  corrupt.add('k', 'hearing');
  assert.deepEqual([...corrupt.get('k')], ['hearing']);
  const tampered = rp.createReviewStore({ getItem: () => JSON.stringify({ k: ['evidence', 'bogus', 7] }), setItem: () => {} });
  assert.deepEqual([...tampered.get('k')], ['evidence'], 'unknown entries are ignored');
  assert.deepEqual([...rp.createReviewStore(null).get('k')], []);
});
