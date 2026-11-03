import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesTaskStatus, taskStatus, TASK_STATUS_OPTIONS, todayDate } from './taskStatus.js';
import { itemStatus, scheduleSummary } from '../features/timeline/lib/timelineStatus.js';
import { timelineItems } from '../features/timeline/lib/timeline.js';

const today = Date.UTC(2026, 9, 20);
const status = (task, options = {}) =>
  taskStatus({ status: 'Open', ...task }, { today, ...options });

test('an overdue task reads the same however it is reached', () => {
  const task = { status: 'Open', deadline: '2026-10-17' };
  const [item] = timelineItems([task], []);
  assert.equal(status(task).text, 'Overdue · 3d');
  assert.equal(taskStatus(task, { schedule: item, today }).text, 'Overdue · 3d');
  assert.equal(itemStatus(item, today).label, 'Overdue · 3d');
  assert.equal(status(task).tone, 'overdue');
});

test('Open and In progress follow one rule', () => {
  assert.equal(status({}).label, 'Open');
  assert.equal(status({ status: 'In progress' }).label, 'In progress');
  assert.equal(status({ status: 'in_progress' }).label, 'In progress');
  // Stored as Open, but its scheduled start has passed.
  assert.equal(
    status({ sourcePlannedStart: '2026-10-10', deadline: '2026-10-30' }).label,
    'In progress',
  );
  assert.equal(
    status({ sourcePlannedStart: '2026-10-25', deadline: '2026-10-30' }).label,
    'Upcoming',
  );
  // A stored start outranks a future plan.
  assert.equal(
    status({ status: 'In progress', sourcePlannedStart: '2026-10-25' }).label,
    'In progress',
  );
});

test('a task starts with its stage when it has no start of its own', () => {
  const stage = { startDate: '2026-10-01' };
  assert.equal(status({ deadline: '2026-10-30' }, { stage }).label, 'In progress');
  assert.equal(
    status({ deadline: '2026-11-30' }, { stage: { startDate: '2026-11-01' } }).label,
    'Upcoming',
  );
});

test('the due day itself is not overdue, the day after is', () => {
  assert.equal(status({ deadline: '2026-10-20' }).overdue, false);
  assert.equal(status({ deadline: '2026-10-19' }).overdue, true);
  assert.equal(status({ deadline: '2026-10-19' }).text, 'Overdue · 1d');
});

test('a legacy dueDate or a stamped deadline still counts as overdue', () => {
  assert.equal(status({ dueDate: '2026-10-17' }).key, 'overdue');
  assert.equal(status({ deadline: '2026-10-17T00:00:00.000Z' }).key, 'overdue');
});

test('finished work is never overdue', () => {
  assert.equal(status({ status: 'Completed', deadline: '2026-01-01' }).text, 'Done');
  assert.equal(status({ status: 'completed', deadline: '2026-01-01' }).tone, 'success');
  assert.equal(status({ status: 'Cancelled', deadline: '2026-01-01' }).text, 'Cancelled');
  assert.equal(status({ status: 'Cancelled', deadline: '2026-01-01' }).overdue, false);
});

test('states that need someone keep their word and add overdue beside it', () => {
  const late = { deadline: '2026-10-01' };
  assert.equal(status({ ...late, status: 'Blocked' }).text, 'Blocked · overdue');
  assert.equal(status({ ...late, sourceStatus: 'Issue Reported' }).text, 'Blocked · overdue');
  assert.equal(status({ ...late, sourceStatus: 'On hold' }).text, 'On hold · overdue');
  assert.equal(
    status({ ...late, sourceApprovalStatus: 'Pending' }).text,
    'Approval pending · overdue',
  );
  assert.equal(status({ ...late, status: 'Blocked' }).tone, 'overdue');
});

test('a gate alone is not an approval waiting on someone', () => {
  const gate = { sourceGateType: 'approval', sourceApprovalStatus: 'Not started' };
  assert.equal(status({ ...gate, deadline: '2026-12-20' }).label, 'Upcoming');
  assert.equal(
    status({ ...gate, sourceApprovalStatus: 'Approved', status: 'In progress' }).key,
    'active',
  );
  assert.equal(status({ ...gate, status: 'Blocked' }).label, 'Blocked');
  assert.equal(status({ ...gate, sourceApprovalStatus: 'Pending' }).label, 'Approval pending');
  assert.equal(status({ sourceStatus: 'Delay Requested' }).label, 'Approval pending');
  assert.equal(status({ status: 'review' }).label, 'Approval pending');
});

test('founder-built approvals count once started, without false matches', () => {
  const started = { status: 'In progress' };
  for (const title of [
    'Drawing approval',
    'Client Presentation & approval',
    'Final check',
    'Approve tile',
  ])
    assert.equal(status({ ...started, title }).label, 'Approval pending');
  assert.equal(status({ ...started, title: 'Deliver approved drawings' }).label, 'In progress');
  assert.equal(status({ title: 'Drawing approval' }).label, 'Open');
});

test('filters find a task under everything it is', () => {
  const late = { deadline: '2026-10-17' };
  const blocked = status({ ...late, status: 'Blocked' });
  assert.equal(matchesTaskStatus(blocked, 'overdue'), true);
  assert.equal(matchesTaskStatus(blocked, 'blocked'), true);
  const inProgress = status({ ...late, status: 'In progress' });
  assert.equal(matchesTaskStatus(inProgress, 'active'), true);
  assert.equal(matchesTaskStatus(inProgress, 'overdue'), true);
  assert.equal(matchesTaskStatus(status({ deadline: '2026-12-20' }), 'active'), false);
  assert.equal(matchesTaskStatus(status({}), 'done'), false);
});

test('On hold is neutral wherever it is stored', () => {
  assert.equal(status({ status: 'On hold' }).tone, 'neutral');
  assert.equal(status({ sourceStatus: 'On hold' }).tone, 'neutral');
  assert.equal(status({ sourceStatus: 'On hold' }).key, 'hold');
});

test('Timeline words come from the same status, including work with no dates', () => {
  const [undated] = timelineItems([{ status: 'Open' }], []);
  assert.equal(itemStatus(undated, today).key, 'unscheduled');
  assert.equal(itemStatus(undated, today).label, 'Open · no dates');
  const [done] = timelineItems([{ status: 'Completed', deadline: '2026-10-01' }], []);
  assert.equal(itemStatus(done, today).key, 'complete');
  assert.equal(itemStatus(done, today).label, 'Done');
});

test('On hold still counts as stuck in the schedule summary', () => {
  const items = timelineItems(
    [
      { status: 'Open', sourceStatus: 'On hold', deadline: '2026-10-30' },
      { status: 'Blocked', deadline: '2026-10-30' },
    ],
    [],
  );
  assert.equal(scheduleSummary(items, today).blocked, 2);
});

test('every filter option is a real state with a label', () => {
  assert.equal(TASK_STATUS_OPTIONS.length, 9);
  assert.ok(TASK_STATUS_OPTIONS.every((option) => option.label));
});

test('today is the local calendar day as UTC midnight', () => {
  assert.equal(todayDate(new Date(2026, 9, 20, 23, 30)), today);
});
