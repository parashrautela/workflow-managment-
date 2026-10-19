import { randomUUID } from 'node:crypto';

const DAY = 86400000;
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const date = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail('Choose a real YYYY-MM-DD date.');
  return Date.parse(value);
};
const iso = (value) => new Date(value).toISOString().slice(0, 10);
const title = (value, label, max) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || value.includes('—')) fail(`Enter ${label} of 1 to ${max} characters without “—”.`);
  return value.trim();
};

// Unlinked projects save their own plan; linked projects continue to use the bot's schedule engine.
export function buildCustomStage(project, tasks, spec, validateOwner) {
  if (spec?.custom !== true) fail('Choose custom tasks for a project without a Telegram group.');
  const name = title(spec.name, 'a stage name', 60);
  if (project.stages?.some((stage) => stage.name.trim().toLowerCase() === name.toLowerCase())) fail(`A stage called “${name}” already exists.`, 409);
  if (!Array.isArray(spec.tasks) || !spec.tasks.length || spec.tasks.length > 60) fail('Add between 1 and 60 tasks.');
  const stage = { id: randomUUID(), name, order: project.stages?.length || 0, dependencies: [] };
  const doneCount = spec.doneCount ?? 0;
  if (!Number.isInteger(doneCount) || doneCount < 0 || doneCount > spec.tasks.length) fail('Choose a valid number of finished tasks.');
  let start, predecessor = '', dependencyType = 'FS';
  const placement = spec.placement || {};
  if (placement.type === 'date') start = date(placement.startDate);
  else if (['after', 'parallel'].includes(placement.type)) {
    const anchor = project.stages?.find((item) => item.name === placement.stageName);
    if (!anchor) fail('Choose an existing stage.');
    const group = tasks.filter((task) => task.stageId === anchor.id && !task.deletedAt && task.status !== 'Cancelled');
    if (!group.length) fail('The selected stage has no tasks.');
    const first = [...group].sort((a, b) => a.sourceForecastStart.localeCompare(b.sourceForecastStart))[0];
    const last = [...group].sort((a, b) => a.deadline.localeCompare(b.deadline)).at(-1);
    dependencyType = placement.type === 'parallel' ? 'SS' : 'FS';
    predecessor = placement.type === 'parallel' ? first.id : last.id;
    start = placement.type === 'parallel' ? date(first.sourceForecastStart) : date(last.deadline) + DAY;
    stage.dependencies = [anchor.id];
  } else fail('Choose where the stage starts.');
  const created = spec.tasks.map((input, index) => {
    const duration = input?.durationDays;
    if (!Number.isInteger(duration) || duration < 1 || duration > 365) fail('Task durations must be whole days from 1 to 365.');
    const id = randomUUID(), end = start + (duration - 1) * DAY;
    const task = { id, projectId: project.id, title: title(input.title, 'a task title', 80), description: '', status: index < doneCount ? 'Completed' : 'Open',
      stageId: stage.id, assigneeId: validateOwner(input.assigneeId || ''), sourceRole: title(input.role || 'Team', 'a role', 80),
      sourcePlannedStart: iso(start), sourcePlannedEnd: iso(end), sourceForecastStart: iso(start), sourceForecastEnd: iso(end), deadline: iso(end),
      planPredecessorId: predecessor, planDependencyType: index === 0 ? dependencyType : 'FS', customPlan: true,
      sourceSequence: String(Math.max(0, ...tasks.map((task) => Number(task.sourceSequence) || 0)) + (index + 1) * 10),
      createdBy: 'founder', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deletedAt: '' };
    predecessor = id; start = end + DAY;
    return task;
  });
  stage.startDate = created[0].sourceForecastStart; stage.deadline = created.at(-1).deadline;
  stage.durationDays = (date(stage.deadline) - date(stage.startDate)) / DAY + 1;
  return { stage, tasks: created };
}

export function previewCustomMoves(tasks, moves) {
  if (!Array.isArray(moves) || !moves.length || moves.length > 60) fail('Send between 1 and 60 schedule moves.');
  const active = tasks.filter((task) => !task.deletedAt && task.status !== 'Cancelled');
  const copies = active.map((task) => ({ ...task }));
  const committed = new Set();
  for (const move of moves) {
    const task = copies.find((item) => item.id === move?.taskId);
    if (!task?.customPlan) fail('Choose a task in this custom plan.', 404);
    if (committed.has(task.id)) fail('A task can move only once.');
    if (task.status === 'Completed') fail('Completed tasks cannot be moved.', 409);
    if (move.fromStart !== task.sourceForecastStart || move.fromEnd !== task.deadline) fail('This task changed since you opened it. Refresh and try again.', 409);
    const start = date(move.start), end = date(move.end);
    if (end < start || end - start >= 365 * DAY) fail('Choose an end date within 365 days of the start.');
    task.sourceForecastStart = move.start; task.sourceForecastEnd = task.deadline = move.end;
    committed.add(task.id);
  }
  const visited = new Set(), visiting = new Set();
  const visit = (task) => {
    if (visited.has(task.id)) return;
    if (visiting.has(task.id)) fail('The custom plan contains a dependency cycle.', 409);
    visiting.add(task.id);
    const predecessor = copies.find((item) => item.id === task.planPredecessorId);
    if (predecessor) {
      visit(predecessor);
      const earliest = task.planDependencyType === 'SS' ? date(predecessor.sourceForecastStart) : date(predecessor.deadline) + DAY;
      const shift = earliest - date(task.sourceForecastStart);
      if (shift > 0) {
        if (committed.has(task.id) || task.status === 'Completed') fail(`“${task.title}” cannot start before its predecessor finishes.`, 409);
        task.sourceForecastStart = iso(date(task.sourceForecastStart) + shift);
        task.deadline = task.sourceForecastEnd = iso(date(task.deadline) + shift);
      }
    }
    visiting.delete(task.id); visited.add(task.id);
  };
  copies.forEach(visit);
  const affected = copies.flatMap((task) => {
    const before = active.find((item) => item.id === task.id);
    return before.sourceForecastStart === task.sourceForecastStart && before.deadline === task.deadline ? [] : [{
      taskId: task.id, webTaskId: task.id, title: task.title, previousStart: before.sourceForecastStart, previousEnd: before.deadline,
      forecastStart: task.sourceForecastStart, forecastEnd: task.deadline, committed: committed.has(task.id),
    }];
  });
  return { ok: true, conflicts: [], warnings: [], affected, finish: copies.map((task) => task.deadline).filter(Boolean).sort().at(-1) || '', tasks: copies };
}

export function insertCustomTask(project, tasks, input, validateOwner) {
  const stage = project.stages?.find((item) => item.id === input?.stageId);
  if (!stage) fail('Choose a stage in this project.', 404);
  const group = tasks.filter((task) => task.stageId === stage.id && !task.deletedAt && task.status !== 'Cancelled');
  if (!group.length || group.some((task) => !task.customPlan)) fail('Choose a custom stage.');
  const after = input.afterTaskId ? group.find((task) => task.id === input.afterTaskId) : null;
  if (input.afterTaskId && !after) fail('Choose a task in this stage.', 404);
  const first = [...group].sort((a, b) => a.sourceForecastStart.localeCompare(b.sourceForecastStart))[0];
  const built = buildCustomStage({ ...project, stages: [] }, [], {
    custom: true, name: stage.name, placement: { type: 'date', startDate: after ? iso(date(after.deadline) + DAY) : first.sourceForecastStart }, tasks: [input],
  }, validateOwner);
  const added = { ...built.tasks[0], stageId: stage.id, planPredecessorId: after?.id || first.planPredecessorId || '', planDependencyType: after ? 'FS' : first.planDependencyType };
  const afterSequence = Number(after?.sourceSequence) || 0;
  const nextSequence = Math.min(...group.map((task) => Number(task.sourceSequence)).filter((value) => value > afterSequence));
  added.sourceSequence = String(after ? (Number.isFinite(nextSequence) ? (afterSequence + nextSequence) / 2 : afterSequence + 10) : (Number(first.sourceSequence) || 10) - 5);
  const rewired = tasks.map((task) => (!after && task.id === first.id) || (after && task.planPredecessorId === after.id && task.planDependencyType !== 'SS') ? { ...task, planPredecessorId: added.id, planDependencyType: 'FS' } : { ...task });
  const result = previewCustomMoves([...rewired, added], [{ taskId: added.id, start: added.sourceForecastStart, end: added.deadline, fromStart: added.sourceForecastStart, fromEnd: added.deadline }]);
  return { ...result, created: [{ title: added.title, start: added.sourceForecastStart, end: added.deadline }], addedId: added.id };
}
