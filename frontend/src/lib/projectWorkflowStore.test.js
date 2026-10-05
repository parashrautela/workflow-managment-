import test from 'node:test';
import assert from 'node:assert/strict';
import { computeStageSchedule } from './projectWorkflowStore.js';

test('an ISO createdAt fallback does not blank a project with stages', () => {
  const dates = computeStageSchedule('2026-10-05T20:30:00.000Z', [{id: 'a', durationDays: 2}]);
  assert.equal(dates[0].startDate, '2026-10-05');
  assert.equal(dates[0].endDate, '2026-10-07');
});
test('saved server stage dates and deadlines take precedence over estimates', () => {
  const dates = computeStageSchedule('2026-10-01', [
    {id: 'a', startDate: '2026-10-06', deadline: '2026-10-09', durationDays: 1},
    {id: 'b', durationDays: 2}
  ]);
  assert.equal(dates[0].startDate, '2026-10-06');
  assert.equal(dates[0].endDate, '2026-10-09');
  assert.equal(dates[1].startDate, '2026-10-09');
  assert.equal(dates[1].endDate, '2026-10-11');
});
test('invalid stored dates and durations cannot crash schedule rendering', () => {
  const dates = computeStageSchedule('invalid', [{startDate: 'invalid', durationDays: 'invalid'}]);
  assert.match(dates[0].startDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(dates[0].endDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(computeStageSchedule('invalid', []), []);
});
test('date-only stages retain calendar dates regardless of browser timezone', () => {
  const dates = computeStageSchedule('2026-10-06', [{durationDays: '2'}, {durationDays: 1}]);
  assert.deepEqual(dates.map(d=>[d.startDate,d.endDate]), [['2026-10-06','2026-10-08'],['2026-10-08','2026-10-09']]);
});
