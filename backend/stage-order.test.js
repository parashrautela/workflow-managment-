import test from 'node:test';
import assert from 'node:assert/strict';
import { planStageOrder, stageOrderFingerprint } from './stage-order.js';
const stages = ['resources', 'discovery', 'planning', 'execution'].map((id) => ({ id, name: id }));
const fixture = () =>
  stages.map((stage, index) => ({
    id: stage.id,
    stageId: stage.id,
    title: stage.name,
    sequence: String(index + 1),
    start: `2026-10-0${index * 2 + 1}`,
    end: `2026-10-0${index * 2 + 2}`,
    status: 'Open',
    dependencies: index ? [{ id: stages[index - 1].id, type: 'FS' }] : [],
  }));
const order = ['resources', 'planning', 'discovery', 'execution'];
test('Planning can precede Discovery; preview preserves durations, moves successors and changes prerequisites without mutating input', () => {
  const input = fixture(),
    original = structuredClone(input);
  input[2].end = '2026-10-08';
  const result = planStageOrder(input, stages, order);
  const planned = new Map(result.tasks.map((task) => [task.id, task]));
  assert.equal(planned.get('planning').start, '2026-10-03');
  assert.equal(planned.get('planning').end, '2026-10-06');
  assert.equal(planned.get('discovery').start, '2026-10-07');
  assert.equal(planned.get('execution').start, '2026-10-09');
  assert.deepEqual(planned.get('planning').dependencies, [{ id: 'resources', type: 'FS' }]);
  assert.deepEqual(planned.get('discovery').dependencies, [{ id: 'planning', type: 'FS' }]);
  assert.equal(input[1].start, original[1].start);
  assert.equal(result.affected.length, 3);
  assert.equal(result.dependencyChanges.length, 3);
});
test('reordering can move the first stage and preserves parallel workflow positions', () => {
  const input = fixture();
  input[1].dependencies = [{ id: 'resources', type: 'SS' }];
  const result = planStageOrder(input, stages, ['planning', 'resources', 'discovery', 'execution']);
  assert.equal(result.tasks.find((task) => task.id === 'planning').start, '2026-10-01');
  assert.deepEqual(result.tasks.find((task) => task.id === 'resources').dependencies, [
    { id: 'planning', type: 'SS' },
  ]);
});
test('invalid orders, missing dates and started/finished work are rejected', () => {
  for (const invalid of [
    null,
    ['resources'],
    ['resources', 'planning', 'planning', 'execution'],
    stages.map((stage) => stage.id),
  ])
    assert.throws(() => planStageOrder(fixture(), stages, invalid));
  for (const status of ['Completed', 'In progress', 'On hold', 'Issue Reported']) {
    const tasks = fixture();
    tasks[1].status = status;
    assert.throws(() => planStageOrder(tasks, stages, order), /started or finished/);
  }
  const tasks = fixture();
  tasks[2].start = '';
  assert.throws(() => planStageOrder(tasks, stages, order), /valid dates/);
  assert.notEqual(
    stageOrderFingerprint(stages, fixture()),
    stageOrderFingerprint([...stages].reverse(), fixture()),
  );
});
