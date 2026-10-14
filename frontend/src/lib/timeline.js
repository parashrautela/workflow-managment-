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
