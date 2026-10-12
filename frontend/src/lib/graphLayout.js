// frontend/src/lib/graphLayout.js
import dagre from '@dagrejs/dagre';
import { MarkerType } from '@xyflow/react';

export const NODE_WIDTH = 280;
export const NODE_HEIGHT = 110;

/**
 * Resolves assignee display label for a task.
 * Never invents an assignee if none is recorded.
 */
export function resolveAssigneeName(task, employees = []) {
  if (task.assigneeId === 'founder') return 'Founder';
  if (!task.assigneeId) return 'Unassigned';
  const found = employees.find((e) => e.id === task.assigneeId);
  return found?.name || task.assigneeName || 'Assigned';
}

/**
 * Builds nodes, edges, warnings, and calculates flat left-to-right dagre layout.
 */
export function computeGraphLayout({ tasks = [], employees = [], stages = [], selectedTaskId = null, searchQuery = '' } = {}) {
  const activeTasks = tasks.filter((t) => !t.deletedAt);
  const telegramToWebId = new Map();
  const taskById = new Map();

  for (const t of activeTasks) {
    taskById.set(t.id, t);
    if (t.telegramTaskId) {
      telegramToWebId.set(t.telegramTaskId, t.id);
    }
  }

  const rawEdges = [];
  const warnings = [];
  const adjacency = new Map(); // source -> targets
  const reverseAdjacency = new Map(); // target -> sources
  const inDegree = new Map();

  for (const t of activeTasks) {
    adjacency.set(t.id, []);
    reverseAdjacency.set(t.id, []);
    inDegree.set(t.id, 0);
  }

  // Build edges and check references
  for (const t of activeTasks) {
    if (!t.dependencies || !Array.isArray(t.dependencies)) continue;

    for (const dep of t.dependencies) {
      const predTgId = dep.predecessorTelegramTaskId;
      const type = dep.type === 'SS' ? 'SS' : (dep.type === 'FS' ? 'FS' : (dep.type || 'FS'));
      const isUnsupported = dep.unsupported || (type !== 'FS' && type !== 'SS');

      if (isUnsupported) {
        warnings.push({
          type: 'unsupported_edge',
          taskId: t.id,
          taskTitle: t.title,
          edgeType: type,
          message: `Task "${t.title}" contains unsupported edge type "${type}".`,
        });
      }

      // Check self-reference
      if (predTgId === t.telegramTaskId) {
        warnings.push({
          type: 'self_reference',
          taskId: t.id,
          taskTitle: t.title,
          predecessorTelegramTaskId: predTgId,
          message: `Task "${t.title}" references itself.`,
        });
        continue;
      }

      const predWebId = telegramToWebId.get(predTgId);
      if (!predWebId) {
        warnings.push({
          type: 'missing_reference',
          taskId: t.id,
          taskTitle: t.title,
          predecessorTelegramTaskId: predTgId,
          message: `Task "${t.title}" references missing prerequisite (${predTgId}).`,
        });
        continue;
      }

      rawEdges.push({
        id: `e-${predWebId}-${t.id}-${type}`,
        source: predWebId,
        target: t.id,
        type,
        isUnsupported,
      });

      adjacency.get(predWebId)?.push(t.id);
      reverseAdjacency.get(t.id)?.push(predWebId);
      inDegree.set(t.id, (inDegree.get(t.id) || 0) + 1);
    }
  }

  // Cycle detection
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
    const cyclicTitles = [];
    for (const [id, deg] of tempDegree.entries()) {
      if (deg > 0) {
        const task = taskById.get(id);
        cyclicTitles.push(task?.title || id);
      }
    }
    warnings.push({
      type: 'cycle',
      message: `Dependency cycle detected involving: ${cyclicTitles.slice(0, 4).join(', ')}${cyclicTitles.length > 4 ? '...' : ''}.`,
      cyclicTitles,
    });
  }

  // Upstream / Downstream set for active selection
  const highlightedNodeIds = new Set();
  const highlightedEdgeIds = new Set();

  if (selectedTaskId && taskById.has(selectedTaskId)) {
    highlightedNodeIds.add(selectedTaskId);

    // Collect ancestors (upstream)
    const upstreamStack = [selectedTaskId];
    const visitedUpstream = new Set([selectedTaskId]);
    while (upstreamStack.length > 0) {
      const current = upstreamStack.pop();
      for (const pred of reverseAdjacency.get(current) || []) {
        highlightedNodeIds.add(pred);
        highlightedEdgeIds.add(`e-${pred}-${current}-FS`);
        highlightedEdgeIds.add(`e-${pred}-${current}-SS`);
        if (!visitedUpstream.has(pred)) {
          visitedUpstream.add(pred);
          upstreamStack.push(pred);
        }
      }
    }

    // Collect descendants (downstream)
    const downstreamStack = [selectedTaskId];
    const visitedDownstream = new Set([selectedTaskId]);
    while (downstreamStack.length > 0) {
      const current = downstreamStack.pop();
      for (const next of adjacency.get(current) || []) {
        highlightedNodeIds.add(next);
        highlightedEdgeIds.add(`e-${current}-${next}-FS`);
        highlightedEdgeIds.add(`e-${current}-${next}-SS`);
        if (!visitedDownstream.has(next)) {
          visitedDownstream.add(next);
          downstreamStack.push(next);
        }
      }
    }
  }

  const query = (searchQuery || '').trim().toLowerCase();

  // Create Dagre graph
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: 'LR',
    nodesep: 35,
    ranksep: 75,
    marginx: 20,
    marginy: 20,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const t of activeTasks) {
    g.setNode(t.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of rawEdges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  // Construct final React Flow nodes
  const nodes = activeTasks.map((t) => {
    const pos = g.node(t.id) || { x: 0, y: 0 };
    const assigneeName = resolveAssigneeName(t, employees);
    const stage = stages.find((s) => s.id === t.stageId);
    const stageName = stage?.name || t.sourcePhase || 'General';
    const matchesSearch = query
      ? t.title.toLowerCase().includes(query) ||
        assigneeName.toLowerCase().includes(query) ||
        stageName.toLowerCase().includes(query) ||
        (t.sourceTrade || '').toLowerCase().includes(query) ||
        t.status.toLowerCase().includes(query)
      : true;

    const isSelected = selectedTaskId === t.id;
    const isHighlighted = highlightedNodeIds.has(t.id);
    const hasSelectionActive = Boolean(selectedTaskId);
    const isDimmed = (hasSelectionActive && !isHighlighted) || (Boolean(query) && !matchesSearch);

    return {
      id: t.id,
      type: 'taskGraphNode',
      position: {
        x: Math.round(pos.x - NODE_WIDTH / 2),
        y: Math.round(pos.y - NODE_HEIGHT / 2),
      },
      data: {
        task: t,
        title: t.title,
        status: t.status,
        sourceStatus: t.sourceStatus || t.status,
        deadline: t.deadline || '',
        assigneeName,
        stageName,
        trade: t.sourceTrade || '',
        gateType: t.sourceGateType || '',
        approvalStatus: t.sourceApprovalStatus || '',
        unconfigured: !t.dependenciesLoaded && (!t.dependencies || t.dependencies.length === 0),
        isSelected,
        isHighlighted,
        isDimmed,
      },
    };
  });

  // Construct final React Flow edges
  const edges = rawEdges.map((e) => {
    const isEdgeActive = highlightedEdgeIds.has(e.id);
    const hasSelectionActive = Boolean(selectedTaskId);
    const isEdgeDimmed = hasSelectionActive && !isEdgeActive;
    const isSS = e.type === 'SS';

    const strokeColor = isEdgeActive
      ? '#2563eb' // Blue highlight
      : (isEdgeDimmed ? '#cbd5e1' : '#64748b');

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'default',
      animated: false,
      style: {
        stroke: strokeColor,
        strokeWidth: isEdgeActive ? 2.5 : 1.75,
        strokeDasharray: isSS ? '5,5' : undefined,
        opacity: isEdgeDimmed ? 0.35 : 1,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: strokeColor,
      },
      data: {
        edgeType: e.type,
        label: isSS ? 'SS' : 'FS',
        tooltip: isSS
          ? 'Start-to-Start (SS): Predecessor must start before dependent starts'
          : 'Finish-to-Start (FS): Predecessor must finish before dependent starts',
        isHighlighted: isEdgeActive,
      },
    };
  });

  return { nodes, edges, warnings };
}
