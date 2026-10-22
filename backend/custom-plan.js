import { ApiError } from './api-error.js';
import { randomUUID } from 'node:crypto';

const DAY = 86400000;
const fail = (message, status = 400) => { throw new ApiError(message,status); };
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
    const references=placement.predecessors || [{stageName:placement.stageName,type:placement.type==='parallel'?'SS':'FS'}];
    if(!Array.isArray(references) || !references.length || references.length>100)fail('Choose predecessor stages.');
    const anchors=references.map(reference=>{
      if(!['FS','SS'].includes(reference.type))fail('Choose a supported stage connection.');
      const anchor=project.stages?.find(item=>item.name===reference.stageName);if(!anchor)fail('Choose an existing stage.');
      const group=tasks.filter(task=>task.stageId===anchor.id && !task.deletedAt && task.status!=='Cancelled');if(!group.length)fail('The selected stage has no tasks.');
      const first=[...group].sort((a,b)=>a.sourceForecastStart.localeCompare(b.sourceForecastStart))[0],last=[...group].sort((a,b)=>a.deadline.localeCompare(b.deadline)).at(-1);
      return {taskId:reference.type==='SS'?first.id:last.id,type:reference.type,date:reference.type==='SS'?date(first.sourceForecastStart):date(last.deadline)+DAY,stageId:anchor.id};
    });
    predecessor=anchors[0].taskId;dependencyType=anchors[0].type;start=Math.max(...anchors.map(anchor=>anchor.date));stage.dependencies=anchors.map(anchor=>anchor.stageId);stage.initialPredecessors=anchors.map(({taskId,type})=>({taskId,type}));
  } else fail('Choose where the stage starts.');
  const created = spec.tasks.map((input, index) => {
    const duration = input?.durationDays;
    if (!Number.isInteger(duration) || duration < 1 || duration > 365) fail('Task durations must be whole days from 1 to 365.');
    const id = randomUUID(), end = start + (duration - 1) * DAY;
    const task = { id, projectId: project.id, title: title(input.title, 'a task title', 80), description: '', status: index < doneCount ? 'Completed' : 'Open',
      stageId: stage.id, assigneeId: validateOwner(input.assigneeId || ''), sourceRole: title(input.role || 'Team', 'a role', 80),
      sourcePlannedStart: iso(start), sourcePlannedEnd: iso(end), sourceForecastStart: iso(start), sourceForecastEnd: iso(end), deadline: iso(end),
      ...(index===0 && stage.initialPredecessors?{planPredecessors:stage.initialPredecessors}:{}),
      planPredecessorId: predecessor, planDependencyType: index === 0 ? dependencyType : 'FS', customPlan: true,
      sourceSequence: String(Math.max(0, ...tasks.map((task) => Number(task.sourceSequence) || 0)) + (index + 1) * 10),
      createdBy: 'founder', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deletedAt: '' };
    predecessor = id; start = end + DAY;
    return task;
  });
  delete stage.initialPredecessors;
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
    if (!task.sourceForecastStart || !task.deadline) { visited.add(task.id); return; }
    if (visiting.has(task.id)) fail('The custom plan contains a dependency cycle.', 409);
    visiting.add(task.id);
    const edges = task.planPredecessors || (task.planPredecessorId ? [{ taskId: task.planPredecessorId, type: task.planDependencyType || 'FS' }] : []);
    let earliest = -Infinity;
    for (const edge of edges) {
      const predecessor = copies.find((item) => item.id === edge.taskId);
      if (!predecessor) continue;
      visit(predecessor);
      earliest = Math.max(earliest, edge.type === 'SS' ? date(predecessor.sourceForecastStart) : date(predecessor.deadline) + DAY);
    }
    if (Number.isFinite(earliest)) {
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
      taskId: task.id, webTaskId: task.id, title: task.title, taskName: task.title, previousStart: before.sourceForecastStart, previousEnd: before.deadline,
      forecastStart: task.sourceForecastStart, forecastEnd: task.deadline, committed: committed.has(task.id),
      moved: committed.has(task.id),
    }];
  });
  return { ok: true, conflicts: [], warnings: [], affected, finish: copies.some((task) => !task.deadline) ? '' : copies.map((task) => task.deadline).sort().at(-1) || '', tasks: copies };
}

export function insertCustomTask(project, tasks, input, validateOwner) {
  const stage = project.stages?.find((item) => item.id === input?.stageId);
  if (!stage) fail('Choose a stage in this project.', 404);
  const group = tasks.filter((task) => task.stageId === stage.id && !task.deletedAt && task.status !== 'Cancelled');
  if (!group.length || group.some((task) => !task.customPlan)) fail('Choose a custom stage.');
  const placementType = input.placementType || 'after';
  if (!['after', 'parallel', 'date'].includes(placementType)) fail('Choose after, parallel or a date.');
  const after = input.afterTaskId ? tasks.find((task) => task.id === input.afterTaskId && !task.deletedAt && task.status !== 'Cancelled') : null;
  if (input.afterTaskId && !after) fail('Choose a task in this stage.', 404);
  const first = [...group].sort((a, b) => a.sourceForecastStart.localeCompare(b.sourceForecastStart))[0];
  if (placementType === 'parallel' && !after) fail('Choose the task to run alongside.');
  const built = buildCustomStage({ ...project, stages: [] }, [], {
    custom: true, name: stage.name, placement: { type: 'date', startDate: placementType === 'date' ? input.startDate : after ? (placementType === 'parallel' ? after.sourceForecastStart : iso(date(after.deadline) + DAY)) : first.sourceForecastStart }, tasks: [input],
  }, validateOwner);
  const added = { ...built.tasks[0], stageId: stage.id, planPredecessorId: placementType === 'date' ? '' : after?.id || first.planPredecessorId || '', planDependencyType: placementType === 'parallel' ? 'SS' : after ? 'FS' : first.planDependencyType };
  const afterSequence = Number(after?.sourceSequence) || 0;
  const nextSequence = Math.min(...group.map((task) => Number(task.sourceSequence)).filter((value) => value > afterSequence));
  added.sourceSequence = String(after ? (Number.isFinite(nextSequence) ? (afterSequence + nextSequence) / 2 : afterSequence + 10) : (Number(first.sourceSequence) || 10) - 5);
  const last = [...group].sort((a, b) => a.deadline.localeCompare(b.deadline)).at(-1);
  const rewired = tasks.map((task) => {
    const edges = task.planPredecessors || (task.planPredecessorId ? [{ taskId: task.planPredecessorId, type: task.planDependencyType || 'FS' }] : []);
    if (placementType === 'after' && !after && task.id === first.id) return { ...task, planPredecessorId: added.id, planDependencyType: 'FS', planPredecessors: [{ taskId: added.id, type: 'FS' }] };
    const next = edges.map((edge) => placementType === 'after' && after?.stageId === stage.id && edge.taskId === after.id && edge.type === 'FS' && (task.stageId === stage.id || after.id === last.id) ? { taskId: added.id, type: 'FS' } : edge);
    if (placementType !== 'after' && task.stageId !== stage.id && edges.some((edge) => edge.taskId === last.id && edge.type === 'FS')) next.push({ taskId: added.id, type: 'FS' });
    return { ...task, planPredecessors: next };
  });
  const result = previewCustomMoves([...rewired, added], [{ taskId: added.id, start: added.sourceForecastStart, end: added.deadline, fromStart: added.sourceForecastStart, fromEnd: added.deadline }]);
  return { ...result, created: [{ title: added.title, start: added.sourceForecastStart, end: added.deadline }], addedId: added.id };
}

// Legacy web templates have stage dates rather than per-task starts. Preserve the dates already shown in the timeline.
export function customTasksFor(project, tasks) {
  return tasks.map((task) => {
    if (task.customPlan) return { ...task };
    const stage = project.stages?.find((item) => item.id === task.stageId);
    const start = task.sourceForecastStart || task.sourceCurrentStart || task.sourcePlannedStart || stage?.startDate || task.deadline || '';
    const first = tasks.find((item) => item.stageId === task.stageId && !item.deletedAt && item.status !== 'Cancelled');
    const previous = tasks.filter((item) => stage?.dependencies?.includes(item.stageId) && !item.deletedAt && item.status !== 'Cancelled').sort((a, b) => String(a.deadline).localeCompare(String(b.deadline))).at(-1);
    return { ...task, customPlan: true, planPredecessorId: first && first.id !== task.id ? first.id : previous?.id || '', planDependencyType: first && first.id !== task.id ? 'SS' : 'FS', sourcePlannedStart: task.sourcePlannedStart || start, sourcePlannedEnd: task.sourcePlannedEnd || task.deadline || '', sourceForecastStart: start, sourceForecastEnd: task.deadline || '' };
  });
}

export function editCustomTask(project, tasks, input, validateOwner) {
  const copies = customTasksFor(project, tasks), task = copies.find((item) => item.id === input.taskId && !item.deletedAt);
  if (!task) fail('Task not found.', 404);
  if (input.fromTitle !== task.title) fail('This task changed since you opened it. Refresh and try again.', 409);
  const duration = input.durationDays;
  if (!Number.isInteger(duration) || duration < 1 || duration > 365) fail('Choose a duration from 1 to 365 days.');
  const placement = input.placement || { type: 'keep' };
  let start = task.sourceForecastStart;
  if (placement.type === 'date') { start = placement.startDate; task.planPredecessorId = ''; task.planPredecessors = []; }
  else if (['after', 'parallel'].includes(placement.type)) {
    const anchor = copies.find((item) => item.id === placement.taskId && !item.deletedAt && item.status !== 'Cancelled');
    if (!anchor || anchor.id === task.id) fail('Choose another task in this project.');
    start = placement.type === 'after' ? iso(date(anchor.deadline) + DAY) : anchor.sourceForecastStart;
    task.planPredecessorId = anchor.id; task.planDependencyType = placement.type === 'after' ? 'FS' : 'SS';
    task.planPredecessors = [{ taskId: anchor.id, type: task.planDependencyType }];
  } else if (placement.type !== 'keep') fail('Choose where the task starts.');
  const end = iso(date(start) + (duration - 1) * DAY);
  task.title = title(input.title, 'a task title', 80); task.sourceRole = title(input.role || 'Team', 'a role', 80); task.assigneeId = validateOwner(input.assigneeId || '');
  return previewCustomMoves(copies, [{ taskId: task.id, start, end, fromStart: input.fromStart, fromEnd: input.fromEnd }]);
}
