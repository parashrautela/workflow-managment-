import test from 'node:test';
import assert from 'node:assert/strict';
import { createPilotRoutes } from './pilot.js';

// Drives the pilot routes directly with a fake bot bridge, so stage and query flows can be checked without a server.
function harness({ botRows = [], onBot } = {}) {
  const state = {
    projects: [{ id: 'p1', name: 'Sameep Residence', telegramGroupChatId: '-900', telegramProjectId: 'P009', clientTelegramId: '42', workflowStartedAt: '2026-10-16T00:00:00Z', stages: [], members: [{ id: 'm1', employeeId: 'EMP-1', telegramUserId: '51', name: 'Riya' }] }],
    tasks: [], taskMessages: [], readPositions: [], employees: [{ id: 'EMP-1', name: 'Riya', active: true }], decisionRequests: [],
  };
  const calls = [];
  const rows = [...botRows];
  const callBotBridge = async (route, input) => {
    calls.push({ route, input });
    if (route === '/api/integrations/web/tasks/sync') return { tasks: rows };
    const reply = await onBot?.(route, input, rows);
    if (reply instanceof Error) throw reply;
    return reply;
  };
  let saves = 0;
  const routes = createPilotRoutes({
    getState: () => state,
    founder: (req) => req.role === 'founder',
    employeeSession: (req) => (req.role === 'employee' ? { id: 'EMP-1', name: 'Riya' } : null),
    body: async (req) => req.input || {},
    json: (res, status, data) => Object.assign(res, { status, data }),
    save: async () => { saves += 1; },
    audit: () => {},
    projectView: (project) => project,
    callBotBridge,
  });
  const call = async (method, path, input, role = 'founder') => {
    const res = {};
    try {
      const handled = await routes({ method, input, role }, res, new URL(`http://test${path}`));
      if (!handled) return { status: 404 };
    } catch (error) { return { status: error.status || 500, data: { error: error.message } }; }
    return res;
  };
  return { state, calls, rows, call, saves: () => saves };
}

const botRow = (id, stage, name, start, end, extra = {}) => ({ TaskID: id, ProjectID: 'P009', Stage: stage, TaskName: `${stage} — ${name}`, Status: 'Pending', Sequence: id.split('-').at(-1), PlannedStart: start, PlannedEnd: end, ForecastStart: start, ForecastEnd: end, ...extra });
const botError = (status, message) => Object.assign(new Error(message), { botStatus: status });

test('the starting chooser offers custom planning and native templates remain editable with impact previews', async () => {
  const h = harness(), p = h.state.projects[0];
  Object.assign(p, { telegramGroupChatId: '', telegramProjectId: '', workflowStartedAt: '', clientName: 'Maya', status: 'Setup' });
  const options = await h.call('GET', '/api/founder/workflows');
  assert.equal(options.data.workflows[0].id, 'BLANK-V1');
  const started = await h.call('POST', '/api/founder/projects/p1/workflow/start', { workflowId: 'PILOT-PAINTING-V1', startDate: '2026-11-01' });
  assert.equal(started.status, 200);
  const task = h.state.tasks[0], oldTitle = task.title, stage = p.stages[0];
  const input = { fromTitle: oldTitle, fromRole: 'Team', fromAssigneeId: 'founder', fromStart: '2026-11-01', fromEnd: '2026-11-01', title: 'Collect custom samples', role: 'Designer', assigneeId: 'EMP-1', durationDays: 3, placement: { type: 'keep' } };
  const route = `/api/founder/tasks/${task.id}/plan/`;
  const preview = await h.call('POST', route + 'preview', input);
  assert.equal(preview.status, 200);
  assert.equal(task.title, oldTitle);
  assert.ok(preview.data.affected.length > 1, 'later stages are included in the preview');
  assert.equal(preview.data.finish, '2026-11-08');
  assert.equal((await h.call('POST', route + 'apply', { ...input, assigneeId: 'not-member' })).status, 400);
  assert.equal((await h.call('POST', route + 'apply', input, 'employee')).status, 401);
  const applied = await h.call('POST', route + 'apply', input);
  assert.equal(applied.status, 200); assert.equal(task.title, 'Collect custom samples'); assert.equal(task.assigneeId, 'EMP-1');
  assert.equal((await h.call('POST', route + 'apply', input)).status, 409);
  const rename = `/api/founder/projects/p1/stages/${stage.id}/rename/`;
  assert.equal((await h.call('POST', rename + 'preview', { name: 'Research', fromName: stage.name })).status, 200);
  assert.equal(stage.name, 'Resources');
  assert.equal((await h.call('POST', rename + 'apply', { name: 'Research', fromName: stage.name })).status, 200);
  assert.equal(stage.name, 'Research'); assert.equal(task.deadline, '2026-11-03');
});

test('custom planning can start empty without forcing a client or template', async () => {
  const h = harness(), p = h.state.projects[0];
  Object.assign(p, { telegramGroupChatId: '', telegramProjectId: '', workflowStartedAt: '', clientName: '', status: 'Setup' });
  const input = { workflowId: 'BLANK-V1', startDate: '2026-11-01' };
  assert.equal((await h.call('POST', '/api/founder/projects/p1/workflow/start', input)).status, 200);
  assert.equal(p.workflowId, 'CUSTOM-V1'); assert.equal(h.state.tasks.length, 0);
  assert.equal((await h.call('POST', '/api/founder/projects/p1/workflow/start', input)).status, 200);
  assert.equal((await h.call('POST', '/api/founder/projects/p1/client', { clientName: 'Maya' })).status, 200);
});

test('a founder creates an unlinked custom timeline, previews without writing, then adds work and reschedules it', async () => {
  const h = harness(); const project = h.state.projects[0];
  Object.assign(project, { telegramGroupChatId: '', telegramProjectId: '', workflowStartedAt: '', status: 'Setup' });
  const stage = { custom: true, name: 'Permits', placement: { type: 'date', startDate: '2026-11-01' }, tasks: [{ key: 'one', title: 'Survey land', role: 'Surveyor', durationDays: 2, assigneeId: 'EMP-1' }] };
  const route = '/api/founder/projects/p1/stages/';
  assert.equal((await h.call('POST', route + 'preview', { stage })).status, 200);
  assert.equal(h.state.tasks.length, 0); assert.equal(h.saves(), 0);
  assert.equal((await h.call('POST', route + 'apply', { stage }, 'employee')).status, 401);
  assert.equal((await h.call('POST', route + 'apply', { stage: { ...stage, tasks: [{ ...stage.tasks[0], assigneeId: 'not-member' }] } })).status, 400);
  const applied = await h.call('POST', route + 'apply', { stage });
  assert.equal(applied.status, 200); assert.equal(project.status, 'Active');
  assert.equal(h.calls.length, 0, 'web-only plans do not call Telegram');
  const task = h.state.tasks[0];
  assert.equal(task.assigneeId, 'EMP-1');
  const moved = await h.call('POST', '/api/founder/projects/p1/schedule/apply', { moves: [{ taskId: task.id, start: '2026-11-03', end: '2026-11-04', fromStart: '2026-11-01', fromEnd: '2026-11-02' }] });
  assert.equal(moved.status, 200); assert.equal(task.deadline, '2026-11-04');
  const inserted = await h.call('POST', route + 'insert-task/apply', { task: { stageId: project.stages[0].id, afterTaskId: task.id, title: 'File permit', durationDays: 3, role: 'Architect' } });
  assert.equal(inserted.status, 200); assert.equal(h.state.tasks.length, 2);
  project.status = 'Completed';
  assert.equal((await h.call('POST', route + 'apply', { stage })).status, 409);
});

test('linked custom stages forward titles and more than six tasks to the bot', async () => {
  const h = harness({ onBot: (route, input) => { assert.equal(input.stages[0].custom, true); assert.equal(input.stages[0].tasks.length, 8); assert.equal(input.stages[0].tasks[7].title, 'Step 8'); return { ok: true }; } });
  const stage = { custom: true, name: 'Custom', tasks: Array.from({ length: 8 }, (_, i) => ({ key: `step-${i}`, title: `Step ${i + 1}`, durationDays: 1, role: 'Designer' })) };
  assert.equal((await h.call('POST', '/api/founder/projects/p1/stages/preview', { stage })).status, 200);
});

test('adding a stage sends only the founder choices, then shows the new stage and tasks', async () => {
  const h = harness({
    onBot: (route, input, rows) => {
      assert.equal(route, '/api/integrations/web/stages/add');
      if (input.mode === 'apply') rows.push(botRow('P009-ST1-1', 'Civil', 'Site Condition Check', '2026-11-02', '2026-11-02'), botRow('P009-ST1-2', 'Civil', 'Drawing', '2026-11-03', '2026-11-04', { AssignedTelegramID: '51' }));
      return { ok: true, conflicts: [], warnings: [], stages: [{ name: 'Civil', startDate: '2026-11-02', endDate: '2026-11-04' }], created: [], finish: '2026-11-04', tasks: ['bot rows are not passed through'] };
    },
  });
  const stage = { name: 'Civil', placement: { type: 'date', startDate: '2026-11-02' }, tasks: [{ key: 'site-check', durationDays: 1 }, { key: 'drawing', durationDays: 2, assigneeId: 'EMP-1', extra: 'dropped' }] };
  const preview = await h.call('POST', '/api/founder/projects/p1/stages/preview', { stage });
  assert.equal(preview.status, 200);
  assert.equal(h.state.tasks.length, 0);
  assert.deepEqual(h.calls[0].input.stages[0].tasks[1], { key: 'drawing', durationDays: 2, role: undefined, assigneeTelegramId: '51', assigneeName: 'Riya' });
  const applied = await h.call('POST', '/api/founder/projects/p1/stages/apply', { stage });
  assert.equal(applied.status, 200);
  assert.deepEqual(h.state.projects[0].stages.map((item) => [item.name, item.startDate, item.deadline]), [['Civil', '2026-11-02', '2026-11-04']]);
  assert.equal(h.state.tasks.length, 2);
  assert.equal(h.state.tasks[1].assigneeId, 'EMP-1');
  assert.equal(applied.data.tasks.length, 2);
  assert.equal((await h.call('POST', '/api/employee/projects/p1/stages/apply', { stage }, 'employee')).status, 403);
});

test('stage changes wait until local edits are synced, and bot refusals keep their status', async () => {
  const h = harness({ onBot: () => botError(409, 'A stage called "Civil" already exists. Try "Civil (2)".') });
  const refused = await h.call('POST', '/api/founder/projects/p1/stages/apply', { stage: { name: 'Civil', tasks: [] } });
  assert.deepEqual([refused.status, refused.data.error], [409, 'A stage called "Civil" already exists. Try "Civil (2)".']);
  h.state.tasks.push({ id: 't', projectId: 'p1', title: 'Local edit', telegramSyncStatus: 'Pending', deletedAt: '' });
  const waiting = await h.call('POST', '/api/founder/projects/p1/stages/apply', { stage: { name: 'X', tasks: [] } });
  assert.equal(waiting.status, 409);
  assert.match(waiting.data.error, /unsaved changes/);
});

function withQuery(h, changes = {}) {
  h.state.decisionRequests.push({ id: 'REQ--900-10-question', projectId: 'p1', groupChatId: '-900', requestType: 'Question', originalSenderName: 'Asha', originalSenderTelegramId: '42', originalMessage: 'Can the drawing wait?', context: '', attachments: [{ type: 'Photo', fileId: 'f' }], status: 'Pending', comments: [], ...changes });
  return h.state.decisionRequests.at(-1);
}

test('accepting a query applies one action, links the task thread, and never messages Telegram', async () => {
  const rows = [botRow('P009-ST1-2', 'Civil', 'Drawing', '2026-11-03', '2026-11-04')];
  const h = harness({
    botRows: rows,
    onBot: (route, input, list) => {
      assert.equal(route, '/api/integrations/web/tasks/action');
      assert.deepEqual([input.taskId, input.action, input.days, input.fromStart, input.fromEnd], ['P009-ST1-2', 'delay', 3, '2026-11-03', '2026-11-04']);
      if (input.mode === 'apply') Object.assign(list[0], { ForecastEnd: '2026-11-07', CurrentEnd: '2026-11-07' });
      return { ok: true, conflicts: [], warnings: [], affected: [{ taskId: 'P009-ST1-2', moved: true }], finish: '2026-11-07', summary: 'Delayed "Drawing" by 3 days. Projected finish 7 Nov.' };
    },
  });
  await h.call('GET', '/api/founder/projects/p1/tasks');
  const task = h.state.tasks[0];
  task.telegramSyncStatus = 'Synced';
  const request = withQuery(h);
  const target = { kind: 'task', taskId: task.id, action: { type: 'delay', days: 3 } };
  const preview = await h.call('POST', `/api/founder/decision-requests/${request.id}/accept-preview`, { target });
  assert.equal(preview.status, 200);
  assert.equal(preview.data.summary, 'Delayed "Drawing" by 3 days. Projected finish 7 Nov.');
  assert.equal(request.acceptedAt, undefined);
  const accepted = await h.call('POST', `/api/founder/decision-requests/${request.id}/accept`, { target });
  assert.equal(accepted.status, 200);
  assert.deepEqual([request.status, request.decisionStatus, request.taskId, request.acceptSummary], ['Approved', 'Approved', task.id, preview.data.summary]);
  assert.equal(task.deadline, '2026-11-07');
  const message = h.state.taskMessages.find((item) => item.queryId === request.id);
  assert.deepEqual([message.taskId, message.author, message.text, message.attachments], [task.id, 'Query from Asha', 'Can the drawing wait?', [{ index: 0, type: 'Photo', fileName: '' }]]);
  assert.ok(!h.calls.some((item) => /publish|sendMessage/.test(item.route)), 'no reply is sent');
  const actionCalls = () => h.calls.filter((item) => item.route.endsWith('/tasks/action')).length;
  const before = actionCalls();
  const again = await h.call('POST', `/api/founder/decision-requests/${request.id}/accept`, { target });
  assert.equal(again.status, 200);
  assert.equal(actionCalls(), before, 'a repeated accept does not delay twice');
  assert.equal((await h.call('POST', `/api/founder/decision-requests/${request.id}/accept`, { target: { ...target, action: { type: 'redo' } } })).status, 409);
  assert.equal(h.state.taskMessages.filter((item) => item.queryId === request.id).length, 1);
});

test('accepting into a new stage links the chosen task of that stage', async () => {
  const h = harness({
    onBot: (route, input, list) => {
      assert.equal(route, '/api/integrations/web/stages/add');
      if (input.mode === 'apply') list.push(botRow('P009-ST2-1', 'Plumbing repair', 'Site Condition Check', '2026-11-20', '2026-11-20'), botRow('P009-ST2-5', 'Plumbing repair', 'Site Execution', '2026-11-21', '2026-11-22'));
      return { ok: true, conflicts: [], warnings: [], stages: [{ name: 'Plumbing repair', startDate: '2026-11-20', endDate: '2026-11-22' }], created: [{ taskId: 'P009-ST2-1' }, { taskId: 'P009-ST2-5' }], finish: '2026-11-22' };
    },
  });
  const request = withQuery(h);
  const accepted = await h.call('POST', `/api/founder/decision-requests/${request.id}/accept`, { target: { kind: 'new-stage', linkTaskKey: 'execution', stage: { name: 'Plumbing repair', tasks: [{ key: 'site-check', durationDays: 1 }, { key: 'execution', durationDays: 2 }] } } });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.data.task.telegramTaskId, 'P009-ST2-5');
  assert.equal(accepted.data.summary, 'Added stage "Plumbing repair" (2026-11-20 to 2026-11-22).');
  assert.equal(h.state.projects[0].stages[0].name, 'Plumbing repair');
});

test('closed, refused and attach-only accepts are handled before anything changes', async () => {
  const rows = [botRow('P009-ST1-6', 'Civil', 'Final check', '2026-11-12', '2026-11-13', { Status: 'Completed' })];
  const h = harness({ botRows: rows, onBot: () => botError(409, 'Final check is already completed. Add a new stage instead.') });
  await h.call('GET', '/api/founder/projects/p1/tasks');
  const task = h.state.tasks[0];
  const request = withQuery(h);
  const refused = await h.call('POST', `/api/founder/decision-requests/${request.id}/accept`, { target: { kind: 'task', taskId: task.id, action: { type: 'delay', days: 1 } } });
  assert.deepEqual([refused.status, refused.data.error], [409, 'Final check is already completed. Add a new stage instead.']);
  assert.equal(request.acceptedAt, undefined);
  assert.equal((await h.call('POST', `/api/founder/decision-requests/${request.id}/accept`, { target: { kind: 'task', taskId: task.id, action: { type: 'attach' } } })).status, 400);
  const update = withQuery(h, { id: 'REQ--900-11-update', requestType: 'Update' });
  const attached = await h.call('POST', `/api/founder/decision-requests/${update.id}/accept`, { target: { kind: 'task', taskId: task.id, action: { type: 'attach' } } });
  assert.equal(attached.status, 200);
  assert.equal(attached.data.summary, 'Attached to "Civil — Final check".');
  const rejected = withQuery(h, { id: 'REQ--900-12-question' });
  assert.equal((await h.call('POST', `/api/founder/decision-requests/${rejected.id}/reject`, { reason: 'Not this week, sorry.' })).status, 200);
  assert.equal(rejected.rejectionReply, 'Not this week, sorry.');
  assert.equal((await h.call('POST', `/api/founder/decision-requests/${rejected.id}/accept`, { target: { kind: 'task', taskId: task.id, action: { type: 'attach' } } })).status, 409);
  assert.equal((await h.call('POST', `/api/employee/decision-requests/${update.id}/accept`, { target: {} }, 'employee')).status, 403);
});

test('a blank project starts with no stages and no tasks; templates still need their tasks', async () => {
  const h = harness({ onBot: (route, input) => ({ workflowId: input.workflowId, workflowName: 'Blank project', tasks: [], announcementStatus: 'Sent' }) });
  Object.assign(h.state.projects[0], { workflowStartedAt: '', status: 'Setup', startDate: '2026-10-20' });
  h.state.telegramGroups = [{ groupChatId: '-900', members: [{ membershipStatus: 'Active', assignedName: 'Asha', assignedRole: 'Client' }, { membershipStatus: 'Active', assignedName: 'Riya', assignedRole: 'Designer' }] }];
  assert.equal((await h.call('POST', '/api/founder/projects/p1/workflow/start', { workflowId: 'INTERIOR-SHEET-V1' })).status, 502);
  const started = await h.call('POST', '/api/founder/projects/p1/workflow/start', { workflowId: 'BLANK-V1' });
  assert.equal(started.status, 200);
  assert.deepEqual([started.data.project.stages, started.data.project.phase, started.data.project.status, h.state.tasks.length], [[], 'Planning', 'Active', 0]);
});


test('rejection is client-only with an optional reply and group context never becomes work', async () => {
  const h = harness();
  const client = withQuery(h);
  const route = id => `/api/founder/decision-requests/${id}`;
  assert.equal((await h.call('GET', route(client.id))).data.request.canReject, true);
  assert.equal((await h.call('POST', route(client.id) + '/reject', {})).status, 200);
  assert.equal(client.rejectionReply, "We're not able to go ahead with this request right now.");
  const staff = withQuery(h, { id: 'REQ--900-15-question', originalSenderTelegramId: '51' });
  assert.equal((await h.call('GET', route(staff.id))).data.request.canReject, false);
  assert.equal((await h.call('POST', route(staff.id) + '/reject', {reason:'No'})).status, 403);
  assert.equal(staff.status,'Pending');
  const context = withQuery(h, { id: 'REQ--900-16-message', requestType:'Message', originalSenderTelegramId:'51' });
  assert.equal((await h.call('POST', route(context.id) + '/accept-preview', {target:{}})).status,409);
  assert.equal((await h.call('POST', route(context.id) + '/reject', {})).status,403);
});
