import test from 'node:test';
import assert from 'node:assert/strict';
import { closeProject } from './project-closure.js';

test('completion and abandonment use different group announcements and close only unfinished work', async () => {
  for (const outcome of ['Completed', 'Abandoned']) {
    const project = {
      id: 'p',
      status: 'Active',
      telegramGroupChatId: '-1',
      telegramProjectId: 'P1',
    };
    const state = {
      tasks: [
        { projectId: 'p', status: 'Open' },
        { projectId: 'p', status: 'Completed' },
        { projectId: 'other', status: 'Open' },
      ],
    };
    let calls = 0,
      saves = 0;
    const options = {
      state,
      project,
      outcome,
      callBotBridge: async (route, input) => {
        calls++;
        assert.equal(route, '/api/integrations/web/projects/close');
        assert.equal(input.outcome, outcome);
        return { announcementStatus: 'Sent' };
      },
      save: async () => saves++,
      audit: () => {},
    };
    assert.equal(await closeProject(options), 'Sent');
    await closeProject(options);
    assert.equal(calls, 1);
    assert.equal(saves, 1);
    assert.equal(project.status, outcome);
    assert.deepEqual(
      state.tasks.map((task) => task.status),
      ['Cancelled', 'Completed', 'Open'],
    );
  }
});

test('bot failures leave the project active; uncertain delivery closes it without resending', async () => {
  const project = { id: 'p', status: 'Active', telegramGroupChatId: '-1', telegramProjectId: 'P1' },
    state = { tasks: [] };
  const options = {
    state,
    project,
    outcome: 'Abandoned',
    callBotBridge: async () => {
      throw new Error('offline');
    },
    save: async () => {},
    audit: () => {},
  };
  await assert.rejects(closeProject(options), /offline/);
  assert.equal(project.status, 'Active');
  assert.equal(
    await closeProject({
      ...options,
      callBotBridge: async () => ({ announcementStatus: 'Unknown' }),
    }),
    'Unknown',
  );
  assert.equal(await closeProject(options), 'Unknown');
});

test('setup projects can be archived before a bot project exists, with honest delivery reporting', async () => {
  for (const registered of [true, false]) {
    const project = {
      id: 'p',
      name: 'Kumar Residence',
      status: 'Needs setup',
      telegramGroupChatId: '-555',
    };
    const state = { tasks: [] };
    let sends = 0;
    const options = {
      state,
      project,
      outcome: 'Abandoned',
      save: async () => {},
      audit: () => {},
      callBotBridge: async (route, input) => {
        sends++;
        assert.equal(input.allowUnstarted, true);
        assert.equal(input.projectName, 'Kumar Residence');
        if (!registered) throw Object.assign(new Error('Group not registered'), { botStatus: 404 });
        return { announcementStatus: 'Sent' };
      },
    };
    assert.equal(await closeProject(options), registered ? 'Sent' : 'Failed');
    await closeProject(options);
    assert.equal(project.status, 'Abandoned');
    assert.equal(sends, 1);
  }
});

test('a setup announcement in flight survives retry without being sent again or changing outcome', async () => {
  const project = {
    id: 'p',
    status: 'Needs setup',
    telegramGroupChatId: '-555',
    closureOutcome: 'Abandoned',
    closureAnnouncementStatus: 'Sending',
  };
  const options = {
    state: { tasks: [] },
    project,
    outcome: 'Abandoned',
    save: async () => {},
    audit: () => {},
    callBotBridge: async () => assert.fail('must not resend'),
  };
  await assert.rejects(closeProject({ ...options, outcome: 'Completed' }), /different closure/);
  assert.equal(await closeProject(options), 'Unknown');
  assert.equal(project.status, 'Abandoned');
});
