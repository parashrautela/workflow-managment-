import test from 'node:test';
import assert from 'node:assert/strict';
import { closeProject } from './project-closure.js';

test('completion and abandonment use different group announcements and close only unfinished work', async () => {
  for (const outcome of ['Completed', 'Abandoned']) {
    const project = { id: 'p', status: 'Active', telegramGroupChatId: '-1' };
    const state = { tasks: [{ projectId: 'p', status: 'Open' }, { projectId: 'p', status: 'Completed' }, { projectId: 'other', status: 'Open' }] };
    let calls = 0, saves = 0;
    const options = { state, project, outcome, callBotBridge: async (route, input) => { calls++; assert.equal(route, '/api/integrations/web/projects/close'); assert.equal(input.outcome, outcome); return { announcementStatus: 'Sent' }; }, save: async () => saves++, audit: () => {} };
    assert.equal(await closeProject(options), 'Sent');
    await closeProject(options);
    assert.equal(calls, 1); assert.equal(saves, 1);
    assert.equal(project.status, outcome);
    assert.deepEqual(state.tasks.map((task) => task.status), ['Cancelled', 'Completed', 'Open']);
  }
});

test('bot failures leave the project active; uncertain delivery closes it without resending', async () => {
  const project = { id: 'p', status: 'Active', telegramGroupChatId: '-1' }, state = { tasks: [] };
  const options = { state, project, outcome: 'Abandoned', callBotBridge: async () => { throw new Error('offline'); }, save: async () => {}, audit: () => {} };
  await assert.rejects(closeProject(options), /offline/);
  assert.equal(project.status, 'Active');
  assert.equal(await closeProject({ ...options, callBotBridge: async () => ({ announcementStatus: 'Unknown' }) }), 'Unknown');
  assert.equal(await closeProject(options), 'Unknown');
});
