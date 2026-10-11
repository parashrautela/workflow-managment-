// backend/task-sync.js
import { adaptBotTaskToWeb, toWebStatus } from './task-adapter.js';

const toBot = {
  Open: 'Pending',
  'In progress': 'In Progress',
  Blocked: 'Issue Reported',
  Completed: 'Completed',
  Cancelled: 'Archived',
};

/**
 * Synchronizes project tasks with the Telegram bot bridge.
 * If options.readOnly is true, sends updates: [] to perform a pure read snapshot.
 */
export async function syncProjectTasks(state, project, callBotBridge, { readOnly = false } = {}) {
  if (!project.telegramGroupChatId || !project.telegramProjectId || !project.workflowStartedAt) return false;

  const local = state.tasks.filter((task) => task.projectId === project.id);
  const pending = readOnly ? [] : local.filter((task) => task.telegramSyncStatus !== 'Synced');

  const updates = pending.map((task) => {
    const member = project.members?.find((item) => item.employeeId === task.assigneeId);
    return {
      taskId: task.telegramTaskId || `WEB-${task.id}`,
      title: task.title,
      stage: project.stages?.find((stage) => stage.id === task.stageId)?.name || '',
      status: task.deletedAt ? 'Archived' : toBot[task.status] || 'Pending',
      deadline: task.deadline || '',
      assigneeTelegramId: task.assigneeId === 'founder' ? 'founder' : member?.telegramUserId || '',
      assigneeName: task.assigneeId === 'founder' ? 'Founder' : member?.name || '',
    };
  });

  const snapshot = await callBotBridge('/api/integrations/web/tasks/sync', {
    groupChatId: project.telegramGroupChatId,
    updates: readOnly ? [] : updates,
  });

  if (!Array.isArray(snapshot?.tasks)) {
    throw new Error('Telegram task sync returned no task snapshot.');
  }

  // Acknowledge sent updates only during write sync
  if (!readOnly) {
    for (const task of pending) {
      task.telegramTaskId ||= `WEB-${task.id}`;
      task.telegramSyncStatus = 'Synced';
    }
  }

  // Hydrate local tasks from bot snapshot without destroying pending local edits
  for (const source of snapshot.tasks) {
    let task = local.find((item) => item.telegramTaskId === source.TaskID);

    if (!task) {
      // If task exists under deterministic telegram ID
      const expectedId = `tg-task-${project.id}-${source.TaskID}`;
      task = local.find((item) => item.id === expectedId);
      if (task) task.telegramTaskId = source.TaskID;
    }

    if (!task) {
      // New task from bot not yet in web state
      const id = `tg-task-${project.id}-${source.TaskID}`;
      const stage = project.stages?.find((item) => item.name === source.Stage);
      task = {
        id,
        projectId: project.id,
        title: source.TaskName || '',
        description: '',
        status: toWebStatus(source.Status || 'Pending'),
        assigneeId: '',
        stageId: stage ? stage.id : (project.stages?.[0]?.id || ''),
        deadline: source.CurrentEnd || source.PlannedEnd || '',
        telegramTaskId: source.TaskID,
        telegramSyncStatus: 'Synced',
        sourceQueryId: '',
        createdBy: 'bot',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: '',
      };
      state.tasks.push(task);
      local.push(task);
    }

    if (task.deletedAt) continue;

    const isPendingSync = task.telegramSyncStatus !== 'Synced';
    adaptBotTaskToWeb(task, source, { isLocalPendingSync: isPendingSync });

    const stage = project.stages?.find((item) => item.name === source.Stage);
    if (stage && !isPendingSync) task.stageId = stage.id;
  }

  return true;
}
