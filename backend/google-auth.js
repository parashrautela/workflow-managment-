import { reserveGoogleAccess, revokeAccountSessions } from './google-access.js';
import { OAuth2Client } from 'google-auth-library';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { ApiError } from './api-error.js';

const googleClient = new OAuth2Client({ transporterOptions: { timeout: 10000, retry: false } });
const hash = value => createHash('sha256').update(String(value)).digest('hex');
const token = () => randomBytes(32).toString('base64url');
const fail = (message, status = 400) => { throw new ApiError(message, status); };
const equal = (a, b) => {
  const left = Buffer.from(String(a || '')), right = Buffer.from(String(b || ''));
  return left.length === right.length && timingSafeEqual(left, right);
};
const readCookie = (req, name) => (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(name + '='))?.slice(name.length + 1) || '';
const cookieValue = req => readCookie(req, 'iksha_google');

export async function verifyGoogleCredential(credential, { clientId, nonce, client = googleClient }) {
  if (typeof credential !== 'string' || credential.length > 12000) fail('Invalid Google sign-in.', 401);
  let payload;
  try { payload = (await client.verifyIdToken({ idToken: credential, audience: clientId })).getPayload(); }
  catch { fail('Google sign-in could not be verified. Please try again.', 401); }
  if (!payload || typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255
    || payload.email_verified !== true || typeof payload.email !== 'string' || payload.email.length > 200
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) || !equal(payload.nonce, nonce)) {
    fail('Google sign-in could not be verified. Please try again.', 401);
  }
  return { authoritativeEmail: payload.email.toLowerCase().endsWith('@gmail.com') || (typeof payload.hd === 'string' && Boolean(payload.hd)), subject: payload.sub, email: payload.email.toLowerCase(), name: String(payload.name || payload.email).slice(0, 120) };
}

export function createGoogleAuthRoutes({ getState, founder, body, json, save, audit, cookie, production,
  clientId = process.env.GOOGLE_CLIENT_ID || '', verify = verifyGoogleCredential }) {
  const enabled = /^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId);
  const attempts = new Map();
  const view = account => ({ id: account.id, email: account.email, name: account.name, status: account.status,
    kind: account.kind, employeeId: account.employeeId || '', requestedAt: account.requestedAt, reviewedAt: account.reviewedAt || '', claimed: Boolean(account.subject) });
  return async (req, res, url) => {
    if (url.pathname === '/api/auth/google/config' && req.method === 'GET') {
      json(res, 200, { enabled, ...(enabled ? { clientId } : {}) }); return true;
    }
    const loginRoute = ['/api/auth/google/challenge', '/api/auth/google/sign-in'].includes(url.pathname);
    const founderInvite = url.pathname === '/api/founder/google/founders';
    const founderRole = url.pathname.match(/^\/api\/founder\/google\/accounts\/([^/]+)\/founder$/);
    const review = url.pathname.match(/^\/api\/founder\/google\/accounts(?:\/([^/]+)\/decision)?$/);
    if (!loginRoute && !review && !founderInvite && !founderRole) return false;
    const state = getState(); state.googleAccounts ||= []; state.googleChallenges ||= [];
    if (founderInvite || founderRole) {
      const actor = founder(req);
      if (!actor) fail('Founder sign-in required.', 401);
      if (req.method !== 'POST') fail('Not found.', 404);
      const input = await body(req);
      if (!founder(req) || founder(req).googleAccountId !== actor.googleAccountId) fail('Your founder session expired.', 401);
      if (founderInvite) {
        const name = String(input.name || '').trim();
        if (!name || name.length > 120) fail('Enter a founder name under 121 characters.');
        const account = reserveGoogleAccess(state, { email: input.email, name, kind: 'founder' });
        audit('founder_invited', '', { accountId: account.id, actorAccountId: actor.googleAccountId });
        await save(); json(res, 201, { account: view(account) }); return true;
      }
      const account = state.googleAccounts.find(row => row.id === founderRole[1]);
      if (!account) fail('Google account not found.', 404);
      if (!['grant', 'revoke', 'transfer'].includes(input.action)) fail('Choose a valid founder action.');
      const demote = target => {
        if (target.kind !== 'founder' || target.status !== 'Approved') fail('This account is not an active founder.', 409);
        if (target.subject && !state.googleAccounts.some(row => row !== target && row.kind === 'founder' && row.status === 'Approved' && row.subject)) fail('Keep at least one founder who has signed in. Invite another founder first.', 409);
        if (!target.subject) target.status = 'Rejected';
        else {
          let employee = state.employees.find(row => row.id === target.employeeId);
          if (!employee) { employee = { id: `EMP-${randomBytes(5).toString('hex').toUpperCase()}`, name: target.name, email: target.email, designation: 'Team member', active: true, createdAt: new Date().toISOString() }; state.employees.push(employee); }
          Object.assign(target, { kind: 'employee', employeeId: employee.id });
        }
        revokeAccountSessions(state, target.id);
      };
      if (input.action === 'revoke') demote(account);
      else {
        if (state.googleAccounts.some(row => row !== account && row.email === account.email && row.status === 'Approved')) fail('This email already has approved access. Review the existing account.', 409);
        if (account.status === 'Rejected') fail('Review this rejected account before assigning founder access.', 409);
        const self = state.googleAccounts.find(row => row.id === actor.googleAccountId);
        if (input.action === 'transfer' && (!account.subject || account.id === actor.googleAccountId || !self)) fail('Transfer to a different person who has already signed in.', 409);
        Object.assign(account, { kind: 'founder', status: 'Approved', reviewedAt: new Date().toISOString() });
        revokeAccountSessions(state, account.id);
        if (input.action === 'transfer') demote(self);
      }
      audit('founder_access_' + input.action, '', { accountId: account.id, actorAccountId: actor.googleAccountId });
      await save(); json(res, 200, { account: view(account), signedOut: account.id === actor.googleAccountId || input.action === 'transfer' }); return true;
    }
    if (review) {
      if (!founder(req)) fail('Founder sign-in required.', 401);
      if (!review[1] && req.method === 'GET') { json(res, 200, { enabled, currentAccountId: founder(req).googleAccountId, accounts: state.googleAccounts.map(view) }); return true; }
      if (!review[1] || req.method !== 'POST') fail('Not found.', 404);
      const account = state.googleAccounts.find(row => row.id === review[1] && row.kind === 'employee');
      if (!account) fail('Google access request not found.', 404);
      const input = await body(req);
      if (!founder(req)) fail('Founder sign-in required.', 401);
      if (account.kind !== 'employee') fail('This account’s role changed. Refresh its access status.', 409);
      if (!['Approved', 'Rejected'].includes(input.status)) fail('Choose approve or reject.');
      if (input.status === 'Rejected') {
        account.status = 'Rejected'; account.reviewedAt = new Date().toISOString();
        revokeAccountSessions(state, account.id);
      } else {
        if (account.status === 'Approved') fail('This Google account is already approved.', 409);
        let employee = input.employeeId ? state.employees.find(row => row.id === input.employeeId && row.active !== false) : null;
        if (input.employeeId && !employee) fail('Choose an active employee profile.');
        if (employee && state.googleAccounts.some(row => row.id !== account.id && row.status === 'Approved' && row.subject && row.employeeId === employee.id)) fail('That employee is already linked to another Google account.', 409);
        if (state.googleAccounts.some(row => row.id !== account.id && (row.subject || row.kind === 'founder') && row.status === 'Approved' && row.email === account.email)) fail('This email already has approved access.', 409);
        const projectIds = input.projectIds || [];
        const role = String(input.role || 'Team member').trim();
        if (!Array.isArray(projectIds) || projectIds.length > 100 || new Set(projectIds).size !== projectIds.length || !role || role.length > 160) fail('Choose valid project access and a project role.');
        const projects = projectIds.map(id => state.projects.find(project => project.id === id && !['Completed', 'Abandoned'].includes(project.status)));
        if (projects.some(project => !project)) fail('Choose active projects.');
        if (!employee && state.employees.some(row => row.active !== false && row.email?.toLowerCase() === account.email)) fail('Link this request to the existing employee with this email.', 409);
        if (!employee) {
          const designation = String(input.designation || 'Team member').trim();
          if (!designation || designation.length > 120) fail('Enter a designation under 121 characters.');
          employee = { id: `EMP-${randomBytes(5).toString('hex').toUpperCase()}`, name: account.name, email: account.email,
            designation, active: true, createdAt: new Date().toISOString() };
          state.employees.push(employee);
        }
        for (const project of projects) {
          project.members ||= [];
          const member = project.members.find(row => row.employeeId === employee.id);
          if (member) { if (member.active === false) Object.assign(member, { active: true, role }); }
          else project.members.push({ id: token().slice(0, 16), employeeId: employee.id, name: employee.name, designation: employee.designation, role, active: true });
        }
        employee.email = account.email;
        for (const invite of state.googleAccounts.filter(row => row !== account && !row.subject && row.employeeId === employee.id)) invite.status = 'Rejected';
        Object.assign(account, { status: 'Approved', employeeId: employee.id, reviewedAt: new Date().toISOString() });
      }
      audit('google_access_' + account.status.toLowerCase(), '', { accountId: account.id, employeeId: account.employeeId || '' });
      await save(); json(res, 200, { account: view(account) }); return true;
    }
    if (req.method !== 'POST') fail('Not found.', 404);
    if (!enabled) fail('Google sign-in is not configured yet.', 503);
    // JSON requests from our own page plus a browser-bound, single-use nonce prevent login CSRF/replay.
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) fail('Use a JSON sign-in request.', 415);
    const ip = req.socket.remoteAddress || 'unknown', now = Date.now();
    const limit = attempts.get(ip) || { count: 0, until: now + 10 * 60 * 1000 };
    if (limit.until <= now) { limit.count = 0; limit.until = now + 10 * 60 * 1000; }
    if (++limit.count > 100) fail('Too many sign-in attempts. Please wait a few minutes.', 429);
    attempts.set(ip, limit);
    if (attempts.size > 1000) for (const [key, row] of attempts) if (row.until <= now) attempts.delete(key);
    const input = await body(req);
    if (url.pathname.endsWith('/challenge')) {
      const mode = input.mode || 'login';
      if (!['login', 'link-founder'].includes(mode)) fail('Choose a valid sign-in action.');
      if (mode !== 'login') fail('Add founders by email from Team access.', 410);
      state.googleChallenges = state.googleChallenges.filter(row => row.expiresAt > now && !equal(row.idHash, hash(cookieValue(req))));
      if (state.googleChallenges.length >= 1000) fail('Sign-in is busy. Try again shortly.', 429);
      const id = token(), nonce = token();
      state.googleChallenges.push({ idHash: hash(id), nonceHash: hash(nonce), mode, expiresAt: now + 10 * 60 * 1000 });
      await save(); json(res, 200, { nonce }, { 'set-cookie': cookie('iksha_google', id, 600) }); return true;
    }
    const challenge = state.googleChallenges.find(row => equal(row.idHash, hash(cookieValue(req))) && row.expiresAt > now);
    if (!challenge || typeof input.nonce !== 'string' || !equal(challenge.nonceHash, hash(input.nonce))) fail('This sign-in expired. Refresh and try again.', 401);
    state.googleChallenges = state.googleChallenges.filter(row => row !== challenge);
    await save();
    const identity = await verify(input.credential, { clientId, nonce: input.nonce });
    let account = state.googleAccounts.find(row => row.subject === identity.subject);
    const at = new Date().toISOString();
    if (!account) {
      const invitation = state.googleAccounts.find(row => !row.subject && row.status === 'Approved' && row.email === identity.email);
      if (invitation && identity.authoritativeEmail) account = invitation;
      else {
        account = { id: token().slice(0, 20), ...identity, kind: 'employee', status: 'Pending', requestedAt: at };
        state.googleAccounts.push(account); audit('google_access_requested', '', { accountId: account.id });
      }
    }
    Object.assign(account, identity, { lastSignInAt: at });
    state.googleChallenges = state.googleChallenges.filter(row => row !== challenge);
    for (const [key, name] of [['founderSessions', 'iksha_founder'], ['employeeSessions', 'iksha_employee']]) state[key] = state[key].filter(row => !equal(row.idHash, hash(readCookie(req, name))));
    const headers = { 'set-cookie': [cookie('iksha_google', '', 0), cookie('iksha_founder', '', 0), cookie('iksha_employee', '', 0)] };
    let redirect = '', message;
    if (account.status === 'Approved' && account.kind === 'founder') {
      const id = token(); state.founderSessions = state.founderSessions.filter(row => row.expiresAt > now);
      state.founderSessions.push({ idHash: hash(id), googleAccountId: account.id, expiresAt: now + 8 * 60 * 60 * 1000 });
      headers['set-cookie'] = [...headers['set-cookie'], cookie('iksha_founder', id, 28800)]; redirect = '/';
    } else if (account.status === 'Approved') {
      const employee = state.employees.find(row => row.id === account.employeeId && row.active !== false);
      if (!employee) { await save(); json(res, 403, { error: 'Your staff account is disabled. Contact the founder.' }, headers); return true; }
      const id = token(); state.employeeSessions = state.employeeSessions.filter(row => row.expiresAt > now);
      state.employeeSessions.push({ idHash: hash(id), employeeId: employee.id, googleAccountId: account.id, expiresAt: now + 7 * 24 * 60 * 60 * 1000 });
      headers['set-cookie'] = [...headers['set-cookie'], cookie('iksha_employee', id, 604800)]; redirect = '/employee';
    } else message = account.status === 'Rejected' ? 'Your access request was declined. Contact the founder.' : 'Your request is with the founder. Sign in again after they approve your account.';
    await save(); json(res, 200, { status: account.status, kind: account.kind, redirect, message }, headers); return true;
  };
}
