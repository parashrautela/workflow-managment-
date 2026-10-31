import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueryNotifier, queryUpdateText } from './query-notifications.js';
import { createCollaborationRoutes } from '../collaboration/collaboration.js';

test('status updates describe the action and revised date without internal notes', () => {
  assert.match(
    queryUpdateText(
      'delay',
      { title: 'Drawing' },
      { affected: [{ moved: true, forecastEnd: '2026-11-07' }], summary: 'Private budget issue' },
    ),
    /delayed.*2026-11-07/,
  );
  assert.doesNotMatch(queryUpdateText('delay', {}, { summary: 'Private budget issue' }), /Private/);
  for (const [action, word] of [
    ['hold', 'on hold'],
    ['resume', 'under review'],
    ['reject', 'not able'],
    ['redo', 'redo'],
    ['complete', 'complete'],
    ['new-stage', 'accepted'],
  ])
    assert.ok(queryUpdateText(action).includes(word));
});

test('notifications persist before sending, retain uncertain deliveries, and reject changed group mappings', async () => {
  const request = { id: 'q', groupChatId: '-1', status: 'Approved' };
  const project = { telegramGroupChatId: '-1' };
  const snapshots = [],
    calls = [];
  const notify = createQueryNotifier({
    save: async () => snapshots.push(structuredClone(request)),
    checkpoint: () => {},
    callBotBridge: async (route, input) => {
      calls.push({ route, input });
      assert.equal(snapshots.at(-1).notifications.at(-1).status, 'Sending');
      return { ok: true, result: { message_id: 45 } };
    },
  });
  await notify(request, project, 'hold', 'Waiting for measurements.');
  await notify(request, project, 'reject', 'We cannot proceed.');
  assert.deepEqual(
    request.notifications.map((row) => row.status),
    ['Sent', 'Sent'],
  );
  assert.notEqual(calls[0].input.notificationId, calls[1].input.notificationId);
  assert.equal(calls[0].input.groupChatId, '-1');
  assert.equal(request.status, 'Approved');
  const uncertain = createQueryNotifier({
    save: async () => {},
    checkpoint: () => {},
    callBotBridge: async () => {
      throw Error('timeout');
    },
  });
  await uncertain(request, project, 'hold', 'Wait.');
  assert.equal(request.notifications.at(-1).status, 'Unknown');
  await notify(request, { telegramGroupChatId: '-2' }, 'resume', 'Reviewing.');
  assert.equal(request.notifications.at(-1).status, 'Failed');
  assert.equal(calls.length, 2);
});

test('hold and resume notify only after the founder action, and repeating hold does not send twice', async () => {
  const query = { id: 'q', projectId: 'p', status: 'Pending', requestType: 'Question' };
  const state = {
    projects: [{ id: 'p', status: 'Active' }],
    tasks: [{ id: 't', projectId: 'p', title: 'Draw' }],
    decisionRequests: [query],
    taskMessages: [],
    employees: [],
    googleAccounts: [],
  };
  const notices = [];
  const route = createCollaborationRoutes({
    getState: () => state,
    founder: (req) => req.admin,
    employeeSession: () => null,
    body: async (req) => req.input,
    json: (res, status, data) => Object.assign(res, { status, data }),
    save: async () => {},
    audit: () => {},
    notifyQuery: async (...args) => notices.push(args),
  });
  const call = async (action, input, admin = true) => {
    const res = {};
    await route(
      { method: 'POST', admin, input },
      res,
      new URL(`http://test/api/founder/decision-requests/q/${action}`),
    );
    return res;
  };
  await assert.rejects(call('hold', { taskId: 't' }, false));
  await assert.rejects(call('hold', { taskId: 'missing' }));
  assert.equal(notices.length, 0);
  assert.equal(
    (await call('hold', { taskId: 't', notificationText: 'Please send the measurements.' })).status,
    200,
  );
  assert.equal(notices[0][3], 'Please send the measurements.');
  await call('hold', { taskId: 't' });
  assert.equal(notices.length, 1);
  await call('resume', {});
  assert.equal(notices.length, 2);
  assert.equal(notices[1][2], 'resume');
});
