import { body } from '../http/request.js';
import { randomBytes } from 'node:crypto';

export function createAssignmentRoutes({ getState, audit, json, save }) {
  return async function assignmentRoutes(req, res, url) {
    const state = getState();
    const assignEmployeeMatch = url.pathname.match(
      /^\/api\/founder\/projects\/([^/]+)\/employees$/,
    );
    if (req.method === 'POST' && assignEmployeeMatch) {
      const project = state.projects.find((item) => item.id === assignEmployeeMatch[1]);
      if (!project) {
        json(res, 404, { error: 'Project not found.' });
        return true;
      }
      const input = await body(req);
      const id = String(input.employeeId || '')
        .trim()
        .toUpperCase();
      const employee = state.employees.find((item) => item.id === id && item.active !== false);
      if (!employee) {
        json(res, 404, { error: 'No employee has that ID.' });
        return true;
      }
      if (project.members?.some((member) => member.employeeId === id)) {
        json(res, 409, { error: 'This employee is already assigned to this project.' });
        return true;
      }
      const role = String(input.role || 'Team member').trim();
      if (!role || role.length > 160) {
        json(res, 400, { error: 'Enter a valid project role.' });
        return true;
      }
      const member = {
        id: randomBytes(8).toString('hex'),
        employeeId: id,
        name: employee.name,
        designation: employee.designation,
        role,
      };
      (project.members ||= []).push(member);
      audit('employee_assigned', project.id, { employeeId: id });
      await save();
      json(res, 201, { member });
      return true;
    }
    return false;
  };
}
