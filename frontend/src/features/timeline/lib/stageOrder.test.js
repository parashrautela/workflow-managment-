import test from 'node:test';
import assert from 'node:assert/strict';
import { movedStageIds } from './stageOrder.js';
const stages = ['resources', 'discovery', 'planning'].map((id) => ({ id }));
test('pointer and keyboard moves use the same before/after insertion without changing source data', () => {
  assert.deepEqual(movedStageIds(stages, 'planning', 'discovery'), [
    'resources',
    'planning',
    'discovery',
  ]);
  assert.deepEqual(movedStageIds(stages, 'resources', 'planning', true), [
    'discovery',
    'planning',
    'resources',
  ]);
  assert.deepEqual(movedStageIds(stages, 'discovery', 'planning', true), [
    'resources',
    'planning',
    'discovery',
  ]);
  assert.deepEqual(
    movedStageIds(stages, 'planning', 'planning'),
    stages.map((stage) => stage.id),
  );
  assert.equal(stages[0].id, 'resources');
});

test('drop halves follow the heading even when a stage has expanded tasks', async () => {
  const { stageDropPosition } = await import('./stageOrder.js');
  const heading = { top: 100, height: 60 };
  assert.deepEqual(stageDropPosition(stages, 'resources', 'planning', 129, heading), {
    targetId: 'planning',
    after: false,
  });
  assert.deepEqual(stageDropPosition(stages, 'resources', 'planning', 130, heading), {
    targetId: 'planning',
    after: true,
  });
  // Expanded task content is below the heading; it must still mean below that stage.
  assert.deepEqual(stageDropPosition(stages, 'resources', 'planning', 170, heading), {
    targetId: 'planning',
    after: true,
  });
  assert.deepEqual(stageDropPosition(stages, 'planning', 'resources', 110, heading), {
    targetId: 'resources',
    after: false,
  });
});

test('invalid targets, the source row and unchanged adjacent positions do not create drops', async () => {
  const { stageDropPosition } = await import('./stageOrder.js');
  const heading = { top: 100, height: 60 };
  assert.equal(stageDropPosition(stages, 'resources', null, 140, heading), null);
  assert.equal(stageDropPosition(stages, 'resources', 'resources', 140, heading), null);
  assert.equal(stageDropPosition(stages, 'resources', 'discovery', 110, heading), null);
  assert.equal(stageDropPosition(stages, 'planning', 'discovery', 140, heading), null);
  assert.equal(stageDropPosition(stages, 'resources', 'planning', 140, null), null);
});
