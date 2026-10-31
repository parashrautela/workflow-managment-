import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { timelineItems } from './timeline.js';
import { buildSheetPlan } from './sheetPlan.js';
const source = JSON.parse(
  readFileSync(new URL('../../../data/sheet-workflows.json', import.meta.url), 'utf8'),
);
const plan = source.plans.find((plan) => plan.id === 'interior-1');
test('the complete source plan retains all 68 works across both sides of the sheet', () => {
  const result = buildSheetPlan(plan, '2026-10-06');
  assert.equal(result.stages.length, 21);
  assert.equal(result.tasks.length, 68);
  assert.equal(new Set(result.tasks.map((task) => task.id)).size, 68);
  for (const cell of ['E15', 'E61', 'K29', 'K38', 'K50', 'K51', 'K58'])
    assert.ok(result.tasks.some((task) => task.sheetSourceCell === cell));
  assert.ok(result.stages.some((stage) => stage.sheetName === 'Ceiling_1'));
  assert.ok(result.stages.some((stage) => stage.sheetName === 'Wall POP'));
  assert.equal(
    result.tasks.filter(
      (task) => task.sheetTaskOrder === '2' && ['K50', 'K51'].includes(task.sheetSourceCell),
    ).length,
    2,
  );
});
test('calendar-day durations and side placement preserve parallel work', () => {
  const { tasks } = buildSheetPlan(plan, '2026-10-06');
  const at = (cell) => tasks.find((task) => task.sheetSourceCell === cell);
  assert.equal(at('E15').sourceCurrentStart, '2026-10-06');
  assert.equal(at('E16').sourceCurrentStart, '2026-10-07');
  assert.equal(at('E16').sourceCurrentEnd, '2026-10-09');
  assert.equal(at('K29').sourceCurrentStart, at('E29').sourceCurrentStart);
  assert.ok(at('K29').sourceCurrentStart < at('E31').sourceCurrentEnd);
  assert.equal(at('K38').sourceCurrentEnd, '');
  assert.equal(at('K39').sourceCurrentStart, '');
  const items = timelineItems(tasks, buildSheetPlan(plan, '2026-10-06').stages);
  assert.equal(items.find((item) => item.task.sheetSourceCell === 'K39').start, null);
  assert.equal(items.filter((item) => item.start === null || item.end === null).length, 2);
});
test('missing durations are not invented and only unique live task matches carry completion', () => {
  assert.throws(() => buildSheetPlan(plan, '2026-02-30'), /valid/);
  const liveStages = [{ id: 'design', name: 'Design plan' }];
  const liveTasks = [
    {
      id: 'saved',
      stageId: 'design',
      title: '2D drawing',
      status: 'Completed',
      assigneeId: 'person',
    },
  ];
  let result = buildSheetPlan(plan, '2026-10-06', liveTasks, liveStages);
  assert.equal(result.tasks.find((task) => task.sheetSourceCell === 'E16').linkedTaskId, 'saved');
  assert.equal(result.tasks.find((task) => task.sheetSourceCell === 'E16').status, 'Completed');
  assert.equal(result.tasks.find((task) => task.sheetSourceCell === 'K38').sheetDurationDays, null);
  result = buildSheetPlan(
    plan,
    '2026-10-06',
    [...liveTasks, { ...liveTasks[0], id: 'duplicate' }],
    liveStages,
  );
  assert.equal(result.tasks.find((task) => task.sheetSourceCell === 'E16').linkedTaskId, null);
});
