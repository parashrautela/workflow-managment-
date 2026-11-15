import { telegramConnected } from './operations.js';

// Founders get a client's voice note as the original recording in Telegram, not only in the inbox.
// Best effort: the inbox already has the note, so a bot or Telegram failure must never fail the request.
export function forwardVoiceToFounders(state, request, callBotBridge) {
  if (request.requestType === 'Message' || !request.attachments.some((item) => item.type === 'voice')) return;
  const isFounder = (employee) => state.googleAccounts.some((account) => account.kind === 'founder' && account.employeeId === employee.id && account.status === 'Approved');
  const telegramUserIds = [...new Set(state.employees.filter((employee) => isFounder(employee) && telegramConnected(state, employee)).map((employee) => String(employee.telegramUserId)))].slice(0, 10);
  if (telegramUserIds.length) callBotBridge('/api/integrations/web/decisions/voice', { requestId: request.id, groupChatId: request.groupChatId, telegramUserIds }).catch(() => {});
}
