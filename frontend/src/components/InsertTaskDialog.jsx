// One extra task inside a stage, placed after a chosen task. Later tasks move back; the founder sees that before saving.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { applyInsertTask, previewInsertTask } from "@/lib/api";
import { EXECUTION_ROLES } from "@/lib/stageTemplate";
import { TaskPlacement } from "@/components/TaskPlacement";
import { ScheduleImpact } from "@/components/ScheduleImpact";
import { useStagePreview } from "@/components/AddStageDialog";


export function InsertTaskDialog({ open, onOpenChange, projectId, stage, afterTask, initialPlacement, members = [], tasks = [], telegramLinked = true, onAdded }) {
  const [value, setValue] = useState({ title: "", role: "Site Team", durationDays: 1, assigneeId: "", placement: { type: "after", taskId: "" } });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (open) { setValue({ title: "", role: "Site Team", durationDays: 1, assigneeId: "", placement: initialPlacement || { type: "after", taskId: afterTask?.id || "" } }); setError(""); } }, [open]);
  const task = { stageId: stage?.id, ...value, title: value.title.trim(), afterTaskId: value.placement.taskId || "", placementType: value.placement.type, startDate: value.placement.startDate };
  const { preview, previewing, error: previewError } = useStagePreview(task, open && Boolean(task.title && stage), () => previewInsertTask(projectId, task));

  const save = async () => {
    setSaving(true); setError("");
    try { const result = await applyInsertTask(projectId, task); onOpenChange(false); onAdded?.(result); }
    catch (problem) { setError(problem.message || "Could not add this task."); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
      <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a task to {stage?.name}</DialogTitle>
          <DialogDescription className="text-xs">Choose when this work runs, then review any change to the schedule before confirming.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1.5"><span className="text-xs font-medium">Task</span><Input autoFocus maxLength={80} value={value.title} placeholder="e.g. Soil test" onChange={(event) => setValue({ ...value, title: event.target.value })} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1.5"><span className="text-xs font-medium">Who does it</span>
              <Input list="iksha-insert-roles" value={value.role} maxLength={80} onChange={(event) => setValue({ ...value, role: event.target.value })} />
              <datalist id="iksha-insert-roles">{["Site Supervisor", "Designer", "Design Head/ Admin", "Client", ...EXECUTION_ROLES].map((item) => <option key={item} value={item} />)}</datalist>
            </label>
            <label className="space-y-1.5"><span className="text-xs font-medium">Days</span>
              <Input type="number" min={1} max={365} step={1} value={value.durationDays} onChange={(event) => setValue({ ...value, durationDays: event.target.value === "" ? "" : Number(event.target.value) })} />
            </label>
          </div>
          <label className="block space-y-1.5"><span className="text-xs font-medium">Person</span>
            <NativeSelect value={value.assigneeId} onChange={(event) => setValue({ ...value, assigneeId: event.target.value })} className="w-full">
              <NativeSelectOption value="">By role</NativeSelectOption>
              {!telegramLinked && <NativeSelectOption value="founder">Founder</NativeSelectOption>}
              {members.filter((member) => member.employeeId).map((member) => <NativeSelectOption key={member.employeeId} value={member.employeeId}>{member.name}{member.role ? ` · ${member.role}` : ""}</NativeSelectOption>)}
            </NativeSelect>
          </label>
          <TaskPlacement allowFirst value={value.placement} tasks={tasks.filter((task) => !task.deletedAt && task.status !== "Cancelled")} onChange={(placement) => setValue({ ...value, placement })} />
          <ScheduleImpact preview={preview} pending={previewing} error={previewError} />
          {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={saving || !preview?.ok || previewing || Boolean(previewError)} onClick={save}>{saving ? "Adding…" : "Confirm and add task"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
