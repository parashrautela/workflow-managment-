import { ApiError } from '../http/api-error.js';
import { connectionTasks } from './stage-connections.js';
import { planStageOrder } from './stage-order.js';
import { syncProjectTasks, refreshStageDates } from './task-sync.js';

export function createStageOrderRoutes({
  getState,
  founder,
  body,
  json,
  save,
  audit,
  callBotBridge,
  checkpoint,
}) {
  return async (req, res, url) => {
    const match = url.pathname.match(
      /^\/api\/founder\/projects\/([^/]+)\/stage-order\/(preview|apply)$/,
    );
    if (!match || req.method !== 'POST') return false;
    if (!founder(req)) throw new ApiError('Founder sign-in required.', 401);
    const state = getState(),
      project = state.projects.find((row) => row.id === match[1]);
    if (!project) throw new ApiError('Project not found.', 404);
    if (['Completed', 'Abandoned'].includes(project.status))
      throw new ApiError('This project is closed.', 409);
    const input = await body(req);
    const working = structuredClone(state),
      target = working.projects.find((row) => row.id === project.id);
    const rows = () =>
      working.tasks.filter(
        (task) => task.projectId === project.id && !task.deletedAt && task.status !== 'Cancelled',
      );
    let botFingerprint;
    if (project.telegramGroupChatId) {
      if (rows().some((task) => task.telegramSyncStatus !== 'Synced'))
        throw new ApiError('Sync pending task edits before reordering stages.', 409);
      const snapshot = await callBotBridge('/api/integrations/web/stages/reorder', {
        groupChatId: project.telegramGroupChatId,
        mode: 'snapshot',
      });
      botFingerprint = snapshot.fingerprint;
      if (!botFingerprint)
        throw new ApiError('Update the Telegram bot before reordering stages.', 409);
      await syncProjectTasks(working, target, async () => snapshot, { readOnly: true });
      if (Array.isArray(snapshot.stageOrder))
        target.stages.sort(
          (a, b) => snapshot.stageOrder.indexOf(a.name) - snapshot.stageOrder.indexOf(b.name),
        );
    }
    const result = planStageOrder(connectionTasks(rows()), target.stages || [], input.stageIds);
    if (match[2] === 'apply') {
      if (
        input.fingerprint !== result.fingerprint ||
        (botFingerprint && input.botFingerprint !== botFingerprint)
      )
        throw new ApiError('The plan changed. Preview the stage order again.', 409);
      if (project.telegramGroupChatId) {
        const response = await callBotBridge('/api/integrations/web/stages/reorder', {
          groupChatId: project.telegramGroupChatId,
          mode: 'apply',
          fingerprint: botFingerprint,
          stageOrder: input.stageIds.map(
            (id) => target.stages.find((stage) => stage.id === id).name,
          ),
          tasks: result.tasks,
        });
        await syncProjectTasks(state, project, async () => response, { readOnly: true });
      } else {
        for (const planned of result.tasks) {
          const task = state.tasks.find((row) => row.id === planned.id);
          Object.assign(task, {
            sourceForecastStart: planned.start,
            sourceForecastEnd: planned.end,
            deadline: planned.end,
            planPredecessors: planned.dependencies.map((edge) => ({
              taskId: edge.id,
              type: edge.type,
            })),
            planPredecessorId: planned.dependencies[0]?.id || '',
            planDependencyType: planned.dependencies[0]?.type || 'FS',
            updatedAt: new Date().toISOString(),
          });
        }
      }
      project.stages = input.stageIds.map((id, order) => ({
        ...target.stages.find((stage) => stage.id === id),
        order,
      }));
      refreshStageDates(
        project,
        state.tasks.filter((task) => task.projectId === project.id && !task.deletedAt),
      );
      if (project.telegramGroupChatId) checkpoint();
      audit('stage_order_changed', project.id, {
        stageIds: input.stageIds,
        affected: result.affected.length,
        dependencies: result.dependencyChanges.length,
      });
      await save();
    }
    json(res, 200, {
      ...result,
      botFingerprint,
      tasks:
        match[2] === 'apply'
          ? state.tasks.filter((task) => task.projectId === project.id && !task.deletedAt)
          : undefined,
      project: match[2] === 'apply' ? project : undefined,
    });
    return true;
  };
}
