import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMeetingRoutes,
  reminderTimes,
  validateMeeting,
  initializeMeetings,
} from './meetings.js';
const future = () => new Date(Date.now() + 4 * 86400000).toISOString();
const fixture = () => ({
  projects: [
    {
      id: 'p',
      name: 'House',
      status: 'Active',
      telegramGroupChatId: '-1',
      members: [
        {
          employeeId: 'e',
          name: 'Designer',
          telegramUserId: '7',
          role: 'Designer',
        },
        {
          employeeId: 's',
          name: 'Supervisor',
          telegramUserId: '8',
          role: 'Site Supervisor',
        },
        { employeeId: 'u', name: 'Unlinked', role: 'Designer' },
      ],
    },
  ],
  tasks: [{ id: 't', projectId: 'p', title: 'Site check', status: 'Open' }],
  employees: [{ id: 'e', telegramUserId: '7', active: true, telegramConnectedAt: 'yes' }],
  telegramGroups: [],
  telegramConnections: [],
  taskMessages: [],
  meetings: [],
  meetingDeliveries: [],
});
const input = () => ({
  title: 'Inspect wall',
  location: 'Site',
  startsAt: future(),
  attendeeIds: ['7', '8', 'employee:u'],
  reminderMinutes: [2880, 60],
  previousEvening: true,
  groupFallback: true,
});
function harness(state, send = async () => ({ messageIds: [1] })) {
  let checkpoints = 0;
  const route = createMeetingRoutes({
    getState: () => state,
    founder: (req) => req.isFounder,
    employeeSession: (req) => req.user,
    body: async (req) => req.input,
    json: (res, status, data) => Object.assign(res, { status, data }),
    save: async () => {},
    audit: () => {},
    callBotBridge: send,
    checkpoint: () => checkpoints++,
  });
  return {
    route,
    get checkpoints() {
      return checkpoints;
    },
    call: async (path, method = 'GET', value, isFounder = true, user) => {
      const res = {};
      await route(
        { method, input: value, isFounder, user },
        res,
        new URL(`http://local/api/${isFounder ? 'founder' : 'employee'}/${path}`),
      );
      return res;
    },
  };
}
test('meeting validation rejects outside attendees and false dates; reminders use the previous India evening', () => {
  const base = input();
  assert.throws(() => validateMeeting({ ...base, attendeeIds: ['outsider'] }, [{ id: '7' }]));
  assert.throws(() =>
    validateMeeting(
      { ...base, startsAt: '2027-02-31T10:00:00Z' },
      base.attendeeIds.map((id) => ({ id })),
    ),
  );
  assert.throws(() =>
    validateMeeting(
      { ...base, reminderMinutes: [0] },
      base.attendeeIds.map((id) => ({ id })),
    ),
  );
  assert.deepEqual(
    reminderTimes({
      startsAt: '2026-11-04T04:30:00.000Z',
      reminderMinutes: [60],
      previousEvening: true,
    }),
    [
      { key: '60', at: '2026-11-04T03:30:00.000Z' },
      { key: 'evening', at: '2026-11-03T12:30:00.000Z' },
    ],
  );
});
test('meetings persist revision guards, combine group fallbacks, send once per event and stop old reminders on cancel', async () => {
  const state = fixture(),
    sends = [];
  const h = harness(state, async (path, value) => {
    sends.push(value);
    return { messageIds: [sends.length] };
  });
  const result = await h.call('tasks/t/meeting', 'POST', input());
  assert.equal(result.status, 200);
  assert.equal(state.meetings.length, 1);
  await assert.rejects(h.call('tasks/t/meeting', 'POST', input()), (error) => error.status === 409);
  await h.route.tick(new Date(Date.now() + 1000));
  assert.equal(sends.length, 2);
  assert.equal(sends.filter((row) => row.personalId === '7').length, 1);
  assert.equal(sends.filter((row) => !row.personalId).length, 1);
  assert.equal(state.meetingDeliveries.filter((row) => row.status === 'Sent').length, 3);
  await h.route.tick(new Date(Date.now() + 2000));
  assert.equal(sends.length, 2);
  const meeting = state.meetings[0];
  await assert.rejects(
    h.call(`meetings/${meeting.id}`, 'PATCH', { ...input(), revision: 0 }),
    (error) => error.status === 409,
  );
  await h.call(`meetings/${meeting.id}`, 'PATCH', {
    revision: 1,
    status: 'Cancelled',
  });
  await h.route.tick(new Date(Date.now() + 3000));
  assert.equal(sends.length, 4);
  assert.equal(meeting.status, 'Cancelled');
  await h.route.tick(new Date(Date.parse(meeting.startsAt) - 3600000));
  assert.equal(sends.length, 4);
});
test('unavailable personal connections can connect later; uncertain delivery and restart never auto-retry', async () => {
  const state = fixture();
  let sends = 0;
  const h = harness(state, async () => {
    sends++;
    throw Error('lost');
  });
  await h.call('tasks/t/meeting', 'POST', {
    ...input(),
    attendeeIds: ['8'],
    groupFallback: false,
  });
  await h.route.tick(new Date(Date.now() + 1000));
  assert.equal(sends, 0);
  assert.equal(state.meetingDeliveries[0].status, 'Unavailable');
  state.telegramConnections.push({ telegramUserId: '8' });
  await h.route.tick(new Date(Date.now() + 2000));
  assert.equal(sends, 1);
  assert.equal(state.meetingDeliveries[0].status, 'Unknown');
  const restored = JSON.parse(JSON.stringify(state));
  const restarted = harness(restored, async () => {
    sends++;
  });
  await restarted.route.tick(new Date(Date.now() + 3000));
  assert.equal(sends, 1);
  restored.meetingDeliveries[0].status = 'Sending';
  restored.taskMessages.push({ telegram: { status: 'Sending' } });
  assert.equal(initializeMeetings(restored), true);
  assert.equal(restored.taskMessages[0].telegram.status, 'Unknown');
  assert.equal(restored.meetingDeliveries[0].status, 'Unknown');
  assert.equal(initializeMeetings(restored), false);
});
test('staff read only their projects meetings and cannot schedule or mutate them', async () => {
  const state = fixture(),
    h = harness(state);
  await h.call('tasks/t/meeting', 'POST', input());
  assert.equal(
    (await h.call('meetings', 'GET', undefined, false, { id: 'e' })).data.meetings.length,
    1,
  );
  assert.equal(
    (await h.call('meetings', 'GET', undefined, false, { id: 'outsider' })).data.meetings.length,
    0,
  );
  await assert.rejects(
    h.call('tasks/t/meeting', 'POST', input(), false, { id: 'e' }),
    (error) => error.status === 403,
  );
});

test('disabled staff and departed group members never receive pending meeting notifications', async () => {
  const state = fixture(),
    sends = [];
  const h = harness(state, async (path, value) => {
    sends.push(value);
    return { messageIds: [1] };
  });
  await h.call('tasks/t/meeting', 'POST', input());
  state.meetingDeliveries.reverse();
  state.employees[0].active = false;
  state.telegramGroups.push({
    groupChatId: '-1',
    members: [{ telegramUserId: '8', membershipStatus: 'Left' }],
  });
  await h.route.tick(new Date(Date.now() + 1000));
  assert.equal(sends.length, 1);
  assert.equal(sends[0].personalId, undefined);
  assert.deepEqual(sends[0].recipientIds, []);
  assert.equal(state.meetingDeliveries.filter((row) => row.status === 'Skipped').length, 2);
});
