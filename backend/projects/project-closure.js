// A successful bot closure is saved locally before an optional move to recoverable trash.
export async function closeProject({ state, project, outcome, callBotBridge, save, audit }) {
  if (!['Completed', 'Abandoned'].includes(outcome))
    throw Object.assign(new Error('Choose Completed or Abandoned.'), { status: 400 });
  if (['Completed', 'Abandoned'].includes(project.status)) {
    if (project.status !== outcome)
      throw Object.assign(new Error(`This project is already ${project.status.toLowerCase()}.`), {
        status: 409,
      });
    return project.closureAnnouncementStatus || 'Not linked';
  }
  let announcementStatus = 'Not linked';
  if (project.telegramGroupChatId) {
    const setupOnly = !project.telegramProjectId;
    if (
      setupOnly &&
      project.closureOutcome &&
      project.closureOutcome !== outcome &&
      ['Sending', 'Unknown', 'Sent'].includes(project.closureAnnouncementStatus)
    )
      throw Object.assign(
        new Error(
          'A different closure announcement may already have been sent. Check the Telegram group before changing the outcome.',
        ),
        { status: 409 },
      );
    // Persist before sending so a restart cannot silently resend a setup project's announcement.
    if (setupOnly && ['Sending', 'Unknown', 'Sent'].includes(project.closureAnnouncementStatus))
      announcementStatus =
        project.closureAnnouncementStatus === 'Sending'
          ? 'Unknown'
          : project.closureAnnouncementStatus;
    else {
      if (setupOnly) {
        project.closureAnnouncementStatus = 'Sending';
        project.closureOutcome = outcome;
        await save();
      }
      try {
        const result = await callBotBridge('/api/integrations/web/projects/close', {
          groupChatId: project.telegramGroupChatId,
          outcome,
          allowUnstarted: setupOnly,
          projectName: project.name || 'Project',
        });
        announcementStatus = result.announcementStatus || 'Unknown';
      } catch (error) {
        if (setupOnly && error.botStatus === 404) announcementStatus = 'Failed';
        else {
          if (setupOnly) {
            project.closureAnnouncementStatus =
              error.botStatus && error.botStatus < 500 ? 'Failed' : 'Unknown';
            await save();
          }
          throw Object.assign(error, { status: error.botStatus || 502 });
        }
      }
    }
  }
  project.status = outcome;
  project.completedAt = outcome === 'Completed' ? new Date().toISOString() : null;
  project.closedAt = new Date().toISOString();
  project.closureAnnouncementStatus = announcementStatus;
  for (const task of state.tasks)
    if (
      task.projectId === project.id &&
      !task.deletedAt &&
      !['Completed', 'Cancelled'].includes(task.status)
    )
      task.status = 'Cancelled';
  audit('project_closed', project.id, { outcome, announcementStatus });
  await save();
  return announcementStatus;
}
