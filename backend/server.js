import { createStageOrderRoutes } from './tasks/stage-order-routes.js';
import { createIntakeRoutes } from './integrations/intake-routes.js';
import { createSessionRoutes } from './auth/session-routes.js';
import { createProjectFileRoutes } from './projects/file-routes.js';
import { createQueryAttachmentRoutes } from './queries/attachment-routes.js';
import { createEmployeeChatRoutes } from './collaboration/employee-chat-routes.js';
import { createGroupSetupRoutes } from './integrations/group-routes.js';
import { createQueryReviewRoutes } from './queries/review-routes.js';
import { createEmployeeRoutes } from './auth/employee-routes.js';
import { createAssistantRoutes } from './queries/assistant-routes.js';
import { createAssignmentRoutes } from './projects/assignment-routes.js';
import { createFounderChatRoutes } from './collaboration/founder-chat-routes.js';
import { createProjectRoutes } from './projects/routes.js';
import { createClientRoutes } from './projects/client-routes.js';
import { createBotBridge } from './integrations/bot-bridge.js';
import { body } from './http/request.js';

import { createQueryNotifier } from './queries/query-notifications.js';

import { createCollaborationRoutes } from './collaboration/collaboration.js';
import { createMeetingRoutes, initializeMeetings } from './meetings/meetings.js';
import { migrateGoogleOnlyAccess } from './auth/google-access.js';
import { createGoogleAuthRoutes } from './auth/google-auth.js';
import { createStageLinksRoutes } from './tasks/stage-links-routes.js';
import { createOperationsRoutes, telegramConnected } from './operations/operations.js';
import { rolesOf, hasRole, isStaff } from './auth/roles.js';
import { reconcileGroupMigration } from './projects/group-migration.js';

import http from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { createStateStore } from './storage/store.js';

import { ApiError } from './http/api-error.js';
import { createPilotRoutes, initializePilot, projectSummary } from './tasks/pilot.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'backend');
const dataFile = process.env.APP_DATA_FILE || path.join(dataDir, 'data.json');
const port = Number(process.env.PORT || 3000);
const production = process.env.NODE_ENV === 'production';
const integrationSecret = process.env.INTEGRATION_SHARED_SECRET || '';
const botBridgeUrl = process.env.BOT_BRIDGE_URL?.replace(/\/$/, '') || '';
if (
  production &&
  !/^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(process.env.GOOGLE_CLIENT_ID || '')
) {
  console.error('Set GOOGLE_CLIENT_ID before production startup.');
  process.exit(1);
}
if (production && !/^https:\/\//i.test(process.env.PUBLIC_URL || '')) {
  console.error('Set PUBLIC_URL to the app HTTPS origin before production startup.');
  process.exit(1);
}

const hash = (value) => createHash('sha256').update(value).digest('hex');
const token = () => randomBytes(32).toString('base64url');
const employeeId = () => `EMP-${randomBytes(5).toString('hex').toUpperCase()}`;
const validIsoDate = (value) =>
  !value ||
  (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()) &&
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value);
const safeEqual = (a, b) => {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && timingSafeEqual(aa, bb);
};
const cookieValue = (req, name) =>
  (req.headers.cookie || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1) || '';
const cookie = (name, value, maxAge) =>
  `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${production ? '; Secure' : ''}`;
const clearCookie = (name) =>
  `${name}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${production ? '; Secure' : ''}`;
await mkdir(dataDir, { recursive: true });
const stateStore = await createStateStore({ dataFile, production });
let state = stateStore.state;
if (initializePilot(state)) await stateStore.save(state);
if (initializeMeetings(state)) await stateStore.save(state);
if (migrateGoogleOnlyAccess(state, process.env.INITIAL_FOUNDER_EMAIL || ''))
  await stateStore.save(state);
console.log(`Project data store connected: ${stateStore.kind}.`);
let saveQueue = Promise.resolve();
const publishingRequests = new Set();
function save() {
  const snapshot = structuredClone(state);
  saveQueue = saveQueue.catch(() => {}).then(() => stateStore.save(snapshot));
  return saveQueue;
}
const audit = (action, projectId, details = {}) =>
  state.activity.unshift({
    id: randomBytes(8).toString('hex'),
    action,
    projectId,
    details,
    at: new Date().toISOString(),
  });
function recordProjectUpdate(projectId, changes) {
  const update = {
    id: randomBytes(8).toString('hex'),
    projectId,
    actor: 'Founder',
    changes,
    at: new Date().toISOString(),
  };
  state.projectUpdates.unshift(update);
  return update;
}
const chatLimits = new Map();
const founderChatLimits = new Map();
const replySuggestionLimits = new Map();
const teamChatLimits = new Map();
const closingProjects = new Set();
function canSendTeamMessage(actor, projectId) {
  const key = `${actor}:${projectId}`;
  const entry = teamChatLimits.get(key) || { count: 0, resetAt: Date.now() + 60_000 };
  if (entry.resetAt <= Date.now()) {
    entry.count = 0;
    entry.resetAt = Date.now() + 60_000;
  }
  if (entry.count >= 20) return false;
  entry.count += 1;
  teamChatLimits.set(key, entry);
  return true;
}
const json = (res, status, body, headers = {}) => {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(JSON.stringify(body));
};
const shortText = (value, limit) =>
  typeof value === 'string' && value.length <= limit ? value : null;
const callBotBridge = createBotBridge({ baseUrl: botBridgeUrl, secret: integrationSecret });
function projectView(project) {
  const owner = (project.members || []).find(
    (member) => member.id === project.internalOwnerMemberId,
  );
  const telegramMembers =
    state.telegramGroups
      .find((group) => group.groupChatId === project.telegramGroupChatId)
      ?.members.filter((member) => member.membershipStatus === 'Active') || [];
  return {
    spaces: project.spaces || [],
    ...projectSummary(state, project),
    workflowName: project.workflowName || '',
    workflowAnnouncementStatus: project.workflowAnnouncementStatus || '',
    clientTelegramId: project.clientTelegramId || '',
    id: project.id,
    name: project.name,
    clientName: project.clientName,
    location: project.location,
    startDate: project.startDate || '',
    telegramGroupChatId: project.telegramGroupChatId || '',
    telegramProjectId: project.telegramProjectId || '',
    telegramSetupPending: Boolean(project.telegramSetupPending),
    telegramMembers,
    internalOwnerMemberId: project.internalOwnerMemberId || '',
    internalOwner: owner?.name || '',
    phase: project.phase,
    status: project.status,
    recentTask: project.recentTask,
    nextMilestone: project.nextMilestone,
    blocker: project.blocker,
    members: project.members || [],
    createdAt: project.createdAt,
    completedAt: project.completedAt || null,
  };
}
function bindTelegramStaff(project, member) {
  if (!isStaff(member.assignedRole)) {
    for (const profile of project.members || [])
      if (profile.telegramUserId === member.telegramUserId) profile.active = false;
    return null;
  }
  let employee = state.employees.find((item) => item.telegramUserId === member.telegramUserId);
  if (!employee) {
    employee = {
      id: employeeId(),
      name: member.assignedName,
      designation: member.assignedRole,
      telegramUserId: member.telegramUserId,
      active: true,
      createdAt: new Date().toISOString(),
    };
    state.employees.push(employee);
  }
  const members = (project.members ||= []);
  let profile = members.find(
    (item) => item.telegramUserId === member.telegramUserId || item.employeeId === employee.id,
  );
  if (!profile) {
    profile = {
      id: randomBytes(8).toString('hex'),
      employeeId: employee.id,
      telegramUserId: member.telegramUserId,
    };
    members.push(profile);
  }
  Object.assign(profile, {
    active: true,
    name: member.assignedName,
    role: member.assignedRole,
    roles: rolesOf(member.assignedRole),
    designation: member.assignedRole,
  });
  return null;
}
function employeeView(employee) {
  return {
    workspaceRole: state.googleAccounts.some(
      (account) =>
        account.kind === 'founder' &&
        account.employeeId === employee.id &&
        account.status === 'Approved',
    )
      ? 'Founder'
      : 'Employee',
    telegramConnected: telegramConnected(state, employee),
    active: employee.active !== false,
    id: employee.id,
    name: employee.name,
    designation: employee.designation,
    email: employee.email || '',
    phone: employee.phone || '',
    googleLinked: state.googleAccounts.some(
      (account) =>
        account.employeeId === employee.id && account.status === 'Approved' && account.subject,
    ),
    googleInvited: state.googleAccounts.some(
      (account) =>
        account.kind === 'employee' &&
        account.employeeId === employee.id &&
        account.status === 'Approved' &&
        !account.subject,
    ),
    createdAt: employee.createdAt,
    projectIds: state.projects
      .filter((project) =>
        project.members?.some(
          (member) => member.employeeId === employee.id && member.active !== false,
        ),
      )
      .map((project) => project.id),
  };
}
function employeeSession(req) {
  const sid = cookieValue(req, 'iksha_employee');
  const session = state.employeeSessions.find(
    (item) => safeEqual(item.idHash, hash(sid)) && item.expiresAt > Date.now(),
  );
  return session &&
    state.googleAccounts.some(
      (account) =>
        account.id === session.googleAccountId &&
        account.kind === 'employee' &&
        account.status === 'Approved' &&
        account.employeeId === session.employeeId,
    )
    ? state.employees.find((item) => item.id === session.employeeId && item.active !== false)
    : null;
}
function clientProjectView(project) {
  return {
    name: project.name,
    clientName: project.clientName,
    phase: project.phase,
    status: project.status,
    recentTask: project.recentTask,
    nextMilestone: project.nextMilestone,
    blocker: project.blocker,
  };
}
function founder(req) {
  const sid = cookieValue(req, 'iksha_founder');
  return state.founderSessions.find(
    (item) =>
      safeEqual(item.idHash, hash(sid)) &&
      item.expiresAt > Date.now() &&
      state.googleAccounts.some(
        (account) =>
          account.id === item.googleAccountId &&
          account.subject &&
          account.kind === 'founder' &&
          account.status === 'Approved',
      ),
  );
}
function clientSession(req) {
  const sid = cookieValue(req, 'iksha_client');
  return state.clientSessions.find(
    (item) => safeEqual(item.idHash, hash(sid)) && item.expiresAt > Date.now(),
  );
}
function sendFile(res, filename) {
  const ext = path.extname(filename);
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.webmanifest': 'application/manifest+json',
  };
  readFile(path.join(root, filename))
    .then((content) => {
      res.writeHead(200, {
        'content-type': types[ext] || 'application/octet-stream',
        'cache-control': 'no-cache',
      });
      res.end(content);
    })
    .catch(() => {
      res.writeHead(404);
      res.end('Not found');
    });
}
function applyGroupSnapshot(input) {
  if (!Array.isArray(input.groups) || input.groups.length > 100)
    throw new ApiError('Invalid group snapshot.', 400);
  for (const group of input.groups.filter((group) => group.status === 'Migrated')) {
    try {
      reconcileGroupMigration(state, group.groupChatId, group.migratedTo);
    } catch (error) {
      throw new ApiError(error.message, 409);
    }
  }
  for (const group of input.groups) {
    if (group.status === 'Migrated') continue;
    const groupChatId = String(group.groupChatId || '');
    if (
      !/^-?\d+$/.test(groupChatId) ||
      !shortText(group.title, 128) ||
      !Array.isArray(group.members) ||
      group.members.length > 1000
    )
      throw new ApiError('Invalid Telegram group.', 400);
    const members = [];
    for (const member of group.members) {
      const telegramUserId = String(member.telegramUserId || '');
      if (
        !/^\d+$/.test(telegramUserId) ||
        !shortText(member.telegramName, 160) ||
        !['Active', 'Left'].includes(member.membershipStatus)
      )
        throw new ApiError('Invalid Telegram member.', 400);
      members.push({
        telegramUserId,
        telegramName: member.telegramName,
        membershipStatus: member.membershipStatus,
        assignedName: shortText(member.assignedName, 100) || '',
        assignedRole: shortText(member.assignedRole, 160) || '',
      });
    }
    const existing = state.telegramGroups.find((item) => item.groupChatId === groupChatId);
    if (existing) {
      existing.title = group.title;
      existing.status = group.status;
      existing.members = members;
      existing.lastSeenAt = new Date().toISOString();
      Object.assign(
        existing,
        Object.fromEntries(
          ['telegramMemberCount', 'botUsername', 'botIsAdmin', 'discoveryWarning']
            .filter((key) => group[key] !== undefined)
            .map((key) => [key, group[key]]),
        ),
      );
    } else
      state.telegramGroups.push({
        groupChatId,
        title: group.title,
        status: group.status,
        members,
        lastSeenAt: new Date().toISOString(),
        ...Object.fromEntries(
          ['telegramMemberCount', 'botUsername', 'botIsAdmin', 'discoveryWarning']
            .filter((key) => group[key] !== undefined)
            .map((key) => [key, group[key]]),
        ),
      });
    const linkedProject = state.projects.find(
      (project) => project.telegramGroupChatId === groupChatId,
    );
    if (linkedProject) {
      const clients = members.filter(
        (member) => member.membershipStatus === 'Active' && hasRole(member.assignedRole, 'Client'),
      );
      linkedProject.clientTelegramIds = clients.map((member) => member.telegramUserId);
      linkedProject.clientTelegramId = clients[0]?.telegramUserId || '';
      for (const member of members) {
        const profile = linkedProject.members?.find(
          (row) => row.telegramUserId === member.telegramUserId,
        );
        if (profile)
          Object.assign(profile, {
            active: member.membershipStatus === 'Active' && isStaff(member.assignedRole),
            name: member.assignedName || member.telegramName,
            role: member.assignedRole,
            roles: rolesOf(member.assignedRole),
            designation: member.assignedRole,
          });
      }
    }
    if (!linkedProject) {
      const project = {
        id: `p_${randomBytes(8).toString('hex')}`,
        name: group.title,
        clientName: 'Client pending',
        location: '',
        startDate: '',
        telegramGroupChatId: groupChatId,
        telegramProjectId: '',
        telegramSetupPending: true,
        internalOwnerMemberId: '',
        phase: 'Setup',
        status: 'Needs setup',
        recentTask: '',
        nextMilestone: '',
        blocker: '',
        members: [],
        createdAt: new Date().toISOString(),
      };
      const clients = members.filter(
        (member) => member.membershipStatus === 'Active' && hasRole(member.assignedRole, 'Client'),
      );
      project.clientTelegramIds = clients.map((member) => member.telegramUserId);
      project.clientTelegramId = clients[0]?.telegramUserId || '';
      state.projects.unshift(project);
      audit('telegram_project_discovered', project.id, { groupChatId });
    } else if (linkedProject.telegramSetupPending) linkedProject.name = group.title;
  }
}

let externalRollbackState = null;
// Preserve the saved Sending record if persistence fails after an external send.
const checkpoint = () => {
  externalRollbackState = structuredClone(state);
};
const notifyQuery = createQueryNotifier({
  save,
  checkpoint,
  callBotBridge,
  sendUpdate: async (payload) => {
    if (botBridgeUrl && integrationSecret)
      return callBotBridge('/api/integrations/web/decisions/notify', payload);
    if (!process.env.GROUP_BOT_TOKEN) return { ok: false, deliveryStatus: 'Failed' };
    const response = await fetch(
      `https://api.telegram.org/bot${process.env.GROUP_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: payload.groupChatId,
          text: payload.response,
          reply_parameters: {
            message_id: Number(payload.sourceMessageId),
            allow_sending_without_reply: true,
          },
        }),
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
      },
    );
    const result = await response.json();
    return response.ok && result.ok
      ? result
      : {
          ok: false,
          deliveryStatus: result.ok === false && response.status < 500 ? 'Failed' : 'Unknown',
        };
  },
});
const collaborationRoutes = createCollaborationRoutes({
  notifyQuery,
  getState: () => state,
  founder,
  employeeSession,
  body,
  json,
  save,
  audit,
  callBotBridge,
  stateStore,
  checkpoint,
});
const meetingRoutes = createMeetingRoutes({
  getState: () => state,
  founder,
  employeeSession,
  body,
  json,
  save,
  audit,
  callBotBridge,
  checkpoint,
});
const pilotRoutes = createPilotRoutes({
  notifyQuery,
  getState: () => state,
  founder,
  employeeSession,
  body,
  json,
  save,
  audit,
  projectView,
  callBotBridge,
});
const stageOrderRoutes = createStageOrderRoutes({
  getState: () => state,
  founder,
  body,
  json,
  save,
  audit,
  callBotBridge,
  checkpoint,
});
const stageLinksRoutes = createStageLinksRoutes({
  getState: () => state,
  founder,
  body,
  json,
  save,
  audit,
  callBotBridge,
});
const operationsRoutes = createOperationsRoutes({
  getState: () => state,
  founder,
  employeeSession,
  body,
  json,
  save,
  audit,
  callBotBridge,
  integrationSecret,
  checkpoint,
});
const googleAuthRoutes = createGoogleAuthRoutes({
  getState: () => state,
  founder,
  body,
  json,
  save,
  audit,
  cookie,
  production,
});
const intakeRoutes = createIntakeRoutes({
  getState: () => state,
  applyGroupSnapshot,
  audit,
  integrationSecret,
  json,
  operationsRoutes,
  safeEqual,
  save,
  shortText,
});
const sessionRoutes = createSessionRoutes({
  getState: () => state,
  clearCookie,
  cookieValue,
  employeeSession,
  employeeView,
  hash,
  json,
  projectView,
  safeEqual,
  save,
});
const projectFileRoutes = createProjectFileRoutes({
  getState: () => state,
  callBotBridge,
  employeeSession,
  founder,
  json,
});
const queryAttachmentRoutes = createQueryAttachmentRoutes({
  getState: () => state,
  botBridgeUrl,
  callBotBridge,
  employeeSession,
  founder,
  integrationSecret,
  json,
});
const employeeChatRoutes = createEmployeeChatRoutes({
  getState: () => state,
  audit,
  canSendTeamMessage,
  employeeSession,
  json,
  save,
});
const groupSetupRoutes = createGroupSetupRoutes({
  getState: () => state,
  applyGroupSnapshot,
  audit,
  bindTelegramStaff,
  callBotBridge,
  json,
  projectView,
  save,
  validIsoDate,
});
const queryReviewRoutes = createQueryReviewRoutes({
  getState: () => state,
  checkpoint,
  audit,
  botBridgeUrl,
  callBotBridge,
  cookieValue,
  hash,
  integrationSecret,
  json,
  publishingRequests,
  replySuggestionLimits,
  save,
});
const employeeRoutes = createEmployeeRoutes({
  getState: () => state,
  audit,
  employeeId,
  employeeView,
  json,
  save,
});
const assistantRoutes = createAssistantRoutes({
  getState: () => state,
  cookieValue,
  founderChatLimits,
  hash,
  json,
  save,
});
const assignmentRoutes = createAssignmentRoutes({ getState: () => state, audit, json, save });
const founderChatRoutes = createFounderChatRoutes({
  getState: () => state,
  audit,
  canSendTeamMessage,
  founder,
  json,
  save,
});
const projectRoutes = createProjectRoutes({
  getState: () => state,
  audit,
  callBotBridge,
  closingProjects,
  hash,
  json,
  port,
  projectView,
  recordProjectUpdate,
  save,
  token,
  validIsoDate,
});
const clientRoutes = createClientRoutes({
  getState: () => state,
  audit,
  chatLimits,
  clientProjectView,
  clientSession,
  cookie,
  hash,
  json,
  safeEqual,
  save,
  token,
});

async function handleRequest(req, res) {
  const before = structuredClone(state);
  externalRollbackState = null;
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    if (
      !['GET', 'HEAD'].includes(req.method) &&
      url.pathname.startsWith('/api/') &&
      !url.pathname.startsWith('/api/integrations/') &&
      req.headers.origin &&
      req.headers.origin !==
        (process.env.PUBLIC_URL?.replace(/\/$/, '') || `http://${req.headers.host}`)
    )
      return json(res, 403, { error: 'Origin is not allowed.' });
    if (await googleAuthRoutes(req, res, url)) return;
    if (await intakeRoutes(req, res, url)) return;
    if (await sessionRoutes(req, res, url)) return;
    if (await projectFileRoutes(req, res, url)) return;
    if (await stageOrderRoutes(req, res, url)) return;
    if (await stageLinksRoutes(req, res, url)) return;
    if (await operationsRoutes(req, res, url)) return;
    if (await collaborationRoutes(req, res, url)) return;
    if (await meetingRoutes(req, res, url)) return;
    if (await pilotRoutes(req, res, url)) return;
    if (await queryAttachmentRoutes(req, res, url)) return;
    if (await employeeChatRoutes(req, res, url)) return;
    if (url.pathname.startsWith('/api/employee/')) return json(res, 404, { error: 'Not found.' });
    // Founder feature routes below inherit this guard; preserve its dispatch position.
    if (url.pathname.startsWith('/api/founder/') && !founder(req))
      return json(res, 401, { error: 'Founder session required.' });
    if (await groupSetupRoutes(req, res, url)) return;
    if (await queryReviewRoutes(req, res, url)) return;
    if (await employeeRoutes(req, res, url)) return;
    if (await assistantRoutes(req, res, url)) return;
    if (await assignmentRoutes(req, res, url)) return;
    if (await founderChatRoutes(req, res, url)) return;
    if (await projectRoutes(req, res, url)) return;
    if (await clientRoutes(req, res, url)) return;
    if (req.method === 'GET' && url.pathname.startsWith('/api/'))
      return json(res, 404, { error: 'Not found.' });
    if (req.method === 'GET' && url.pathname === '/') return sendFile(res, 'frontend/index.html');
    if (req.method === 'GET' && (url.pathname === '/employee' || url.pathname === '/employee/'))
      return sendFile(res, 'frontend/index.html');
    if (req.method === 'GET' && (url.pathname === '/privacy' || url.pathname === '/privacy.html'))
      return sendFile(res, 'frontend/privacy.html');
    if (req.method === 'GET' && url.pathname === '/app.css')
      return sendFile(res, 'frontend/app.css');
    if (req.method === 'GET' && url.pathname === '/app.js') return sendFile(res, 'frontend/app.js');
    if (req.method === 'GET' && url.pathname === '/sw.js') return sendFile(res, 'frontend/sw.js');
    if (req.method === 'GET' && url.pathname === '/manifest.webmanifest')
      return sendFile(res, 'frontend/manifest.webmanifest');
    if (
      req.method === 'GET' &&
      ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'].includes(
        url.pathname,
      )
    )
      return sendFile(res, `frontend${url.pathname}`);
    if (req.method === 'GET' && url.pathname === '/assets/studio-iksha-access.png')
      return sendFile(res, 'frontend/assets/studio-iksha-access.png');
    if (req.method === 'GET' && url.pathname.startsWith('/c/'))
      return sendFile(res, 'frontend/client.html');
    res.writeHead(404);
    res.end('Not found');
  } catch (error) {
    state = externalRollbackState || before;
    const status = error instanceof ApiError ? error.status : 500;
    if (status === 500) console.error('Request failed.');
    json(res, status, {
      error: status === 500 ? 'Something went wrong. Please try again.' : error.message,
    });
  }
}
// Single writer prevents overlapping mutations and makes persistence rollback deterministic.
let requestQueue = Promise.resolve();
const server = http.createServer((req, res) => {
  requestQueue = requestQueue.catch(() => {}).then(() => handleRequest(req, res));
});
server.listen(port, () => console.log(`Studio Iksha V1 listening on http://localhost:${port}`));

if (process.env.NODE_ENV !== 'test') {
  const timer = setInterval(() => {
    requestQueue = requestQueue
      .catch(() => {})
      .then(async () => {
        externalRollbackState = null;
        try {
          await meetingRoutes.tick();
        } catch {
          console.warn('Meeting notification check failed.');
        }
        try {
          await operationsRoutes.tick();
        } catch {
          console.warn('Morning digest check failed.');
        }
      });
  }, 60000);
  timer.unref();
}
