const DAY = 86400000;
export function calendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0,10) === value ? timestamp : null;
}
export function timelineItems(tasks, stages) {
  const stageMap = new Map(stages.map(stage => [stage.id, stage]));
  return tasks.filter(task => !task.deletedAt && task.status !== 'Cancelled').map(task => {
    const stage = stageMap.get(task.stageId);
    const directStart = calendarDate(task.sourceCurrentStart) ?? calendarDate(task.sourcePlannedStart);
    const endDate = calendarDate(task.sourceCurrentEnd) ?? calendarDate(task.deadline) ?? calendarDate(task.sourcePlannedEnd);
    const stageStart = calendarDate(stage?.startDate);
    const start = directStart ?? (stageStart !== null && endDate !== null && stageStart <= endDate ? stageStart : endDate);
    const end = endDate !== null && start !== null && endDate >= start ? endDate + DAY : null;
    return { task, stage, start, end, milestone: directStart === null && stageStart === null && endDate !== null };
  });
}
export const calendarDay = DAY;

export function stageSummary(items, stage) {
  const group = items.filter(item => (item.stage?.id || 'other') === stage.id);
  const scheduled = group.filter(item => item.start !== null && item.end !== null);
  const complete = group.filter(item => ['Completed', 'completed'].includes(item.task.status)).length;
  const stageEnd = calendarDate(stage.deadline);
  return {
    items: group,
    start: scheduled.length ? Math.min(...scheduled.map(item => item.start)) : calendarDate(stage.startDate),
    end: scheduled.length ? Math.max(...scheduled.map(item => item.end)) : stageEnd === null ? null : stageEnd + DAY,
    complete,
    progress: group.length ? Math.round(complete / group.length * 100) : 0,
  };
}
