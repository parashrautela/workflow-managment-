// A successful bot closure is saved locally before an optional move to recoverable trash.
export async function closeProject({ state, project, outcome, callBotBridge, save, audit }) {
  if (!['Completed', 'Abandoned'].includes(outcome)) throw Object.assign(new Error('Choose Completed or Abandoned.'), { status: 400 });
  if (['Completed', 'Abandoned'].includes(project.status)) {
    if (project.status !== outcome) throw Object.assign(new Error(`This project is already ${project.status.toLowerCase()}.`), { status: 409 });
    return project.closureAnnouncementStatus || 'Not linked';
  }
  let announcementStatus = 'Not linked';
  if (project.telegramGroupChatId) {
    const result = await callBotBridge('/api/integrations/web/projects/close', { groupChatId: project.telegramGroupChatId, outcome });
    announcementStatus = result.announcementStatus;
  }
  project.status = outcome;
  project.completedAt = outcome === 'Completed' ? new Date().toISOString() : null;
  project.closedAt = new Date().toISOString();
  project.closureAnnouncementStatus = announcementStatus;
  for (const task of state.tasks) if (task.projectId === project.id && !task.deletedAt && !['Completed', 'Cancelled'].includes(task.status)) task.status = 'Cancelled';
  audit('project_closed', project.id, { outcome, announcementStatus });
  await save();
  return announcementStatus;
}
