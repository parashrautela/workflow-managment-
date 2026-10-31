import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  STAGE_TASKS,
  DURATION_OPTIONS,
  durationLabel,
  defaultStageTasks,
} from './stageTemplate.js';
import { orderStagesForPicker, defaultTaskForStage } from './stagePicker.js';
import { stageMoves } from './timelineStatus.js';
import { timelineItems } from './timeline.js';

const day = (value) => Date.parse(`${value}T00:00:00Z`);

test('the stage template matches the copy taken from the bot', async () => {
  const fixture = JSON.parse(
    await readFile(new URL('./stageTemplate.fixture.json', import.meta.url), 'utf8'),
  );
  assert.deepEqual(STAGE_TASKS, fixture);
  assert.equal(DURATION_OPTIONS[0], 0);
  assert.equal(durationLabel(0), 'Skip');
  assert.equal(durationLabel(1), '1 day');
  assert.equal(defaultStageTasks().length, 6);
});

const stages = [
  { id: 'a', name: 'Civil' },
  { id: 'b', name: 'Flooring' },
  { id: 'c', name: 'Design' },
  { id: 'd', name: 'Painting' },
];
const task = (id, stageId, start, end, extra = {}) => ({
  id,
  stageId,
  title: id,
  status: 'Open',
  telegramTaskId: `T-${id}`,
  sourceForecastStart: start,
  sourceForecastEnd: end,
  deadline: end,
  ...extra,
});
const tasks = [
  task('a1', 'a', '2026-10-10', '2026-10-14', { status: 'Completed' }),
  task('a2', 'a', '2026-10-15', '2026-10-20'),
  task('b1', 'b', '2026-10-25', '2026-10-28'),
  task('c1', 'c', '2026-09-01', '2026-09-05', { status: 'Completed' }),
  task('d1', 'd', '2026-10-21', '2026-10-24'),
];

test('ongoing stages come first and finished stages cannot be chosen', () => {
  const items = timelineItems(tasks, stages);
  const rows = orderStagesForPicker(stages, items, day('2026-10-16'));
  assert.deepEqual(
    rows.map((row) => [row.stage.name, row.status, row.selectable]),
    [
      ['Civil', 'ongoing', true],
      ['Painting', 'upcoming', true],
      ['Flooring', 'upcoming', true],
      ['Design', 'completed', false],
    ],
  );
  assert.equal(defaultTaskForStage(items, 'a', day('2026-10-16')).task.id, 'a2');
});

test('moving a stage shifts its open tasks together and leaves finished ones', () => {
  const items = timelineItems(tasks, stages);
  const moves = stageMoves(items, 'a', 3);
  assert.deepEqual(
    moves.map((move) => [move.taskId, move.start, move.end, move.fromStart]),
    [['a2', '2026-10-18', '2026-10-23', '2026-10-15']],
  );
  assert.deepEqual(
    stageMoves(items, 'b', -2).map((move) => [move.start, move.end]),
    [['2026-10-23', '2026-10-26']],
  );
});

test('a reviewed default plan keeps the founder choices and re-links stages after unticked ones', async () => {
  const { defaultPlanSpecs } = await import('./stageTemplate.js');
  const six = (days) => STAGE_TASKS.map((task) => ({ key: task.key, durationDays: days }));
  const specs = defaultPlanSpecs(
    [
      { name: 'Design plan', include: false, placement: { type: 'date' }, tasks: six(1) },
      {
        name: 'Civil Work',
        include: true,
        placement: { type: 'after', stageName: 'Design plan' },
        tasks: six(2),
      },
      {
        name: 'Electrical Work',
        include: true,
        placement: { type: 'parallel', stageName: 'Civil Work' },
        tasks: six(1),
      },
      {
        name: 'Plumbing',
        include: true,
        placement: { type: 'after', stageName: 'Skipped stage' },
        tasks: six(1),
      },
    ],
    '2026-11-02',
  );
  assert.deepEqual(
    specs.map((spec) => [spec.name, spec.placement]),
    [
      ['Civil Work', { type: 'date', startDate: '2026-11-02' }],
      ['Electrical Work', { type: 'parallel', stageName: 'Civil Work' }],
      ['Plumbing', { type: 'after', stageName: 'Electrical Work' }],
    ],
  );
  assert.equal(specs[0].tasks[0].durationDays, 2);
});
