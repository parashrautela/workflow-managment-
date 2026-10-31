import { ApiError } from '../http/api-error.js';
import { loadTelegramAttachment } from '../integrations/telegram-media.js';

export function createQueryAttachmentRoutes({
  getState,
  botBridgeUrl,
  callBotBridge,
  employeeSession,
  founder,
  integrationSecret,
  json,
}) {
  return async function queryAttachmentRoutes(req, res, url) {
    const state = getState();
    const attachmentMatch = url.pathname.match(
      /^\/api\/(founder|employee)\/decision-requests\/([^/]+)\/attachments\/(\d+)$/,
    );
    if (req.method === 'GET' && attachmentMatch) {
      const namespace = attachmentMatch[1];
      const employee = namespace === 'employee' ? employeeSession(req) : null;
      if (namespace === 'founder' ? !founder(req) : !employee) {
        json(res, 401, { error: 'Staff session required.' });
        return true;
      }
      const request = state.decisionRequests.find(
        (r) => r.id === decodeURIComponent(attachmentMatch[2]),
      );
      const project =
        request &&
        state.projects.find(
          (p) =>
            p.id === request.projectId &&
            (namespace === 'founder' ||
              p.members?.some((m) => m.employeeId === employee.id && m.active !== false)),
        );
      if (!project) {
        json(res, 404, { error: 'Request not found in your workspace.' });
        return true;
      }
      const attachment = request.attachments[Number(attachmentMatch[3])];
      if (!attachment) {
        json(res, 404, { error: 'Attachment not found.' });
        return true;
      }
      let file;
      if (botBridgeUrl && integrationSecret) {
        const stored = await callBotBridge('/api/integrations/web/decisions/content', {
          requestId: request.id,
          groupChatId: request.groupChatId,
          attachmentIndex: Number(attachmentMatch[3]),
        });
        if (typeof stored.bytes !== 'string' || stored.bytes.length > 27000000)
          throw new ApiError('Attachment exceeds the download limit.', 502);
        const bytes = Buffer.from(stored.bytes, 'base64');
        if (bytes.length > 20000000)
          throw new ApiError('Attachment exceeds the 20 MB pilot limit.', 413);
        const inline = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(stored.mime);
        file = { bytes, mime: inline ? stored.mime : 'application/octet-stream', inline };
      } else file = await loadTelegramAttachment(attachment, process.env.GROUP_BOT_TOKEN);
      res.writeHead(200, {
        'content-type': file.mime,
        'content-disposition': file.inline ? 'inline' : 'attachment',
        'cache-control': 'private, no-store',
        'content-security-policy': "default-src 'none'; sandbox",
      });
      res.end(file.bytes);
      return true;
    }
    return false;
  };
}
