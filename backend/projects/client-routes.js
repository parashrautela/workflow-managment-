import { body } from '../http/request.js';
import { answerProjectQuestion } from '../queries/project-assistant.js';

export function createClientRoutes({
  getState,
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
}) {
  return async function clientRoutes(req, res, url) {
    const state = getState();
    if (req.method === 'POST' && url.pathname === '/api/client/claim') {
      const input = await body(req);
      const invite = state.invites.find((item) =>
        safeEqual(item.tokenHash, hash(input.token || '')),
      );
      if (!invite) {
        json(res, 404, { error: 'This client link is invalid or has been replaced.' });
        return true;
      }
      const invitedProject = state.projects.find((item) => item.id === invite.projectId);
      if (!invitedProject) {
        json(res, 404, { error: 'This project is no longer available.' });
        return true;
      }
      const existingSession = clientSession(req);
      if (
        invite.claimedAt &&
        (!existingSession ||
          existingSession.inviteId !== invite.id ||
          !safeEqual(invite.sessionHash, existingSession.idHash))
      ) {
        json(res, 410, { error: 'This private client link has already been claimed.' });
        return true;
      }
      let session = existingSession;
      if (!invite.claimedAt) {
        const id = token();
        session = {
          idHash: hash(id),
          inviteId: invite.id,
          projectId: invite.projectId,
          expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        };
        invite.claimedAt = Date.now();
        invite.sessionHash = session.idHash;
        state.clientSessions.push(session);
        audit('client_link_claimed', invite.projectId);
        await save();
        res.setHeader('set-cookie', cookie('iksha_client', id, 2592000));
      }
      json(res, 200, { project: clientProjectView(invitedProject) }, {});
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/client/project') {
      const session = clientSession(req);
      if (!session) {
        json(res, 401, { error: 'Open your private project link to continue.' });
        return true;
      }
      const project = state.projects.find((item) => item.id === session.projectId);
      project
        ? json(res, 200, { project: clientProjectView(project) })
        : json(res, 404, { error: 'Project not found.' });
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/client/conversation') {
      const session = clientSession(req);
      if (!session) {
        json(res, 401, { error: 'Open your private project link to continue.' });
        return true;
      }
      if (!state.projects.some((project) => project.id === session.projectId)) {
        json(res, 404, { error: 'Project not found.' });
        return true;
      }
      json(res, 200, {
        messages: state.conversations
          .filter((item) => item.projectId === session.projectId)
          .slice(-30),
      });
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/client/chat') {
      const session = clientSession(req);
      if (!session) {
        json(res, 401, { error: 'Open your private project link to continue.' });
        return true;
      }
      const limit = chatLimits.get(session.idHash) || {
        count: 0,
        resetAt: Date.now() + 60 * 60 * 1000,
      };
      if (limit.resetAt <= Date.now()) {
        limit.count = 0;
        limit.resetAt = Date.now() + 60 * 60 * 1000;
      }
      if (limit.count >= 30) {
        json(res, 429, {
          error: 'You have reached the hourly question limit. Please try again later.',
        });
        return true;
      }
      const input = await body(req);
      const question = String(input.question || '').trim();
      if (!question || question.length > 1000) {
        json(res, 400, { error: 'Enter a question under 1,000 characters.' });
        return true;
      }
      limit.count += 1;
      chatLimits.set(session.idHash, limit);
      const project = state.projects.find((item) => item.id === session.projectId);
      if (!project) {
        json(res, 404, { error: 'Project not found.' });
        return true;
      }
      const answer = await answerProjectQuestion(project, question);
      state.conversations.push({
        projectId: project.id,
        question,
        answer,
        at: new Date().toISOString(),
      });
      await save();
      json(res, 200, { answer });
      return true;
    }
    return false;
  };
}
