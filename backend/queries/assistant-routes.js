import { body } from '../http/request.js';
import { founderAssistantAnswer } from './project-assistant.js';
import { randomBytes } from 'node:crypto';

export function createAssistantRoutes({
  getState,
  cookieValue,
  founderChatLimits,
  hash,
  json,
  save,
}) {
  return async function assistantRoutes(req, res, url) {
    const state = getState();
    if (req.method === 'GET' && url.pathname === '/api/founder/assistant') {
      json(res, 200, { messages: state.founderChat.slice(-40) });
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/founder/assistant') {
      const sid = cookieValue(req, 'iksha_founder');
      const key = hash(sid);
      const limit = founderChatLimits.get(key) || {
        count: 0,
        resetAt: Date.now() + 60 * 60 * 1000,
      };
      if (limit.resetAt <= Date.now()) {
        limit.count = 0;
        limit.resetAt = Date.now() + 60 * 60 * 1000;
      }
      if (limit.count >= 60) {
        json(res, 429, { error: 'Assistant limit reached. Try again later.' });
        return true;
      }
      const input = await body(req);
      const question = String(input.question || '').trim();
      if (!question || question.length > 1000) {
        json(res, 400, { error: 'Enter a question under 1,000 characters.' });
        return true;
      }
      limit.count += 1;
      founderChatLimits.set(key, limit);
      const answer = founderAssistantAnswer(state, question);
      const message = {
        id: randomBytes(8).toString('hex'),
        question,
        answer,
        at: new Date().toISOString(),
      };
      state.founderChat.push(message);
      state.founderChat = state.founderChat.slice(-200);
      await save();
      json(res, 200, { message });
      return true;
    }
    return false;
  };
}
