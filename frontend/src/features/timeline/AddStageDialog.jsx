import { useEffect, useRef, useState } from 'react';
import { Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  AddStageForm,
  emptyStage,
  stageNameProblem,
  stageSpec,
} from '@/features/timeline/AddStageForm';
import { applyStages, fetchDefaultPlan, previewStages } from '@/lib/api';

// Ask the bot for dates while the founder edits, a moment after they stop typing.
export function useStagePreview(value, enabled, request) {
  const [state, setState] = useState({ preview: null, previewing: false, error: '' });
  const latest = useRef(0);
  const key = JSON.stringify(value);
  useEffect(() => {
    if (!enabled) {
      setState({ preview: null, previewing: false, error: '' });
      return undefined;
    }
    const ticket = ++latest.current;
    setState((current) => ({ ...current, previewing: true, error: '' }));
    const timer = setTimeout(async () => {
      try {
        const preview = await request();
        if (ticket === latest.current)
          setState({
            preview,
            previewing: false,
            error:
              preview.ok === false
                ? preview.conflicts?.[0]?.reason || 'This stage cannot be added.'
                : '',
          });
      } catch (error) {
        if (ticket === latest.current)
          setState({
            preview: null,
            previewing: false,
            error: error.message || 'Could not check this stage.',
          });
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      latest.current++;
    };
  }, [key, enabled]);
  return state;
}

// The default plan is the same for every project; fetch it once per page.
let defaultPlanCache = null;
export function useDefaultPlan(projectId, open) {
  const [plan, setPlan] = useState(defaultPlanCache || []);
  useEffect(() => {
    if (!open || defaultPlanCache || !projectId) return;
    fetchDefaultPlan(projectId)
      .then((result) => {
        defaultPlanCache = result.stages || [];
        setPlan(defaultPlanCache);
      })
      .catch(() => {});
  }, [open, projectId]);
  return plan;
}

export function AddStageDialog({
  open,
  onOpenChange,
  projectId,
  stages = [],
  members = [],
  spaces = [],
  tailStageName,
  initialPlacement,
  telegramLinked = true,
  startedDefault = false,
  onAdded,
}) {
  const [value, setValue] = useState(() =>
    emptyStage({
      stages,
      tailStageName,
      placement: initialPlacement,
      started: startedDefault,
      custom: true,
    }),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) {
      setValue(
        emptyStage({
          stages,
          tailStageName,
          placement: initialPlacement,
          started: startedDefault,
          custom: true,
        }),
      );
      setError('');
    }
  }, [open]);
  const problem = stageNameProblem(value, stages);
  const {
    preview,
    previewing,
    error: previewError,
  } = useStagePreview(value, open && !problem, () =>
    previewStages(projectId, { stage: stageSpec(value) }),
  );

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const result = await applyStages(projectId, { stage: stageSpec(value) });
      onOpenChange(false);
      onAdded?.(result);
    } catch (problemSaving) {
      setError(problemSaving.message || 'Could not add this stage.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
    >
      <SheetContent className="w-full gap-0 overflow-hidden p-0 sm:max-w-[640px]">
        <SheetHeader className="shrink-0 border-b px-4 py-4 pr-16 text-left">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <Layers className="size-5" />
            </span>
            <div>
              <SheetTitle>Add a stage</SheetTitle>
              <SheetDescription className="text-sm">
                Edit the standard tasks, choose assignees and durations, then check the dates before
                saving.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <fieldset className="mb-4 flex gap-4 text-sm">
            <legend className="mb-2 text-xs font-medium">Start from</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="stage-structure"
                checked={value.structure !== 'blank'}
                onChange={() =>
                  setValue({
                    ...value,
                    ...emptyStage({ custom: true }),
                    name: value.name,
                    placement: value.placement,
                    spaces: value.spaces,
                  })
                }
              />
              Editable Studio template
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="stage-structure"
                checked={value.structure === 'blank'}
                onChange={() =>
                  setValue({
                    ...value,
                    custom: true,
                    structure: 'blank',
                    tasks: [
                      {
                        key: crypto.randomUUID(),
                        title: '',
                        role: 'Team',
                        durationDays: 1,
                        assigneeId: '',
                      },
                    ],
                  })
                }
              />
              Blank task list
            </label>
          </fieldset>
          <AddStageForm
            spaces={spaces}
            telegramLinked={telegramLinked}
            value={value}
            onChange={setValue}
            stages={stages}
            members={members}
            preview={preview}
            previewing={previewing}
            previewError={previewError}
          />
          {error && (
            <p className="mt-3 text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
        <SheetFooter className="mt-0 shrink-0 flex-row justify-end gap-2 border-t bg-background px-4 py-3">
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={saving || Boolean(problem) || previewing || Boolean(previewError) || !preview}
            onClick={save}
          >
            {saving ? 'Adding…' : 'Add stage'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
