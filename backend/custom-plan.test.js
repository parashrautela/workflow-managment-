import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCustomStage, insertCustomTask, previewCustomMoves, editCustomTask } from './custom-plan.js';

const project = { id: 'p', stages: [] };
const spec = { custom: true, name: 'Permits', placement: { type: 'date', startDate: '2026-11-01' }, tasks: [
  { title: 'Survey the land', role: 'Surveyor', durationDays: 2, assigneeId: 'founder' },
  { title: 'Submit permit', role: 'Architect', durationDays: 3 },
] };
const owner = (id) => id;
const move = (task, start, end) => ({ taskId: task.id, start, end, fromStart: task.sourceForecastStart, fromEnd: task.deadline });

test('custom stages keep arbitrary names, owners and inclusive dates without mutating the project', () => {
  const built = buildCustomStage(project, [], spec, owner);
  assert.deepEqual(built.tasks.map((task) => [task.title, task.sourceForecastStart, task.deadline]), [
    ['Survey the land', '2026-11-01', '2026-11-02'], ['Submit permit', '2026-11-03', '2026-11-05'],
  ]);
  assert.equal(built.tasks[0].assigneeId, 'founder');
  assert.equal(built.tasks[1].planPredecessorId, built.tasks[0].id);
  assert.equal(project.stages.length, 0);
  assert.throws(() => buildCustomStage(project, [], { ...spec, tasks: [] }, owner), /1 and 60/);
  assert.throws(() => buildCustomStage(project, [], { ...spec, tasks: [{ ...spec.tasks[0], durationDays: -1 }] }, owner), /durations/);
  assert.throws(() => buildCustomStage(project, [], { ...spec, placement: { type: 'date', startDate: '2026-02-30' } }, owner), /real/);
  assert.throws(() => buildCustomStage({ ...project, stages: [{ name: ' permits ' }] }, [], spec, owner), /already exists/);
});

test('later stages can start after or alongside existing custom work', () => {
  const built = buildCustomStage(project, [], spec, owner);
  const p = { ...project, stages: [built.stage] };
  const after = buildCustomStage(p, built.tasks, { ...spec, name: 'Build', placement: { type: 'after', stageName: 'Permits' } }, owner);
  const parallel = buildCustomStage(p, built.tasks, { ...spec, name: 'Design', placement: { type: 'parallel', stageName: 'Permits' } }, owner);
  assert.equal(after.tasks[0].sourceForecastStart, '2026-11-06');
  assert.equal(parallel.tasks[0].sourceForecastStart, '2026-11-01');
});

test('moving custom work pushes its successors, preserves the baseline and refuses stale edits', () => {
  const { tasks } = buildCustomStage(project, [], spec, owner);
  const result = previewCustomMoves(tasks, [move(tasks[0], '2026-11-03', '2026-11-04')]);
  assert.equal(result.affected.length, 2);
  assert.equal(result.tasks[1].sourceForecastStart, '2026-11-05');
  assert.equal(result.tasks[0].sourcePlannedStart, '2026-11-01');
  assert.equal(tasks[0].sourceForecastStart, '2026-11-01');
  assert.throws(() => previewCustomMoves(tasks, [{ ...move(tasks[0], '2026-11-03', '2026-11-04'), fromStart: '' }]), /changed/);
  assert.throws(() => previewCustomMoves(tasks, [move(tasks[1], '2026-11-01', '2026-11-02')]), /predecessor/);
  assert.throws(() => previewCustomMoves([{ ...tasks[0], status: 'Completed' }, tasks[1]], [move(tasks[0], '2026-11-03', '2026-11-04')]), /Completed/);
});

test('inserting a task inside custom work shifts later tasks without altering the input', () => {
  const built = buildCustomStage(project, [], spec, owner);
  const result = insertCustomTask({ ...project, stages: [built.stage] }, built.tasks, { stageId: built.stage.id, afterTaskId: built.tasks[0].id, title: 'Extra inspection', role: 'Inspector', durationDays: 2 }, owner);
  assert.equal(result.tasks.length, 3);
  assert.equal(result.tasks.find((task) => task.id === built.tasks[1].id).sourceForecastStart, '2026-11-05');
  assert.deepEqual([...result.tasks].sort((a, b) => Number(a.sourceSequence) - Number(b.sourceSequence)).map((task) => task.title), ['Survey the land', 'Extra inspection', 'Submit permit']);
  assert.equal(built.tasks[1].sourceForecastStart, '2026-11-03');
  assert.throws(() => insertCustomTask({ ...project, stages: [built.stage] }, built.tasks, { stageId: built.stage.id, afterTaskId: 'other' }, owner), /Choose a task/);
});

test('parallel tasks share a start without blocking the existing chain, but following work types wait for both', () => {
  const built = buildCustomStage(project, [], spec, owner);
  const following = buildCustomStage({ ...project, stages: [built.stage] }, built.tasks, { ...spec, name: 'Build', placement: { type: 'after', stageName: 'Permits' } }, owner);
  const all = [...built.tasks, ...following.tasks];
  const result = insertCustomTask({ ...project, stages: [built.stage, following.stage] }, all, { stageId: built.stage.id, afterTaskId: built.tasks[0].id, placementType: 'parallel', title: 'Parallel research', role: 'Designer', durationDays: 10 }, owner);
  const added = result.tasks.find((task) => task.id === result.addedId);
  assert.equal(added.sourceForecastStart, '2026-11-01');
  assert.equal(result.tasks.find((task) => task.id === built.tasks[1].id).sourceForecastStart, '2026-11-03');
  assert.equal(result.tasks.find((task) => task.id === following.tasks[0].id).sourceForecastStart, '2026-11-11');
});

test('task editing preserves the old plan, supports parallel placement, and rejects cyclic dependencies', () => {
  const built = buildCustomStage(project, [], spec, owner), p = { ...project, stages: [built.stage] }, first = built.tasks[0], second = built.tasks[1];
  const input = { taskId: second.id, fromTitle: second.title, fromStart: second.sourceForecastStart, fromEnd: second.deadline, title: 'Revised permit', role: 'Architect', durationDays: 4, assigneeId: 'founder', placement: { type: 'parallel', taskId: first.id } };
  const result = editCustomTask(p, built.tasks, input, owner);
  assert.equal(result.tasks[1].sourceForecastStart, '2026-11-01');
  assert.equal(result.tasks[1].title, 'Revised permit');
  assert.equal(result.tasks[1].assigneeId, 'founder');
  assert.equal(result.tasks[1].sourcePlannedStart, '2026-11-03');
  assert.equal(second.title, 'Submit permit');
  assert.throws(() => editCustomTask(p, built.tasks, { ...input, taskId: first.id, fromTitle: first.title, fromStart: first.sourceForecastStart, fromEnd: first.deadline, placement: { type: 'after', taskId: second.id } }, owner), /cycle/);
});


test('custom move options persist removed links and preserve baseline dates', () => {
  const {tasks}=buildCustomStage(project,[],spec,owner);
  const moved=move(tasks[1],'2026-11-01','2026-11-03');
  const parallel=previewCustomMoves(tasks,[moved],{mode:'parallel'});
  assert.equal(parallel.tasks[1].planPredecessorId,'');
  assert.deepEqual(parallel.tasks[1].planPredecessors,[]);
  assert.equal(parallel.tasks[1].sourcePlannedStart,'2026-11-03');
  assert.equal(tasks[1].planPredecessorId,tasks[0].id);
  assert.equal(parallel.dependencyChanges.length,1);
  assert.throws(()=>previewCustomMoves(tasks,[{...moved,fromStart:''}],{mode:'parallel'}),error=>error.status===409);
  const cascade=previewCustomMoves(tasks,[move(tasks[0],'2026-11-03','2026-11-04')],{mode:'shift-following'});
  assert.equal(cascade.tasks[1].sourceForecastStart,'2026-11-05');
  assert.equal(cascade.tasks[1].planPredecessorId,tasks[0].id);
});
