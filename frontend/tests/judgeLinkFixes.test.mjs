// The fixes from the 31 Oct UI review: decisions survive a reload, automatic closes never claim
// a human review, a decided appeal says what is left to do, and the hero follows the decision.
import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './_load.mjs';

const ds = await load('decisionState');
const rp = await load('reviewProgress');
const ns = await load('notifyState');
const as = await load('appealState');
const vd = await load('verdictDisplay');

const memoryStorage = () => { const map = new Map(); return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) }; };
const saved = { kind: 'decided', decision: 'no_action', precedentId: 'R-001', reason: 'Checked the chat log.', at: '10:00' };

test('a saved decision comes back after a reload with its precedent', () => {
  const storage = memoryStorage();
  ds.writeSaved(storage, { 'D007|run': saved });
  assert.deepEqual(ds.readSaved(storage), { 'D007|run': saved });
});

test('damaged or blocked storage restores nothing', () => {
  const storage = memoryStorage();
  storage.setItem(ds.SAVED_KEY, '{not json');
  assert.deepEqual(ds.readSaved(storage), {});
  assert.deepEqual(ds.readSaved(null), {});
  storage.setItem(ds.SAVED_KEY, JSON.stringify({ a: { kind: 'auto', decision: 'no_action', precedentId: 'R-1' }, b: { kind: 'decided', decision: 'needs_review', precedentId: 'R-2' }, c: { kind: 'decided', decision: 'no_action' } }));
  assert.deepEqual(ds.readSaved(storage), {});
});

test('an automatic close says so instead of claiming a review', () => {
  assert.equal(rp.AUTO_SUMMARY.text, 'Auto-resolved');
  assert.equal(ns.closingTitle('D001', rp.AUTO_SUMMARY), 'Closed automatically: D001');
});

test('a decided appeal that differs says the parties have not been told', () => {
  const appeal = { status: 'decided', reviewer_decision: 'full_refund' };
  const current = { decision: 'partial_refund', text: 'Partial refund $6.30' };
  assert.match(as.appealFollowUp(appeal, current, true), /still Partial refund \$6\.30.*not been told.*Reopen the case/);
  assert.match(as.appealFollowUp(appeal, current, false), /Change the decision in this review/);
});

test('a decided appeal that matches, or one still waiting, asks for nothing', () => {
  const current = { decision: 'partial_refund', text: 'Partial refund $6.30' };
  assert.match(as.appealFollowUp({ status: 'decided', reviewer_decision: 'partial_refund' }, current, true), /Nothing new goes/);
  assert.equal(as.appealFollowUp({ status: 'queued', reviewer_decision: null }, current, true), null);
  assert.equal(as.appealFollowUp({ status: 'decided', reviewer_decision: 'full_refund' }, null, true), null);
});

test('the hero stops awaiting review once a person has decided', () => {
  const hero = vd.rulingHero({ decision: 'needs_review', refund_amount: null, policy_refs: [] });
  assert.equal(hero.headline, 'You Decide This Case');
  const decided = vd.decidedHero(hero, { decision: 'no_action', amount: null, by: 'decided' });
  assert.equal(decided.label, 'Reviewer Decided');
  assert.notEqual(decided.headline, 'You Decide This Case');
  assert.equal(vd.decidedHero(hero, { decision: 'partial_refund', amount: 6.9, by: 'decided' }).amount, 6.9);
});

test('accepting a ruling or having no decision leaves the hero alone', () => {
  const hero = vd.rulingHero({ decision: 'partial_refund', refund_amount: 6.3, policy_refs: [] });
  assert.equal(vd.decidedHero(hero, null), hero);
  assert.equal(vd.decidedHero(hero, { decision: 'partial_refund', amount: 6.3, by: null }), hero);
});

test('an override keeps the larger amount in the hero, labelled as an override', () => {
  const hero = vd.rulingHero({ decision: 'partial_refund', refund_amount: 6.3, policy_refs: [] });
  const over = vd.decidedHero(hero, { decision: 'partial_refund', amount: 8, by: 'overridden' });
  assert.equal(over.label, 'Reviewer Overrode the Rules');
  assert.equal(over.amount, 8);
});
