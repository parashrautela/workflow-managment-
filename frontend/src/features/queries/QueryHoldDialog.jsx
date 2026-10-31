import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { fetchProjectWorkspace, request } from '@/lib/api';
export function QueryHoldDialog({ open, onOpenChange, query, onChanged }) {
  const [workspace, setWorkspace] = useState(null),
    [taskId, setTaskId] = useState(''),
    [reply, setReply] = useState(''),
    [search, setSearch] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open || !query) return;
    let active = true;
    setWorkspace(null);
    setTaskId(query.taskId || '');
    setSearch('');
    setReply(
      'Your query is on hold while we wait for more information. Please share any details needed to continue.',
    );
    setError('');
    fetchProjectWorkspace(query.projectId)
      .then((data) => {
        if (active) setWorkspace(data);
      })
      .catch((problem) => {
        if (active) setError(problem.message);
      });
    return () => {
      active = false;
    };
  }, [open, query?.id]);
  const save = async () => {
    setBusy(true);
    try {
      await request(`/api/founder/decision-requests/${encodeURIComponent(query.id)}/hold`, {
        method: 'POST',
        body: { taskId, notificationText: reply.trim() },
      });
      onOpenChange(false);
      onChanged?.();
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Waiting for more context</DialogTitle>
          <DialogDescription>
            Keep this message and its files in a task discussion while you wait for more
            information. The task's dates and status stay unchanged.
          </DialogDescription>
        </DialogHeader>
        <Input
          aria-label="Find a task for this query"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find a task…"
        />
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {workspace?.tasks
            .filter(
              (task) =>
                task.status !== 'Cancelled' &&
                `${task.title} ${workspace.project.stages?.find((row) => row.id === task.stageId)?.name || ''}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
            )
            .map((task) => (
              <label
                className="flex items-center gap-2 rounded-lg border p-3 text-sm"
                key={task.id}
              >
                <input
                  type="radio"
                  name="hold-task"
                  checked={taskId === task.id}
                  onChange={() => setTaskId(task.id)}
                />
                {task.title} · {task.status}
              </label>
            ))}
          {workspace && !workspace.tasks.length && (
            <p className="text-sm">Add a task to this project first.</p>
          )}
        </div>
        <label className="grid gap-2 text-sm">
          Update to the sender
          <Textarea
            value={reply}
            maxLength={3000}
            onChange={(event) => setReply(event.target.value)}
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Sent as a reply to the original query when you confirm.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button disabled={busy || !taskId || !reply.trim()} onClick={save}>
          {busy ? 'Saving…' : 'Put on hold and update sender'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
