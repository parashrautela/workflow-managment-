import { createHash } from 'node:crypto';
import { ApiError } from '../http/api-error.js';
import { planStageConnections, stageLinksFor } from './stage-connections.js';

const DAY = 86400000;
const fail = (message) => {
  throw new ApiError(message, 409);
};
const locked = (task) =>
  task.actualStart ||
  /^(Completed|Done|Resolved|In progress|On hold|Issue Reported)$/i.test(task.status || '');
const date = (value) => {
  const time = Date.parse(value);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value || '') ||
    !Number.isFinite(time) ||
    new Date(time).toISOString().slice(0, 10) !== value
  )
    fail('Set valid dates on the stages before reordering them.');
  return time;
};
export const stageOrderFingerprint = (stages, tasks) =>
  createHash('sha256')
    .update(
      JSON.stringify({
        stages: stages.map((stage) => stage.id),
        tasks: [...tasks].sort((a, b) => a.id.localeCompare(b.id)),
      }),
    )
    .digest('hex');

// Stages exchange positions in the existing dependency graph, including its parallel branches.
export function planStageOrder(input, stages, stageIds) {
  const previous = stages.map((stage) => stage.id);
  if (
    !Array.isArray(stageIds) ||
    stageIds.length !== previous.length ||
    new Set(stageIds).size !== previous.length ||
    stageIds.some((id) => !previous.includes(id))
  )
    fail('Send every stage in this project exactly once.');
  if (stageIds.every((id, index) => id === previous[index]))
    fail('Move a stage to a different position.');
  const groups = new Map(previous.map((id) => [id, input.filter((task) => task.stageId === id)]));
  const position = new Map(previous.map((id, index) => [id, stageIds[index]]));
  const starts = new Map();
  for (const [id, tasks] of groups)
    if (tasks.length) starts.set(id, Math.min(...tasks.map((task) => date(task.start))));
  const seeded = structuredClone(input);
  for (const task of seeded) {
    const index = stageIds.indexOf(task.stageId);
    if (index < 0 || previous[index] === task.stageId) continue;
    if (locked(task))
      fail(`"${task.title}" has already started or finished. Its stage cannot be reordered.`);
    const targetStart = starts.get(previous[index]);
    if (targetStart === undefined) fail('Choose a position occupied by a scheduled stage.');
    const shift = targetStart - starts.get(task.stageId);
    task.start = new Date(date(task.start) + shift).toISOString().slice(0, 10);
    task.end = new Date(date(task.end) + shift).toISOString().slice(0, 10);
  }
  const links = stageLinksFor(input).map((link) => ({
    ...link,
    source: position.get(link.source) || link.source,
    target: position.get(link.target) || link.target,
  }));
  const planned = planStageConnections(seeded, links);
  const original = new Map(input.map((task) => [task.id, task]));
  const affected = [],
    dependencyChanges = [];
  for (const task of planned.tasks) {
    const before = original.get(task.id);
    const changedDates = before.start !== task.start || before.end !== task.end;
    const changedLinks =
      JSON.stringify(before.dependencies || []) !== JSON.stringify(task.dependencies || []);
    if ((changedDates || changedLinks) && locked(before))
      fail(`"${task.title}" has already started or finished and cannot change.`);
    if (changedDates)
      affected.push({
        taskId: task.id,
        taskName: task.title,
        previousStart: before.start,
        previousEnd: before.end,
        forecastStart: task.start,
        forecastEnd: task.end,
      });
    if (changedLinks)
      dependencyChanges.push({
        taskId: task.id,
        taskName: task.title,
        previous: before.dependencies || [],
        dependencies: task.dependencies || [],
      });
  }
  return {
    ...planned,
    affected,
    dependencyChanges,
    stageIds,
    fingerprint: stageOrderFingerprint(stages, input),
  };
}
