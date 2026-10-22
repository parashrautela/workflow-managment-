// backend/task-adapter.js
// Adapter for normalizing bot dependency metadata, resolving graph edges, and preserving source state.

/**
 * Parses predecessor fields from bot task row.
 * PredecessorTaskIDs takes priority; falls back to PredecessorTaskID only when absent/blank.
 */
export function parsePredecessors(predecessorTaskIDs, predecessorTaskID) {
  const hasMulti = typeof predecessorTaskIDs === 'string' && predecessorTaskIDs.trim().length > 0;
  const hasLegacy = typeof predecessorTaskID === 'string' && predecessorTaskID.trim().length > 0;

  if (hasMulti) {
    const rawParts = predecessorTaskIDs.split(',').map((part) => part.trim()).filter(Boolean);
    const seen = new Set();
    const dependencies = [];
    const malformed = [];

    for (const part of rawParts) {
      const tokens = part.split(':').map((t) => t.trim());
      const predecessorId = tokens[0] || '';
      const type = (tokens[1] || 'FS').toUpperCase();

      if (!predecessorId) {
        malformed.push(part);
        continue;
      }

      const isSupported = type === 'FS' || type === 'SS';
      if (!isSupported) {
        malformed.push(`${part} (unsupported edge type '${type}')`);
      }

      const dedupeKey = `${predecessorId}:${type}`;
      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        dependencies.push({
          predecessorTelegramTaskId: predecessorId,
          type,
          unsupported: !isSupported,
          raw: part,
        });
      }
    }

    return { dependencies, malformed, loaded: true };
  }

  if (hasLegacy) {
    const predecessorId = predecessorTaskID.trim();
    return {
      dependencies: [
        {
          predecessorTelegramTaskId: predecessorId,
          type: 'FS',
          unsupported: false,
          raw: predecessorId,
        },
      ],
      malformed: [],
      loaded: true,
    };
  }

  // Both absent or blank: check if fields were present in the source object
  const wasLoaded = predecessorTaskIDs !== undefined || predecessorTaskID !== undefined;
  return {
    dependencies: [],
    malformed: [],
    loaded: wasLoaded,
  };
}

const toBotStatus = {
  Open: 'Pending',
  'In progress': 'In Progress',
  Blocked: 'Issue Reported',
  Completed: 'Completed',
  Cancelled: 'Archived',
};

export const toWebStatus = (status = '') => {
  if (status === 'Completed') return 'Completed';
  if (/^(Archived|Cancelled|Closed)/.test(status)) return 'Cancelled';
  if (status === 'In Progress') return 'In progress';
  if (status === 'Issue Reported' || status.includes('Delay')) return 'Blocked';
  return 'Open';
};

/**
 * Hydrates or updates a web task with bot snapshot fields without modifying
 * pending local edits or reassigning users.
 */
export function adaptBotTaskToWeb(task, source, { isLocalPendingSync = false } = {}) {
  const parsed = parsePredecessors(source.PredecessorTaskIDs, source.PredecessorTaskID);
  task.dependencies = parsed.dependencies;
  task.dependenciesLoaded = parsed.loaded;

  if (parsed.malformed.length > 0) {
    task.dependencyIssues = parsed.malformed;
  } else {
    delete task.dependencyIssues;
  }

  // Preserve source fields separately from simplified web status
  task.sourceStatus = source.Status || '';
  task.sourceActualStart = source.ActualStart || '';
  task.sourceApprovalStatus = source.ApprovalStatus || '';
  task.sourceGateType = source.GateType || '';
  task.sourcePhase = source.Phase || '';
  task.sourceTrade = source.Trade || '';
  task.sourceTemplateVersion = source.TemplateVersion || '';
  task.sourcePlannedStart = source.PlannedStart || '';
  task.sourcePlannedEnd = source.PlannedEnd || '';
  task.sourceCurrentStart = source.CurrentStart || '';
  task.sourceCurrentEnd = source.CurrentEnd || '';
  task.sourceForecastStart = source.ForecastStart || '';
  task.sourceForecastEnd = source.ForecastEnd || '';
  task.sourceActualStart = source.ActualStart || '';
  task.sourceActualEnd = source.ActualEnd || '';
  task.sourceBlockedReason = source.BlockedReason || '';
  // Who the sheet says does the work: a named person when assigned, otherwise the plan's role (Designer, Client…).
  task.sourceAssigneeName = source.AssignedName || '';
  task.sourceAssigneeTelegramId = source.AssignedTelegramID || '';
  task.sourceRole = source.AssignedRole || '';
  task.sourceSequence = source.Sequence !== undefined ? String(source.Sequence) : '';

  // Only update simplified web fields if the task does not have un-synced local edits
  if (!isLocalPendingSync) {
    task.status = toWebStatus(source.Status || 'Pending');
    task.title = source.TaskName || task.title;
    task.deadline = source.ForecastEnd || source.CurrentEnd || source.PlannedEnd || '';
  }

  return task;
}

/**
 * Resolves graph relationships for project tasks using telegramTaskId -> webId mapping.
 * Never derives IDs from titles, sequence numbers, or array indices.
 * Detects missing references, self-references, cross-project references, and cycles.
 */
export function buildProjectDependencyGraph(tasks = []) {
  const activeTasks = tasks.filter((t) => !t.deletedAt);
  const telegramToWebId = new Map();
  const taskById = new Map();

  for (const t of activeTasks) {
    taskById.set(t.id, t);
    if (t.telegramTaskId) {
      telegramToWebId.set(t.telegramTaskId, t.id);
    }
  }

  const nodes = [];
  const edges = [];
  const warnings = [];
  const adjacency = new Map(); // webId -> array of child webIds
  const inDegree = new Map();

  for (const t of activeTasks) {
    nodes.push({
      id: t.id,
      title: t.title,
      status: t.status,
      sourceStatus: t.sourceStatus || t.status,
      deadline: t.deadline || '',
      assigneeId: t.assigneeId || '',
      stageId: t.stageId || '',
      telegramTaskId: t.telegramTaskId || '',
      sourceTrade: t.sourceTrade || '',
      sourcePhase: t.sourcePhase || '',
      sourceGateType: t.sourceGateType || '',
      sourceApprovalStatus: t.sourceApprovalStatus || '',
      sourceForecastStart: t.sourceForecastStart || '',
      sourceForecastEnd: t.sourceForecastEnd || '',
      dependenciesLoaded: Boolean(t.dependenciesLoaded),
      unconfigured: !t.dependenciesLoaded && (!t.dependencies || t.dependencies.length === 0),
    });
    adjacency.set(t.id, []);
    inDegree.set(t.id, 0);
  }

  for (const t of activeTasks) {
    if (!t.dependencies || !Array.isArray(t.dependencies)) continue;

    for (const dep of t.dependencies) {
      const predTgId = dep.predecessorTelegramTaskId;
      const type = dep.type || 'FS';

      if (dep.unsupported) {
        warnings.push({
          type: 'unsupported_edge',
          taskId: t.id,
          taskTitle: t.title,
          predecessorTelegramTaskId: predTgId,
          edgeType: type,
          message: `Task "${t.title}" contains unsupported dependency type "${type}".`,
        });
      }

      // Check self-reference
      if (predTgId === t.telegramTaskId) {
        warnings.push({
          type: 'self_reference',
          taskId: t.id,
          taskTitle: t.title,
          predecessorTelegramTaskId: predTgId,
          message: `Task "${t.title}" has a self-referencing dependency (${predTgId}).`,
        });
        continue;
      }

      // Resolve via telegramTaskId -> webId map
      const predWebId = telegramToWebId.get(predTgId);
      if (!predWebId) {
        warnings.push({
          type: 'missing_reference',
          taskId: t.id,
          taskTitle: t.title,
          predecessorTelegramTaskId: predTgId,
          message: `Task "${t.title}" references missing or cross-project prerequisite (${predTgId}).`,
        });
        continue;
      }

      const edgeId = `edge-${predWebId}-${t.id}-${type}`;
      edges.push({
        id: edgeId,
        source: predWebId,
        target: t.id,
        type,
        unsupported: Boolean(dep.unsupported),
      });

      adjacency.get(predWebId)?.push(t.id);
      inDegree.set(t.id, (inDegree.get(t.id) || 0) + 1);
    }
  }

  // Cycle detection via Kahn's algorithm / topological sort
  const queue = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  let visitedCount = 0;
  const tempDegree = new Map(inDegree);

  while (queue.length > 0) {
    const current = queue.shift();
    visitedCount += 1;
    for (const neighbor of adjacency.get(current) || []) {
      const nextDeg = tempDegree.get(neighbor) - 1;
      tempDegree.set(neighbor, nextDeg);
      if (nextDeg === 0) queue.push(neighbor);
    }
  }

  if (visitedCount < activeTasks.length) {
    // Find participating cyclic nodes
    const cyclicTaskIds = [];
    for (const [id, deg] of tempDegree.entries()) {
      if (deg > 0) {
        const task = taskById.get(id);
        cyclicTaskIds.push(task?.title || id);
      }
    }
    warnings.push({
      type: 'cycle',
      message: `Dependency cycle detected involving: ${cyclicTaskIds.slice(0, 5).join(', ')}${cyclicTaskIds.length > 5 ? '...' : ''}.`,
      cyclicTaskIds,
    });
  }

  return { nodes, edges, warnings };
}
