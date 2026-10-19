import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { renameWorkType } from '@/lib/api';

export function RenameWorkTypeDialog({ stage, projectId, onClose, onSaved }) {
  const [name, setName] = useState(''), [saving, setSaving] = useState(false), [error, setError] = useState('');
  useEffect(() => { setName(stage?.name || ''); setError(''); }, [stage?.id]);
  const save = async () => {
    setSaving(true); setError('');
    try { const result = await renameWorkType(projectId, stage.id, { name, fromName: stage.name }); onSaved(result); onClose(); }
    catch (problem) { setError(problem.message); } finally { setSaving(false); }
  };
  return <Dialog open={Boolean(stage)} onOpenChange={(open) => { if (!open && !saving) onClose(); }}><DialogContent>
    <DialogHeader><DialogTitle>Edit work type</DialogTitle><DialogDescription>Renaming this stage keeps its tasks, dates and dependencies. No schedule dates change.</DialogDescription></DialogHeader>
    <label className="space-y-1"><span className="text-xs">Work type name</span><Input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} /></label>
    {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
    <div className="flex justify-end gap-2"><Button variant="outline" disabled={saving} onClick={onClose}>Cancel</Button><Button disabled={saving || !name.trim() || name.trim() === stage?.name} onClick={save}>{saving ? 'Saving…' : 'Confirm rename'}</Button></div>
  </DialogContent></Dialog>;
}
