import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { answerWithAi } from './founder-ai.js';
import { founderTools } from './mcp.js';
import { googleTestIdentity } from './test-helpers/google-identity.js';

const call = (name, args, id = 'c1') => ({ output: [{ type: 'function_call', call_id: id, name, arguments: JSON.stringify(args) }] });
const say = (text) => ({ output: [{ type: 'message', content: [{ type: 'output_text', text }] }] });
// Replays are answered by a fake app: it records the founder routes asked for and returns contact details the model must never see.
const fakeApp = (data = { tasks: [], projects: [{ id: 'p1', name: 'Sharma Residence', clientTelegramId: '4242', email: 'a@b.co', telegramUserId: '9' }] }) => {
  const routes = [];
  return { routes, handleRequest: async (req, res) => { routes.push(req.url); res.end(JSON.stringify(data)); } };
};
const scripted = (replies) => {
  const bodies = [];
  const fetchImpl = async (url, init) => {
    bodies.push(JSON.parse(init.body));
    const next = replies.shift();
    if (next instanceof Error) throw next;
    return typeof next === 'number' ? { ok: false, status: next, json: async () => ({}) } : { ok: true, status: 200, json: async () => next };
  };
  return { bodies, fetchImpl };
};
const run = (app, ai, extra = {}) => answerWithAi({ question: 'How is Sharma?', ...founderTools(app.handleRequest, { headers: {}, socket: {} }, { googleAccountId: 'g', expiresAt: 1 }),
  apiKey: 'k', model: 'gpt-5-mini', fetchImpl: ai.fetchImpl, ...extra });

test('the model asks for a tool, gets its result, then answers', async () => {
  const app = fakeApp(), ai = scripted([call('get_work_queue', { status: 'overdue' }), say('Nothing is late.')]);
  assert.equal(await run(app, ai), 'Nothing is late.');
  assert.deepEqual(app.routes, ['/api/founder/work-queue?status=overdue&personId=all&projectId=']);
  const followUp = ai.bodies[1].input.at(-1);
  assert.equal(followUp.type, 'function_call_output');
  assert.equal(followUp.call_id, 'c1');
});

test('arguments that fail validation go back to the model as an error and nothing runs', async () => {
  const app = fakeApp(), ai = scripted([call('get_project', { projectId: '../employees' }), call('delete_project', {}, 'c2'), say('Could not look that up.')]);
  assert.equal(await run(app, ai), 'Could not look that up.');
  assert.deepEqual(app.routes, []);
  assert.match(ai.bodies[1].input.at(-1).output, /Invalid projectId/);
  assert.match(ai.bodies[2].input.at(-1).output, /Unknown tool/);
});

test('contact details never reach the model', async () => {
  const app = fakeApp(), ai = scripted([call('list_projects', {}), say('One project.')]);
  await run(app, ai);
  const sent = JSON.stringify(ai.bodies);
  assert.match(sent, /Sharma Residence/);
  assert.doesNotMatch(sent, /4242|a@b\.co|telegramUserId|clientTelegramId/);
});

test('five rounds of tool calls end in an error so the caller can fall back', async () => {
  const app = fakeApp(), ai = scripted(Array.from({ length: 6 }, () => call('list_team', {})));
  await assert.rejects(run(app, ai), /too many tool rounds/);
  assert.equal(ai.bodies.length, 5);
});

test('an HTTP error, an empty answer or a timeout rejects', async () => {
  await assert.rejects(run(fakeApp(), scripted([500])), /failed \(500\)/);
  await assert.rejects(run(fakeApp(), scripted([say('  ')])), /no answer/);
  const hang = { fetchImpl: (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason))) };
  await assert.rejects(run(fakeApp(), hang, { timeoutMs: 50 }));
});

test('reasoning models, gpt-6 included, get their reasoning passed back; others do not', async () => {
  for (const [model, wanted] of [['gpt-6.1-terra', true], ['gpt-5-mini', true], ['gpt-4.1', false]]) {
    const ai = scripted([say('Ok.')]);
    await run(fakeApp({}), ai, { model });
    assert.deepEqual(ai.bodies[0].include, wanted ? ['reasoning.encrypted_content'] : undefined, model);
  }
});

test('storage is off, the read-only rule is sent, and long tool results are cut', async () => {
  const app = fakeApp({ note: 'x'.repeat(40000) }), ai = scripted([call('list_team', {}), say('Done.')]);
  await run(app, ai, { history: [{ question: 'Earlier?', answer: 'Earlier answer.' }] });
  assert.equal(ai.bodies[0].store, false);
  assert.match(ai.bodies[0].instructions, /read-only/);
  assert.match(ai.bodies[0].instructions, /third parties/);
  assert.deepEqual(ai.bodies[0].input.slice(0, 2).map((item) => item.role), ['user', 'assistant']);
  assert.ok(ai.bodies[0].tools.every((tool) => tool.type === 'function'));
  const output = ai.bodies[1].input.at(-1).output;
  assert.ok(output.length < 30200);
  assert.match(output, /Result cut/);
});

// Route level: the real server against a local fake model.
async function fixture(t, { flag, replies }) {
  const directory = await mkdtemp(path.join(tmpdir(), 'iksha-founder-ai-'));
  const source = path.dirname(fileURLToPath(import.meta.url));
  await cp(source, path.join(directory, 'backend'), { recursive: true, filter: (p) => !p.endsWith('.test.js') && !p.endsWith('data.json') });
  await cp(path.join(source, '../package.json'), path.join(directory, 'package.json'));
  await symlink(path.join(source, '../node_modules'), path.join(directory, 'node_modules'));
  await symlink(path.join(source, '../frontend'), path.join(directory, 'frontend'));
  const requests = [];
  const model = http.createServer((req, res) => {
    let raw = ''; req.on('data', (chunk) => (raw += chunk)); req.on('end', () => {
      requests.push(JSON.parse(raw));
      const next = replies.shift();
      res.writeHead(typeof next === 'number' ? next : 200, { 'content-type': 'application/json' }); res.end(JSON.stringify(typeof next === 'number' ? {} : next));
    });
  });
  await new Promise((resolve) => model.listen(0, '127.0.0.1', resolve));
  const reserve = net.createServer();
  await new Promise((resolve) => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port; await new Promise((resolve) => reserve.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const google = await googleTestIdentity(directory);
  await google.seed(path.join(directory, 'backend/data.json'));
  const child = spawn(process.execPath, ['--import', google.mock, path.join(directory, 'backend/server.js')], { cwd: directory, stdio: 'ignore',
    env: { ...process.env, PORT: String(port), GOOGLE_CLIENT_ID: google.clientId, INITIAL_FOUNDER_EMAIL: '', NODE_ENV: 'test', PUBLIC_URL: '',
      OPENAI_API_KEY: 'test-key', FOUNDER_AI_ASSISTANT_ENABLED: flag, OPENAI_BASE_URL: `http://127.0.0.1:${model.address().port}/v1` } });
  t.after(async () => { if (child.exitCode === null) { const exited = new Promise((resolve) => child.once('exit', resolve)); child.kill(); await exited; } model.close(); await rm(directory, { recursive: true, force: true }); });
  for (let i = 0; i < 60; i++) { try { await fetch(base + '/api/auth/google/config'); break; } catch { await new Promise((resolve) => setTimeout(resolve, 50)); } }
  const { cookie } = await google.signIn(base);
  const api = async (route, method = 'GET', input) => (await fetch(base + route, { method, headers: { 'content-type': 'application/json', cookie }, ...(input ? { body: JSON.stringify(input) } : {}) })).json();
  return { api, requests, ask: (question) => api('/api/founder/assistant', 'POST', { question }) };
}

test('founder Assistant: flag off keeps the rule-based answer and makes no outbound call', async (t) => {
  const f = await fixture(t, { flag: '', replies: [say('should never be used')] });
  const { message } = await f.ask('Summarize all ongoing projects');
  assert.match(message.answer, /^# No projects yet/);
  assert.equal(message.ai, undefined);
  assert.equal(f.requests.length, 0);
});

test('founder Assistant: without the model, "who are you" is answered and one project gets a short update', async (t) => {
  const f = await fixture(t, { flag: '', replies: [] });
  await f.api('/api/founder/projects', 'POST', { name: 'Kumar Residence', clientName: 'Asha Kumar' });
  const who = (await f.ask('Who are you?')).message.answer;
  assert.match(who, /^I'm the Iksha assistant/);
  assert.doesNotMatch(who, /Kumar Residence — |Client:/, 'no project dump');
  const brief = (await f.ask("How's Kumar Residence going?")).message.answer;
  assert.match(brief, /^Kumar Residence is /);
  assert.doesNotMatch(brief, /Not recorded|Location:|Client:/);
  assert.ok(brief.split('\n').length <= 4);
});

test('founder Assistant: flag on answers with the model, remembers the conversation, and falls back on failure', async (t) => {
  const f = await fixture(t, { flag: 'true', replies: [call('list_projects', {}), say('Kumar Residence is the only project.'), say('It has no overdue work.'), 500] });
  await f.api('/api/founder/projects', 'POST', { name: 'Kumar Residence', clientName: 'Asha Kumar' });
  const first = (await f.ask('What projects do I have?')).message;
  assert.equal(first.answer, 'Kumar Residence is the only project.');
  assert.equal(first.ai, true);
  assert.match(JSON.stringify(f.requests[1].input), /Kumar Residence/);
  const second = (await f.ask('Is it late?')).message;
  assert.equal(second.ai, true);
  assert.match(JSON.stringify(f.requests[2].input), /What projects do I have\?/, 'the earlier exchange is sent as history');
  const failed = (await f.ask('Summarize all ongoing projects')).message;
  assert.equal(failed.ai, undefined);
  assert.match(failed.answer, /^# Ongoing projects/);
  assert.equal((await f.api('/api/founder/assistant')).messages.filter((m) => m.ai).length, 2);
});
