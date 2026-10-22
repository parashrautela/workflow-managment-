import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { TaskPlacement } from '@/components/TaskPlacement';
import { ScheduleImpact } from '@/components/ScheduleImpact';
import { useStagePreview } from '@/components/AddStageDialog';
import { previewTaskPlan, applyTaskPlan } from '@/lib/api';

export function EditTimelineTaskDialog({ item, tasks = [], members = [], telegramLinked, onClose, onSaved }) {
  const [value, setValue] = useState(null), [saving, setSaving] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    if (!item) { setValue(null); return; }
    const prefix = item.stage?.name + ' — ';
    setValue({ fromTitle: item.task.title, fromRole: item.task.sourceRole || 'Team', fromAssigneeId: item.task.assigneeId || '', fromStart: item.start === null ? '' : new Date(item.start).toISOString().slice(0, 10), fromEnd: item.end === null ? '' : new Date(item.end - 86400000).toISOString().slice(0, 10), title: item.task.title.startsWith(prefix) ? item.task.title.slice(prefix.length) : item.task.title, role: item.task.sourceRole || 'Team', assigneeId: item.task.assigneeId || '', durationDays: item.start !== null && item.end !== null ? Math.round((item.end - item.start) / 86400000) : 1, placement: item.start === null ? { type: 'date', startDate: new Date().toLocaleDateString('en-CA') } : { type: 'keep' } });
    setError('');
  }, [item?.task.id]);
  const input = item && value ? value : null;
  const valid = input && input.title.trim() && input.role.trim() && Number.isInteger(input.durationDays) && input.durationDays >= 1 && input.durationDays <= 365;
  const { preview, previewing, error: previewError } = useStagePreview({ id: item?.task.id, input }, Boolean(valid), () => previewTaskPlan(item.task.id, input));
  const set = (changes) => setValue((current) => ({ ...current, ...changes }));
  const save = async () => {
    setSaving(true); setError('');
    try { const result = await applyTaskPlan(item.task.id, input); onSaved(result); onClose(); }
    catch (problem) { setError(problem.message || 'Could not edit this task.'); }
    finally { setSaving(false); }
  };
  return <Dialog open={Boolean(item)} onOpenChange={(open) => { if (!open && !saving) onClose(); }}><DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto">
    <DialogHeader><DialogTitle>Edit work item</DialogTitle><DialogDescription>Edit the name, owner, duration or dependency. Review the schedule impact before saving.</DialogDescription></DialogHeader>
    {item && value && <div className="space-y-3">
      <label className="block space-y-1"><span className="text-xs font-medium">Task name</span><Input value={value.title} maxLength={80} onChange={(event) => set({ title: event.target.value })} /></label>
      <div className="grid grid-cols-2 gap-2"><label className="space-y-1"><span className="text-xs">Role</span><Input maxLength={80} value={value.role} onChange={(event) => set({ role: event.target.value })} /></label><label className="space-y-1"><span className="text-xs">Duration in days</span><Input type="number" min={1} max={365} step={1} value={value.durationDays} onChange={(event) => set({ durationDays: event.target.value === '' ? '' : Number(event.target.value) })} /></label></div>
      <label className="block space-y-1"><span className="text-xs">Owner</span><NativeSelect className="w-full" value={value.assigneeId} onChange={(event) => set({ assigneeId: event.target.value })}><NativeSelectOption value="">{telegramLinked ? 'By role' : 'Unassigned'}</NativeSelectOption>{!telegramLinked && <NativeSelectOption value="founder">Founder</NativeSelectOption>}{members.filter((member) => member.employeeId).map((member) => <NativeSelectOption key={member.employeeId} value={member.employeeId}>{member.name}</NativeSelectOption>)}</NativeSelect></label>
      <TaskPlacement allowKeep value={value.placement} tasks={tasks.filter((task) => task.stageId===item.task.stageId && task.id !== item.task.id && !task.deletedAt && task.status !== 'Cancelled')} onChange={(placement) => set({ placement })} />
      <ScheduleImpact preview={preview} pending={previewing} error={previewError} />
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>}
    <div className="flex justify-end gap-2"><Button variant="outline" disabled={saving} onClick={onClose}>Cancel</Button><Button disabled={!valid || !preview?.ok || previewing || Boolean(previewError) || saving} onClick={save}>{saving ? 'Saving…' : 'Confirm and save'}</Button></div>
  </DialogContent></Dialog>;
}
