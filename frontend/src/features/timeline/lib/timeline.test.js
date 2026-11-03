import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarDate, calendarDay, timelineItems, stageSummary } from './timeline.js';
test('timeline uses valid source dates and preserves parallel stages', () => {
  assert.equal(calendarDate('2026-02-30'), null);
  const tasks = [
    {
      id: 'civil',
      stageId: 'c',
      title: 'Civil',
      sourceCurrentStart: '2026-10-14',
      sourceCurrentEnd: '2026-10-18',
    },
    {
      id: 'electrical',
      stageId: 'e',
      title: 'Electrical',
      sourceCurrentStart: '2026-10-16',
      deadline: '2026-10-19',
    },
    { id: 'unknown', title: 'No dates' },
    { id: 'due', title: 'Deadline only', deadline: '2026-10-20' },
    { id: 'deleted', deletedAt: '2026-10-14', title: 'Hidden' },
  ];
  const items = timelineItems(tasks, [
    { id: 'c', name: 'Civil' },
    { id: 'e', name: 'Electrical' },
  ]);
  assert.equal(items.length, 4);
  assert.ok(items[1].start < items[0].end);
  assert.equal(items[0].end, calendarDate('2026-10-19'));
  assert.equal(items[2].start, null);
  assert.equal(items[3].end - items[3].start, calendarDay);
  assert.equal(items[3].milestone, true);
});
test('stage summary includes all work and its real date range without crossing stages', () => {
  const stages = [
    { id: 'resources', name: 'Resources' },
    { id: 'civil', name: 'Civil' },
  ];
  const items = timelineItems(
    [
      {
        id: 'a',
        stageId: 'resources',
        title: 'Client references',
        status: 'Completed',
        sourceCurrentStart: '2026-10-06',
        deadline: '2026-10-07',
      },
      {
        id: 'b',
        stageId: 'resources',
        title: 'Site photos',
        status: 'Open',
        sourceCurrentStart: '2026-10-07',
        deadline: '2026-10-10',
      },
      {
        id: 'c',
        stageId: 'civil',
        title: 'Civil',
        status: 'Open',
        sourceCurrentStart: '2026-10-05',
        deadline: '2026-10-20',
      },
    ],
    stages,
  );
  const summary = stageSummary(items, stages[0]);
  assert.deepEqual(
    summary.items.map((item) => item.task.id),
    ['a', 'b'],
  );
  assert.equal(summary.start, calendarDate('2026-10-06'));
  assert.equal(summary.end, calendarDate('2026-10-11'));
  assert.equal(summary.complete, 1);
  assert.equal(summary.progress, 50);
});
test('stage dates are used only for tasks with a known compatible deadline', () => {
  const items = timelineItems(
    [
      { title: 'Within stage', stageId: 'design', deadline: '2026-10-16' },
      { title: 'No end', stageId: 'design' },
      { title: 'Earlier deadline', stageId: 'design', deadline: '2026-10-12' },
    ],
    [{ id: 'design', startDate: '2026-10-14' }],
  );
  assert.equal(items[0].start, calendarDate('2026-10-14'));
  assert.equal(items[1].start, null);
  assert.equal(items[2].start, calendarDate('2026-10-12'));
});
test('approved Telegram delays move the bar through forecast dates', () => {
  const [item] = timelineItems(
    [
      {
        id: 'd',
        stageId: 's',
        title: 'Carpentry',
        sourcePlannedStart: '2026-10-06',
        sourcePlannedEnd: '2026-10-08',
        sourceForecastStart: '2026-10-11',
        sourceForecastEnd: '2026-10-13',
      },
    ],
    [],
  );
  assert.equal(item.start, calendarDate('2026-10-11'));
  assert.equal(item.end, calendarDate('2026-10-14'));
});
test('a deadline moved before the recorded start stays visible', () => {
  const [item] = timelineItems(
    [
      {
        id: 'e',
        stageId: 's',
        title: 'Tiles',
        sourceCurrentStart: '2026-10-10',
        sourceCurrentEnd: '2026-10-12',
        deadline: '2026-10-08',
      },
    ],
    [],
  );
  assert.equal(item.start, calendarDate('2026-10-08'));
  assert.equal(item.end, calendarDate('2026-10-09'));
});
