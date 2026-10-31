import test from 'node:test';
import assert from 'node:assert/strict';
import { createBotBridge } from './bot-bridge.js';

test('bot client sends the authenticated payload and preserves upstream failure details', async (t) => {
  let sent;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    sent = { url, options };
    return { ok: false, status: 409, json: async () => ({ error: 'Project is closed.' }) };
  });
  const bridge = createBotBridge({ baseUrl: 'https://bot.example', secret: 'test-secret' });
  await assert.rejects(
    bridge('/api/integrations/web/tasks/sync', { groupChatId: '-123' }),
    (error) => {
      assert.equal(error.message, 'Project is closed.');
      assert.equal(error.botStatus, 409);
      assert.deepEqual(error.botBody, { error: 'Project is closed.' });
      return true;
    },
  );
  assert.equal(sent.url, 'https://bot.example/api/integrations/web/tasks/sync');
  assert.equal(sent.options.headers.authorization, 'Bearer test-secret');
  assert.deepEqual(JSON.parse(sent.options.body), { groupChatId: '-123' });
});

test('an unconfigured bot client fails before contacting a service', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', () => {
    throw new Error('Unexpected network call');
  });
  await assert.rejects(
    createBotBridge({ baseUrl: '', secret: '' })('/tasks', {}),
    /not configured/,
  );
  assert.equal(fetch.mock.callCount(), 0);
});
