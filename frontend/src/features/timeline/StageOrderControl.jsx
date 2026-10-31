import { movedStageIds, stageDropPosition } from './lib/stageOrder';
import { useEffect, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { request } from '@/lib/api';

export function useStageOrder({ projectId, stages, tasks, onChanged, enabled }) {
  const [drag, setDrag] = useState(null),
    [proposal, setProposal] = useState(null);
  const gesture = useRef(null),
    generation = useRef(0);
  const latest = useRef({ stages, enabled });
  latest.current = { stages, enabled };
  const cancelDrag = () => {
    if (gesture.current) {
      clearTimeout(gesture.current.timer);
      cancelAnimationFrame(gesture.current.frame);
    }
    gesture.current = null;
    setDrag(null);
  };
  useEffect(
    () => () => {
      if (gesture.current) {
        clearTimeout(gesture.current.timer);
        cancelAnimationFrame(gesture.current.frame);
      }
      generation.current++;
    },
    [],
  );
  const preview = async (ids) => {
    if (ids.every((id, index) => id === stages[index]?.id)) return;
    const token = ++generation.current;
    setProposal({ stageIds: ids, loading: true });
    try {
      const result = await request(`/api/founder/projects/${projectId}/stage-order/preview`, {
        method: 'POST',
        body: { stageIds: ids },
      });
      if (generation.current === token) setProposal({ stageIds: ids, preview: result });
    } catch (error) {
      if (generation.current === token) setProposal({ stageIds: ids, error: error.message });
    }
  };
  const locate = (current) => {
    const target = document.elementFromPoint(current.x, current.y)?.closest('[data-reorder-stage]');
    const heading = target?.querySelector('.iksha-stage-row');
    const drop =
      target && current.container?.contains(target)
        ? stageDropPosition(
            latest.current.stages,
            current.sourceId,
            target.dataset.reorderStage,
            current.y,
            heading?.getBoundingClientRect(),
          )
        : null;
    current.targetId = drop?.targetId || null;
    current.after = drop?.after || false;
    setDrag({ sourceId: current.sourceId, targetId: current.targetId, after: current.after });
  };
  const gripProps = (stage) => ({
    disabled: !enabled || Boolean(proposal),
    'aria-label': `Reorder ${stage.name}. Hold and drag, or use Arrow Up and Arrow Down.`,
    'aria-pressed': drag?.sourceId === stage.id,
    onPointerDown: (event) => {
      if (!enabled || proposal || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      const container = event.currentTarget.closest('.iksha-schedule-scroll');
      const current = {
        sourceId: stage.id,
        targetId: null,
        container,
        x: event.clientX,
        y: event.clientY,
        originX: event.clientX,
        originY: event.clientY,
        active: false,
      };
      gesture.current = current;
      current.timer = setTimeout(
        () => {
          if (gesture.current !== current) return;
          current.active = true;
          setDrag({ sourceId: stage.id, targetId: stage.id });
          const scroll = () => {
            if (gesture.current !== current) return;
            if (container) {
              const rect = container.getBoundingClientRect();
              const speed = current.y < rect.top + 45 ? -12 : current.y > rect.bottom - 45 ? 12 : 0;
              if (speed) {
                container.scrollTop += speed;
                locate(current);
              }
            }
            current.frame = requestAnimationFrame(scroll);
          };
          current.frame = requestAnimationFrame(scroll);
        },
        event.pointerType === 'mouse' ? 0 : 300,
      );
    },
    onPointerMove: (event) => {
      const current = gesture.current;
      if (!current) return;
      current.x = event.clientX;
      current.y = event.clientY;
      if (!current.active) {
        if (Math.hypot(current.x - current.originX, current.y - current.originY) > 8) cancelDrag();
        return;
      }
      event.preventDefault();
      locate(current);
    },
    onPointerUp: (event) => {
      const current = gesture.current;
      if (!current) return;
      event.preventDefault();
      event.stopPropagation();
      if (current.active) {
        current.x = event.clientX;
        current.y = event.clientY;
        locate(current);
      }
      const ids =
        current.active && current.targetId
          ? movedStageIds(latest.current.stages, current.sourceId, current.targetId, current.after)
          : null;
      cancelDrag();
      if (ids) void preview(ids);
    },
    onPointerCancel: cancelDrag,
    onLostPointerCapture: cancelDrag,
    onClick: (event) => {
      event.preventDefault();
      event.stopPropagation();
    },
    onKeyDown: (event) => {
      if (event.key === 'Escape') {
        cancelDrag();
        return;
      }
      if (!enabled || proposal || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const index = stages.findIndex((row) => row.id === stage.id),
        target = stages[index + (event.key === 'ArrowUp' ? -1 : 1)];
      if (target)
        void preview(movedStageIds(stages, stage.id, target.id, event.key === 'ArrowDown'));
    },
  });
  const close = () => {
    if (proposal?.saving) return;
    generation.current++;
    setProposal(null);
  };
  const apply = async () => {
    setProposal({ ...proposal, saving: true });
    try {
      const result = await request(`/api/founder/projects/${projectId}/stage-order/apply`, {
        method: 'POST',
        body: {
          stageIds: proposal.stageIds,
          fingerprint: proposal.preview.fingerprint,
          botFingerprint: proposal.preview.botFingerprint,
        },
      });
      setProposal(null);
      onChanged(result);
    } catch (error) {
      setProposal({ ...proposal, error: error.message, saving: false });
    }
  };
  const names = new Map(tasks.map((task) => [task.telegramTaskId || task.id, task.title]));
  return {
    drag,
    gripProps,
    dialog: (
      <Dialog
        open={Boolean(proposal)}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review stage order</DialogTitle>
            <DialogDescription>
              Stages take their new positions in the workflow. Task durations and parallel work are
              preserved. Review changes to dates and prerequisites before saving.
            </DialogDescription>
          </DialogHeader>
          <ol className="flex flex-wrap gap-2 text-sm" aria-label="Proposed stage order">
            {proposal?.stageIds.map((id, index) => (
              <li key={id} className="rounded border px-2 py-1">
                {index + 1}. {stages.find((stage) => stage.id === id)?.name}
              </li>
            ))}
          </ol>
          {proposal?.loading && <p role="status">Checking dates and dependencies…</p>}
          {proposal?.error && (
            <p role="alert" className="text-sm text-destructive">
              {proposal.error}
            </p>
          )}
          {proposal?.preview && (
            <>
              <h3 className="text-sm font-semibold">
                Date changes · {proposal.preview.affected.length} tasks
              </h3>
              <div className="space-y-2">
                {proposal.preview.affected.map((task) => (
                  <div key={task.taskId} className="rounded border p-2 text-sm">
                    <strong>{task.taskName}</strong>
                    <p>
                      {task.previousStart} – {task.previousEnd} → {task.forecastStart} –{' '}
                      {task.forecastEnd}
                    </p>
                  </div>
                ))}
              </div>
              <h3 className="text-sm font-semibold">
                Prerequisite changes · {proposal.preview.dependencyChanges.length} tasks
              </h3>
              <div className="space-y-2">
                {proposal.preview.dependencyChanges.map((task) => (
                  <div key={task.taskId} className="rounded border p-2 text-sm">
                    <strong>{task.taskName}</strong>
                    <p>
                      Before:{' '}
                      {task.previous.map((edge) => names.get(edge.id) || edge.id).join(', ') ||
                        'No prerequisite'}
                    </p>
                    <p>
                      After:{' '}
                      {task.dependencies
                        .map(
                          (edge) =>
                            `${names.get(edge.id) || edge.id}${edge.type === 'SS' ? ' (start together)' : ' (after finish)'}`,
                        )
                        .join(', ') || 'No prerequisite'}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-sm">
                Projected finish: {proposal.preview.finish || 'Not confirmed'}
              </p>
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={proposal?.saving} onClick={close}>
              Cancel
            </Button>
            <Button
              disabled={!proposal?.preview || Boolean(proposal?.error) || proposal?.saving}
              onClick={apply}
            >
              {proposal?.saving ? 'Saving…' : 'Save order and schedule'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    ),
  };
}

export function StageOrderGrip({ stage, reorder }) {
  return (
    <button type="button" className="iksha-stage-reorder-grip" {...reorder.gripProps(stage)}>
      <GripVertical size={16} aria-hidden="true" />
    </button>
  );
}
