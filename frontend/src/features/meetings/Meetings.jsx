import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { request } from '@/lib/api';
import { MeetingEditor } from '@/features/meetings/MeetingEditor';
import { TaskThreadDrawer } from '@/features/tasks/TaskThreadDrawer';
import { formatDateTime, STUDIO_TIME_ZONE } from '@/lib/dates';
import { Empty } from '@/components/ui/empty';
import { navigate } from '@/lib/navigation';
import { CalendarDays } from 'lucide-react';
const when = (value) => `${formatDateTime(value, { timeZone: STUDIO_TIME_ZONE })} IST`;
export function MeetingsView({
  namespace = 'founder',
  projectId = '',
  onOpenTask,
  embedded = false,
}) {
  const Heading = embedded ? 'h2' : 'h1';
  const [meetings, setMeetings] = useState([]),
    [error, setError] = useState(''),
    [edit, setEdit] = useState(null),
    [action, setAction] = useState(null),
    [history, setHistory] = useState(false),
    [busy, setBusy] = useState(false),
    [selectedTask, setSelectedTask] = useState(null);
  const load = async () => {
    try {
      const data = await request(
        `/api/${namespace}/meetings${projectId ? '?projectId=' + encodeURIComponent(projectId) : ''}`,
      );
      setMeetings(data.meetings);
      setError('');
    } catch (problem) {
      setError(problem.message);
    }
  };
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (active && document.visibilityState === 'visible') load();
    };
    load();
    const timer = setInterval(refresh, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [namespace, projectId]);
  const update = async () => {
    setBusy(true);
    try {
      await request(`/api/founder/meetings/${action.meeting.id}`, {
        method: 'PATCH',
        body: { revision: action.meeting.revision, status: action.status },
      });
      setAction(null);
      await load();
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  };
  const openTask = async (meeting) => {
    if (onOpenTask) {
      onOpenTask(meeting);
      return;
    }
    try {
      const workspace = await request(`/api/${namespace}/projects/${meeting.projectId}/workspace`);
      const task = workspace.tasks.find((row) => row.id === meeting.taskId);
      if (!task) throw Error('Task is no longer available.');
      setSelectedTask({ task, project: workspace.project });
    } catch (problem) {
      setError(problem.message);
    }
  };
  const visible = meetings.filter((meeting) => history || meeting.status === 'Scheduled');
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Heading>Meetings</Heading>
          <p className="text-xs text-muted-foreground">
            Open a task and choose Schedule meeting to arrange a visit or review.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          Refresh
        </Button>
      </div>
      <label className="flex gap-2 text-sm">
        <input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} />
        Include completed and cancelled meetings
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {visible.map((meeting) => (
        <article key={meeting.id} className="space-y-3 card-box bg-card">
          <div className="flex flex-wrap justify-between gap-2">
            <div>
              <p className="text-xs text-primary">
                {meeting.projectName} · {meeting.status}
              </p>
              <h3 className="type-label-14-strong">{meeting.title}</h3>
              <p className="text-sm">{when(meeting.startsAt)}</p>
              <p className="text-xs text-muted-foreground">
                {meeting.location || 'Location to be confirmed'}
              </p>
            </div>
            {Date.parse(meeting.startsAt) < Date.now() && <span>Past</span>}
          </div>
          <p className="text-xs">
            Attendees: {meeting.attendees.map((row) => row.name).join(', ')}
          </p>
          {meeting.attendees.some((row) => !row.connected) && (
            <p className="text-xs text-warning">
              {meeting.attendees
                .filter((row) => !row.connected)
                .map((row) => row.name)
                .join(', ')}
              : personal Telegram unavailable
              {meeting.groupFallback ? '; group fallback enabled' : '; group fallback off'}.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {
              <Button variant="outline" size="sm" onClick={() => openTask(meeting)}>
                Open task
              </Button>
            }
            {namespace === 'founder' && meeting.status === 'Scheduled' && (
              <>
                <Button variant="outline" size="sm" onClick={() => setEdit(meeting)}>
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAction({ meeting, status: 'Completed' })}
                >
                  Mark meeting complete
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAction({ meeting, status: 'Cancelled' })}
                >
                  Cancel meeting
                </Button>
              </>
            )}
          </div>
          {namespace === 'founder' && (
            <details className="card-box">
              <summary className="text-xs">
                Notification history · {meeting.deliveries.length}
              </summary>
              <div className="max-h-52 overflow-y-auto space-y-1 pt-2">
                {meeting.deliveries
                  .slice()
                  .reverse()
                  .map((row) => (
                    <p key={row.id} className="text-xs">
                      {meeting.attendees.find((person) => person.id === row.attendeeId)?.name ||
                        row.attendeeId}{' '}
                      · {row.kind} · {row.channel || 'Personal'} · {row.status}
                      {row.error ? ' — ' + row.error : ''}
                    </p>
                  ))}
              </div>
            </details>
          )}
        </article>
      ))}
      {!visible.length && (
        <Empty
          icon={CalendarDays}
          title="No scheduled meetings"
          description="Open a task and choose Schedule to arrange a site visit or review."
          action={
            namespace === 'employee' ? null : (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  projectId ? navigate({ projectTab: 'tasks' }) : navigate({ section: 'projects' })
                }
              >
                {projectId ? 'Go to tasks' : 'Go to projects'}
              </Button>
            )
          }
        />
      )}
      <TaskThreadDrawer
        task={selectedTask?.task}
        project={selectedTask?.project}
        projectMembers={selectedTask?.project.members || []}
        isFounder={namespace === 'founder'}
        open={Boolean(selectedTask)}
        onOpenChange={(value) => {
          if (!value) setSelectedTask(null);
        }}
        onTaskUpdated={load}
      />
      <MeetingEditor
        open={Boolean(edit)}
        onOpenChange={(value) => {
          if (!value) setEdit(null);
        }}
        task={edit ? { id: edit.taskId, title: edit.title } : null}
        meeting={edit}
        onSaved={load}
      />
      <Dialog
        open={Boolean(action)}
        onOpenChange={(value) => {
          if (!value && !busy) setAction(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action?.status === 'Cancelled' ? 'Cancel meeting?' : 'Complete meeting?'}
            </DialogTitle>
            <DialogDescription>
              {action?.status === 'Cancelled'
                ? 'Attendees will be notified and future reminders stopped.'
                : 'Future meeting reminders will stop. The linked task stays unchanged.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setAction(null)}>
              {action?.status === 'Cancelled' ? 'Keep meeting' : 'Cancel'}
            </Button>
            <Button
              variant={action?.status === 'Cancelled' ? 'destructive' : 'default'}
              disabled={busy}
              onClick={update}
            >
              {busy
                ? 'Saving…'
                : action?.status === 'Cancelled'
                  ? 'Cancel meeting'
                  : 'Mark complete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
