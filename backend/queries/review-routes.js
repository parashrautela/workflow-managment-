import { queryView } from './query-context.js';
import { body } from '../http/request.js';
import { buildReplyContext, suggestReply } from './reply-suggestions.js';
import { randomBytes } from 'node:crypto';

export function createQueryReviewRoutes({
  getState,
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
}) {
  return async function queryReviewRoutes(req, res, url) {
    const state = getState();
    if (req.method === 'GET' && url.pathname === '/api/founder/decision-requests') {
      json(res, 200, {
        requests: state.decisionRequests
          .filter((item) => state.projects.some((project) => project.id === item.projectId))
          .map((item) => queryView(state, item)),
      });
      return true;
    }
    // AI-suggested reply for a client query. Only drafts text for the founder to edit; publishing stays a separate, confirmed step.
    const suggestMatch = url.pathname.match(
      /^\/api\/founder\/decision-requests\/([^/]+)\/suggest-reply$/,
    );
    if (suggestMatch && req.method === 'POST') {
      const request = state.decisionRequests.find(
        (item) => item.id === decodeURIComponent(suggestMatch[1]),
      );
      if (!request) {
        json(res, 404, { error: 'Request not found.' });
        return true;
      }
      const key = hash(cookieValue(req, 'iksha_founder'));
      const limit = replySuggestionLimits.get(key) || {
        count: 0,
        resetAt: Date.now() + 60 * 60 * 1000,
      };
      if (limit.resetAt <= Date.now()) {
        limit.count = 0;
        limit.resetAt = Date.now() + 60 * 60 * 1000;
      }
      if (limit.count >= 40) {
        json(res, 429, {
          error:
            'Suggestion limit reached for this hour. Write the reply yourself or try again later.',
        });
        return true;
      }
      const input = await body(req);
      const instruction =
        typeof input.instruction === 'string' ? input.instruction.trim().slice(0, 500) : '';
      const context = buildReplyContext(state, request);
      if (!context) {
        json(res, 404, { error: 'This request is not linked to a project.' });
        return true;
      }
      limit.count += 1;
      replySuggestionLimits.set(key, limit);
      // The decision the founder is about to confirm (accepted with a new date, or declined), stated plainly in the draft.
      if (typeof input.outcome === 'string' && input.outcome.trim())
        context.decision = input.outcome.trim().slice(0, 300);
      const result = await suggestReply(context, { instruction });
      audit('reply_suggested', request.projectId, { requestId: request.id, ai: result.ai });
      json(res, 200, {
        ...result,
        basedOn: {
          projectedFinish: context.project.projected_finish,
          inProgress: context.schedule.in_progress.length,
          late: context.schedule.late.length,
          nextUp: context.schedule.next_up.length,
          previousReplies: context.previous_replies.length,
          internalNotes: context.internal_notes.length,
        },
      });
      return true;
    }
    const decisionAction = url.pathname.match(
      /^\/api\/founder\/decision-requests\/([^/]+)\/(comment|publish|resolve)$/,
    );
    if (req.method === 'POST' && decisionAction) {
      const request = state.decisionRequests.find(
        (item) => item.id === decodeURIComponent(decisionAction[1]),
      );
      if (!request || !state.projects.some((project) => project.id === request.projectId)) {
        json(res, 404, { error: 'Request not found.' });
        return true;
      }
      const action = decisionAction[2];
      if (action === 'comment') {
        const input = await body(req);
        const text = String(input.text || '').trim();
        if (!text || text.length > 2000) {
          json(res, 400, { error: 'Enter an internal comment under 2,000 characters.' });
          return true;
        }
        (request.comments ||= []).push({
          id: randomBytes(8).toString('hex'),
          author: 'Founder',
          text,
          at: new Date().toISOString(),
        });
        audit('decision_request_comment', request.projectId, { requestId: request.id });
        await save();
        json(res, 200, { request });
        return true;
      }
      if (action === 'resolve') {
        if (publishingRequests.has(request.id)) {
          json(res, 409, { error: 'Wait for Telegram publishing to finish.' });
          return true;
        }
        if (request.status === 'Done') {
          json(res, 200, { request });
          return true;
        }
        request.status = 'Done';
        request.resolvedAt = new Date().toISOString();
        audit('decision_request_resolved', request.projectId, { requestId: request.id });
        await save();
        json(res, 200, { request });
        return true;
      }
      if (request.status === 'Done') {
        json(res, 409, { error: 'This request is already done.' });
        return true;
      }
      if (['Sending', 'Unknown'].includes(request.deliveryStatus)) {
        json(res, 409, {
          error: 'Delivery is pending or uncertain. Check Telegram before any further send.',
        });
        return true;
      }
      if (request.publishedMessageId) {
        const retry = await body(req);
        if (
          retry.idempotencyKey &&
          retry.idempotencyKey === request.publishKey &&
          retry.response === request.response
        ) {
          json(res, 200, { request });
          return true;
        }
        json(res, 409, { error: 'A response was already published.' });
        return true;
      }
      if (publishingRequests.has(request.id)) {
        json(res, 409, { error: 'This response is already being published.' });
        return true;
      }
      const input = await body(req);
      const answer = String(input.response || '').trim();
      if (!answer || answer.length > 3000) {
        json(res, 400, { error: 'Enter a response under 3,000 characters.' });
        return true;
      }
      if (!process.env.GROUP_BOT_TOKEN && !(botBridgeUrl && integrationSecret)) {
        json(res, 503, { error: 'Telegram publishing is not configured.' });
        return true;
      }
      const project = state.projects.find((item) => item.id === request.projectId);
      if (project.telegramGroupChatId !== request.groupChatId) {
        json(res, 409, { error: 'Project group mapping changed. Check the linked group.' });
        return true;
      }
      if (
        input.idempotencyKey !== undefined &&
        (typeof input.idempotencyKey !== 'string' ||
          !input.idempotencyKey.trim() ||
          input.idempotencyKey.length > 128)
      ) {
        json(res, 400, { error: 'Invalid idempotency key.' });
        return true;
      }
      if (
        request.publishKey &&
        input.idempotencyKey &&
        request.publishKey === input.idempotencyKey &&
        request.response !== answer
      ) {
        json(res, 409, { error: 'This key belongs to a different response.' });
        return true;
      }
      request.deliveryStatus = 'Sending';
      request.response = answer;
      request.publishKey = input.idempotencyKey || request.id;
      request.deliveryError = '';
      await save();
      checkpoint(); // Keep the durable Sending state if a later operation fails.
      publishingRequests.add(request.id);
      try {
        let telegramResult;
        try {
          if (botBridgeUrl && integrationSecret) {
            telegramResult = await callBotBridge('/api/integrations/web/decisions/publish', {
              requestId: request.id,
              groupChatId: request.groupChatId,
              response: answer,
            });
          } else {
            const telegramResponse = await fetch(
              `https://api.telegram.org/bot${process.env.GROUP_BOT_TOKEN}/sendMessage`,
              {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  chat_id: request.groupChatId,
                  text: answer,
                  reply_parameters: {
                    message_id: Number(request.sourceMessageId),
                    allow_sending_without_reply: true,
                  },
                }),
                signal: AbortSignal.timeout(10_000),
                redirect: 'error',
              },
            );
            telegramResult = await telegramResponse.json();
            if (!telegramResponse.ok || !telegramResult.ok)
              telegramResult = {
                ...telegramResult,
                ok: false,
                deliveryStatus:
                  telegramResult.ok === false && telegramResponse.status < 500
                    ? 'Failed'
                    : 'Unknown',
              };
          }
          if (!telegramResult.ok) {
            request.deliveryStatus =
              telegramResult.deliveryStatus === 'Failed' ? 'Failed' : 'Unknown';
            request.deliveryError =
              request.deliveryStatus === 'Failed'
                ? 'Telegram rejected the response. Check bot access before retrying.'
                : 'Delivery is uncertain. Check Telegram before sending again.';
            await save();
            json(res, 502, { error: request.deliveryError, request });
            return true;
          }
          if (
            !Number.isSafeInteger(telegramResult.result?.message_id) ||
            telegramResult.result.message_id <= 0
          )
            throw new Error('Missing message ID');
        } catch {
          request.deliveryStatus = 'Unknown';
          request.deliveryError = 'Delivery is uncertain. Check Telegram before sending again.';
          await save();
          json(res, 502, { error: request.deliveryError, request });
          return true;
        }
        if (request.status !== 'On hold') request.status = 'Published';
        request.deliveryStatus = 'Sent';
        request.publishedMessageId = String(telegramResult.result.message_id);
        request.publishedAt = new Date().toISOString();
        audit('decision_request_published', request.projectId, {
          requestId: request.id,
          telegramMessageId: request.publishedMessageId,
        });
        await save();
        json(res, 200, { request });
        return true;
      } finally {
        publishingRequests.delete(request.id);
      }
    }
    return false;
  };
}
