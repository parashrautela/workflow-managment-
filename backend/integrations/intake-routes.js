import { body } from '../http/request.js';
import { hasRole } from '../auth/roles.js';

export function createIntakeRoutes({
  getState,
  applyGroupSnapshot,
  audit,
  integrationSecret,
  json,
  operationsRoutes,
  safeEqual,
  save,
  shortText,
}) {
  return async function intakeRoutes(req, res, url) {
    const state = getState();
    if (req.method === 'POST' && url.pathname === '/api/integrations/telegram/connect') {
      const supplied = (req.headers.authorization || '').replace(/^Bearer /i, '');
      if (!integrationSecret || !safeEqual(supplied, integrationSecret)) {
        json(res, 401, { error: 'Integration authentication required.' });
        return true;
      }
      const input = await body(req);
      if (!/^\d+$/.test(String(input.telegramUserId || ''))) {
        json(res, 400, { error: 'Invalid Telegram user ID.' });
        return true;
      }
      json(res, 200, await operationsRoutes.connect(input.telegramUserId));
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/integrations/telegram/groups/snapshot') {
      const supplied = (req.headers.authorization || '').replace(/^Bearer /i, '');
      if (!integrationSecret || !safeEqual(supplied, integrationSecret)) {
        json(res, 401, { error: 'Integration authentication required.' });
        return true;
      }
      const input = await body(req);
      applyGroupSnapshot(input);
      await save();
      json(res, 200, { ok: true });
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/integrations/telegram/resources') {
      const supplied = (req.headers.authorization || '').replace(/^Bearer /i, '');
      if (!integrationSecret || !safeEqual(supplied, integrationSecret)) {
        json(res, 401, { error: 'Integration authentication required.' });
        return true;
      }
      const input = await body(req);
      const groupId = String(input.GroupChatID || '');
      const project = state.projects.find(
        (item) =>
          item.telegramGroupChatId === groupId && item.telegramProjectId === input.ProjectID,
      );
      if (!project) {
        json(res, 409, { error: 'Link this Telegram project first.' });
        return true;
      }
      const member = state.telegramGroups
        .find((group) => group.groupChatId === groupId)
        ?.members.find(
          (item) =>
            item.telegramUserId === String(input.TelegramUserID) &&
            item.membershipStatus === 'Active' &&
            item.assignedRole,
        );
      if (!member) {
        json(res, 403, { error: 'Resource sender is not an assigned member.' });
        return true;
      }
      if (
        !/^\d+$/.test(String(input.SourceMessageID || '')) ||
        ![
          groupId,
          ...state.telegramMigrations.filter((row) => row.to === groupId).map((row) => row.from),
        ].some((id) => input.SubmissionID === `RES-${id}-${input.SourceMessageID}`) ||
        !shortText(input.FileName, 200) ||
        !['Photo', 'Document'].includes(input.ResourceType) ||
        !shortText(input.TelegramFileID, 300)
      ) {
        json(res, 400, { error: 'Invalid project resource.' });
        return true;
      }
      let file = state.projectFiles.find((item) => item.id === input.SubmissionID);
      if (file && file.projectId !== project.id) {
        json(res, 409, { error: 'File identity belongs to another project.' });
        return true;
      }
      if (!file) {
        file = { id: input.SubmissionID, projectId: project.id };
        state.projectFiles.push(file);
      }
      Object.assign(file, {
        name: input.FileName,
        type: input.ResourceType,
        fileId: input.TelegramFileID,
        mimeType: shortText(input.MimeType, 200) || '',
        submittedBy: shortText(input.SubmittedByName, 160) || 'Team member',
        submittedAt: shortText(input.SubmittedAt, 40) || new Date().toISOString(),
        status: input.DriveStatus === 'Stored' ? 'Stored' : 'Pending',
        error: shortText(input.DriveError, 300) || '',
        driveFileId: shortText(input.DriveFileID, 200) || '',
      });
      await save();
      json(res, 200, { ok: true });
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/integrations/telegram/requests') {
      const supplied = (req.headers.authorization || '').replace(/^Bearer /i, '');
      if (!integrationSecret || !safeEqual(supplied, integrationSecret)) {
        json(res, 401, { error: 'Integration authentication required.' });
        return true;
      }
      const input = await body(req);
      const groupId = String(input.GroupChatID || '');
      const project = state.projects.find((item) => item.telegramGroupChatId === groupId);
      if (!project) {
        json(res, 409, { error: 'Link this Telegram group to a web app project first.' });
        return true;
      }
      if (
        project.telegramProjectId &&
        project.telegramProjectId !== String(input.TelegramProjectID || '')
      ) {
        json(res, 409, { error: 'Telegram project mapping does not match.' });
        return true;
      }
      if (input.AutomaticClientQuery === true) {
        const clientId =
          project.clientTelegramId ||
          state.telegramGroups
            .find((g) => g.groupChatId === groupId)
            ?.members.find(
              (m) => m.membershipStatus === 'Active' && hasRole(m.assignedRole, 'Client'),
            )?.telegramUserId;
        if (
          !(project.clientTelegramIds?.length ? project.clientTelegramIds : [clientId]).includes(
            String(input.OriginalSenderTelegramID || ''),
          )
        ) {
          json(res, 403, { error: 'Message is not from the assigned client.' });
          return true;
        }
      }
      const id = shortText(input.RequestID, 120);
      const requestType = input.RequestType;
      const message = shortText(input.OriginalMessage, 4096);
      const context = shortText(input.RequestContext, 2000);
      const sender = shortText(input.OriginalSenderName, 160);
      if (
        !id ||
        !/^REQ--?\d+-\d+-(approval|question|update|message)$/.test(id) ||
        !['Approval', 'Question', 'Update', 'Message'].includes(requestType) ||
        message === null ||
        context === null ||
        !sender ||
        !/^[-]?\d+$/.test(groupId) ||
        !/^\d+$/.test(String(input.SourceMessageID || ''))
      ) {
        json(res, 400, { error: 'Invalid Telegram request.' });
        return true;
      }
      if (id !== `REQ-${groupId}-${input.SourceMessageID}-${requestType.toLowerCase()}`) {
        json(res, 400, { error: 'Request identity does not match its source.' });
        return true;
      }
      const existing = state.decisionRequests.find((item) => item.id === id);
      if (existing) {
        existing.projectId === project.id
          ? json(res, 200, { request: existing, created: false })
          : json(res, 409, { error: 'Request ID belongs to another project.' });
        return true;
      }
      let attachments;
      try {
        attachments = JSON.parse(input.AttachmentsJSON || '[]');
      } catch {
        attachments = null;
      }
      if (
        !Array.isArray(attachments) ||
        attachments.length > 8 ||
        attachments.some(
          (item) =>
            !item ||
            typeof item !== 'object' ||
            typeof item.type !== 'string' ||
            item.type.length > 40 ||
            typeof item.fileId !== 'string' ||
            !item.fileId ||
            item.fileId.length > 300 ||
            ['fileName', 'mimeType'].some(
              (key) =>
                item[key] !== undefined &&
                (typeof item[key] !== 'string' || item[key].length > 200),
            ),
        )
      ) {
        json(res, 400, { error: 'Invalid attachments.' });
        return true;
      }
      const request = {
        id,
        projectId: project.id,
        groupChatId: groupId,
        telegramProjectId: shortText(input.TelegramProjectID, 100) || '',
        sourceMessageId: String(input.SourceMessageID),
        commandMessageId: String(input.CommandMessageID || ''),
        requestedByName: shortText(input.RequestedByName, 160) || 'Unknown',
        requestedByRole: shortText(input.RequestedByRole, 100) || '',
        originalSenderName: sender,
        originalSenderTelegramId: String(input.OriginalSenderTelegramID || ''),
        automaticClientQuery: input.AutomaticClientQuery === true,
        requestType,
        originalMessage: message,
        context,
        attachments,
        status: 'Pending',
        createdAt: new Date().toISOString(),
        comments: [],
        response: '',
        publishedMessageId: '',
        publishedAt: '',
        resolvedAt: '',
      };
      state.decisionRequests.unshift(request);
      audit('decision_request_received', project.id, { requestId: id });
      await save();
      json(res, 201, { request, created: true });
      return true;
    }
    return false;
  };
}
