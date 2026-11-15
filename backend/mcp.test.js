import { googleTestIdentity } from './test-helpers/google-identity.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, symlink, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TOKEN = 'test-mcp-token';
async function fixture(t, enabled) {
  const directory = await mkdtemp(path.join(tmpdir(), 'iksha-mcp-'));
  const source = path.dirname(fileURLToPath(import.meta.url));
  await cp(source, path.join(directory, 'backend'), { recursive: true, filter: (p) => !p.endsWith('.test.js') && !p.endsWith('data.json') });
  await cp(path.join(source, '../package.json'), path.join(directory, 'package.json'));
  await symlink(path.join(source, '../node_modules'), path.join(directory, 'node_modules'));
  await symlink(path.join(source,'../frontend'),path.join(directory,'frontend')); // backend imports the app's shared status rule
  const reserve = net.createServer();
  await new Promise((resolve) => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port; await new Promise((resolve) => reserve.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const token = (value, resource = `${base}/mcp`) => ({ idHash: createHash('sha256').update(value).digest('hex'), googleAccountId: 'test-founder-account', resource, expiresAt: Date.now() + 3600_000 });
  const google = await googleTestIdentity(directory);
  await google.seed(path.join(directory, 'backend/data.json'), { mcpTokens: [token(TOKEN), token('other-audience', 'https://elsewhere.example/mcp')] });
  const child = spawn(process.execPath, ['--import', google.mock, path.join(directory, 'backend/server.js')], { cwd: directory, stdio: 'ignore',
    env: { ...process.env, PORT: String(port), GOOGLE_CLIENT_ID: google.clientId, INITIAL_FOUNDER_EMAIL: '', NODE_ENV: 'test', PUBLIC_URL: '', MCP_CONNECTOR_ENABLED: enabled ? 'true' : '' } });
  t.after(async () => { if (child.exitCode === null) { const exited = new Promise((resolve) => child.once('exit', resolve)); child.kill(); await exited; } await rm(directory, { recursive: true, force: true }); });
  for (let i = 0; i < 60; i++) { try { await fetch(base + '/api/auth/google/config'); break; } catch { await new Promise((resolve) => setTimeout(resolve, 50)); } }
  const { cookie } = await google.signIn(base);
  const rpc = async (method, params, bearer = TOKEN, notify = false) => {
    const response = await fetch(base + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
      body: JSON.stringify({ jsonrpc: '2.0', ...(notify ? {} : { id: 1 }), method, ...(params ? { params } : {}) }) });
    return { status: response.status, headers: response.headers, data: response.headers.get('content-type')?.includes('json') ? await response.json() : null };
  };
  const api = async (route, method = 'GET', input) => (await fetch(base + route, { method, headers: { 'content-type': 'application/json', cookie }, ...(input ? { body: JSON.stringify(input) } : {}) })).json();
  return { base, rpc, api };
}

test('connector is off unless the studio turns it on', async (t) => {
  const f = await fixture(t, false);
  assert.equal((await f.rpc('initialize', {})).status, 404);
});

test('founder token reads the workspace through read-only tools', async (t) => {
  const f = await fixture(t, true);
  const unauthenticated = await f.rpc('initialize', {}, '');
  assert.equal(unauthenticated.status, 401);
  assert.match(unauthenticated.headers.get('www-authenticate'), /resource_metadata="http:\/\/127\.0\.0\.1:\d+\/\.well-known\/oauth-protected-resource\/mcp"/);
  assert.equal((await f.rpc('initialize', {}, 'other-audience')).status, 401, 'tokens issued for another server are refused');
  assert.equal((await fetch(f.base + '/mcp', { headers: { authorization: `Bearer ${TOKEN}` } })).status, 405);

  const init = await f.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  assert.equal(init.data.result.protocolVersion, '2025-06-18');
  assert.equal(init.data.result.serverInfo.name, 'studio-iksha');
  assert.equal((await f.rpc('notifications/initialized', undefined, TOKEN, true)).status, 202);

  const { tools } = (await f.rpc('tools/list')).data.result;
  assert.deepEqual(tools.map((tool) => tool.name), ['list_projects', 'get_project', 'get_work_queue', 'list_client_queries', 'get_client_query', 'list_team']);
  assert.ok(tools.every((tool) => tool.annotations.readOnlyHint === true));

  const { project } = await f.api('/api/founder/projects', 'POST', { name: 'Kumar Residence', clientName: 'Asha Kumar' });
  await f.api(`/api/founder/projects/${project.id}/client`, 'POST', { clientName: 'Asha Kumar', clientTelegramId: '4242' });
  const listed = (await f.rpc('tools/call', { name: 'list_projects', arguments: {} })).data.result;
  assert.equal(listed.isError, undefined);
  assert.equal(listed.structuredContent.projects[0].name, 'Kumar Residence');
  assert.doesNotMatch(listed.content[0].text, /4242/, 'client Telegram ID never reaches the AI');

  const one = (await f.rpc('tools/call', { name: 'get_project', arguments: { projectId: project.id } })).data.result;
  assert.equal(one.structuredContent.project.id, project.id);
  const queue = (await f.rpc('tools/call', { name: 'get_work_queue', arguments: { status: 'overdue' } })).data.result;
  assert.deepEqual(queue.structuredContent.tasks, []);
  assert.equal((await f.rpc('tools/call', { name: 'list_team', arguments: {} })).data.result.isError, undefined);

  assert.equal((await f.rpc('tools/call', { name: 'get_project', arguments: { projectId: '../employees' } })).data.result.isError, true);
  assert.equal((await f.rpc('tools/call', { name: 'get_project', arguments: { projectId: 'p_missing' } })).data.result.isError, true);
  assert.equal((await f.rpc('tools/call', { name: 'get_work_queue', arguments: { status: 'everything' } })).data.result.isError, true);
  assert.equal((await f.rpc('tools/call', { name: 'delete_project', arguments: {} })).data.error.code, -32602);

  const prompt = (await f.rpc('prompts/get', { name: 'current_update', arguments: { project: 'Kumar Residence' } })).data.result;
  assert.match(prompt.messages[0].content.text, /Kumar Residence/);
});
