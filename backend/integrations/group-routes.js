import { body } from '../http/request.js';
import { roleText, isStaff, hasRole } from '../auth/roles.js';
import { randomBytes } from 'node:crypto';

export function createGroupSetupRoutes({
  getState,
  applyGroupSnapshot,
  audit,
  bindTelegramStaff,
  callBotBridge,
  json,
  projectView,
  save,
  validIsoDate,
}) {
  return async function groupSetupRoutes(req, res, url) {
    const state = getState();
    const projectWorkflows = url.pathname.match(/^\/api\/founder\/projects\/([^/]+)\/workflows$/);
    if (req.method === 'GET' && projectWorkflows) {
      const project = state.projects.find((item) => item.id === projectWorkflows[1]);
      if (!project) {
        json(res, 404, { error: 'Project not found.' });
        return true;
      }
      if (!project.telegramGroupChatId) {
        json(res, 200, { workflows: (await import('./tasks/pilot.js')).workflows });
        return true;
      }
      try {
        json(
          res,
          200,
          await callBotBridge('/api/integrations/web/workflows', {
            groupChatId: project.telegramGroupChatId,
          }),
        );
        return true;
      } catch (error) {
        json(res, 502, { error: error.message });
        return true;
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/founder/telegram-groups/refresh') {
      const input = await body(req);
      if (
        input.groupChatId &&
        !state.telegramGroups.some((group) => group.groupChatId === String(input.groupChatId))
      ) {
        json(res, 404, { error: 'Telegram group not found.' });
        return true;
      }
      let snapshot;
      try {
        snapshot = await callBotBridge('/api/integrations/web/groups', {
          groupChatId: input.groupChatId,
          telegramUserId: input.telegramUserId,
        });
      } catch (error) {
        json(res, 502, { error: error.message });
        return true;
      }
      applyGroupSnapshot(snapshot);
      await save();
      json(res, 200, { ok: true });
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/founder/telegram-groups') {
      json(res, 200, {
        groups: state.telegramGroups.map((group) => ({
          ...group,
          projectId:
            state.projects.find((project) => project.telegramGroupChatId === group.groupChatId)
              ?.id || '',
        })),
      });
      return true;
    }
    const telegramMemberMatch = url.pathname.match(
      /^\/api\/founder\/telegram-groups\/(-?\d+)\/members\/(\d+)$/,
    );
    if (req.method === 'POST' && telegramMemberMatch) {
      const group = state.telegramGroups.find(
        (item) => item.groupChatId === telegramMemberMatch[1],
      );
      const member = group?.members.find(
        (item) =>
          item.telegramUserId === telegramMemberMatch[2] && item.membershipStatus === 'Active',
      );
      if (!member) {
        json(res, 404, { error: 'Active Telegram member not found.' });
        return true;
      }
      const input = await body(req);
      const name = String(input.name || '').trim();
      const role = roleText(input.roles || input.role);
      if (!name || !role || name.length > 100 || role.length > 160) {
        json(res, 400, { error: 'Enter a name and role.' });
        return true;
      }
      if (
        isStaff(role) &&
        state.employees.some(
          (item) => item.telegramUserId === member.telegramUserId && item.active === false,
        )
      ) {
        json(res, 409, {
          error:
            'This Telegram member has a disabled staff account. Open Employees and restore access before assignment.',
        });
        return true;
      }
      try {
        await callBotBridge('/api/integrations/web/group-members', {
          groupChatId: group.groupChatId,
          telegramUserId: member.telegramUserId,
          name,
          role,
        });
      } catch (error) {
        json(res, 502, { error: error.message });
        return true;
      }
      member.assignedName = name;
      member.assignedRole = role;
      const projectClients = group.members.filter(
        (item) => item.membershipStatus === 'Active' && hasRole(item.assignedRole, 'Client'),
      );
      const linked = state.projects.find(
        (project) => project.telegramGroupChatId === group.groupChatId,
      );
      if (linked) {
        linked.clientTelegramIds = projectClients.map((item) => item.telegramUserId);
        linked.clientTelegramId = linked.clientTelegramIds[0] || '';
      }
      if (linked) bindTelegramStaff(linked, member);

      audit(
        'telegram_member_role_assigned',
        state.projects.find((project) => project.telegramGroupChatId === group.groupChatId)?.id ||
          '',
        { groupChatId: group.groupChatId, telegramUserId: member.telegramUserId },
      );
      await save();
      json(res, 200, { member });
      return true;
    }
    const telegramProjectMatch = url.pathname.match(
      /^\/api\/founder\/telegram-groups\/(-?\d+)\/create-project$/,
    );
    if (req.method === 'POST' && telegramProjectMatch) {
      const group = state.telegramGroups.find(
        (item) => item.groupChatId === telegramProjectMatch[1],
      );
      if (!group) {
        json(res, 404, { error: 'Telegram group not found.' });
        return true;
      }
      const existingProject = state.projects.find(
        (project) => project.telegramGroupChatId === group.groupChatId,
      );
      if (existingProject && !existingProject.telegramSetupPending) {
        json(res, 409, { error: 'This group already has a completed project setup.' });
        return true;
      }
      const client = group.members.find(
        (member) => member.membershipStatus === 'Active' && /\bclient\b/i.test(member.assignedRole),
      );
      const active = group.members.filter((member) => member.membershipStatus === 'Active');
      if (
        !client ||
        !active.some((member) => hasRole(member.assignedRole, 'Client')) ||
        active.some((member) => !member.assignedName || !member.assignedRole) ||
        !active.some((member) => isStaff(member.assignedRole))
      ) {
        json(res, 409, {
          error:
            'Assign at least one client and one team member, and complete every active member profile.',
        });
        return true;
      }
      const input = await body(req);
      const projectName = String(input.projectName || group.title).trim();
      const startDate = String(input.startDate || '').trim();
      if (!projectName || projectName.length > 120 || !validIsoDate(startDate) || !startDate) {
        json(res, 400, { error: 'Enter a project name and valid start date.' });
        return true;
      }
      if (
        active.some(
          (member) =>
            isStaff(member.assignedRole) &&
            state.employees.some(
              (item) => item.telegramUserId === member.telegramUserId && item.active === false,
            ),
        )
      ) {
        json(res, 409, {
          error:
            'Open Employees and restore access for disabled team accounts before completing setup.',
        });
        return true;
      }
      let botProject;
      try {
        botProject = await callBotBridge('/api/integrations/web/projects', {
          groupChatId: group.groupChatId,
          projectName,
          clientName: client.assignedName || client.telegramName,
          startDate,
        });
      } catch (error) {
        json(res, 502, { error: error.message });
        return true;
      }
      const project = existingProject || {
        id: `p_${randomBytes(8).toString('hex')}`,
        telegramGroupChatId: group.groupChatId,
        location: '',
        internalOwnerMemberId: '',
        recentTask: '',
        nextMilestone: '',
        blocker: '',
        members: [],
        createdAt: new Date().toISOString(),
      };
      Object.assign(project, {
        name: projectName,
        clientName: client.assignedName || client.telegramName,
        clientTelegramId: client.telegramUserId,
        clientTelegramIds: active
          .filter((member) => hasRole(member.assignedRole, 'Client'))
          .map((member) => member.telegramUserId),
        startDate,
        telegramProjectId: botProject.projectId,
        telegramSetupPending: false,
        phase: 'Setup',
        status: 'Setup',
      });
      active.forEach((member) => bindTelegramStaff(project, member));
      if (!existingProject) state.projects.unshift(project);
      audit('project_created_from_telegram', project.id, {
        groupChatId: group.groupChatId,
        botProjectId: botProject.projectId,
      });
      await save();
      json(res, 201, { project: projectView(project) });
      return true;
    }
    return false;
  };
}
