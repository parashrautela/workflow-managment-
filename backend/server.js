import http from 'node:http';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { createStateStore } from './store.js';
import { loadTelegramAttachment } from './telegram-media.js';
import { ApiError, createPilotRoutes, initializePilot, projectSummary } from './pilot.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'backend');
const dataFile = process.env.APP_DATA_FILE || path.join(dataDir, 'data.json');
const port = Number(process.env.PORT || 3000);
const production = process.env.NODE_ENV === 'production';
const founderPassword = process.env.FOUNDER_PASSWORD;
const integrationSecret = process.env.INTEGRATION_SHARED_SECRET || '';
const botBridgeUrl = process.env.BOT_BRIDGE_URL?.replace(/\/$/, '') || '';
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
const employeeId = () => `EMP-${randomBytes(5).toString('hex').toUpperCase()}`;
const employeePassword = () => randomBytes(15).toString('base64url');
const passwordHash = (password, salt) => scryptSync(password, salt, 64).toString('hex');
const validIsoDate = (value) => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value);
const safeEqual = (a, b) => {
  const aa = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  return aa.length === bb.length && timingSafeEqual(aa, bb);
};
const cookieValue = (req, name) => (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || '';
const cookie = (name, value, maxAge) => `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${production ? '; Secure' : ''}`;
const clearCookie = (name) => `${name}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${production ? '; Secure' : ''}`;
await mkdir(dataDir, { recursive: true });
const stateStore = await createStateStore({ dataFile, production });
let state = stateStore.state;
if (initializePilot(state)) await stateStore.save(state);
console.log(`Project data store connected: ${stateStore.kind}.`);
let saveQueue = Promise.resolve();
const publishingRequests = new Set();
function save() {
  const snapshot = structuredClone(state);
  saveQueue = saveQueue.catch(() => {}).then(() => stateStore.save(snapshot));
  return saveQueue;
}
const audit = (action, projectId, details = {}) => state.activity.unshift({ id: randomBytes(8).toString('hex'), action, projectId, details, at: new Date().toISOString() });
function recordProjectUpdate(projectId, changes) {
  const update = { id: randomBytes(8).toString('hex'), projectId, actor: 'Founder', changes, at: new Date().toISOString() };
  state.projectUpdates.unshift(update);
  return update;
}
const loginAttempts = new Map();
const chatLimits = new Map();
const employeeLoginAttempts = new Map();
const founderChatLimits = new Map();
const teamChatLimits = new Map();
function canSendTeamMessage(actor, projectId) {
  const key = `${actor}:${projectId}`;
  const entry = teamChatLimits.get(key) || { count: 0, resetAt: Date.now() + 60_000 };
  if (entry.resetAt <= Date.now()) { entry.count = 0; entry.resetAt = Date.now() + 60_000; }
  if (entry.count >= 20) return false;
  entry.count += 1; teamChatLimits.set(key, entry);
  return true;
}
const json = (res, status, body, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }); res.end(JSON.stringify(body)); };
const shortText = (value, limit) => typeof value === 'string' && value.length <= limit ? value : null;
async function callBotBridge(route, payload) {
  if (!botBridgeUrl || !integrationSecret) throw new Error('Bot integration is not configured.');
  const response = await fetch(`${botBridgeUrl}${route}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${integrationSecret}` }, body: JSON.stringify(payload), signal: AbortSignal.timeout(route.endsWith('/content') ? 45_000 : 30_000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Telegram bot did not accept the update.');
  return data;
}
async function body(req) {
  let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 1_000_000) throw new ApiError('Request too large.',413); }
  try { const value = raw ? JSON.parse(raw) : {}; if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; } catch { throw new ApiError('Invalid JSON object.',400); }
}
function projectView(project) {
  const owner = (project.members || []).find((member) => member.id === project.internalOwnerMemberId);
  const telegramMembers = state.telegramGroups.find((group) => group.groupChatId === project.telegramGroupChatId)?.members.filter((member) => member.membershipStatus === 'Active') || [];
  return { ...projectSummary(state, project), workflowName:project.workflowName || '',workflowAnnouncementStatus:project.workflowAnnouncementStatus || '',clientTelegramId: project.clientTelegramId || '', id: project.id, name: project.name, clientName: project.clientName, location: project.location, startDate: project.startDate || '', telegramGroupChatId: project.telegramGroupChatId || '', telegramProjectId: project.telegramProjectId || '', telegramSetupPending: Boolean(project.telegramSetupPending), telegramMembers, internalOwnerMemberId: project.internalOwnerMemberId || '', internalOwner: owner?.name || '', phase: project.phase, status: project.status, recentTask: project.recentTask, nextMilestone: project.nextMilestone, blocker: project.blocker, members: project.members || [], createdAt: project.createdAt, completedAt: project.completedAt || null };
}
function bindTelegramStaff(project, member) {
  if (/\b(client|founder)\b/i.test(member.assignedRole)) {
    project.members = (project.members || []).filter((item)=>item.telegramUserId!==member.telegramUserId);
    return null;
  }
  let employee=state.employees.find((item)=>item.telegramUserId===member.telegramUserId);
  let credentials;
  if (!employee) {
    const password=employeePassword(),salt=randomBytes(16).toString('hex');
    employee={id:employeeId(),name:member.assignedName,designation:member.assignedRole,telegramUserId:member.telegramUserId,active:true,passwordSalt:salt,passwordHash:passwordHash(password,salt),createdAt:new Date().toISOString()};
    state.employees.push(employee);credentials={employeeId:employee.id,password,name:member.assignedName};
  }
  const members=project.members ||= [];
  let profile=members.find((item)=>item.telegramUserId===member.telegramUserId || item.employeeId===employee.id);
  if(!profile){profile={id:randomBytes(8).toString('hex'),employeeId:employee.id,telegramUserId:member.telegramUserId};members.push(profile);}
  Object.assign(profile,{name:member.assignedName,role:member.assignedRole,designation:member.assignedRole});
  return credentials;
}
function employeeView(employee) {
  return { active: employee.active !== false, id: employee.id, name: employee.name, designation: employee.designation, email: employee.email || '', phone: employee.phone || '', createdAt: employee.createdAt, projectIds: state.projects.filter((project) => project.members?.some((member) => member.employeeId === employee.id)).map((project) => project.id) };
}
function employeeSession(req) {
  const sid = cookieValue(req, 'iksha_employee');
  const session = state.employeeSessions.find((item) => safeEqual(item.idHash, hash(sid)) && item.expiresAt > Date.now());
  return session ? state.employees.find((item) => item.id === session.employeeId && item.active !== false) : null;
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
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
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

function founderAssistantAnswer(question) {
  const q = question.toLowerCase();
  const named = state.projects.filter((project) => q.includes(project.name.toLowerCase()) || q.includes(project.clientName.toLowerCase()));
  const wantsCompleted = /complet|finish|done/.test(q);
  const wantsAll = /all projects|every project|entire workspace/.test(q);
  const wantsBlockers = /block|risk|issue|delay/.test(q);
  const wantsTeam = /team|member|employee|working on|assigned/.test(q);
  const wantsMilestones = /milestone|next|upcoming|deadline/.test(q);
  const wantsClientQuestions = /client question|client ask|conversation/.test(q);
  const wantsActivity = /activit|change|update history|recent update/.test(q);
  if (wantsActivity && !named.length) {
    const entries = state.activity.slice(0, 8).map((item) => `- ${state.projects.find((project) => project.id === item.projectId)?.name || item.details?.name || 'Workspace'}: ${item.action.replace(/_/g, ' ')} · ${new Date(item.at).toLocaleDateString()}`);
    return entries.length ? ['# Recent activity', ...entries].join('\n') : '# Recent activity\nNo activity has been recorded yet.';
  }
  let projects = named.length ? named : state.projects.filter((project) => wantsCompleted ? project.status === 'Completed' : wantsAll || project.status !== 'Completed');
  if (!named.length && wantsBlockers) projects = projects.filter((project) => project.blocker || project.status === 'At risk');
  if (!projects.length) return state.projects.length ? '# No matching projects\nTry a project name, or ask about ongoing projects, blockers, team members, or milestones.' : '# No projects yet\nCreate a project to start tracking progress here.';
  const title = wantsClientQuestions ? 'Client questions' : wantsTeam ? 'Project teams' : wantsMilestones ? 'Next milestones' : wantsBlockers ? 'Blockers and risks' : wantsCompleted ? 'Completed projects' : wantsAll ? 'All projects' : 'Ongoing projects';
  const lines = [`# ${named.length === 1 ? 'Project details' : title}`, `${projects.length} ${projects.length === 1 ? 'project' : 'projects'} found in saved workspace records.`];
  for (const project of projects.slice(0, 20)) {
    lines.push('', `## ${project.name}`);
    if (wantsClientQuestions) {
      const questions = state.conversations.filter((item) => item.projectId === project.id).slice(-3).reverse();
      if (questions.length) questions.forEach((item) => lines.push(`- ${item.question}`));
      else lines.push('- No client questions recorded.');
      continue;
    }
    if (wantsTeam) {
      if (project.members?.length) project.members.forEach((member) => lines.push(`- ${member.name} — ${member.role || member.designation || 'Team member'}`));
      else lines.push('- No team members assigned.');
      continue;
    }
    if (wantsMilestones) { lines.push(`- Next milestone: ${project.nextMilestone || 'Not recorded'}`, `- Current phase: ${project.phase || 'Not recorded'}`); continue; }
    if (wantsBlockers) { lines.push(`- Status: ${project.status || 'Setup'}`, `- Blocker: ${project.blocker || 'Marked at risk; details not recorded'}`); continue; }
    lines.push(`- Client: ${project.clientName || 'Not recorded'}`, `- Status: ${project.status || 'Setup'} · ${project.phase || 'Phase not set'}`, `- Location: ${project.location || 'Not recorded'}`, `- Recent work: ${project.recentTask || 'Not recorded'}`, `- Next milestone: ${project.nextMilestone || 'Not recorded'}`, `- Blocker: ${project.blocker || 'None recorded'}`, `- Team: ${project.members?.length ? project.members.map((member) => member.name).join(', ') : 'No one assigned'}`);
  }
  if (projects.length > 20) lines.push(`${projects.length - 20} more matching projects. Ask for a project by name.`);
  return lines.join('\n');
}

const pilotRoutes = createPilotRoutes({ getState: () => state, founder, employeeSession, body, json, save, audit, projectView, callBotBridge });
async function handleRequest(req, res) {
  let before = structuredClone(state);
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    if (!['GET','HEAD'].includes(req.method) && url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/integrations/') && req.headers.origin && req.headers.origin !== (process.env.PUBLIC_URL?.replace(/\/$/, '') || `http://${req.headers.host}`)) return json(res,403,{error:'Origin is not allowed.'});
    if (req.method === 'POST' && url.pathname === '/api/integrations/telegram/groups/snapshot') {
      const supplied = (req.headers.authorization || '').replace(/^Bearer /i, '');
      if (!integrationSecret || !safeEqual(supplied, integrationSecret)) return json(res, 401, { error: 'Integration authentication required.' });
      const input = await body(req);
      if (!Array.isArray(input.groups) || input.groups.length > 100) return json(res, 400, { error: 'Invalid group snapshot.' });
      for (const group of input.groups) {
        const groupChatId = String(group.groupChatId || '');
        if (!/^-?\d+$/.test(groupChatId) || !shortText(group.title, 128) || !Array.isArray(group.members) || group.members.length > 1000) return json(res, 400, { error: 'Invalid Telegram group.' });
        const members = [];
        for (const member of group.members) {
          const telegramUserId = String(member.telegramUserId || '');
          if (!/^\d+$/.test(telegramUserId) || !shortText(member.telegramName, 160) || !['Active', 'Left'].includes(member.membershipStatus)) return json(res, 400, { error: 'Invalid Telegram member.' });
          members.push({ telegramUserId, telegramName: member.telegramName, membershipStatus: member.membershipStatus, assignedName: shortText(member.assignedName, 100) || '', assignedRole: shortText(member.assignedRole, 80) || '' });
        }
        const existing = state.telegramGroups.find((item) => item.groupChatId === groupChatId);
        if (existing) { existing.title = group.title; existing.status = group.status; existing.members = members; existing.lastSeenAt = new Date().toISOString(); }
        else state.telegramGroups.push({ groupChatId, title: group.title, status: group.status, members, lastSeenAt: new Date().toISOString() });
        const linkedProject = state.projects.find((project) => project.telegramGroupChatId === groupChatId);
        if (!linkedProject) {
          const project = { id: `p_${randomBytes(8).toString('hex')}`, name: group.title, clientName: 'Client pending', location: '', startDate: '', telegramGroupChatId: groupChatId, telegramProjectId: '', telegramSetupPending: true, internalOwnerMemberId: '', phase: 'Setup', status: 'Needs setup', recentTask: '', nextMilestone: '', blocker: '', members: [], createdAt: new Date().toISOString() };
          state.projects.unshift(project);
          audit('telegram_project_discovered', project.id, { groupChatId });
        } else if (linkedProject.telegramSetupPending) linkedProject.name = group.title;
      }
      await save(); return json(res, 200, { ok: true });
    }
    if(req.method==='POST' && url.pathname==='/api/integrations/telegram/resources') {
      const supplied=(req.headers.authorization || '').replace(/^Bearer /i,'');
      if(!integrationSecret || !safeEqual(supplied,integrationSecret))return json(res,401,{error:'Integration authentication required.'});
      const input=await body(req);const groupId=String(input.GroupChatID || '');
      const project=state.projects.find((item)=>item.telegramGroupChatId===groupId && item.telegramProjectId===input.ProjectID);
      if(!project)return json(res,409,{error:'Link this Telegram project first.'});
      const member=state.telegramGroups.find((group)=>group.groupChatId===groupId)?.members.find((item)=>item.telegramUserId===String(input.TelegramUserID) && item.membershipStatus==='Active' && item.assignedRole);
      if(!member)return json(res,403,{error:'Resource sender is not an assigned member.'});
      if(!/^\d+$/.test(String(input.SourceMessageID || '')) || input.SubmissionID!==`RES-${groupId}-${input.SourceMessageID}` || !shortText(input.FileName,200) || !['Photo','Document'].includes(input.ResourceType) || !shortText(input.TelegramFileID,300))return json(res,400,{error:'Invalid project resource.'});
      let file=state.projectFiles.find((item)=>item.id===input.SubmissionID);
      if(file && file.projectId!==project.id)return json(res,409,{error:'File identity belongs to another project.'});
      if(!file){file={id:input.SubmissionID,projectId:project.id};state.projectFiles.push(file);}
      Object.assign(file,{name:input.FileName,type:input.ResourceType,fileId:input.TelegramFileID,mimeType:shortText(input.MimeType,200) || '',submittedBy:shortText(input.SubmittedByName,160) || 'Team member',submittedAt:shortText(input.SubmittedAt,40) || new Date().toISOString(),status:input.DriveStatus==='Stored'?'Stored':'Pending',error:shortText(input.DriveError,300) || '',driveFileId:shortText(input.DriveFileID,200) || ''});
      await save();return json(res,200,{ok:true});
    }
    if (req.method === 'POST' && url.pathname === '/api/integrations/telegram/requests') {
      const supplied = (req.headers.authorization || '').replace(/^Bearer /i, '');
      if (!integrationSecret || !safeEqual(supplied, integrationSecret)) return json(res, 401, { error: 'Integration authentication required.' });
      const input = await body(req);
      const groupId = String(input.GroupChatID || '');
      const project = state.projects.find((item) => item.telegramGroupChatId === groupId);
      if (!project) return json(res, 409, { error: 'Link this Telegram group to a web app project first.' });
      if (project.telegramProjectId && project.telegramProjectId !== String(input.TelegramProjectID || '')) return json(res,409,{error:'Telegram project mapping does not match.'});
      if (input.AutomaticClientQuery === true) {
        const clientId = project.clientTelegramId || state.telegramGroups.find((g) => g.groupChatId === groupId)?.members.find((m) => m.membershipStatus === 'Active' && /\bclient\b/i.test(m.assignedRole))?.telegramUserId;
        if (!clientId || clientId !== String(input.OriginalSenderTelegramID || '')) return json(res,403,{error:'Message is not from the assigned client.'});
      }
      const id = shortText(input.RequestID, 120);
      const requestType = input.RequestType;
      const message = shortText(input.OriginalMessage, 4096);
      const context = shortText(input.RequestContext, 2000);
      const sender = shortText(input.OriginalSenderName, 160);
      if (!id || !/^REQ--?\d+-\d+-(approval|question)$/.test(id) || !['Approval', 'Question'].includes(requestType) || message === null || context === null || !sender || !/^[-]?\d+$/.test(groupId) || !/^\d+$/.test(String(input.SourceMessageID || ''))) return json(res, 400, { error: 'Invalid Telegram request.' });
      if (id !== `REQ-${groupId}-${input.SourceMessageID}-${requestType.toLowerCase()}`) return json(res,400,{error:'Request identity does not match its source.'});
      const existing = state.decisionRequests.find((item) => item.id === id);
      if (existing) return existing.projectId === project.id ? json(res, 200, { request: existing, created: false }) : json(res, 409, { error: 'Request ID belongs to another project.' });
      let attachments;
      try { attachments = JSON.parse(input.AttachmentsJSON || '[]'); } catch { attachments = null; }
      if (!Array.isArray(attachments) || attachments.length > 8 || attachments.some((item) => !item || typeof item !== 'object' || typeof item.type !== 'string' || item.type.length > 40 || typeof item.fileId !== 'string' || !item.fileId || item.fileId.length > 300 || ['fileName','mimeType'].some((key) => item[key] !== undefined && (typeof item[key] !== 'string' || item[key].length > 200)))) return json(res, 400, { error: 'Invalid attachments.' });
      const request = { id, projectId: project.id, groupChatId: groupId, telegramProjectId: shortText(input.TelegramProjectID, 100) || '', sourceMessageId: String(input.SourceMessageID), commandMessageId: String(input.CommandMessageID || ''), requestedByName: shortText(input.RequestedByName, 160) || 'Unknown', requestedByRole: shortText(input.RequestedByRole, 100) || '', originalSenderName: sender, originalSenderTelegramId: String(input.OriginalSenderTelegramID || ''), automaticClientQuery: input.AutomaticClientQuery === true, requestType, originalMessage: message, context, attachments, status: 'Pending', createdAt: new Date().toISOString(), comments: [], response: '', publishedMessageId: '', publishedAt: '', resolvedAt: '' };
      state.decisionRequests.unshift(request); audit('decision_request_received', project.id, { requestId: id }); await save();
      return json(res, 201, { request, created: true });
    }
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
    if (req.method === 'POST' && url.pathname === '/api/employee/login') {
      const input = await body(req);
      const id = String(input.employeeId || '').trim().toUpperCase();
      const employee = state.employees.find((item) => item.id === id);
      const attemptKey = `${req.socket.remoteAddress || 'unknown'}:${id}`;
      const attempts = employeeLoginAttempts.get(attemptKey) || { count: 0, lockedUntil: 0 };
      if (attempts.lockedUntil > Date.now()) return json(res, 429, { error: 'Too many attempts. Try again in a few minutes.' });
      if (!employee || employee.active === false || !safeEqual(employee.passwordHash, passwordHash(String(input.password || ''), employee.passwordSalt))) {
        attempts.count += 1;
        if (attempts.count >= 8) { attempts.count = 0; attempts.lockedUntil = Date.now() + 10 * 60 * 1000; }
        employeeLoginAttempts.set(attemptKey, attempts);
        return json(res, 401, { error: 'Employee ID or password is incorrect.' });
      }
      employeeLoginAttempts.delete(attemptKey);
      const sessionId = token();
      state.employeeSessions = state.employeeSessions.filter((session) => session.expiresAt > Date.now());
      state.employeeSessions.push({ idHash: hash(sessionId), employeeId: employee.id, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 });
      await save();
      return json(res, 200, { employee: employeeView(employee) }, { 'set-cookie': cookie('iksha_employee', sessionId, 604800) });
    }
    if (req.method === 'POST' && url.pathname === '/api/employee/logout') {
      const sid = cookieValue(req, 'iksha_employee');
      state.employeeSessions = state.employeeSessions.filter((session) => !safeEqual(session.idHash, hash(sid)));
      await save();
      return json(res, 200, { ok: true }, { 'set-cookie': clearCookie('iksha_employee') });
    }
    if (req.method === 'GET' && url.pathname === '/api/employee/me') {
      const employee = employeeSession(req);
      if (!employee) return json(res, 401, { error: 'Employee sign-in required.' });
      const projects = state.projects.filter((project) => project.members?.some((member) => member.employeeId === employee.id));
      return json(res, 200, { employee: employeeView(employee), projects: projects.map(projectView) });
    }
    const projectFilesMatch=url.pathname.match(/^\/api\/(founder|employee)\/projects\/([^/]+)\/files(?:\/([^/]+))?$/);
    if(req.method==='GET' && projectFilesMatch) {
      const namespace=projectFilesMatch[1], employee=namespace==='employee'?employeeSession(req):null;
      if(namespace==='founder'?!founder(req):!employee)return json(res,401,{error:'Sign-in required.'});
      const project=state.projects.find((item)=>item.id===projectFilesMatch[2] && (namespace==='founder' || item.members.some((member)=>member.employeeId===employee.id)));
      if(!project)return json(res,404,{error:'Project not found in your workspace.'});
      const files=state.projectFiles.filter((item)=>item.projectId===project.id);
      if(!projectFilesMatch[3])return json(res,200,{files:files.map(({fileId,driveFileId,...file})=>file)});
      const file=files.find((item)=>item.id===decodeURIComponent(projectFilesMatch[3]) && item.status==='Stored');
      if(!file)return json(res,404,{error:'Stored file not found.'});
      let stored;try{stored=await callBotBridge('/api/integrations/web/resources/content',{groupChatId:project.telegramGroupChatId,submissionId:file.id});}catch(error){return json(res,502,{error:error.message});}
      if(typeof stored.bytes!=='string' || stored.bytes.length>27000000)return json(res,502,{error:'Stored file exceeds the download limit.'});
      const bytes=Buffer.from(stored.bytes,'base64');if(bytes.length>20000000)return json(res,413,{error:'Stored file is too large.'});
      const mime=['image/jpeg','image/png','image/webp','image/gif'].includes(file.mimeType)?file.mimeType:'application/octet-stream';
      res.writeHead(200,{'content-type':mime,'content-disposition':`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,'cache-control':'private, no-store','content-security-policy':"default-src 'none'; sandbox"});return res.end(bytes);
    }
    if (await pilotRoutes(req, res, url)) return;
    const attachmentMatch = url.pathname.match(/^\/api\/(founder|employee)\/decision-requests\/([^/]+)\/attachments\/(\d+)$/);
    if (req.method === 'GET' && attachmentMatch) {
      const namespace = attachmentMatch[1]; const employee = namespace === 'employee' ? employeeSession(req) : null;
      if (namespace === 'founder' ? !founder(req) : !employee) return json(res,401,{error:'Staff session required.'});
      const request = state.decisionRequests.find((r) => r.id === decodeURIComponent(attachmentMatch[2]));
      const project = request && state.projects.find((p) => p.id === request.projectId && (namespace === 'founder' || p.members?.some((m) => m.employeeId === employee.id)));
      if (!project) return json(res,404,{error:'Request not found in your workspace.'});
      const attachment = request.attachments[Number(attachmentMatch[3])];
      if (!attachment) return json(res,404,{error:'Attachment not found.'});
      const file = await loadTelegramAttachment(attachment, process.env.GROUP_BOT_TOKEN);
      res.writeHead(200,{'content-type':file.mime,'content-disposition':file.inline ? 'inline' : 'attachment','cache-control':'private, no-store','content-security-policy':"default-src 'none'; sandbox"});
      return res.end(file.bytes);
    }
    const employeeChatMatch = url.pathname.match(/^\/api\/employee\/projects\/([^/]+)\/team-chat$/);
    if (employeeChatMatch) {
      const employee = employeeSession(req);
      if (!employee) return json(res, 401, { error: 'Employee sign-in required.' });
      const project = state.projects.find((item) => item.id === employeeChatMatch[1] && item.members?.some((member) => member.employeeId === employee.id));
      if (!project) return json(res, 404, { error: 'Project not found in your workspace.' });
      if (req.method === 'GET') return json(res, 200, { messages: state.teamMessages.filter((item) => item.projectId === project.id).slice(-80) });
      if (req.method === 'POST') {
        const input = await body(req); const text = String(input.message || '').trim();
        if (!text || text.length > 2000) return json(res, 400, { error: 'Enter a message under 2,000 characters.' });
        if (!canSendTeamMessage(employee.id, project.id)) return json(res, 429, { error: 'Too many messages. Please wait a minute.' });
        const message = { id: randomBytes(8).toString('hex'), projectId: project.id, senderId: employee.id, senderName: employee.name, senderRole: 'employee', text, at: new Date().toISOString() };
        state.teamMessages.push(message); audit('team_message', project.id, { sender: employee.name }); await save();
        return json(res, 201, { message });
      }
    }
    if (url.pathname.startsWith('/api/employee/')) return json(res, 404, { error: 'Not found.' });
    if (url.pathname.startsWith('/api/founder/') && !founder(req)) return json(res, 401, { error: 'Founder session required.' });
    const projectWorkflows=url.pathname.match(/^\/api\/founder\/projects\/([^/]+)\/workflows$/);
    if(req.method==='GET' && projectWorkflows){
      const project=state.projects.find((item)=>item.id===projectWorkflows[1]);if(!project)return json(res,404,{error:'Project not found.'});
      if(!project.telegramGroupChatId)return json(res,200,{workflows:(await import('./pilot.js')).workflows});
      try{return json(res,200,await callBotBridge('/api/integrations/web/workflows',{groupChatId:project.telegramGroupChatId}));}
      catch(error){return json(res,502,{error:error.message});}
    }
    if (req.method === 'GET' && url.pathname === '/api/founder/telegram-groups') {
      return json(res, 200, { groups: state.telegramGroups.map((group) => ({ ...group, projectId: state.projects.find((project) => project.telegramGroupChatId === group.groupChatId)?.id || '' })) });
    }
    const telegramMemberMatch = url.pathname.match(/^\/api\/founder\/telegram-groups\/(-?\d+)\/members\/(\d+)$/);
    if (req.method === 'POST' && telegramMemberMatch) {
      const group = state.telegramGroups.find((item) => item.groupChatId === telegramMemberMatch[1]);
      const member = group?.members.find((item) => item.telegramUserId === telegramMemberMatch[2] && item.membershipStatus === 'Active');
      if (!member) return json(res, 404, { error: 'Active Telegram member not found.' });
      const input = await body(req); const name = String(input.name || '').trim(); const role = String(input.role || '').trim();
      if (!name || !role || name.length > 100 || role.length > 80) return json(res, 400, { error: 'Enter a name and role.' });
      if(!/\b(client|founder)\b/i.test(role) && state.employees.some((item)=>item.telegramUserId===member.telegramUserId && item.active===false)) return json(res,409,{error:'This Telegram member has a disabled staff account. Re-enable it before assignment.'});
      try { await callBotBridge('/api/integrations/web/group-members', { groupChatId: group.groupChatId, telegramUserId: member.telegramUserId, name, role }); }
      catch (error) { return json(res, 502, { error: error.message }); }
      member.assignedName = name; member.assignedRole = role;
      const linked=state.projects.find((project)=>project.telegramGroupChatId===group.groupChatId);
      const credentials=linked ? bindTelegramStaff(linked,member) : null;

      audit('telegram_member_role_assigned', state.projects.find((project) => project.telegramGroupChatId === group.groupChatId)?.id || '', { groupChatId: group.groupChatId, telegramUserId: member.telegramUserId }); await save();
      return json(res, 200, { member, ...(credentials?{credentials}:{}) });
    }
    const telegramProjectMatch = url.pathname.match(/^\/api\/founder\/telegram-groups\/(-?\d+)\/create-project$/);
    if (req.method === 'POST' && telegramProjectMatch) {
      const group = state.telegramGroups.find((item) => item.groupChatId === telegramProjectMatch[1]);
      if (!group) return json(res, 404, { error: 'Telegram group not found.' });
      const existingProject = state.projects.find((project) => project.telegramGroupChatId === group.groupChatId);
      if (existingProject && !existingProject.telegramSetupPending) return json(res, 409, { error: 'This group already has a completed project setup.' });
      const client = group.members.find((member) => member.membershipStatus === 'Active' && /\bclient\b/i.test(member.assignedRole));
      const active=group.members.filter((member)=>member.membershipStatus==='Active');
      if (!client || active.filter((member)=>/\bclient\b/i.test(member.assignedRole)).length!==1 || active.some((member)=>!member.assignedName || !member.assignedRole) || !active.some((member)=>!/\b(client|founder)\b/i.test(member.assignedRole))) return json(res,409,{error:'Assign exactly one client and at least one team member, and complete every active member profile.'});
      const input = await body(req); const projectName = String(input.projectName || group.title).trim();
      const startDate = String(input.startDate || '').trim();
      if (!projectName || projectName.length > 120 || !validIsoDate(startDate) || !startDate) return json(res, 400, { error: 'Enter a project name and valid start date.' });
      if(active.some((member)=>!/\b(client|founder)\b/i.test(member.assignedRole) && state.employees.some((item)=>item.telegramUserId===member.telegramUserId && item.active===false))) return json(res,409,{error:'Re-enable disabled team accounts before completing setup.'});
      let botProject;
      try { botProject = await callBotBridge('/api/integrations/web/projects', { groupChatId: group.groupChatId, projectName, clientName: client.assignedName || client.telegramName, startDate }); }
      catch (error) { return json(res, 502, { error: error.message }); }
      const project = existingProject || { id: `p_${randomBytes(8).toString('hex')}`, telegramGroupChatId: group.groupChatId, location: '', internalOwnerMemberId: '', recentTask: '', nextMilestone: '', blocker: '', members: [], createdAt: new Date().toISOString() };
      Object.assign(project, { name: projectName, clientName: client.assignedName || client.telegramName, clientTelegramId: client.telegramUserId, startDate, telegramProjectId: botProject.projectId, telegramSetupPending: false, phase: 'Setup', status: 'Setup' });
      const credentials=active.map((member)=>bindTelegramStaff(project,member)).filter(Boolean);
      if (!existingProject) state.projects.unshift(project);
      audit('project_created_from_telegram', project.id, { groupChatId: group.groupChatId, botProjectId: botProject.projectId }); await save();
      return json(res, 201, { project: projectView(project), ...(credentials.length?{credentials}:{}) });
    }
    if (req.method === 'GET' && url.pathname === '/api/founder/decision-requests') {
      return json(res, 200, { requests: state.decisionRequests.filter((item) => state.projects.some((project) => project.id === item.projectId)) });
    }
    const decisionAction = url.pathname.match(/^\/api\/founder\/decision-requests\/([^/]+)\/(comment|publish|resolve)$/);
    if (req.method === 'POST' && decisionAction) {
      const request = state.decisionRequests.find((item) => item.id === decodeURIComponent(decisionAction[1]));
      if (!request || !state.projects.some((project) => project.id === request.projectId)) return json(res, 404, { error: 'Request not found.' });
      const action = decisionAction[2];
      if (action === 'comment') {
        const input = await body(req); const text = String(input.text || '').trim();
        if (!text || text.length > 2000) return json(res, 400, { error: 'Enter an internal comment under 2,000 characters.' });
        (request.comments ||= []).push({ id: randomBytes(8).toString('hex'), author: 'Founder', text, at: new Date().toISOString() });
        audit('decision_request_comment', request.projectId, { requestId: request.id }); await save(); return json(res, 200, { request });
      }
      if (action === 'resolve') {
        if (publishingRequests.has(request.id)) return json(res, 409, { error: 'Wait for Telegram publishing to finish.' });
        if (request.status === 'Done') return json(res, 200, { request });
        request.status = 'Done'; request.resolvedAt = new Date().toISOString();
        audit('decision_request_resolved', request.projectId, { requestId: request.id }); await save(); return json(res, 200, { request });
      }
      if (request.status === 'Done') return json(res, 409, { error: 'This request is already done.' });
      if (['Sending','Unknown'].includes(request.deliveryStatus)) return json(res,409,{error:'Delivery is pending or uncertain. Check Telegram before any further send.'});
      if (request.publishedMessageId) {
        const retry = await body(req);
        if (retry.idempotencyKey && retry.idempotencyKey === request.publishKey && retry.response === request.response) return json(res,200,{request});
        return json(res,409,{error:'A response was already published.'});
      }
      if (publishingRequests.has(request.id)) return json(res, 409, { error: 'This response is already being published.' });
      const input = await body(req); const answer = String(input.response || '').trim();
      if (!answer || answer.length > 3000) return json(res, 400, { error: 'Enter a response under 3,000 characters.' });
      if (!process.env.GROUP_BOT_TOKEN) return json(res, 503, { error: 'Telegram publishing is not configured.' });
      const project = state.projects.find((item) => item.id === request.projectId);
      if (project.telegramGroupChatId !== request.groupChatId) return json(res, 409, { error: 'Project group mapping changed. Check the linked group.' });
      if (input.idempotencyKey !== undefined && (typeof input.idempotencyKey !== 'string' || !input.idempotencyKey.trim() || input.idempotencyKey.length > 128)) return json(res,400,{error:'Invalid idempotency key.'});
      if (request.publishKey && input.idempotencyKey && request.publishKey === input.idempotencyKey && request.response !== answer) return json(res,409,{error:'This key belongs to a different response.'});
      request.deliveryStatus = 'Sending'; request.response = answer; request.publishKey = input.idempotencyKey || request.id; request.deliveryError = '';
      await save();
      before = structuredClone(state); // Never roll back a possibly delivered message to Pending.
      publishingRequests.add(request.id);
      try {
        let telegramResult;
        try {
          const telegramResponse = await fetch(`https://api.telegram.org/bot${process.env.GROUP_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: request.groupChatId, text: answer, reply_parameters: { message_id: Number(request.sourceMessageId), allow_sending_without_reply: true } }), signal: AbortSignal.timeout(10_000), redirect: 'error' });
          telegramResult = await telegramResponse.json();
          if (!telegramResponse.ok || !telegramResult.ok) {
            request.deliveryStatus = telegramResult.ok === false && telegramResponse.status < 500 ? 'Failed' : 'Unknown';
            request.deliveryError = request.deliveryStatus === 'Failed' ? 'Telegram rejected the response. Check bot access before retrying.' : 'Delivery is uncertain. Check Telegram before sending again.';
            await save(); return json(res,502,{error:request.deliveryError,request});
          }
          if (!Number.isSafeInteger(telegramResult.result?.message_id) || telegramResult.result.message_id <= 0) throw new Error('Missing message ID');
        } catch {
          request.deliveryStatus = 'Unknown'; request.deliveryError = 'Delivery is uncertain. Check Telegram before sending again.';
          await save(); return json(res,502,{error:request.deliveryError,request});
        }
        request.status = 'Published'; request.deliveryStatus = 'Sent'; request.publishedMessageId = String(telegramResult.result.message_id); request.publishedAt = new Date().toISOString();
        audit('decision_request_published', request.projectId, { requestId: request.id, telegramMessageId: request.publishedMessageId }); await save();
        return json(res, 200, { request });
      } finally { publishingRequests.delete(request.id); }
    }
    if (req.method === 'GET' && url.pathname === '/api/founder/employees') return json(res, 200, { employees: state.employees.map(employeeView) });
    if (req.method === 'POST' && url.pathname === '/api/founder/employees') {
      const input = await body(req);
      const project = state.projects.find((item) => item.id === input.projectId);
      if (!project) return json(res, 404, { error: 'Select a project for this employee.' });
      const name = String(input.name || '').trim(); const designation = String(input.designation || '').trim(); const role = String(input.role || 'Team member').trim();
      const email = String(input.email || '').trim(); const phone = String(input.phone || '').trim();
      if (!name || !designation || !role || name.length > 120 || designation.length > 120 || email.length > 200 || phone.length > 40) return json(res, 400, { error: 'Enter a name, designation, and role using the requested lengths.' });
      const id = employeeId(); const password = employeePassword(); const salt = randomBytes(16).toString('hex');
      const employee = { id, name, designation, email, phone, passwordSalt: salt, passwordHash: passwordHash(password, salt), createdAt: new Date().toISOString() };
      state.employees.push(employee);
      (project.members ||= []).push({ id: randomBytes(8).toString('hex'), employeeId: id, name, designation, role });
      audit('employee_created', project.id, { employeeId: id }); await save();
      const base = process.env.PUBLIC_URL || `http://localhost:${port}`;
      return json(res, 201, { employee: employeeView(employee), credentials: { employeeId: id, password, link: `${base.replace(/\/$/, '')}/employee?id=${encodeURIComponent(id)}` } });
    }
    if (req.method === 'GET' && url.pathname === '/api/founder/assistant') return json(res, 200, { messages: state.founderChat.slice(-40) });
    if (req.method === 'POST' && url.pathname === '/api/founder/assistant') {
      const sid = cookieValue(req, 'iksha_founder'); const key = hash(sid);
      const limit = founderChatLimits.get(key) || { count: 0, resetAt: Date.now() + 60 * 60 * 1000 };
      if (limit.resetAt <= Date.now()) { limit.count = 0; limit.resetAt = Date.now() + 60 * 60 * 1000; }
      if (limit.count >= 60) return json(res, 429, { error: 'Assistant limit reached. Try again later.' });
      const input = await body(req); const question = String(input.question || '').trim();
      if (!question || question.length > 1000) return json(res, 400, { error: 'Enter a question under 1,000 characters.' });
      limit.count += 1; founderChatLimits.set(key, limit);
      const answer = founderAssistantAnswer(question);
      const message = { id: randomBytes(8).toString('hex'), question, answer, at: new Date().toISOString() };
      state.founderChat.push(message); state.founderChat = state.founderChat.slice(-200); await save();
      return json(res, 200, { message });
    }
    const assignEmployeeMatch = url.pathname.match(/^\/api\/founder\/projects\/([^/]+)\/employees$/);
    if (req.method === 'POST' && assignEmployeeMatch) {
      const project = state.projects.find((item) => item.id === assignEmployeeMatch[1]);
      if (!project) return json(res, 404, { error: 'Project not found.' });
      const input = await body(req); const id = String(input.employeeId || '').trim().toUpperCase();
      const employee = state.employees.find((item) => item.id === id && item.active !== false);
      if (!employee) return json(res, 404, { error: 'No employee has that ID.' });
      if (project.members?.some((member) => member.employeeId === id)) return json(res, 409, { error: 'This employee is already assigned to this project.' });
      const role = String(input.role || 'Team member').trim();
      if (!role || role.length > 80) return json(res, 400, { error: 'Enter a valid project role.' });
      const member = { id: randomBytes(8).toString('hex'), employeeId: id, name: employee.name, designation: employee.designation, role };
      (project.members ||= []).push(member); audit('employee_assigned', project.id, { employeeId: id }); await save();
      return json(res, 201, { member });
    }
    const founderChatMatch = url.pathname.match(/^\/api\/founder\/projects\/([^/]+)\/team-chat$/);
    if (founderChatMatch) {
      const project = state.projects.find((item) => item.id === founderChatMatch[1]);
      if (!project) return json(res, 404, { error: 'Project not found.' });
      if (req.method === 'GET') return json(res, 200, { messages: state.teamMessages.filter((item) => item.projectId === project.id).slice(-80) });
      if (req.method === 'POST') {
        const input = await body(req); const text = String(input.message || '').trim();
        if (!text || text.length > 2000) return json(res, 400, { error: 'Enter a message under 2,000 characters.' });
        if (!canSendTeamMessage('founder', project.id)) return json(res, 429, { error: 'Too many messages. Please wait a minute.' });
        const message = { id: randomBytes(8).toString('hex'), projectId: project.id, senderId: 'founder', senderName: 'Founder', senderRole: 'founder', text, at: new Date().toISOString() };
        state.teamMessages.push(message); audit('team_message', project.id, { sender: 'Founder' }); await save();
        return json(res, 201, { message });
      }
    }
    if (req.method === 'GET' && url.pathname === '/api/founder/projects') return json(res, 200, { projects: state.projects.map(projectView) });
    if (req.method === 'GET' && url.pathname === '/api/founder/trash') return json(res, 200, { projects: state.trashedProjects.map(projectView) });
    const restoreMatch = url.pathname.match(/^\/api\/founder\/trash\/([^/]+)\/restore$/);
    if (req.method === 'POST' && restoreMatch) {
      const project = state.trashedProjects.find((item) => item.id === restoreMatch[1]);
      if (!project) return json(res, 404, { error: 'Project not found in Trash.' });
      state.trashedProjects = state.trashedProjects.filter((item) => item.id !== project.id);
      delete project.trashedAt; state.projects.unshift(project);
      audit('project_restored', project.id, { name: project.name }); await save();
      return json(res, 200, { project: projectView(project) });
    }
    if (req.method === 'POST' && url.pathname === '/api/founder/projects') {
      const input = await body(req);
      if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120 || (input.clientName !== undefined && (typeof input.clientName !== 'string' || input.clientName.length > 120))) return json(res, 400, { error: 'Enter a project name and an optional client name under 121 characters.' });
      if (input.status && input.status !== 'Setup') return json(res,409,{error:'Create in Setup and start a workflow after assigning a client.'});
      if (input.startDate !== undefined && (typeof input.startDate !== 'string' || !validIsoDate(input.startDate))) return json(res, 400, { error: 'Start date must use YYYY-MM-DD.' });
      const project = { id: `p_${randomBytes(8).toString('hex')}`, name: input.name.trim(), clientName: input.clientName?.trim() || '', location: input.location?.trim() || '', startDate: input.startDate?.trim() || '', telegramGroupChatId: '', internalOwnerMemberId: '', phase: input.phase?.trim() || 'Design', status: input.status || 'Setup', recentTask: input.recentTask?.trim() || '', nextMilestone: input.nextMilestone?.trim() || '', blocker: '', members: [], createdAt: new Date().toISOString() };
      state.projects.unshift(project); audit('project_created', project.id); await save(); return json(res, 201, { project: projectView(project) });
    }
    const projectMatch = url.pathname.match(/^\/api\/founder\/projects\/([^/]+)$/);
    const completeMatch = url.pathname.match(/^\/api\/founder\/projects\/([^/]+)\/complete$/);
    if (req.method === 'POST' && completeMatch) {
      const project = state.projects.find((item) => item.id === completeMatch[1]);
      if (!project) return json(res, 404, { error: 'Project not found.' });
      const old = project.status;
      project.status = 'Completed'; project.completedAt = project.completedAt || new Date().toISOString();
      if (old !== 'Completed') { recordProjectUpdate(project.id, { status: { old, new: 'Completed' } }); audit('project_completed', project.id, { name: project.name }); }
      await save(); return json(res, 200, { project: projectView(project) });
    }
    const trashMatch = url.pathname.match(/^\/api\/founder\/projects\/([^/]+)\/trash$/);
    if (req.method === 'POST' && trashMatch) {
      const project = state.projects.find((item) => item.id === trashMatch[1]);
      if (!project) return json(res, 404, { error: 'Project not found.' });
      state.projects = state.projects.filter((item) => item.id !== project.id);
      project.trashedAt = new Date().toISOString(); state.trashedProjects.unshift(project);
      audit('project_moved_to_trash', project.id, { name: project.name }); await save();
      return json(res, 200, { ok: true });
    }
    if (req.method === 'PATCH' && projectMatch) {
      const project = state.projects.find((item) => item.id === projectMatch[1]); if (!project) return json(res, 404, { error: 'Project not found.' });
      const input = await body(req); const allowed = ['phase', 'status', 'recentTask', 'nextMilestone', 'blocker'];
      if (input.startDate !== undefined && (typeof input.startDate !== 'string' || !validIsoDate(input.startDate))) return json(res, 400, { error: 'Start date must use YYYY-MM-DD.' });
      const updates = {};
      if (input.startDate !== undefined) updates.startDate = input.startDate.trim();
      if (input.telegramGroupChatId !== undefined) {
        const groupId = String(input.telegramGroupChatId).trim();
        if (groupId && !/^-?\d{1,25}$/.test(groupId)) return json(res, 400, { error: 'Enter a numeric Telegram group chat ID.' });
        if (groupId && state.projects.some((item) => item.id !== project.id && item.telegramGroupChatId === groupId)) return json(res, 409, { error: 'This Telegram group is linked to another project.' });
        updates.telegramGroupChatId = groupId;
      }
      if (input.internalOwnerMemberId !== undefined) {
        const ownerId = String(input.internalOwnerMemberId || '').trim();
        const owner = ownerId ? project.members.find((member) => member.id === ownerId) : null;
        if (ownerId && (!owner || /client/i.test(owner.role))) return json(res, 400, { error: 'Project owner must be an internal member of this project.' });
        updates.internalOwnerMemberId = ownerId;
      }
      for (const key of allowed) if (typeof input[key] === 'string') updates[key] = input[key].trim();
      if (updates.status && !['Setup','Needs setup','Completed'].includes(updates.status) && !project.workflowStartedAt && ['Setup','Needs setup'].includes(project.status)) return json(res,409,{error:'Assign a client and start a workflow before activating this project.'});
      if (updates.status === 'Completed' && project.status !== 'Completed') updates.completedAt = new Date().toISOString();
      if (updates.status && updates.status !== 'Completed' && project.status === 'Completed') updates.completedAt = null;
      const changes = {};
      for (const [key, value] of Object.entries(updates)) {
        if (project[key] !== value) { changes[key] = { old: project[key] ?? '', new: value }; project[key] = value; }
      }
      if (Object.keys(changes).length) {
        const update = recordProjectUpdate(project.id, changes);
        audit('project_update', project.id, { updateId: update.id, changes });
      }
      await save(); return json(res, 200, { project: projectView(project) });
    }
    const updatesMatch = url.pathname.match(/^\/api\/founder\/projects\/([^/]+)\/updates$/);
    if (req.method === 'GET' && updatesMatch) {
      const project = state.projects.find((item) => item.id === updatesMatch[1]);
      if (!project) return json(res, 404, { error: 'Project not found.' });
      const updates = state.projectUpdates.filter((item) => item.projectId === project.id).slice(0, 50);
      return json(res, 200, { updates });
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
      const invitedProject = state.projects.find((item) => item.id === invite.projectId);
      if (!invitedProject) return json(res, 404, { error: 'This project is no longer available.' });
      const existingSession = clientSession(req);
      if (invite.claimedAt && (!existingSession || existingSession.inviteId !== invite.id || !safeEqual(invite.sessionHash, existingSession.idHash))) return json(res, 410, { error: 'This private client link has already been claimed.' });
      let session = existingSession;
      if (!invite.claimedAt) {
        const id = token(); session = { idHash: hash(id), inviteId: invite.id, projectId: invite.projectId, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 };
        invite.claimedAt = Date.now(); invite.sessionHash = session.idHash; state.clientSessions.push(session); audit('client_link_claimed', invite.projectId); await save();
        res.setHeader('set-cookie', cookie('iksha_client', id, 2592000));
      }
      return json(res, 200, { project: clientProjectView(invitedProject) }, {});
    }
    if (req.method === 'GET' && url.pathname === '/api/client/project') {
      const session = clientSession(req); if (!session) return json(res, 401, { error: 'Open your private project link to continue.' });
      const project = state.projects.find((item) => item.id === session.projectId); return project ? json(res, 200, { project: clientProjectView(project) }) : json(res, 404, { error: 'Project not found.' });
    }
    if (req.method === 'GET' && url.pathname === '/api/client/conversation') {
      const session = clientSession(req); if (!session) return json(res, 401, { error: 'Open your private project link to continue.' });
      if (!state.projects.some((project) => project.id === session.projectId)) return json(res, 404, { error: 'Project not found.' });
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
    if (req.method === 'GET' && (url.pathname === '/employee' || url.pathname === '/employee/')) return sendFile(res, 'frontend/index.html');
    if (req.method === 'GET' && url.pathname === '/app.css') return sendFile(res, 'frontend/app.css');
    if (req.method === 'GET' && url.pathname === '/app.js') return sendFile(res, 'frontend/app.js');
    if (req.method === 'GET' && url.pathname === '/sw.js') return sendFile(res, 'frontend/sw.js');
    if (req.method === 'GET' && url.pathname === '/manifest.webmanifest') return sendFile(res, 'frontend/manifest.webmanifest');
    if (req.method === 'GET' && ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'].includes(url.pathname)) return sendFile(res, `frontend${url.pathname}`);
    if (req.method === 'GET' && url.pathname === '/assets/studio-iksha-access.png') return sendFile(res, 'frontend/assets/studio-iksha-access.png');
    if (req.method === 'GET' && url.pathname.startsWith('/c/')) return sendFile(res, 'frontend/client.html');
    res.writeHead(404); res.end('Not found');
  } catch (error) {
    state = before;
    const status = error instanceof ApiError ? error.status : 500;
    if (status === 500) console.error('Request failed.');
    json(res, status, { error: status === 500 ? 'Something went wrong. Please try again.' : error.message });
  }
}
// Single writer prevents overlapping mutations and makes persistence rollback deterministic.
let requestQueue = Promise.resolve();
const server = http.createServer((req,res) => { requestQueue = requestQueue.catch(() => {}).then(() => handleRequest(req,res)); });
server.listen(port, () => console.log(`Studio Iksha V1 listening on http://localhost:${port}`));
