import { body } from '../http/request.js';
import { loginEmail, reserveGoogleAccess } from './google-access.js';
import { randomBytes } from 'node:crypto';
import { ApiError } from '../http/api-error.js';

export function createEmployeeRoutes({ getState, audit, employeeId, employeeView, json, save }) {
  return async function employeeRoutes(req, res, url) {
    const state = getState();
    if (req.method === 'GET' && url.pathname === '/api/founder/employees') {
      json(res, 200, { employees: state.employees.map(employeeView) });
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/founder/employees') {
      const input = await body(req);
      const project = state.projects.find((item) => item.id === input.projectId);
      if (!project) {
        json(res, 404, { error: 'Select a project for this employee.' });
        return true;
      }
      const name = String(input.name || '').trim();
      const designation = String(input.designation || '').trim();
      const role = String(input.role || 'Team member').trim();
      const email = loginEmail(input.email);
      const phone = String(input.phone || '').trim();
      if (
        !name ||
        !designation ||
        !role ||
        name.length > 120 ||
        designation.length > 120 ||
        email.length > 200 ||
        phone.length > 40
      ) {
        json(res, 400, {
          error: 'Enter a name, designation, and role using the requested lengths.',
        });
        return true;
      }
      const id = employeeId();
      const employee = {
        id,
        name,
        designation,
        email,
        phone,
        active: true,
        createdAt: new Date().toISOString(),
      };
      reserveGoogleAccess(state, { email, name, employeeId: id });
      state.employees.push(employee);
      (project.members ||= []).push({
        id: randomBytes(8).toString('hex'),
        employeeId: id,
        name,
        designation,
        role,
      });
      audit('employee_created', project.id, { employeeId: id });
      await save();
      json(res, 201, {
        employee: employeeView(employee),
        access: { email, link: '/employee' },
      });
      return true;
    }
    const employeeEditMatch = url.pathname.match(
      /^\/api\/founder\/employees\/(EMP-[0-9A-F]+)(\/password)?$/,
    );
    if (employeeEditMatch) {
      const employee = state.employees.find((item) => item.id === employeeEditMatch[1]);
      if (!employee) {
        json(res, 404, { error: 'Employee not found.' });
        return true;
      }
      // Edit profile: the name and designation also update on every project the employee belongs to.
      if (!employeeEditMatch[2] && req.method === 'PATCH') {
        const input = await body(req);
        const next = {};
        for (const [field, max, required] of [
          ['name', 120, true],
          ['designation', 120, true],
          ['email', 200, false],
          ['phone', 40, false],
        ]) {
          if (input[field] === undefined) continue;
          const value = String(input[field]).trim();
          if ((required && !value) || value.length > max) {
            json(res, 400, { error: `Enter a valid ${field} (up to ${max} characters).` });
            return true;
          }
          if (field === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            json(res, 400, { error: 'Enter a valid email address.' });
            return true;
          }
          next[field] = value;
        }
        if (!Object.keys(next).length) {
          json(res, 400, { error: 'Nothing to update.' });
          return true;
        }
        if (next.email !== undefined) {
          next.email = loginEmail(next.email);
          const isFounder = state.googleAccounts.some(
            (account) =>
              account.employeeId === employee.id &&
              account.kind === 'founder' &&
              account.status === 'Approved',
          );
          if (isFounder && next.email !== employee.email)
            throw new ApiError('Manage this founder’s login from founder access instead.', 409);
          if (!isFounder)
            reserveGoogleAccess(state, {
              email: next.email,
              name: next.name || employee.name,
              employeeId: employee.id,
            });
        }
        Object.assign(employee, next, { updatedAt: new Date().toISOString() });
        for (const project of state.projects)
          for (const member of project.members || []) {
            if (member.employeeId !== employee.id) continue;
            if (next.name) member.name = next.name;
            if (next.designation) member.designation = next.designation;
          }
        audit('employee_updated', '', { employeeId: employee.id, fields: Object.keys(next) });
        await save();
        json(res, 200, { employee: employeeView(employee) });
        return true;
      }
      // Set or reset the password. Existing sessions end, so the old password stops working everywhere at once.
      if (employeeEditMatch[2] && req.method === 'POST') {
        json(res, 410, {
          error: 'Passwords have been removed. Edit the Google sign-in email instead.',
        });
        return true;
      }
    }
    return false;
  };
}
