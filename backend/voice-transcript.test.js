import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { googleTestIdentity } from './test-helpers/google-identity.js';
import { transcribeAudio, transcriptionEnabled } from './voice-transcript.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const HINDI = 'नमस्ते, पंखा कब लगेगा?';

test('a voice note goes out as an ogg file with the model, and the spoken words come back untouched', async () => {
  let call;
  const fetchImpl = async (url, init) => { call = { url, init }; return Response.json({ text: ` ${HINDI} ` }); };
  const result = await transcribeAudio({ bytes: Buffer.from('OGG'), mime: 'audio/ogg', apiKey: 'k', model: 'gpt-transcribe', baseUrl: 'https://api.openai.com/v1', fetchImpl });
  assert.equal(call.url, 'https://api.openai.com/v1/audio/transcriptions');
  assert.equal(call.init.headers.authorization, 'Bearer k');
  assert.equal(call.init.body.get('model'), 'gpt-transcribe');
  assert.equal(call.init.body.get('file').name, 'voice.ogg');
  assert.deepEqual(result, { text: HINDI, model: 'gpt-transcribe' });
});

test('an unsupported format never leaves the server; HTTP errors and silence reject', async () => {
  let calls = 0;
  const answer = (response) => async () => { calls++; return response; };
  const bytes = Buffer.from('x');
  await assert.rejects(transcribeAudio({ bytes, mime: 'application/octet-stream', apiKey: 'k', fetchImpl: answer(Response.json({ text: 'x' })) }), /format/);
  assert.equal(calls, 0);
  await assert.rejects(transcribeAudio({ bytes, mime: 'audio/ogg', apiKey: 'k', fetchImpl: answer(new Response('{}', { status: 401 })) }), /401/);
  await assert.rejects(transcribeAudio({ bytes, mime: 'audio/ogg', apiKey: 'k', fetchImpl: answer(Response.json({ text: '  ' })) }), /No speech/);
});

test('transcripts need both the switch and a key', () => {
  assert.equal(transcriptionEnabled({ VOICE_TRANSCRIPT_ENABLED: 'true', OPENAI_API_KEY: 'k' }), true);
  assert.equal(transcriptionEnabled({ VOICE_TRANSCRIPT_ENABLED: 'true' }), false);
  assert.equal(transcriptionEnabled({ OPENAI_API_KEY: 'k' }), false);
});

// Route level: the real server, with one fake server playing both the bot's stored media and the AI provider.
async function fixture(t, { flag }) {
  const directory = await mkdtemp(path.join(tmpdir(), 'iksha-voice-'));
  const source = path.dirname(fileURLToPath(import.meta.url));
  await cp(source, path.join(directory, 'backend'), { recursive: true, filter: (p) => !p.endsWith('.test.js') && !p.endsWith('data.json') });
  await cp(path.join(source, '../package.json'), path.join(directory, 'package.json'));
  await symlink(path.join(source, '../node_modules'), path.join(directory, 'node_modules'));
  await symlink(path.join(source, '../frontend'), path.join(directory, 'frontend'));
  const transcriptions = [];
  const fake = http.createServer(async (req, res) => {
    const chunks = []; for await (const part of req) chunks.push(part);
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/integrations/web/decisions/content') return res.end(JSON.stringify({ bytes: Buffer.from('OGGDATA').toString('base64') }));
    if (req.url === '/v1/audio/transcriptions') { transcriptions.push({ auth: req.headers.authorization, body: Buffer.concat(chunks).toString('latin1') }); return res.end(JSON.stringify({ text: HINDI })); }
    res.statusCode = 404; res.end('{}');
  });
  await new Promise((resolve) => fake.listen(0, '127.0.0.1', resolve));
  const fakeUrl = `http://127.0.0.1:${fake.address().port}`;
  const reserve = net.createServer();
  await new Promise((resolve) => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port; await new Promise((resolve) => reserve.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const google = await googleTestIdentity(directory);
  await google.seed(path.join(directory, 'backend/data.json'));
  const child = spawn(process.execPath, ['--import', google.mock, path.join(directory, 'backend/server.js')], { cwd: directory, stdio: 'ignore',
    env: { ...process.env, PORT: String(port), GOOGLE_CLIENT_ID: google.clientId, INITIAL_FOUNDER_EMAIL: '', INTEGRATION_SHARED_SECRET: 'test-secret', GROUP_BOT_TOKEN: '', DATABASE_URL: '', NODE_ENV: 'test',
      BOT_BRIDGE_URL: fakeUrl, OPENAI_API_KEY: 'k', OPENAI_BASE_URL: `${fakeUrl}/v1`, OPENAI_TRANSCRIBE_MODEL: 'gpt-transcribe', VOICE_TRANSCRIPT_ENABLED: flag } });
  t.after(async () => { if (child.exitCode === null) { const exited = new Promise((resolve) => child.once('exit', resolve)); child.kill(); await exited; } fake.close(); await rm(directory, { recursive: true, force: true }); });
  for (let i = 0; i < 60; i++) { try { await fetch(base + '/api/auth/google/config'); break; } catch { await sleep(50); } }
  const { cookie } = await google.signIn(base);
  const call = async (route, method = 'GET', value, headers = {}) => {
    const response = await fetch(base + route, { method, headers: { 'content-type': 'application/json', ...headers }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
    return { status: response.status, data: await response.json() };
  };
  const founder = (route, method, value) => call(route, method, value, { cookie });
  const project = (await founder('/api/founder/projects', 'POST', { name: 'Voice Home', clientName: 'Client' })).data.project;
  await founder(`/api/founder/projects/${project.id}`, 'PATCH', { telegramGroupChatId: '-777' });
  const ingest = async (type, messageId, attachments) => (await call('/api/integrations/telegram/requests', 'POST', {
    RequestID: `REQ--777-${messageId}-${type.toLowerCase()}`, GroupChatID: '-777', SourceMessageID: messageId, RequestType: type, OriginalMessage: '', RequestContext: '', OriginalSenderName: 'Client', RequestedByName: 'Designer',
    AttachmentsJSON: JSON.stringify(attachments || [{ type: 'voice', fileId: 'v1', mimeType: 'audio/ogg' }, { type: 'Photo', fileId: 'p1' }]) }, { authorization: 'Bearer test-secret' })).status;
  const listed = async (id) => (await founder('/api/founder/decision-requests')).data.requests.find((item) => item.id === id);
  return { call, founder, ingest, listed, transcriptions };
}

test('voice notes: a client query is transcribed on its own, once; group chatter waits for the button', async (t) => {
  const f = await fixture(t, { flag: 'true' });
  const id = 'REQ--777-20-question';
  assert.equal(await f.ingest('Question', '20'), 201);
  let transcript;
  for (let i = 0; i < 50 && !transcript; i++) { await sleep(100); transcript = (await f.listed(id)).attachments[0].transcript; }
  assert.equal(transcript?.text, HINDI);
  assert.equal((await f.listed(id)).canTranscribe, true);
  assert.equal(f.transcriptions.length, 1);
  assert.equal(f.transcriptions[0].auth, 'Bearer k');
  for (const part of ['filename="voice.ogg"', 'gpt-transcribe', 'OGGDATA']) assert.ok(f.transcriptions[0].body.includes(part), part);
  // Asking again returns the saved text without another provider call.
  const again = await f.founder(`/api/founder/decision-requests/${id}/attachments/0/transcript`, 'POST', {});
  assert.equal(again.status, 200);
  assert.equal(again.data.transcript.text, HINDI);
  assert.equal(f.transcriptions.length, 1);
  // Group chatter is not sent on its own, but the button works on it.
  assert.equal(await f.ingest('Message', '21'), 201);
  await sleep(300);
  assert.equal(f.transcriptions.length, 1);
  const manual = await f.founder('/api/founder/decision-requests/REQ--777-21-message/attachments/0/transcript', 'POST', {});
  assert.equal(manual.status, 200);
  assert.equal(f.transcriptions.length, 2);
  // A photo is not a voice note, a missing attachment is not found, and signed-out callers are refused.
  assert.equal((await f.founder(`/api/founder/decision-requests/${id}/attachments/1/transcript`, 'POST', {})).status, 404);
  assert.equal((await f.founder(`/api/founder/decision-requests/${id}/attachments/9/transcript`, 'POST', {})).status, 404);
  assert.equal((await f.call(`/api/founder/decision-requests/${id}/attachments/0/transcript`, 'POST', {})).status, 401);
});

test('voice notes: with the switch off nothing leaves the server and the button route says so', async (t) => {
  const f = await fixture(t, { flag: '' });
  assert.equal(await f.ingest('Question', '30'), 201);
  await sleep(400);
  const request = await f.listed('REQ--777-30-question');
  assert.equal(request.canTranscribe, false);
  assert.equal(request.attachments[0].transcript, undefined);
  assert.equal(f.transcriptions.length, 0);
  const asked = await f.founder('/api/founder/decision-requests/REQ--777-30-question/attachments/0/transcript', 'POST', {});
  assert.equal(asked.status, 409);
  assert.match(asked.data.error, /switched off/);
  assert.equal(f.transcriptions.length, 0);
});
