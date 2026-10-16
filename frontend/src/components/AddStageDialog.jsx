import { useEffect, useRef, useState } from "react";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AddStageForm, emptyStage, stageNameProblem, stageSpec } from "@/components/AddStageForm";
import { applyStages, fetchDefaultPlan, previewStages } from "@/lib/api";

// Ask the bot for dates while the founder edits, a moment after they stop typing.
export function useStagePreview(value, enabled, request) {
  const [state, setState] = useState({ preview: null, previewing: false, error: "" });
  const latest = useRef(0);
  const key = JSON.stringify(value);
  useEffect(() => {
    if (!enabled) { setState({ preview: null, previewing: false, error: "" }); return undefined; }
    const ticket = ++latest.current;
    setState((current) => ({ ...current, previewing: true, error: "" }));
    const timer = setTimeout(async () => {
      try {
        const preview = await request();
        if (ticket === latest.current) setState({ preview, previewing: false, error: preview.ok === false ? preview.conflicts?.[0]?.reason || "This stage cannot be added." : "" });
      } catch (error) {
        if (ticket === latest.current) setState({ preview: null, previewing: false, error: error.message || "Could not check this stage." });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [key, enabled]);
  return state;
}

// The default plan is the same for every project; fetch it once per page.
let defaultPlanCache = null;
export function useDefaultPlan(projectId, open) {
  const [plan, setPlan] = useState(defaultPlanCache || []);
  useEffect(() => {
    if (!open || defaultPlanCache || !projectId) return;
    fetchDefaultPlan(projectId).then((result) => { defaultPlanCache = result.stages || []; setPlan(defaultPlanCache); }).catch(() => {});
  }, [open, projectId]);
  return plan;
}

export function AddStageDialog({ open, onOpenChange, projectId, stages = [], members = [], tailStageName, initialPlacement, startedDefault = false, onAdded }) {
  const [value, setValue] = useState(() => emptyStage({ stages, tailStageName, placement: initialPlacement, started: startedDefault }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const defaultPlan = useDefaultPlan(projectId, open);
  useEffect(() => {
    if (open) { setValue(emptyStage({ stages, tailStageName, placement: initialPlacement, started: startedDefault })); setError(""); }
  }, [open]);
  const problem = stageNameProblem(value, stages);
  const { preview, previewing, error: previewError } = useStagePreview(value, open && !problem, () => previewStages(projectId, { stage: stageSpec(value) }));

  const save = async () => {
    setSaving(true); setError("");
    try {
      const result = await applyStages(projectId, { stage: stageSpec(value) });
      onOpenChange(false);
      onAdded?.(result);
    } catch (problemSaving) {
      setError(problemSaving.message || "Could not add this stage.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
      <DialogContent className="flex max-h-[92dvh] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12 text-left">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary"><Layers className="size-5" /></span>
            <div>
              <DialogTitle>Add a stage</DialogTitle>
              <DialogDescription className="text-xs">Six tasks, one after another. Pick the days for each, or Skip the ones this stage does not need.</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <AddStageForm value={value} onChange={setValue} stages={stages} members={members} defaultPlan={defaultPlan} preview={preview} previewing={previewing} previewError={previewError} />
          {error && <p className="mt-3 text-xs text-destructive" role="alert">{error}</p>}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t px-5 py-3">
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={saving || Boolean(problem) || previewing || Boolean(previewError) || !preview} onClick={save}>{saving ? "Adding…" : "Add stage"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
