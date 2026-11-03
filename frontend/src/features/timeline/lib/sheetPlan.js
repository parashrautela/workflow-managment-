import { calendarDate, calendarDay } from './timeline.js';

const clean = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
const iso = (value) => (value === null ? '' : new Date(value).toISOString().slice(0, 10));

export function buildSheetPlan(plan, startDate, liveTasks = [], liveStages = []) {
  const origin = calendarDate(startDate);
  if (origin === null) throw new Error('Choose a valid plan start date.');
  const windows = new Map();
  const rowStarts = new Map();
  let cursor = origin;
  const mainStages = plan.stages
    .filter((stage) => stage.lane === 'main')
    .sort((a, b) => a.sourceRow - b.sourceRow);
  const schedule = (stage, start) => {
    let time = start;
    const tasks = stage.tasks.map((task) => {
      const from = time;
      if (stage.lane === 'main') rowStarts.set(task.sourceRow, from);
      const end =
        from !== null && task.durationDays !== null ? from + task.durationDays * calendarDay : null;
      time = end;
      return { source: task, start: from, end };
    });
    const window = { start, end: time, tasks };
    windows.set(stage.id, window);
    return time;
  };
  for (const stage of mainStages) cursor = schedule(stage, cursor);
  for (const stage of plan.stages.filter((stage) => stage.lane !== 'main')) {
    const main = mainStages.find((item) => item.code === stage.parallelAnchor?.stageCode);
    const anchor = main?.tasks.filter((task) => task.sourceRow <= stage.parallelAnchor.row).at(-1);
    schedule(stage, anchor ? (rowStarts.get(anchor.sourceRow) ?? null) : null);
  }
  const tasks = [],
    stages = [];
  for (const stage of plan.stages) {
    const window = windows.get(stage.id);
    const stageId = 'sheet-' + stage.id;
    stages.push({
      id: stageId,
      name: stage.code + ' · ' + stage.name,
      startDate: iso(window.start),
      deadline: window.end === null ? '' : iso(window.end - calendarDay),
      sheetPlan: true,
      sheetCode: stage.code,
      sheetName: stage.name,
      description:
        stage.lane === 'main'
          ? 'Main sequence from the Google Sheet.'
          : 'Parallel work positioned alongside stage ' +
            stage.parallelAnchor.stageCode +
            ' in the Google Sheet.',
    });
    for (const item of window.tasks) {
      const source = item.source;
      const sourceDuplicates = plan.stages
        .filter((s) => clean(s.name) === clean(stage.name))
        .flatMap((s) => s.tasks)
        .filter((t) => clean(t.title) === clean(source.title));
      const matches = liveTasks.filter(
        (task) =>
          !task.deletedAt &&
          clean(task.title) === clean(source.title) &&
          clean(liveStages.find((s) => s.id === task.stageId)?.name) === clean(stage.name),
      );
      // Only exact, unique stage/title matches can carry a saved task's status.
      const linked = sourceDuplicates.length === 1 && matches.length === 1 ? matches[0] : null;
      tasks.push({
        id: 'sheet-' + source.id,
        title: source.title,
        stageId,
        status: linked?.status || 'Plan item',
        assigneeId: linked?.assigneeId || '',
        assigneeName: linked?.assigneeName || source.role || 'Role not specified',
        description:
          'Work item from ' + plan.sheet + ', stage ' + stage.code + ' · ' + stage.name + '.',
        sourceCurrentStart: iso(item.start),
        sourceCurrentEnd: item.end === null ? '' : iso(item.end - calendarDay),
        sourceSequence: source.sourceRow,
        sheetPlan: true,
        sheetRole: source.role,
        sheetDurationDays: source.durationDays,
        sheetTaskOrder: source.order,
        sheetSourceCell: source.sourceCell,
        sheetSourceTab: plan.sheet,
        linkedTaskId: linked?.id || null,
        missingDuration: source.durationDays === null,
      });
    }
  }
  return { tasks, stages };
}
