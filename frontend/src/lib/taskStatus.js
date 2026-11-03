import {
  calendarDate,
  calendarDay as DAY,
  taskSchedule,
} from '../features/timeline/lib/timeline.js';

// One status for every task, so Actions, Timeline, Tasks, the graph and the task panel all agree.
// It only reads what the task already holds. It never changes what the backend stores.

const DONE = ['Completed', 'completed', 'Done', 'done'];
const CANCELLED = ['Cancelled', 'cancelled'];

// key: the state. label: the agreed word. tone: the colour step in StatusChip.
const STATES = {
  done: { label: 'Done', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  waiting: { label: 'Approval pending', tone: 'warning' },
  blocked: { label: 'Blocked', tone: 'warning' },
  hold: { label: 'On hold', tone: 'neutral' },
  overdue: { label: 'Overdue', tone: 'overdue' },
  active: { label: 'In progress', tone: 'info' },
  upcoming: { label: 'Upcoming', tone: 'neutral' },
  open: { label: 'Open', tone: 'neutral' },
};

// Filters offer these in this order. Open and Upcoming are separate because dates separate them.
export const TASK_STATUS_OPTIONS = [
  'overdue',
  'waiting',
  'blocked',
  'hold',
  'active',
  'upcoming',
  'open',
  'done',
  'cancelled',
].map((key) => ({ key, label: STATES[key].label }));

// Today's calendar date as a UTC-midnight timestamp, matching timeline items.
export const todayDate = (now = new Date()) =>
  Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

export const isTaskDone = (task) => DONE.includes(task.status);
export const isTaskClosed = (task) => isTaskDone(task) || CANCELLED.includes(task.status);

// Founder-built stages have no gate fields, so their title is the only approval signal.
const APPROVAL_TITLE = /\b(approval|approve)\b|\bfinal check\b/i;
const needsApproval = (task, started) =>
  task.sourceStatus === 'Delay Requested' ||
  task.sourceApprovalStatus === 'Pending' ||
  task.status === 'review' ||
  (!task.sourceGateType && started && APPROVAL_TITLE.test(task.title || ''));
const isBlocked = (task) => task.status === 'Blocked' || task.sourceStatus === 'Issue Reported';
const isOnHold = (task) => task.status === 'On hold' || task.sourceStatus === 'On hold';
const isStarted = (task) => ['In progress', 'in_progress'].includes(task.status);

// The last day of the task, exclusive. A legacy dueDate or a stamped deadline still counts.
function endOf(task, schedule) {
  if (schedule.end !== null) return schedule.end;
  const day = calendarDate(String(task.deadline || task.dueDate || '').slice(0, 10));
  return day === null ? null : day + DAY;
}

const hasStarted = (task, start, today) => isStarted(task) || (start !== null && start <= today);

function stateOf(task, start, overdue, today) {
  if (isTaskDone(task)) return 'done';
  if (CANCELLED.includes(task.status)) return 'cancelled';
  if (isBlocked(task)) return 'blocked';
  if (needsApproval(task, hasStarted(task, start, today))) return 'waiting';
  if (isOnHold(task)) return 'hold';
  if (overdue) return 'overdue';
  if (isStarted(task)) return 'active';
  if (start === null) return 'open';
  return start <= today ? 'active' : 'upcoming';
}

// `schedule` lets a caller that already has { start, end } reuse it. Otherwise pass `stage`.
export function taskStatus(task, { stage, schedule, today = todayDate() } = {}) {
  const dates = schedule ?? taskSchedule(task, stage);
  const end = endOf(task, dates);
  const open = !isTaskClosed(task);
  const late = open && end !== null && end <= today;
  const overdueDays = late ? Math.round((today - end) / DAY) + 1 : 0;
  const key = stateOf(task, dates.start, late, today);
  const { label, tone } = STATES[key];
  const suffix = key === 'overdue' ? ` · ${overdueDays}d` : late ? ' · overdue' : '';
  return {
    key,
    label,
    tone: late ? 'overdue' : tone,
    overdue: late,
    overdueDays,
    started: hasStarted(task, dates.start, today),
    text: `${label}${suffix}`,
  };
}

// A task can be two things at once, such as blocked and overdue. Filters find it under both.
export function matchesTaskStatus(status, filter) {
  if (filter === 'overdue') return status.overdue;
  if (filter === 'active') return status.key === 'active' || (status.overdue && status.started);
  return status.key === filter;
}

// Project status is its own vocabulary, shown through the same chip.
export const PROJECT_STATUS_TONES = {
  'On track': 'success',
  Active: 'success',
  Completed: 'success',
  'At risk': 'warning',
  'On hold': 'neutral',
  Setup: 'info',
};
