import { OAuth2Client } from 'google-auth-library';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { ApiError } from './api-error.js';

// drive.file: Iksha sees only files it creates or the founder picks, so no Google security review and no "all your files" warning.
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER = 'application/vnd.google-apps.folder';
const fail = (message, status = 400) => { throw new ApiError(message, status); };
// The tag Iksha writes on what it creates, so a retry finds the copy a crash left behind instead of making a second one.
export const driveTag = (key) => createHash('sha256').update(String(key)).digest('hex').slice(0, 40);

// Seals the refresh token with a key from the client secret, so a copy of the database alone can't use it. A new secret means connecting again.
export function tokenBox(secret) {
  const key = createHash('sha256').update(`iksha-drive-token:${secret}`).digest();
  return {
    seal(text) {
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
      const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
      return [iv, cipher.getAuthTag(), data].map((part) => part.toString('base64url')).join('.');
    },
    open(sealed) {
      try {
        const [iv, tag, data] = String(sealed).split('.').map((part) => Buffer.from(part, 'base64url'));
        const decipher = createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
      } catch { return fail('Google Drive needs to be connected again.', 409); }
    },
  };
}

function googleOAuth(clientId, clientSecret) {
  // 'postmessage' is the redirect for codes from Google's popup sign-in.
  const client = () => new OAuth2Client({ clientId, clientSecret, redirectUri: 'postmessage', transporterOptions: { timeout: 10000, retry: false } });
  return {
    async exchange(code) { return (await client().getToken(code)).tokens; },
    async accessToken(refreshToken) { const c = client(); c.setCredentials({ refresh_token: refreshToken }); return (await c.getAccessToken()).token; },
    async revoke(refreshToken) { await client().revokeToken(refreshToken); },
  };
}

// Everything that talks to Google Drive, shared by the page's routes and the upload worker.
export function createDriveClient({ clientId = process.env.GOOGLE_CLIENT_ID || '', clientSecret = process.env.GOOGLE_CLIENT_SECRET || '',
  google = googleOAuth(clientId, clientSecret), fetchImpl = fetch } = {}) {
  const ready = /^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId) && Boolean(clientSecret);
  const box = tokenBox(clientSecret);
  async function call(accessToken, url, { missing = 'Google Drive couldn’t find that item.', timeout = 10000, ...options } = {}) {
    const response = await fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(timeout),
      headers: { authorization: `Bearer ${accessToken}`, ...(typeof options.body === 'string' ? { 'content-type': 'application/json; charset=UTF-8' } : {}), ...options.headers } })
      .catch(() => fail('Could not reach Google Drive. Iksha will try again.', 502));
    if (response.status === 404) fail(missing, 404);
    if (response.status === 403 && /storageQuotaExceeded/.test(await response.clone().text().catch(() => ''))) fail('The connected Google Drive is full. Free up space or connect another account.', 507);
    if (!response.ok) fail('Google Drive refused the request. Iksha will try again.', 502);
    return response;
  }
  const api = async (accessToken, path, options) => (await call(accessToken, API + path, options)).json();
  async function find(accessToken, parentId, tag) {
    const q = `'${parentId}' in parents and trashed=false and appProperties has { key='ikshaKey' and value='${tag}' }`;
    return (await api(accessToken, `/files?${new URLSearchParams({ q, fields: 'files(id)', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' })}`)).files?.[0]?.id || '';
  }
  return {
    ready, clientId, box, google, api, find, FOLDER,
    async accessToken(connection) {
      const refreshToken = box.open(connection.token);
      try { return await google.accessToken(refreshToken); }
      catch { return fail('Google Drive access has expired. Connect Google Drive again.', 409); }
    },
    async folder(accessToken, parentId, name, tag) {
      return (await find(accessToken, parentId, tag)) || (await api(accessToken, '/files?fields=id&supportsAllDrives=true', { method: 'POST',
        body: JSON.stringify({ name, mimeType: FOLDER, parents: [parentId], appProperties: { ikshaKey: tag } }) })).id;
    },
    async rename(accessToken, id, name) {
      await api(accessToken, `/files/${id}?fields=id&supportsAllDrives=true`, { method: 'PATCH', body: JSON.stringify({ name }) });
    },
    // Resumable upload: one request for the details, one for the bytes, which works for files of any size.
    async upload(accessToken, { parentId, name, mime, tag, bytes }) {
      const start = await call(accessToken, `${UPLOAD}?uploadType=resumable&supportsAllDrives=true&fields=id`, { method: 'POST',
        headers: { 'x-upload-content-type': mime }, body: JSON.stringify({ name, parents: [parentId], appProperties: { ikshaKey: tag } }) });
      const session = start.headers.get('location') || '';
      if (!session.startsWith('https://www.googleapis.com/')) fail('Google Drive didn’t start the upload. Iksha will try again.', 502);
      const done = await call(accessToken, session, { method: 'PUT', headers: { 'content-type': mime }, body: bytes, timeout: 120000 });
      return (await done.json()).id;
    },
  };
}

// Save status per project from both the group files and the files people attach to tasks.
// A pending file with an error is a problem; without one it is waiting.
export function driveSummary(state) {
  const totals = { saved: 0, waiting: 0, problems: 0 }, problems = [], folders = state.drive?.folders || {};
  const rows = new Map(state.projects.map((project) => [project.id, { id: project.id, name: project.name, saved: 0, waiting: 0, problems: 0, lastAt: '',
    url: folders[`p:${project.id}`] ? `https://drive.google.com/drive/folders/${folders[`p:${project.id}`].id}` : '' }]));
  for (const file of [...state.projectFiles, ...state.taskFiles.map((row) => ({ ...row, submittedAt: row.at }))]) {
    const row = rows.get(file.projectId);
    if (!row) continue;
    const kind = file.status === 'Stored' ? 'saved' : file.error ? 'problems' : 'waiting';
    row[kind] += 1; totals[kind] += 1;
    if ((file.submittedAt || '') > row.lastAt) row.lastAt = file.submittedAt;
    if (kind === 'problems') problems.push({ id: file.id, name: file.name || 'Untitled file', project: row.name, error: file.error, at: file.submittedAt || '' });
  }
  const latest = (a, b) => (b.lastAt || b.at || '').localeCompare(a.lastAt || a.at || '');
  return { totals, projects: [...rows.values()].sort(latest), problems: problems.sort(latest).slice(0, 20) };
}

export function createDriveRoutes({ getState, body, json, save, audit, client = createDriveClient(),
  pickerKey = process.env.GOOGLE_PICKER_API_KEY || '', onReady = () => {} }) {
  const { ready, box, google, clientId } = client;
  const view = (state) => ({
    ready, picker: ready && Boolean(pickerKey),
    ...(ready ? { clientId, scope: DRIVE_SCOPE } : {}),
    // The picker's app id is the Cloud project number, the first part of the client id.
    ...(ready && pickerKey ? { pickerKey, appId: clientId.split('-')[0] } : {}),
    connection: state.drive?.token ? { email: state.drive.email, name: state.drive.name, connectedAt: state.drive.connectedAt, folder: state.drive.folder || null } : null,
    ...driveSummary(state),
  });
  return async (req, res, url) => {
    const match = url.pathname.match(/^\/api\/founder\/drive(?:\/(connect|token|folder|disconnect))?$/);
    if (!match) return false;
    const state = getState(), action = match[1];
    if (!action) {
      if (req.method !== 'GET') fail('Not found.', 404);
      json(res, 200, view(state)); return true;
    }
    if (req.method !== 'POST') fail('Not found.', 404);
    if (!ready) fail('Google Drive isn’t set up on the server yet.', 503);
    const input = await body(req);
    if (action === 'connect') {
      if (typeof input.code !== 'string' || !input.code || input.code.length > 2000) fail('Google sign-in didn’t finish. Try again.');
      let tokens;
      try { tokens = await google.exchange(input.code); } catch { fail('Google didn’t accept the sign-in. Try again.', 502); }
      if (!String(tokens?.scope || '').split(' ').includes(DRIVE_SCOPE)) fail('Allow the Google Drive permission on Google’s screen to connect.');
      if (!tokens.refresh_token) fail('Google didn’t give lasting access. Remove Iksha under Google Account → Security → Third-party access, then connect again.', 409);
      const { user } = await client.api(tokens.access_token, '/about?fields=user(emailAddress,displayName)');
      const email = String(user?.emailAddress || '').toLowerCase().slice(0, 200);
      if (!email) fail('Google didn’t share the account email. Try again.', 502);
      const previous = state.drive, same = previous?.email === email;
      // Reconnecting the same account keeps its folder; another account starts without one.
      state.drive = { email, name: String(user.displayName || email).slice(0, 120), token: box.seal(tokens.refresh_token),
        connectedAt: new Date().toISOString(), folder: same ? previous.folder || null : null, folders: same ? previous.folders || {} : {} };
      audit('drive_connected', '', { email });
      await save();
      if (state.drive.folder) onReady();
      json(res, 200, view(state)); return true;
    }
    if (!state.drive?.token) fail('Connect Google Drive first.', 409);
    if (action === 'token') { json(res, 200, { accessToken: await client.accessToken(state.drive) }); return true; }
    if (action === 'folder') {
      const token = await client.accessToken(state.drive);
      let folder, how;
      if (input.create === true) {
        folder = await client.api(token, '/files?fields=id,name', { method: 'POST', body: JSON.stringify({ name: 'Iksha Studio', mimeType: client.FOLDER }) });
        how = 'created';
      } else {
        if (typeof input.folderId !== 'string' || !/^[\w-]{10,200}$/.test(input.folderId)) fail('Choose a Drive folder.');
        folder = await client.api(token, `/files/${input.folderId}?fields=id,name,mimeType,trashed,capabilities(canAddChildren)&supportsAllDrives=true`,
          { missing: 'Iksha can’t open that folder. Choose it in Google’s picker so Drive gives access.' });
        if (folder.mimeType !== client.FOLDER || folder.trashed) fail('That link isn’t a Drive folder. Choose a folder.');
        if (folder.capabilities?.canAddChildren === false) fail('You can’t add files to that folder. Choose one you can edit.', 403);
        how = input.how === 'paste' ? 'pasted' : 'picked';
      }
      if (!/^[\w-]{10,200}$/.test(String(folder?.id || ''))) fail('Google Drive sent back an unexpected folder. Try again.', 502);
      // New files go to the new folder; files already saved stay where they are.
      state.drive.folder = { id: folder.id, name: String(folder.name || 'Drive folder').slice(0, 200),
        url: `https://drive.google.com/drive/folders/${folder.id}`, how, setAt: new Date().toISOString() };
      state.drive.folders = {};
      audit('drive_folder_set', '', { folderId: folder.id, how });
      await save();
      onReady();
      json(res, 200, view(state)); return true;
    }
    // Disconnect: Google may already have dropped the grant, so the local copy goes either way.
    try { await google.revoke(box.open(state.drive.token)); } catch { /* already revoked or expired */ }
    state.drive = null;
    audit('drive_disconnected', '', {});
    await save();
    json(res, 200, view(state)); return true;
  };
}
