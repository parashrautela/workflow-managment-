import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarDate } from './timeline.js';
import { canChooseMoveMode, canMove, itemStatus, moveFor, scheduleSummary, swapMoves, undoMoves, unscheduledReason } from './timelineStatus.js';

const today = calendarDate('2026-10-16');
const item = (task, start, end) => ({ task: { id: task.id || 'x', status: 'Open', ...task }, start: start && calendarDate(start), end: end && calendarDate(end) });

test('bars report late, blocked, waiting, active and upcoming states', () => {
  assert.deepEqual(itemStatus(item({}, '2026-10-10', '2026-10-14'), today), { key: 'late', label: 'Late by 3d', late: true });
  assert.equal(itemStatus(item({}, '2026-10-10', '2026-10-17'), today).key, 'active');
  assert.equal(itemStatus(item({}, '2026-10-20', '2026-10-22'), today).key, 'upcoming');
  assert.equal(itemStatus(item({ status: 'Blocked', sourceStatus: 'Issue Reported' }, '2026-10-10', '2026-10-12'), today).late, true);
  assert.equal(itemStatus(item({ sourceStatus: 'Delay Requested' }, '2026-10-20', '2026-10-22'), today).label, 'Waiting on you');
  assert.equal(itemStatus(item({ status: 'Completed' }, '2026-10-01', '2026-10-02'), today).key, 'complete');
  assert.equal(itemStatus(item({}, null, null), today).key, 'unscheduled');
});

test('the header summary counts what needs attention and only confirms a finish when every open task is dated', () => {
  const items = [
    item({ id: 'a' }, '2026-10-01', '2026-10-05'),
    item({ id: 'b', status: 'Blocked' }, '2026-10-20', '2026-10-25'),
    item({ id: 'c', sourceApprovalStatus: 'Pending' }, '2026-10-26', '2026-11-02'),
    item({ id: 'd', status: 'Completed' }, null, null),
  ];
  assert.deepEqual(scheduleSummary(items, today), { late: 1, blocked: 1, waiting: 1, unscheduled: 0, finish: calendarDate('2026-11-01') });
  assert.equal(scheduleSummary([...items, item({ id: 'e' }, null, null)], today).finish, null);
});

test('drags, resizes and swaps become inclusive-date moves with stale guards', () => {
  const carpentry = item({ id: 'carp', sourceForecastStart: '2026-10-20', sourceForecastEnd: '2026-10-24' }, '2026-10-20', '2026-10-25');
  assert.deepEqual(moveFor(carpentry, 3), { taskId: 'carp', start: '2026-10-23', end: '2026-10-27', fromStart: '2026-10-20', fromEnd: '2026-10-24' });
  assert.deepEqual(moveFor(carpentry, 0, 2), { taskId: 'carp', start: '2026-10-20', end: '2026-10-26', fromStart: '2026-10-20', fromEnd: '2026-10-24' });
  const tiles = item({ id: 'tile', sourceCurrentStart: '2026-11-01', sourceCurrentEnd: '2026-11-02' }, '2026-11-01', '2026-11-03');
  assert.deepEqual(swapMoves(carpentry, tiles).map((move) => [move.taskId, move.start, move.end]), [['carp', '2026-11-01', '2026-11-05'], ['tile', '2026-10-20', '2026-10-21']]);
});

test('undo restores moved and pushed tasks, pushed ones as forecast only', () => {
  const affected = [
    { webTaskId: 'a', committed: true, previousStart: '2026-10-01', previousEnd: '2026-10-03', forecastStart: '2026-10-02', forecastEnd: '2026-10-04' },
    { webTaskId: 'b', committed: false, previousStart: '2026-10-04', previousEnd: '2026-10-05', forecastStart: '2026-10-05', forecastEnd: '2026-10-06' },
    { webTaskId: '', committed: false, previousStart: '2026-10-04', previousEnd: '2026-10-05' },
  ];
  assert.deepEqual(undoMoves(affected).map((move) => [move.taskId, move.start, move.forecastOnly, move.fromStart]), [['a', '2026-10-01', false, '2026-10-02'], ['b', '2026-10-04', true, '2026-10-05']]);
});

test('only linked, open, dated work can be dragged, and undated work says why', () => {
  assert.equal(canMove(item({ telegramTaskId: 'P1-T1' }, '2026-10-01', '2026-10-02')), true);
  assert.equal(canMove(item({ telegramTaskId: 'P1-T1', status: 'Completed' }, '2026-10-01', '2026-10-02')), false);
  assert.equal(canMove(item({ sheetPlan: true, telegramTaskId: 'x' }, '2026-10-01', '2026-10-02')), false);
  assert.equal(unscheduledReason(item({ sheetPlan: true, missingDuration: true }, null, null)), 'Duration missing in the Google Sheet');
  assert.equal(unscheduledReason(item({}, null, null)), 'No dates in the Google Sheet yet');
});


test('only whole translations offer the two move options',()=>{
  const a={taskId:'a',fromStart:'2026-10-01',fromEnd:'2026-10-03',start:'2026-10-03',end:'2026-10-05'};
  assert.equal(canChooseMoveMode([a]),true);
  assert.equal(canChooseMoveMode([{...a,end:'2026-10-06'}]),false);
  assert.equal(canChooseMoveMode([a,{...a,taskId:'b',start:'2026-10-02',end:'2026-10-04'}]),false);
  assert.equal(canChooseMoveMode([{...a,forecastOnly:true}]),false);
  assert.equal(canChooseMoveMode([]),false);
});
