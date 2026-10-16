// One extra task inside a stage, placed after a chosen task. Later tasks move back; the founder sees that before saving.
import { useEffect, useState } from "react";
import { Loader2, Octagon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { applyInsertTask, previewInsertTask } from "@/lib/api";
import { DURATION_OPTIONS, EXECUTION_ROLES, durationLabel } from "@/lib/stageTemplate";
import { useStagePreview } from "@/components/AddStageDialog";

const label = (value) => (value ? new Date(`${value}T00:00:00Z`).toLocaleDateString([], { day: "numeric", month: "short", timeZone: "UTC" }) : "no date");

export function InsertTaskDialog({ open, onOpenChange, projectId, stage, afterTask, members = [], onAdded }) {
  const [value, setValue] = useState({ title: "", role: "Site Team", durationDays: 1, assigneeId: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (open) { setValue({ title: "", role: "Site Team", durationDays: 1, assigneeId: "" }); setError(""); } }, [open]);
  const task = { stageId: stage?.id, afterTaskId: afterTask?.id || "", ...value, title: value.title.trim() };
  const { preview, previewing, error: previewError } = useStagePreview(task, open && Boolean(task.title && stage), () => previewInsertTask(projectId, task));
  const pushed = preview?.affected?.filter((item) => !item.moved) || [];

  const save = async () => {
    setSaving(true); setError("");
    try { const result = await applyInsertTask(projectId, task); onOpenChange(false); onAdded?.(result); }
    catch (problem) { setError(problem.message || "Could not add this task."); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a task to {stage?.name}</DialogTitle>
          <DialogDescription className="text-xs">{afterTask ? `It starts after "${afterTask.title.split(" — ").at(-1)}". Later tasks in the stage wait for it.` : "It becomes the first task of this stage."}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1.5"><span className="text-xs font-medium">Task</span><Input autoFocus maxLength={80} value={value.title} placeholder="e.g. Soil test" onChange={(event) => setValue({ ...value, title: event.target.value })} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1.5"><span className="text-xs font-medium">Who does it</span>
              <Input list="iksha-insert-roles" value={value.role} maxLength={80} onChange={(event) => setValue({ ...value, role: event.target.value })} />
              <datalist id="iksha-insert-roles">{["Site Supervisor", "Designer", "Design Head/ Admin", "Client", ...EXECUTION_ROLES].map((item) => <option key={item} value={item} />)}</datalist>
            </label>
            <label className="space-y-1.5"><span className="text-xs font-medium">Days</span>
              <NativeSelect value={String(value.durationDays)} onChange={(event) => setValue({ ...value, durationDays: Number(event.target.value) })} className="w-full">
                {DURATION_OPTIONS.filter(Boolean).map((days) => <NativeSelectOption key={days} value={String(days)}>{durationLabel(days)}</NativeSelectOption>)}
              </NativeSelect>
            </label>
          </div>
          <label className="block space-y-1.5"><span className="text-xs font-medium">Person</span>
            <NativeSelect value={value.assigneeId} onChange={(event) => setValue({ ...value, assigneeId: event.target.value })} className="w-full">
              <NativeSelectOption value="">By role</NativeSelectOption>
              {members.filter((member) => member.employeeId).map((member) => <NativeSelectOption key={member.employeeId} value={member.employeeId}>{member.name}{member.role ? ` · ${member.role}` : ""}</NativeSelectOption>)}
            </NativeSelect>
          </label>
          <div className="min-h-9 rounded-lg bg-muted/50 px-3 py-2 text-xs" aria-live="polite">
            {previewing ? <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />Checking…</span>
              : previewError ? <span className="flex items-start gap-1.5 text-destructive"><Octagon className="mt-0.5 size-3.5 shrink-0" />{previewError}</span>
              : preview ? <span>{label(preview.created?.[0]?.start)} – {label(preview.created?.[0]?.end)}{pushed.length ? ` · ${pushed.length} later task${pushed.length === 1 ? "" : "s"} move back` : " · nothing else moves"}{preview.finish ? ` · finish ${label(preview.finish)}` : ""}</span>
              : <span className="text-muted-foreground">Name the task to see its dates.</span>}
          </div>
          {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={saving || !preview?.ok || previewing || Boolean(previewError)} onClick={save}>{saving ? "Adding…" : "Add task"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
