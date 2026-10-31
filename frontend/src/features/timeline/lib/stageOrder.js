export function movedStageIds(stages, sourceId, targetId, after = false) {
  const ids = stages.map((stage) => stage.id);
  if (sourceId === targetId || !ids.includes(sourceId) || !ids.includes(targetId)) return ids;
  const next = ids.filter((id) => id !== sourceId);
  next.splice(next.indexOf(targetId) + (after ? 1 : 0), 0, sourceId);
  return next;
}

export function stageDropPosition(stages, sourceId, targetId, y, heading) {
  if (
    !heading ||
    !Number.isFinite(y) ||
    sourceId === targetId ||
    !stages.some((stage) => stage.id === sourceId) ||
    !stages.some((stage) => stage.id === targetId)
  )
    return null;
  const after = y >= heading.top + heading.height / 2;
  const ids = movedStageIds(stages, sourceId, targetId, after);
  if (ids.every((id, index) => id === stages[index].id)) return null;
  return { targetId, after };
}
