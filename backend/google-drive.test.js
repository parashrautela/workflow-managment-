import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from './api-error.js';
import { createDriveClient, createDriveRoutes, driveSummary, tokenBox, DRIVE_SCOPE } from './google-drive.js';

const CLIENT = '123456-test.apps.googleusercontent.com';
const FOLDER_ID = 'folder-abcdefghij';

function harness({ secret = 'secret', state = { projects: [], projectFiles: [], taskFiles: [] }, tokens = {}, files = {} } = {}) {
  const calls = { drive: [], revoked: [], audit: [], saves: 0 };
  const google = {
    exchange: async (code) => ({ access_token: 'access-1', refresh_token: 'refresh-1', scope: `openid ${DRIVE_SCOPE}`, ...tokens, code }),
    accessToken: async (refresh) => { if (refresh !== 'refresh-1') throw new Error('invalid_grant'); return 'access-2'; },
    revoke: async (refresh) => { calls.revoked.push(refresh); },
  };
  const fetchImpl = async (url, options) => {
    calls.drive.push({ url, method: options.method || 'GET', body: options.body, auth: options.headers.authorization });
    const path = url.replace('https://www.googleapis.com/drive/v3', '').split('?')[0];
    const reply = path === '/about' ? { user: { emailAddress: 'Ravi@Gmail.com', displayName: 'Ravi' } }
      : path === '/files' ? { id: 'created-folder-1', name: 'Iksha Studio' }
      : files[path.slice('/files/'.length)];
    return reply ? { ok: true, status: 200, json: async () => reply } : { ok: false, status: 404, json: async () => ({}) };
  };
  const routes = createDriveRoutes({ getState: () => state, body: async (req) => req.input || {}, save: async () => { calls.saves += 1; },
    audit: (action, projectId, details) => calls.audit.push({ action, details }), pickerKey: 'picker-key', onReady: () => { calls.ready = (calls.ready || 0) + 1; },
    json: (res, status, value) => Object.assign(res, { status, value }), client: createDriveClient({ clientId: CLIENT, clientSecret: secret, google, fetchImpl }) });
  const send = async (method, path, input) => {
    const res = {};
    try { assert.equal(await routes({ method, input }, res, new URL(path, 'http://app')), true); }
    catch (error) { if (!(error instanceof ApiError)) throw error; return { status: error.status, error: error.message }; }
    return res;
  };
  return { state, calls, send };
}

test('the refresh token is sealed and only opens with the same secret', () => {
  const sealed = tokenBox('one').seal('refresh-1');
  assert.ok(!sealed.includes('refresh-1'));
  assert.equal(tokenBox('one').open(sealed), 'refresh-1');
  assert.throws(() => tokenBox('two').open(sealed), (error) => error.status === 409);
});

test('without a client secret the page says Drive is not set up and refuses to connect', async () => {
  const { send } = harness({ secret: '' });
  const view = await send('GET', '/api/founder/drive');
  assert.equal(view.value.ready, false);
  assert.equal(view.value.clientId, undefined);
  assert.equal((await send('POST', '/api/founder/drive/connect', { code: 'x' })).status, 503);
});

test('connect stores the account with a sealed token and never shows the token', async () => {
  const { send, state, calls } = harness();
  const result = await send('POST', '/api/founder/drive/connect', { code: 'code-1' });
  assert.equal(result.status, 200);
  assert.equal(result.value.accessToken, undefined);
  assert.deepEqual(result.value.connection.email, 'ravi@gmail.com');
  assert.equal(result.value.connection.folder, null);
  assert.equal(result.value.appId, '123456');
  assert.ok(!JSON.stringify(state.drive).includes('refresh-1'));
  assert.ok(!JSON.stringify((await send('GET', '/api/founder/drive')).value).includes(state.drive.token));
  assert.deepEqual(calls.audit.map((row) => row.action), ['drive_connected']);
});

test('connect fails clearly when Google leaves out Drive or lasting access', async () => {
  assert.equal((await harness({ tokens: { scope: 'openid email' } }).send('POST', '/api/founder/drive/connect', { code: 'c' })).status, 400);
  assert.equal((await harness({ tokens: { refresh_token: undefined } }).send('POST', '/api/founder/drive/connect', { code: 'c' })).status, 409);
  assert.equal((await harness().send('POST', '/api/founder/drive/connect', {})).status, 400);
});

test('create makes an Iksha Studio folder; pick and paste check the folder first', async () => {
  const files = { [FOLDER_ID]: { id: FOLDER_ID, name: 'Clients', mimeType: 'application/vnd.google-apps.folder', capabilities: { canAddChildren: true } },
    'doc-abcdefghijk': { id: 'doc-abcdefghijk', mimeType: 'application/pdf' },
    'locked-abcdefghij': { id: 'locked-abcdefghij', mimeType: 'application/vnd.google-apps.folder', capabilities: { canAddChildren: false } } };
  const { send, state, calls } = harness({ files });
  assert.equal((await send('POST', '/api/founder/drive/folder', { create: true })).status, 409); // not connected yet
  await send('POST', '/api/founder/drive/connect', { code: 'c' });
  const created = await send('POST', '/api/founder/drive/folder', { create: true });
  assert.deepEqual(JSON.parse(calls.drive.at(-1).body), { name: 'Iksha Studio', mimeType: 'application/vnd.google-apps.folder' });
  assert.equal(calls.drive.at(-1).auth, 'Bearer access-2');
  assert.equal(created.value.connection.folder.how, 'created');
  assert.equal(state.drive.folder.url, 'https://drive.google.com/drive/folders/created-folder-1');
  assert.equal(calls.ready, 1); // the upload worker starts once a folder is chosen
  assert.equal((await send('POST', '/api/founder/drive/folder', { folderId: 'doc-abcdefghijk' })).status, 400);
  assert.equal((await send('POST', '/api/founder/drive/folder', { folderId: 'locked-abcdefghij' })).status, 403);
  assert.equal((await send('POST', '/api/founder/drive/folder', { folderId: 'unknown-abcdefgh' })).status, 404);
  assert.equal((await send('POST', '/api/founder/drive/folder', { folderId: '../etc' })).status, 400);
  const pasted = await send('POST', '/api/founder/drive/folder', { folderId: FOLDER_ID, how: 'paste' });
  assert.deepEqual([pasted.value.connection.folder.name, pasted.value.connection.folder.how], ['Clients', 'pasted']);
});

test('reconnecting the same account keeps its folder; disconnect revokes and forgets it', async () => {
  const { send, state, calls } = harness();
  await send('POST', '/api/founder/drive/connect', { code: 'c' });
  await send('POST', '/api/founder/drive/folder', { create: true });
  await send('POST', '/api/founder/drive/connect', { code: 'again' });
  assert.equal(state.drive.folder.id, 'created-folder-1');
  const off = await send('POST', '/api/founder/drive/disconnect', {});
  assert.deepEqual(calls.revoked, ['refresh-1']);
  assert.equal(off.value.connection, null);
  assert.equal(state.drive, null);
  assert.equal((await send('POST', '/api/founder/drive/token', {})).status, 409);
});

test('summary counts saved, waiting and problem files per project', () => {
  const state = { drive: { folders: { 'p:p1': { id: 'folder-p1' } } }, projects: [{ id: 'p1', name: 'Sharma Residence' }, { id: 'p2', name: 'Kapoor Villa' }],
    taskFiles: [{ id: 't1', projectId: 'p2', name: 'quote.pdf', status: 'Stored', at: '2026-11-18T10:00:00Z' }], projectFiles: [
    { id: 'f1', projectId: 'p1', status: 'Stored', submittedAt: '2026-11-20T10:00:00Z' },
    { id: 'f2', projectId: 'p1', status: 'Pending', submittedAt: '2026-11-21T10:00:00Z' },
    { id: 'f3', projectId: 'p1', status: 'Pending', error: 'File exceeds the 20 MB automatic upload limit.', name: 'site.mp4', submittedAt: '2026-11-19T10:00:00Z' },
    { id: 'f4', projectId: 'gone', status: 'Stored' }] };
  const summary = driveSummary(state);
  assert.deepEqual(summary.totals, { saved: 2, waiting: 1, problems: 1 });
  assert.deepEqual(summary.projects.map((row) => [row.name, row.saved, row.waiting, row.problems]), [['Sharma Residence', 1, 1, 1], ['Kapoor Villa', 1, 0, 0]]);
  assert.deepEqual(summary.projects.map((row) => row.url), ['https://drive.google.com/drive/folders/folder-p1', '']);
  assert.deepEqual(summary.problems.map((row) => [row.name, row.project]), [['site.mp4', 'Sharma Residence']]);
});
