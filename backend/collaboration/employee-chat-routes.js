import { body } from '../http/request.js';
import { randomBytes } from 'node:crypto';

export function createEmployeeChatRoutes({
  getState,
  audit,
  canSendTeamMessage,
  employeeSession,
  json,
  save,
}) {
  return async function employeeChatRoutes(req, res, url) {
    const state = getState();
    const employeeChatMatch = url.pathname.match(/^\/api\/employee\/projects\/([^/]+)\/team-chat$/);
    if (employeeChatMatch) {
      const employee = employeeSession(req);
      if (!employee) {
        json(res, 401, { error: 'Employee sign-in required.' });
        return true;
      }
      const project = state.projects.find(
        (item) =>
          item.id === employeeChatMatch[1] &&
          item.members?.some(
            (member) => member.employeeId === employee.id && member.active !== false,
          ),
      );
      if (!project) {
        json(res, 404, { error: 'Project not found in your workspace.' });
        return true;
      }
      if (req.method === 'GET') {
        json(res, 200, {
          messages: state.teamMessages.filter((item) => item.projectId === project.id).slice(-80),
        });
        return true;
      }
      if (req.method === 'POST') {
        const input = await body(req);
        const text = String(input.message || '').trim();
        if (!text || text.length > 2000) {
          json(res, 400, { error: 'Enter a message under 2,000 characters.' });
          return true;
        }
        if (!canSendTeamMessage(employee.id, project.id)) {
          json(res, 429, { error: 'Too many messages. Please wait a minute.' });
          return true;
        }
        const message = {
          id: randomBytes(8).toString('hex'),
          projectId: project.id,
          senderId: employee.id,
          senderName: employee.name,
          senderRole: 'employee',
          text,
          at: new Date().toISOString(),
        };
        state.teamMessages.push(message);
        audit('team_message', project.id, { sender: employee.name });
        await save();
        json(res, 201, { message });
        return true;
      }
    }
    return false;
  };
}
