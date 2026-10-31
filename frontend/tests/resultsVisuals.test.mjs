import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/resultsVisuals.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { RESULTS_BOX, SAMPLE_TICKS, REPEAT_DOTS, AUTOMATION_RING, STOPWATCH } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10);
const inside = (n) => assert.ok(n >= 0 && n <= RESULTS_BOX, `coordinate ${n} outside viewBox`);

test('100 rerun dots form ten rows with unique positions inside the box', () => {
  assert.equal(REPEAT_DOTS.length, 100);
  assert.equal(new Set(REPEAT_DOTS.map(p => `${p.x},${p.y}`)).size, 100);
  assert.deepEqual(Array.from({length:10}, (_, row) => REPEAT_DOTS.filter(p => p.row === row).length), Array(10).fill(10));
});
test('nine ticks retain sample ID order', () => {
  assert.equal(SAMPLE_TICKS.length, 9);
  assert.deepEqual(SAMPLE_TICKS.map(p => p.id), ['D001','D002','D003','D004','D005','D006','D007','D008','DISP-002']);
});
test('automation arc is computed from 390 of 500 disputes, with the other 22% neutral', () => {
  near(AUTOMATION_RING.ratio, 0.78);
  near(AUTOMATION_RING.accentLength, 2 * Math.PI * AUTOMATION_RING.radius * 390 / 500);
  near(AUTOMATION_RING.offset, AUTOMATION_RING.circumference * 0.22);
});
test('stopwatch arc and hand represent 17 seconds on a 60-second dial', () => {
  near(STOPWATCH.accentLength, 2 * Math.PI * STOPWATCH.radius * 17 / 60);
  near(STOPWATCH.handAngle, 102);
});
test('all geometry, including strokes, watch hand and button, stays in the viewBox', () => {
  for(const p of [...SAMPLE_TICKS, ...REPEAT_DOTS]) {
    const edge = p.radius + ('id' in p ? 0.75 : 0);
    [p.x-edge,p.x+edge,p.y-edge,p.y+edge].forEach(inside);
  }
  for(const ring of [AUTOMATION_RING, STOPWATCH]) {
    const edge = ring.radius + ring.width/2;
    [ring.x-edge,ring.x+edge,ring.y-edge,ring.y+edge].forEach(inside);
  }
  const b=STOPWATCH.button;
  [b.x,b.y,b.x+b.width,b.y+b.height,STOPWATCH.stem.x,STOPWATCH.stem.y1,STOPWATCH.stem.y2].forEach(inside);
  // The hand's entire animated sweep, including the round end cap.
  for(let angle=0;angle<=STOPWATCH.handAngle;angle++) {
    const r=angle*Math.PI/180,x=STOPWATCH.x+STOPWATCH.handLength*Math.sin(r),y=STOPWATCH.y-STOPWATCH.handLength*Math.cos(r);
    [x-1.5,x+1.5,y-1.5,y+1.5].forEach(inside);
  }
});

test('the cost coins and the injection shield stay in the viewBox', async () => {
  const { COINS, SHIELD } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
  for (const coin of COINS) [coin.x - coin.radius - 1, coin.x + coin.radius + 1, coin.y - coin.radius - 1, coin.y + coin.radius + 1].forEach(inside);
  const { left, right, top, bottom } = SHIELD.bounds;
  [left - 1.25, right + 1.25, top - 1.25, bottom + 1.25].forEach(inside);
  for (const n of SHIELD.outline.match(/\d+/g).map(Number)) inside(n);
});
