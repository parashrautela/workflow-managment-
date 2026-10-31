import { calendarDay as DAY } from './timeline.js';

// Today's calendar date as a UTC-midnight timestamp, matching timelineItems.
export const todayDate = (now = new Date()) =>
  Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
export const isoDate = (value) => new Date(value).toISOString().slice(0, 10);

const isComplete = (task) => ['Completed', 'completed', 'Done'].includes(task.status);
const isClosed = (task) => isComplete(task) || task.status === 'Cancelled';

// What a founder needs from a bar at a glance. Items use exclusive end timestamps.
export function itemStatus(item, today = todayDate()) {
  const { task, start, end } = item;
  if (isComplete(task)) return { key: 'complete', label: 'Done', late: false };
  const scheduled = start !== null && end !== null;
  const late = scheduled && end <= today;
  if (task.sourceStatus === 'Delay Requested' || task.sourceApprovalStatus === 'Pending')
    return { key: 'waiting', label: 'Waiting on you', late };
  if (task.status === 'Blocked' || ['Issue Reported', 'On hold'].includes(task.sourceStatus))
    return { key: 'blocked', label: task.sourceStatus === 'On hold' ? 'On hold' : 'Blocked', late };
  if (!scheduled) return { key: 'unscheduled', label: 'No dates', late: false };
  if (late)
    return { key: 'late', label: `Late by ${Math.round((today - end) / DAY) + 1}d`, late: true };
  if (start <= today) return { key: 'active', label: 'In progress', late: false };
  return { key: 'upcoming', label: 'Upcoming', late: false };
}

export function unscheduledReason(item) {
  const { task } = item;
  if (task.sheetPlan)
    return task.missingDuration
      ? 'Duration missing in the Google Sheet'
      : 'Waits on an earlier step with no duration';
  if (task.sourceBlockedReason) return task.sourceBlockedReason;
  return 'No dates in the Google Sheet yet';
}

// One line for the header: the answers a founder looks for first.
export function scheduleSummary(items, today = todayDate()) {
  const open = items.filter((item) => !isClosed(item.task));
  const statuses = open.map((item) => itemStatus(item, today));
  const unscheduled = open.filter((item) => item.start === null || item.end === null).length;
  const ends = open.filter((item) => item.end !== null).map((item) => item.end);
  return {
    late: statuses.filter((status) => status.late).length,
    blocked: statuses.filter((status) => status.key === 'blocked').length,
    waiting: statuses.filter((status) => status.key === 'waiting').length,
    unscheduled,
    finish: unscheduled || !ends.length ? null : Math.max(...ends) - DAY,
  };
}

// Calendar-style edits become moves for the server. Ends sent to the server are inclusive last days.
export function moveFor(item, startShiftDays, endShiftDays = startShiftDays) {
  return {
    taskId: item.task.id,
    start: isoDate(item.start + startShiftDays * DAY),
    end: isoDate(item.end - DAY + endShiftDays * DAY),
    ...staleGuard(item.task),
  };
}

// Dropping one task on another swaps their slots; each keeps its own length.
export function swapMoves(a, b) {
  const lengthA = a.end - a.start;
  const lengthB = b.end - b.start;
  return [
    {
      taskId: a.task.id,
      start: isoDate(b.start),
      end: isoDate(b.start + lengthA - DAY),
      ...staleGuard(a.task),
    },
    {
      taskId: b.task.id,
      start: isoDate(a.start),
      end: isoDate(a.start + lengthB - DAY),
      ...staleGuard(b.task),
    },
  ];
}

// The dates the sheet currently holds, so the server can refuse a move made from an out-of-date screen.
export function staleGuard(task) {
  return {
    fromStart: task.sourceForecastStart || task.sourceCurrentStart || task.sourcePlannedStart || '',
    fromEnd: task.sourceForecastEnd || task.sourceCurrentEnd || task.sourcePlannedEnd || '',
  };
}

// Undo restores every task the change touched. Pushed successors go back as forecast-only changes.
export function undoMoves(affected = []) {
  return affected
    .filter((item) => item.webTaskId && item.previousStart && item.previousEnd)
    .map((item) => ({
      taskId: item.webTaskId,
      start: item.previousStart,
      end: item.previousEnd,
      fromStart: item.forecastStart,
      fromEnd: item.forecastEnd,
      forecastOnly: !item.committed,
    }));
}

export const canMove = (item) =>
  (Boolean(item.task.telegramTaskId) || item.task.customPlan === true) &&
  !item.task.sheetPlan &&
  !isClosed(item.task) &&
  item.start !== null &&
  item.end !== null;

// A whole stage moves together: every open, dated task in it shifts by the same number of days.
export function stageMoves(items, stageId, shiftDays) {
  return items
    .filter(
      (item) =>
        (item.stage?.id || 'other') === stageId &&
        !isClosed(item.task) &&
        item.start !== null &&
        item.end !== null &&
        (item.task.telegramTaskId || item.task.customPlan),
    )
    .map((item) => moveFor(item, shiftDays));
}

export function canChooseMoveMode(moves) {
  if (!moves?.length || moves.some((move) => move.forecastOnly)) return false;
  const delta = Date.parse(moves[0].start) - Date.parse(moves[0].fromStart);
  return (
    Number.isFinite(delta) &&
    delta !== 0 &&
    moves.every(
      (move) =>
        Date.parse(move.start) - Date.parse(move.fromStart) === delta &&
        Date.parse(move.end) - Date.parse(move.fromEnd) === delta,
    )
  );
}
