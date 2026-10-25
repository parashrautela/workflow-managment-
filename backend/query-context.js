import { hasRole } from './roles.js';

export function isClientQuery(state, request) {
  if (request.requestType === 'Message') return false;
  const project = state.projects.find(row => row.id === request.projectId);
  if (!project || !request.originalSenderTelegramId) return false;
  const ids = new Set([project.clientTelegramId, ...(project.clientTelegramIds || [])].filter(Boolean).map(String));
  const group = state.telegramGroups?.find(row => row.groupChatId === request.groupChatId);
  for (const member of group?.members || []) {
    if (member.membershipStatus === 'Active' && hasRole(member.assignedRole, 'Client')) ids.add(String(member.telegramUserId));
  }
  return ids.has(String(request.originalSenderTelegramId));
}

export const queryView = (state, request) => ({ ...request, canReject: isClientQuery(state, request) });
