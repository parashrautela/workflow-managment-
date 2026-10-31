import { hasRole, matchesRole } from './roles.js';
export function canWorkOnTask(project, task, user) {
  if (user.founder) return true;
  const member = project.members?.find((row) => row.employeeId === user.id);
  if (!member || member.active === false) return false;
  const roles = member.roles || member.role || member.designation;
  if (hasRole(roles, 'Founder')) return true;
  if (task.assigneeId) return task.assigneeId === user.id;
  if (task.sourceAssigneeTelegramId)
    return String(member.telegramUserId) === String(task.sourceAssigneeTelegramId);
  return Boolean(task.sourceRole && matchesRole(roles, task.sourceRole));
}
