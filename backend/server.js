import http from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'backend');
const dataFile = path.join(dataDir, 'data.json');
const port = Number(process.env.PORT || 3000);
const production = process.env.NODE_ENV === 'production';
const founderPassword = process.env.FOUNDER_PASSWORD;
if (!founderPassword) {
  console.error('Set FOUNDER_PASSWORD before starting.');
  process.exit(1);
}
if (production && !/^https:\/\//i.test(process.env.PUBLIC_URL || '')) {
  console.error('Set PUBLIC_URL to the app HTTPS origin before production startup.');
  process.exit(1);
}

const hash = (value) => createHash('sha256').update(value).digest('hex');
const token = () => randomBytes(32).toString('base64url');
const safeEqual = (a, b) => {
  const aa = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  return aa.length === bb.length && timingSafeEqual(aa, bb);
};
const cookieValue = (req, name) => (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || '';
const cookie = (name, value, maxAge) => `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${production ? '; Secure' : ''}`;
const clearCookie = (name) => `${name}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${production ? '; Secure' : ''}`;
let state = { projects: [], founderSessions: [], invites: [], clientSessions: [], conversations: [], activity: [] };
await mkdir(dataDir, { recursive: true });
try { state = { ...state, ...JSON.parse(await readFile(dataFile, 'utf8')) }; } catch (error) { if (error.code !== 'ENOENT') throw error; }
for (const key of ['projects', 'founderSessions', 'invites', 'clientSessions', 'conversations', 'activity']) if (!Array.isArray(state[key])) state[key] = [];
let saveQueue = Promise.resolve();
function save() {
  saveQueue = saveQueue.then(() => writeFile(dataFile, JSON.stringify(state, null, 2), { mode: 0o600 }));
  return saveQueue;
}
const audit = (action, projectId, details = {}) => state.activity.unshift({ id: randomBytes(8).toString('hex'), action, projectId, details, at: new Date().toISOString() });
const loginAttempts = new Map();
const chatLimits = new Map();
const json = (res, status, body, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }); res.end(JSON.stringify(body)); };
async function body(req) {
  let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 1_000_000) throw new Error('Request too large'); }
  return raw ? JSON.parse(raw) : {};
}
function projectView(project) {
  return { id: project.id, name: project.name, clientName: project.clientName, location: project.location, phase: project.phase, status: project.status, recentTask: project.recentTask, nextMilestone: project.nextMilestone, blocker: project.blocker, members: project.members, createdAt: project.createdAt };
}
function clientProjectView(project) {
  return { name: project.name, clientName: project.clientName, phase: project.phase, status: project.status, recentTask: project.recentTask, nextMilestone: project.nextMilestone, blocker: project.blocker };
}
function founder(req) {
  const sid = cookieValue(req, 'iksha_founder');
  return state.founderSessions.find((item) => safeEqual(item.idHash, hash(sid)) && item.expiresAt > Date.now());
}
function clientSession(req) {
  const sid = cookieValue(req, 'iksha_client');
  return state.clientSessions.find((item) => safeEqual(item.idHash, hash(sid)) && item.expiresAt > Date.now());
}
function sendFile(res, filename) {
  const ext = path.extname(filename);
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
  readFile(path.join(root, filename)).then((content) => { res.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream', 'cache-control': 'no-cache' }); res.end(content); }).catch(() => { res.writeHead(404); res.end('Not found'); });
}
async function answerProjectQuestion(project, question) {
  const facts = {
    project: project.name, overall_status: project.status, current_phase: project.phase,
    recent_task: project.recentTask || 'Not set yet', next_milestone: project.nextMilestone || 'Not set yet',
    blocker: project.blocker || 'No blocker has been recorded',
  };
  if (process.env.OPENAI_API_KEY) {
    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-5-mini', store: false, input: [
          { role: 'system', content: 'You are Studio Iksha project’s client update assistant. Answer only from the supplied project facts. Be concise and friendly. Never invent progress, dates, tasks, decisions, or promises. If a fact is missing, say it is not available in the project update and suggest asking the project founder. Do not reveal private/internal data.' },
          { role: 'user', content: `Project facts: ${JSON.stringify(facts)}\nClient question: ${question}` },
        ] }), signal: AbortSignal.timeout(20000),
      });
      if (response.ok) {
        const result = await response.json();
        const text = result.output?.flatMap((item) => item.content || []).find((item) => item.type === 'output_text')?.text;
        if (text) return text;
      }
    } catch (error) { console.error('AI request failed:', error.message); }
  }
  const q = question.toLowerCase();
  if (/phase|stage/.test(q)) return `The project is currently in the ${facts.current_phase} phase.`;
  if (/recent|last|being done|task/.test(q)) return `The latest task recorded is: ${facts.recent_task}.`;
  if (/block|issue|problem/.test(q)) return `${facts.blocker}.`;
  if (/next|milestone/.test(q)) return `The next milestone recorded is: ${facts.next_milestone}.`;
  return `The project is ${facts.overall_status}, currently in ${facts.current_phase}. The latest task recorded is ${facts.recent_task}. Ask me about the current phase, recent task, blocker, or next milestone.`;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'POST' && url.pathname === '/api/founder/login') {
      const ip = req.socket.remoteAddress || 'unknown'; const attempts = loginAttempts.get(ip) || { count: 0, lockedUntil: 0 };
      if (attempts.lockedUntil > Date.now()) return json(res, 429, { error: 'Too many attempts. Try again in a few minutes.' });
      const input = await body(req);
      if (!safeEqual(input.password || '', founderPassword)) {
        attempts.count += 1; if (attempts.count >= 8) { attempts.count = 0; attempts.lockedUntil = Date.now() + 10 * 60 * 1000; }
        loginAttempts.set(ip, attempts); return json(res, 401, { error: 'That password is not correct.' });
      }
      loginAttempts.delete(ip);
      const id = token(); state.founderSessions = state.founderSessions.filter((session) => session.expiresAt > Date.now());
      state.founderSessions.push({ idHash: hash(id), expiresAt: Date.now() + 8 * 60 * 60 * 1000 }); await save();
      return json(res, 200, { ok: true }, { 'set-cookie': cookie('iksha_founder', id, 28800) });
    }
    if (req.method === 'POST' && url.pathname === '/api/founder/logout') {
      const sid = cookieValue(req, 'iksha_founder'); state.founderSessions = state.founderSessions.filter((session) => !safeEqual(session.idHash, hash(sid))); await save();
      return json(res, 200, { ok: true }, { 'set-cookie': clearCookie('iksha_founder') });
    }
    if (url.pathname.startsWith('/api/founder/') && !founder(req)) return json(res, 401, { error: 'Founder session required.' });
    if (req.method === 'GET' && url.pathname === '/api/founder/projects') return json(res, 200, { projects: state.projects.map(projectView) });
    if (req.method === 'POST' && url.pathname === '/api/founder/projects') {
      const input = await body(req);
      if (!input.name?.trim() || !input.clientName?.trim()) return json(res, 400, { error: 'Project and client names are required.' });
      const project = { id: `p_${randomBytes(8).toString('hex')}`, name: input.name.trim(), clientName: input.clientName.trim(), location: input.location?.trim() || '', phase: input.phase?.trim() || 'Design', status: input.status || 'Setup', recentTask: input.recentTask?.trim() || '', nextMilestone: input.nextMilestone?.trim() || '', blocker: '', members: [], createdAt: new Date().toISOString() };
      state.projects.unshift(project); audit('project_created', project.id); await save(); return json(res, 201, { project: projectView(project) });
    }
    const projectMatch = url.pathname.match(/^\/api\/founder\/projects\/([^/]+)$/);
    if (req.method === 'PATCH' && projectMatch) {
      const project = state.projects.find((item) => item.id === projectMatch[1]); if (!project) return json(res, 404, { error: 'Project not found.' });
      const input = await body(req); const allowed = ['phase', 'status', 'recentTask', 'nextMilestone', 'blocker'];
      for (const key of allowed) if (typeof input[key] === 'string') project[key] = input[key].trim();
      audit('project_update', project.id); await save(); return json(res, 200, { project: projectView(project) });
    }
    const conversationMatch = url.pathname.match(/^\/api\/founder\/projects\/([^/]+)\/conversation$/);
    if (req.method === 'GET' && conversationMatch) {
      const project = state.projects.find((item) => item.id === conversationMatch[1]); if (!project) return json(res, 404, { error: 'Project not found.' });
      return json(res, 200, { messages: state.conversations.filter((item) => item.projectId === project.id).slice(-30).reverse() });
    }
    const memberMatch = url.pathname.match(/^\/api\/founder\/projects\/([^/]+)\/members$/);
    if (req.method === 'POST' && memberMatch) {
      const project = state.projects.find((item) => item.id === memberMatch[1]); if (!project) return json(res, 404, { error: 'Project not found.' });
      const input = await body(req); if (!input.name?.trim() || !input.designation?.trim() || !input.role?.trim()) return json(res, 400, { error: 'Name, designation and role are required.' });
      const member = { id: randomBytes(8).toString('hex'), name: input.name.trim(), designation: input.designation.trim(), role: input.role.trim() };
      project.members.push(member); audit('member_added', project.id, { role: member.role }); await save(); return json(res, 201, { member });
    }
    const inviteMatch = url.pathname.match(/^\/api\/founder\/projects\/([^/]+)\/invite$/);
    if (req.method === 'POST' && inviteMatch) {
      const project = state.projects.find((item) => item.id === inviteMatch[1]); if (!project) return json(res, 404, { error: 'Project not found.' });
      const raw = token(); state.invites = state.invites.filter((item) => item.projectId !== project.id);
      state.clientSessions = state.clientSessions.filter((item) => item.projectId !== project.id);
      state.invites.push({ id: randomBytes(8).toString('hex'), projectId: project.id, tokenHash: hash(raw), claimedAt: null, sessionHash: null, createdAt: Date.now() });
      audit('client_link_created', project.id); await save();
      const base = process.env.PUBLIC_URL || `http://localhost:${port}`;
      return json(res, 201, { link: `${base.replace(/\/$/, '')}/c/${raw}` });
    }
    if (req.method === 'GET' && url.pathname === '/api/founder/activity') return json(res, 200, { activity: state.activity.slice(0, 40) });
    if (req.method === 'POST' && url.pathname === '/api/client/claim') {
      const input = await body(req); const invite = state.invites.find((item) => safeEqual(item.tokenHash, hash(input.token || '')));
      if (!invite) return json(res, 404, { error: 'This client link is invalid or has been replaced.' });
      const existingSession = clientSession(req);
      if (invite.claimedAt && (!existingSession || existingSession.inviteId !== invite.id || !safeEqual(invite.sessionHash, existingSession.idHash))) return json(res, 410, { error: 'This private client link has already been claimed.' });
      let session = existingSession;
      if (!invite.claimedAt) {
        const id = token(); session = { idHash: hash(id), inviteId: invite.id, projectId: invite.projectId, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 };
        invite.claimedAt = Date.now(); invite.sessionHash = session.idHash; state.clientSessions.push(session); audit('client_link_claimed', invite.projectId); await save();
        res.setHeader('set-cookie', cookie('iksha_client', id, 2592000));
      }
      return json(res, 200, { project: clientProjectView(state.projects.find((item) => item.id === invite.projectId)) }, {});
    }
    if (req.method === 'GET' && url.pathname === '/api/client/project') {
      const session = clientSession(req); if (!session) return json(res, 401, { error: 'Open your private project link to continue.' });
      const project = state.projects.find((item) => item.id === session.projectId); return project ? json(res, 200, { project: clientProjectView(project) }) : json(res, 404, { error: 'Project not found.' });
    }
    if (req.method === 'GET' && url.pathname === '/api/client/conversation') {
      const session = clientSession(req); if (!session) return json(res, 401, { error: 'Open your private project link to continue.' });
      return json(res, 200, { messages: state.conversations.filter((item) => item.projectId === session.projectId).slice(-30) });
    }
    if (req.method === 'POST' && url.pathname === '/api/client/chat') {
      const session = clientSession(req); if (!session) return json(res, 401, { error: 'Open your private project link to continue.' });
      const limit = chatLimits.get(session.idHash) || { count: 0, resetAt: Date.now() + 60 * 60 * 1000 };
      if (limit.resetAt <= Date.now()) { limit.count = 0; limit.resetAt = Date.now() + 60 * 60 * 1000; }
      if (limit.count >= 30) return json(res, 429, { error: 'You have reached the hourly question limit. Please try again later.' });
      const input = await body(req); const question = String(input.question || '').trim(); if (!question || question.length > 1000) return json(res, 400, { error: 'Enter a question under 1,000 characters.' });
      limit.count += 1; chatLimits.set(session.idHash, limit);
      const project = state.projects.find((item) => item.id === session.projectId); if (!project) return json(res, 404, { error: 'Project not found.' });
      const answer = await answerProjectQuestion(project, question);
      state.conversations.push({ projectId: project.id, question, answer, at: new Date().toISOString() }); await save();
      return json(res, 200, { answer });
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Not found.' });
    if (req.method === 'GET' && url.pathname === '/') return sendFile(res, 'frontend/index.html');
    if (req.method === 'GET' && url.pathname === '/app.css') return sendFile(res, 'frontend/app.css');
    if (req.method === 'GET' && url.pathname === '/app.js') return sendFile(res, 'frontend/app.js');
    if (req.method === 'GET' && url.pathname.startsWith('/c/')) return sendFile(res, 'frontend/client.html');
    res.writeHead(404); res.end('Not found');
  } catch (error) {
    console.error(error); json(res, 500, { error: 'Something went wrong. Please try again.' });
  }
});
server.listen(port, () => console.log(`Studio Iksha V1 listening on http://localhost:${port}`));
