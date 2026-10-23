import { randomBytes } from 'node:crypto';
import { ApiError } from './api-error.js';
export function loginEmail(value) {
  if (typeof value !== 'string') throw new ApiError('Enter the Google email used to sign in.');
  const email = value.trim().toLowerCase();
  if (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError('Enter a valid Google sign-in email.');
  return email;
}
export function revokeAccountSessions(state, accountId) {
  state.founderSessions = state.founderSessions.filter(row => row.googleAccountId !== accountId);
  state.employeeSessions = state.employeeSessions.filter(row => row.googleAccountId !== accountId);
}
export function reserveGoogleAccess(state, { email: value, name, kind = 'employee', employeeId = '' }) {
  const email = loginEmail(value);
  const matches = state.googleAccounts.filter(row => row.email.toLowerCase() === email);
  const approved = matches.filter(row => row.status === 'Approved');
  if (approved.length > 1 || (!approved.length && matches.length > 1)) throw new ApiError('Multiple accounts use this email. Review their access requests first.', 409);
  let account = approved[0] || matches[0];
  if (account && (account.kind !== kind || (account.employeeId && account.employeeId !== employeeId))) throw new ApiError('This email already belongs to another account. Manage its existing role instead.', 409);
  if (account?.subject && account.status !== 'Approved' && !account.authoritativeEmail) throw new ApiError('Approve this Google identity from access requests first.', 409);
  if (state.employees.some(row => row.id !== employeeId && row.active !== false && row.email?.toLowerCase() === email)) throw new ApiError('This Google email belongs to an existing employee. Edit that employee instead.', 409);
  const at = new Date().toISOString();
  if (!account) {
    account = { id: randomBytes(10).toString('hex'), email, name, kind, requestedAt: at };
    state.googleAccounts.push(account);
  }
  if (employeeId) {
    for (const old of state.googleAccounts.filter(row => row !== account && row.kind === 'employee' && row.employeeId === employeeId)) {
      old.status = 'Rejected'; revokeAccountSessions(state, old.id);
    }
  }
  Object.assign(account, { status: 'Approved', employeeId, reviewedAt: at });
  return account;
}
export function migrateGoogleOnlyAccess(state, initialFounderEmail = '') {
  const before = JSON.stringify([state.employees, state.founderSessions, state.employeeSessions, state.googleAccounts]);
  for (const employee of state.employees) { delete employee.passwordHash; delete employee.passwordSalt; }
  const approved = (session, kind) => state.googleAccounts.some(account => account.id === session.googleAccountId && account.kind === kind && account.status === 'Approved' && account.subject);
  state.founderSessions = state.founderSessions.filter(row => approved(row, 'founder'));
  state.employeeSessions = state.employeeSessions.filter(row => approved(row, 'employee'));
  if (initialFounderEmail && !state.googleAccounts.some(row => row.kind === 'founder' && row.status === 'Approved')) reserveGoogleAccess(state, { email: initialFounderEmail, name: 'Founder', kind: 'founder' });
  return before !== JSON.stringify([state.employees, state.founderSessions, state.employeeSessions, state.googleAccounts]);
}
