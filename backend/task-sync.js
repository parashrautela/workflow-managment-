// backend/task-sync.js
import { adaptBotTaskToWeb, toWebStatus } from './task-adapter.js';

const toBot = {
  Open: 'Pending',
  'In progress': 'In Progress',
  Blocked: 'Issue Reported',
  Completed: 'Completed',
  Cancelled: 'Archived',
};

// Stages live in the sheet only as the Stage label on task rows. A label the web has not seen yet becomes a stage here,
// so stages added from the web timeline (or typed into the sheet) show up after the next sync.
function stageFor(project, name) {
  const label = String(name || '').trim();
  if (!label) return null;
  project.stages ||= [];
  let stage = project.stages.find((item) => item.name === label);
  if (!stage) {
    let index = project.stages.length;
    while (project.stages.some((item) => item.id === `tg-stage-${project.id}-${index}`)) index += 1;
    stage = { id: `tg-stage-${project.id}-${index}`, name: label, order: project.stages.length, durationDays: 0, startDate: '', deadline: '', dependencies: [] };
    project.stages.push(stage);
  }
  return stage;
}

const effectiveStart = (task) => task.sourceForecastStart || task.sourceCurrentStart || task.sourcePlannedStart || '';
const effectiveEnd = (task) => task.sourceForecastEnd || task.sourceCurrentEnd || task.sourcePlannedEnd || task.deadline || '';

// Stage dates follow their tasks, so the project overview and stage details match the timeline after any move.
export function refreshStageDates(project, tasks) {
  for (const stage of project.stages || []) {
    const group = tasks.filter((task) => task.stageId === stage.id && !task.deletedAt && task.status !== 'Cancelled');
    const starts = group.map(effectiveStart).filter(Boolean).sort();
    const ends = group.map(effectiveEnd).filter(Boolean).sort();
    if (!starts.length || !ends.length) continue;
    stage.startDate = starts[0];
    stage.deadline = ends.at(-1);
    stage.durationDays = Math.round((Date.parse(stage.deadline) - Date.parse(stage.startDate)) / 86400000) + 1;
  }
}

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

  // Give new web tasks their bot ID now so the snapshot below can match them.
  if (!readOnly) for (const task of pending) task.telegramTaskId ||= `WEB-${task.id}`;
  const sent = new Set(readOnly ? [] : pending.map((task) => task.id));

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
      const stage = stageFor(project, source.Stage);
      task = {
        id,
        projectId: project.id,
        title: source.TaskName || '',
        description: '',
        status: toWebStatus(source.Status || 'Pending'),
        // Stages added from the web carry a Telegram assignee; map it to that member's web account.
        assigneeId: project.members?.find((member) => source.AssignedTelegramID && String(member.telegramUserId) === String(source.AssignedTelegramID))?.employeeId || '',
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

    // Tasks just sent keep their local edits through this hydration; they are acknowledged after it.
    const isPendingSync = task.telegramSyncStatus !== 'Synced';
    adaptBotTaskToWeb(task, source, { isLocalPendingSync: isPendingSync });

    const stage = stageFor(project, source.Stage);
    if (stage && !isPendingSync) task.stageId = stage.id;
  }
  refreshStageDates(project, local);

  // Acknowledge only after hydration, so a stale snapshot cannot overwrite the edit that was just sent.
  for (const task of pending) if (sent.has(task.id)) task.telegramSyncStatus = 'Synced';

  return true;
}
