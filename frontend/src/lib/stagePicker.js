import { calendarDay as DAY } from './timeline.js';
import { todayDate } from './timelineStatus.js';

const done = (task) => ['Completed', 'completed', 'Done'].includes(task.status);

// Stages for the "where does this query belong?" list: running today first, then coming up, then finished.
// A finished stage cannot take a delay or redo, so it is listed but not selectable.
export function orderStagesForPicker(stages = [], items = [], today = todayDate()) {
  const rows = stages.map((stage) => {
    const group = items.filter((item) => item.stage?.id === stage.id);
    const open = group.filter((item) => !done(item.task) && item.task.status !== 'Cancelled');
    const starts = group.map((item) => item.start).filter((value) => value !== null);
    const ends = group.map((item) => item.end).filter((value) => value !== null);
    const start = starts.length ? Math.min(...starts) : null;
    const end = ends.length ? Math.max(...ends) : null;
    let status;
    if (group.length && !open.length) status = 'completed';
    else if (open.some((item) => item.task.status === 'In progress' || (item.start !== null && item.start <= today && item.end > today))) status = 'ongoing';
    else if (open.some((item) => item.end !== null && item.end <= today)) status = 'ongoing';
    else status = 'upcoming';
    return { stage, status, start, end, selectable: status !== 'completed', taskCount: group.length };
  });
  const rank = { ongoing: 0, upcoming: 1, completed: 2 };
  return rows.sort((a, b) => rank[a.status] - rank[b.status]
    || (a.status === 'completed' ? (b.end ?? 0) - (a.end ?? 0) : (a.start ?? Infinity) - (b.start ?? Infinity)));
}

// The task to pre-select in a stage: the one running today, else the first unfinished one.
export function defaultTaskForStage(items = [], stageId, today = todayDate()) {
  const open = items.filter((item) => item.stage?.id === stageId && !done(item.task))
    .sort((a, b) => (Number(a.task.sourceSequence) || 0) - (Number(b.task.sourceSequence) || 0));
  return open.find((item) => item.start !== null && item.start <= today && item.end > today) || open[0] || null;
}

export const stageDays = (row) => (row.start !== null && row.end !== null ? Math.round((row.end - row.start) / DAY) : 0);
