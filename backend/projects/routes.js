import { body } from '../http/request.js';
import { randomBytes } from 'node:crypto';
import { closeProject } from './project-closure.js';

export function createProjectRoutes({
  getState,
  audit,
  callBotBridge,
  closingProjects,
  hash,
  json,
  port,
  projectView,
  recordProjectUpdate,
  save,
  token,
  validIsoDate,
}) {
  return async function projectRoutes(req, res, url) {
    const state = getState();
    if (req.method === 'GET' && url.pathname === '/api/founder/projects') {
      json(res, 200, { projects: state.projects.map(projectView) });
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/founder/trash') {
      json(res, 200, { projects: state.trashedProjects.map(projectView) });
      return true;
    }
    const restoreMatch = url.pathname.match(/^\/api\/founder\/trash\/([^/]+)\/restore$/);
    if (req.method === 'POST' && restoreMatch) {
      const project = state.trashedProjects.find((item) => item.id === restoreMatch[1]);
      if (!project) {
        json(res, 404, { error: 'Project not found in Trash.' });
        return true;
      }
      state.trashedProjects = state.trashedProjects.filter((item) => item.id !== project.id);
      delete project.trashedAt;
      state.projects.unshift(project);
      audit('project_restored', project.id, { name: project.name });
      await save();
      json(res, 200, { project: projectView(project) });
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/founder/projects') {
      const input = await body(req);
      if (
        typeof input.name !== 'string' ||
        !input.name.trim() ||
        input.name.length > 120 ||
        (input.clientName !== undefined &&
          (typeof input.clientName !== 'string' || input.clientName.length > 120))
      ) {
        json(res, 400, {
          error: 'Enter a project name and an optional client name under 121 characters.',
        });
        return true;
      }
      if (input.status && input.status !== 'Setup') {
        json(res, 409, {
          error: 'Create in Setup and start a workflow after assigning a client.',
        });
        return true;
      }
      if (
        input.startDate !== undefined &&
        (typeof input.startDate !== 'string' || !validIsoDate(input.startDate))
      ) {
        json(res, 400, { error: 'Start date must use YYYY-MM-DD.' });
        return true;
      }
      const project = {
        id: `p_${randomBytes(8).toString('hex')}`,
        name: input.name.trim(),
        clientName: input.clientName?.trim() || '',
        location: input.location?.trim() || '',
        startDate: input.startDate?.trim() || '',
        telegramGroupChatId: '',
        internalOwnerMemberId: '',
        phase: input.phase?.trim() || 'Design',
        status: input.status || 'Setup',
        recentTask: input.recentTask?.trim() || '',
        nextMilestone: input.nextMilestone?.trim() || '',
        blocker: '',
        members: [],
        createdAt: new Date().toISOString(),
      };
      state.projects.unshift(project);
      audit('project_created', project.id);
      await save();
      json(res, 201, { project: projectView(project) });
      return true;
    }
    const projectMatch = url.pathname.match(/^\/api\/founder\/projects\/([^/]+)$/);
    const completeMatch = url.pathname.match(/^\/api\/founder\/projects\/([^/]+)\/complete$/);
    if (req.method === 'POST' && completeMatch) {
      const project = state.projects.find((item) => item.id === completeMatch[1]);
      if (!project) {
        json(res, 404, { error: 'Project not found.' });
        return true;
      }
      if (closingProjects.has(project.id)) {
        json(res, 409, { error: 'This project is being closed. Please wait.' });
        return true;
      }
      closingProjects.add(project.id);
      try {
        const announcementStatus = await closeProject({
          state,
          project,
          outcome: 'Completed',
          callBotBridge,
          save,
          audit,
        });
        json(res, 200, { project: projectView(project), announcementStatus });
        return true;
      } finally {
        closingProjects.delete(project.id);
      }
    }
    const trashMatch = url.pathname.match(/^\/api\/founder\/projects\/([^/]+)\/trash$/);
    if (req.method === 'POST' && trashMatch) {
      const project = state.projects.find((item) => item.id === trashMatch[1]);
      if (!project) {
        json(res, 404, { error: 'Project not found.' });
        return true;
      }
      if (closingProjects.has(project.id)) {
        json(res, 409, { error: 'This project is being closed. Please wait.' });
        return true;
      }
      closingProjects.add(project.id);
      try {
        const announcementStatus = await closeProject({
          state,
          project,
          outcome: project.status === 'Completed' ? 'Completed' : 'Abandoned',
          callBotBridge,
          save,
          audit,
        });
        state.projects = state.projects.filter((item) => item.id !== project.id);
        project.trashedAt = new Date().toISOString();
        state.trashedProjects.unshift(project);
        audit('project_moved_to_trash', project.id, { name: project.name });
        await save();
        json(res, 200, { ok: true, announcementStatus });
        return true;
      } finally {
        closingProjects.delete(project.id);
      }
    }
    if (req.method === 'PATCH' && projectMatch) {
      const project = state.projects.find((item) => item.id === projectMatch[1]);
      if (!project) {
        json(res, 404, { error: 'Project not found.' });
        return true;
      }
      const input = await body(req);
      const allowed = [
        'clientName',
        'location',
        'phase',
        'status',
        'recentTask',
        'nextMilestone',
        'blocker',
      ];
      if (
        input.startDate !== undefined &&
        (typeof input.startDate !== 'string' || !validIsoDate(input.startDate))
      ) {
        json(res, 400, { error: 'Start date must use YYYY-MM-DD.' });
        return true;
      }
      if (
        ['clientName', 'location'].some(
          (key) =>
            input[key] !== undefined && (typeof input[key] !== 'string' || input[key].length > 200),
        )
      ) {
        json(res, 400, { error: 'Client name and location must be under 201 characters.' });
        return true;
      }
      const updates = {};
      if (input.spacesText !== undefined) {
        if (typeof input.spacesText !== 'string' || input.spacesText.length > 6100) {
          json(res, 400, { error: 'Enter up to 100 space names.' });
          return true;
        }
        const spaces = input.spacesText
          .split('\n')
          .map((name) => name.trim())
          .filter(Boolean);
        if (
          spaces.length > 100 ||
          spaces.some((name) => name.length > 60) ||
          new Set(spaces.map((name) => name.toLowerCase())).size !== spaces.length
        ) {
          json(res, 400, { error: 'Space names must be unique, up to 60 characters each.' });
          return true;
        }
        if (
          (project.stages || [])
            .flatMap((stage) => stage.spaces || [])
            .some((name) => !spaces.includes(name))
        ) {
          json(res, 409, { error: 'Update stages before removing spaces they use.' });
          return true;
        }
        updates.spaces = spaces;
      }
      if (input.startDate !== undefined) updates.startDate = input.startDate.trim();
      if (input.telegramGroupChatId !== undefined) {
        const groupId = String(input.telegramGroupChatId).trim();
        if (groupId && !/^-?\d{1,25}$/.test(groupId)) {
          json(res, 400, { error: 'Enter a numeric Telegram group chat ID.' });
          return true;
        }
        if (
          groupId &&
          state.projects.some(
            (item) => item.id !== project.id && item.telegramGroupChatId === groupId,
          )
        ) {
          json(res, 409, { error: 'This Telegram group is linked to another project.' });
          return true;
        }
        // shortcut: web-only plans cannot migrate to Sheets yet; add an explicit plan migration before allowing a group change.
        if (groupId !== (project.telegramGroupChatId || '') && project.workflowId === 'CUSTOM-V1') {
          json(res, 409, {
            error:
              'This custom plan is saved in the web app. Its Telegram connection cannot be changed after planning starts.',
          });
          return true;
        }
        updates.telegramGroupChatId = groupId;
      }
      if (input.internalOwnerMemberId !== undefined) {
        const ownerId = String(input.internalOwnerMemberId || '').trim();
        const owner = ownerId ? project.members.find((member) => member.id === ownerId) : null;
        if (ownerId && (!owner || /client/i.test(owner.role))) {
          json(res, 400, {
            error: 'Project owner must be an internal member of this project.',
          });
          return true;
        }
        updates.internalOwnerMemberId = ownerId;
      }
      for (const key of allowed)
        if (typeof input[key] === 'string') updates[key] = input[key].trim();
      if (
        ['Completed', 'Abandoned'].includes(updates.status) &&
        updates.status !== project.status
      ) {
        json(res, 409, {
          error:
            'Use Complete project or Abandon & move to trash to notify the group and close the work.',
        });
        return true;
      }
      if (
        ['Completed', 'Abandoned'].includes(project.status) &&
        updates.status &&
        updates.status !== project.status
      ) {
        json(res, 409, { error: 'Closed projects retain their final status.' });
        return true;
      }
      if (
        updates.status &&
        !['Setup', 'Needs setup', 'Completed'].includes(updates.status) &&
        !project.workflowStartedAt &&
        ['Setup', 'Needs setup'].includes(project.status)
      ) {
        json(res, 409, {
          error: 'Assign a client and start a workflow before activating this project.',
        });
        return true;
      }
      if (updates.status === 'Completed' && project.status !== 'Completed')
        updates.completedAt = new Date().toISOString();
      if (updates.status && updates.status !== 'Completed' && project.status === 'Completed')
        updates.completedAt = null;
      const changes = {};
      for (const [key, value] of Object.entries(updates)) {
        if (project[key] !== value) {
          changes[key] = { old: project[key] ?? '', new: value };
          project[key] = value;
        }
      }
      if (Object.keys(changes).length) {
        const update = recordProjectUpdate(project.id, changes);
        audit('project_update', project.id, { updateId: update.id, changes });
      }
      await save();
      json(res, 200, { project: projectView(project) });
      return true;
    }
    const updatesMatch = url.pathname.match(/^\/api\/founder\/projects\/([^/]+)\/updates$/);
    if (req.method === 'GET' && updatesMatch) {
      const project = state.projects.find((item) => item.id === updatesMatch[1]);
      if (!project) {
        json(res, 404, { error: 'Project not found.' });
        return true;
      }
      const updates = state.projectUpdates
        .filter((item) => item.projectId === project.id)
        .slice(0, 50);
      json(res, 200, { updates });
      return true;
    }
    const conversationMatch = url.pathname.match(
      /^\/api\/founder\/projects\/([^/]+)\/conversation$/,
    );
    if (req.method === 'GET' && conversationMatch) {
      const project = state.projects.find((item) => item.id === conversationMatch[1]);
      if (!project) {
        json(res, 404, { error: 'Project not found.' });
        return true;
      }
      json(res, 200, {
        messages: state.conversations
          .filter((item) => item.projectId === project.id)
          .slice(-30)
          .reverse(),
      });
      return true;
    }
    const memberMatch = url.pathname.match(/^\/api\/founder\/projects\/([^/]+)\/members$/);
    if (req.method === 'POST' && memberMatch) {
      const project = state.projects.find((item) => item.id === memberMatch[1]);
      if (!project) {
        json(res, 404, { error: 'Project not found.' });
        return true;
      }
      const input = await body(req);
      if (!input.name?.trim() || !input.designation?.trim() || !input.role?.trim()) {
        json(res, 400, { error: 'Name, designation and role are required.' });
        return true;
      }
      const member = {
        id: randomBytes(8).toString('hex'),
        name: input.name.trim(),
        designation: input.designation.trim(),
        role: input.role.trim(),
      };
      project.members.push(member);
      audit('member_added', project.id, { role: member.role });
      await save();
      json(res, 201, { member });
      return true;
    }
    const inviteMatch = url.pathname.match(/^\/api\/founder\/projects\/([^/]+)\/invite$/);
    if (req.method === 'POST' && inviteMatch) {
      const project = state.projects.find((item) => item.id === inviteMatch[1]);
      if (!project) {
        json(res, 404, { error: 'Project not found.' });
        return true;
      }
      const raw = token();
      state.invites = state.invites.filter((item) => item.projectId !== project.id);
      state.clientSessions = state.clientSessions.filter((item) => item.projectId !== project.id);
      state.invites.push({
        id: randomBytes(8).toString('hex'),
        projectId: project.id,
        tokenHash: hash(raw),
        claimedAt: null,
        sessionHash: null,
        createdAt: Date.now(),
      });
      audit('client_link_created', project.id);
      await save();
      const base = process.env.PUBLIC_URL || `http://localhost:${port}`;
      json(res, 201, { link: `${base.replace(/\/$/, '')}/c/${raw}` });
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/founder/activity') {
      json(res, 200, { activity: state.activity.slice(0, 40) });
      return true;
    }
    return false;
  };
}
