import { body } from '../http/request.js';
import { randomBytes } from 'node:crypto';

export function createFounderChatRoutes({
  getState,
  audit,
  canSendTeamMessage,
  founder,
  json,
  save,
}) {
  return async function founderChatRoutes(req, res, url) {
    const state = getState();
    const founderChatMatch = url.pathname.match(/^\/api\/founder\/projects\/([^/]+)\/team-chat$/);
    if (founderChatMatch) {
      const project = state.projects.find((item) => item.id === founderChatMatch[1]);
      if (!project) {
        json(res, 404, { error: 'Project not found.' });
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
        if (!canSendTeamMessage('founder', project.id)) {
          json(res, 429, { error: 'Too many messages. Please wait a minute.' });
          return true;
        }
        const message = {
          id: randomBytes(8).toString('hex'),
          projectId: project.id,
          senderId: 'founder',
          senderName:
            state.googleAccounts.find((account) => account.id === founder(req)?.googleAccountId)
              ?.name || 'Founder',
          senderRole: 'founder',
          text,
          at: new Date().toISOString(),
        };
        state.teamMessages.push(message);
        audit('team_message', project.id, { sender: 'Founder' });
        await save();
        json(res, 201, { message });
        return true;
      }
    }
    return false;
  };
}
