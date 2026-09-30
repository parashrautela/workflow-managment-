import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test('Telegram request enters founder inbox once, stays private, and can be resolved', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'iksha-decision-'));
  const source = path.dirname(fileURLToPath(import.meta.url));
  await cp(source, path.join(root, 'backend'), { recursive: true, filter: (sourcePath) => !sourcePath.endsWith('.test.js') });
  await cp(path.join(source, '../package.json'), path.join(root, 'package.json'));
  await symlink(path.join(source, '../node_modules'), path.join(root, 'node_modules'));
  await writeFile(path.join(root, 'mock-telegram.js'), `const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (String(url).endsWith('/sendMessage') && String(url).startsWith('https://api.telegram.org/bot')) {
    const input = JSON.parse(options.body);
    if (input.chat_id !== '-123' || input.reply_parameters.message_id !== 10 || input.text !== 'Approved') return Response.json({ ok: false }, { status: 400 });
    return Response.json({ ok: true, result: { message_id: 99 } });
  }
  return originalFetch(url, options);
};`);
  const port = await freePort();
  const child = spawn(process.execPath, ['--import', path.join(root, 'mock-telegram.js'), path.join(root, 'backend/server.js')], { cwd: root, env: { ...process.env, PORT: String(port), FOUNDER_PASSWORD: 'test-password', INTEGRATION_SHARED_SECRET: 'test-secret', GROUP_BOT_TOKEN: 'test-bot-token', DATABASE_URL: '', NODE_ENV: 'test' }, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  const call = async (route, method = 'GET', value, headers = {}) => {
    const response = await fetch(base + route, { method, headers: { 'content-type': 'application/json', ...headers }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie') };
  };
  try {
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try { await call('/api/founder/projects'); ready = true; break; }
      catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
    }
    assert.ok(ready, 'server started');
    const session = await call('/api/founder/login', 'POST', { password: 'test-password' });
    const cookie = { cookie: session.cookie.split(';')[0] };
    const project = await call('/api/founder/projects', 'POST', { name: 'Test Home', clientName: 'Client' }, cookie);
    const projectId = project.data.project.id;
    const payload = { RequestID: 'REQ--123-10-approval', GroupChatID: '-123', SourceMessageID: '10', RequestType: 'Approval', OriginalMessage: 'Approve lights?', RequestContext: '', OriginalSenderName: 'Client', RequestedByName: 'Designer', AttachmentsJSON: '[]' };
    assert.equal((await call('/api/integrations/telegram/requests', 'POST', payload)).status, 401);
    const bridge = { authorization: 'Bearer test-secret' };
    assert.equal((await call('/api/integrations/telegram/requests', 'POST', payload, bridge)).status, 409);
    assert.equal((await call(`/api/founder/projects/${projectId}`, 'PATCH', { telegramGroupChatId: '-123' }, cookie)).status, 200);
    assert.equal((await call('/api/integrations/telegram/requests', 'POST', payload, bridge)).status, 201);
    assert.equal((await call('/api/integrations/telegram/requests', 'POST', payload, bridge)).status, 200);
    assert.equal((await call('/api/founder/decision-requests')).status, 401);
    const inbox = await call('/api/founder/decision-requests', 'GET', undefined, cookie);
    assert.equal(inbox.data.requests.length, 1);
    assert.equal(inbox.data.requests[0].projectId, projectId);
    const item = encodeURIComponent(payload.RequestID);
    assert.equal((await call(`/api/founder/decision-requests/${item}/comment`, 'POST', { text: 'Check dimensions' }, cookie)).status, 200);
    assert.equal((await call(`/api/founder/decision-requests/${item}/publish`, 'POST', { response: 'Approved' }, cookie)).status, 200);
    assert.equal((await call(`/api/founder/decision-requests/${item}/publish`, 'POST', { response: 'Approved' }, cookie)).status, 409);
    assert.equal((await call(`/api/founder/decision-requests/${item}/resolve`, 'POST', {}, cookie)).status, 200);
    const finalInbox = await call('/api/founder/decision-requests', 'GET', undefined, cookie);
    assert.equal(finalInbox.data.requests[0].status, 'Done');
    assert.equal(finalInbox.data.requests[0].publishedMessageId, '99');
    assert.equal(finalInbox.data.requests[0].comments[0].text, 'Check dimensions');
  } finally {
    child.kill();
    await rm(root, { recursive: true, force: true });
  }
});
