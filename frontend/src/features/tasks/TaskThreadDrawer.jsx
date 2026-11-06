import { useEffect, useState, useRef } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  Layers,
  Link2,
  MessageSquare,
  Paperclip,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import './task-thread.css';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ProjectFiles } from '@/features/projects/ProjectFiles';
import { MeetingEditor } from '@/features/meetings/MeetingEditor';
import {
  request,
  updateTask,
  deleteTask,
  fetchTaskMessages,
  markTaskRead,
  getAttachmentUrl,
} from '@/lib/api';
import { formatCalendar } from '@/lib/dates';
import { Time } from '@/components/ui/time';
import { StatusChip } from '@/components/ui/status-chip';
import { taskStatus } from '@/lib/taskStatus';

export function TaskMessage({ message, namespace = 'founder' }) {
  return (
    <article className="space-y-2 card-box bg-card text-sm">
      <div className="flex items-center gap-2 text-xs">
        <Avatar size="sm" aria-hidden="true">
          <AvatarFallback className="bg-secondary font-medium text-secondary-foreground">
            {String(message.author || '?')
              .trim()
              .charAt(0)
              .toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <strong className="min-w-0 flex-1 truncate">{message.author}</strong>
        <Time value={message.at} className="shrink-0 text-muted-foreground" />
      </div>
      {message.text && <p className="whitespace-pre-wrap break-words">{message.text}</p>}
      {message.isResource && (
        <p className="text-xs text-primary">Marked as a resource for dependent work</p>
      )}
      {message.attachmentUrl && (
        <a
          className="block break-all text-xs underline"
          href={message.attachmentUrl}
          target="_blank"
          rel="noreferrer"
        >
          {message.attachmentUrl}
        </a>
      )}
      {(message.files || []).map((file) => {
        const href = `/api/${namespace}/files/${file.id}/content`;
        return (
          <a
            className="block text-xs underline"
            key={file.id}
            href={href}
            target="_blank"
            rel="noreferrer"
          >
            {file.type.startsWith('image/') && (
              <img
                className="mb-1 max-h-60 max-w-full rounded-lg object-contain"
                src={href}
                alt={file.name}
                loading="lazy"
              />
            )}
            {file.name}
          </a>
        );
      })}
      {message.queryId &&
        (message.attachments || []).map((file) => {
          const href = getAttachmentUrl(message.queryId, file.index, namespace);
          return (
            <a
              key={file.index}
              className="block text-xs underline"
              href={href}
              target="_blank"
              rel="noreferrer"
            >
              {/photo|image/i.test(file.type) && (
                <img
                  src={href}
                  className="mb-1 max-h-52 rounded-lg"
                  alt={file.fileName || 'Query photo'}
                  loading="lazy"
                />
              )}
              {file.fileName || file.type}
            </a>
          );
        })}
      {message.telegram && (
        <p className="text-xs text-muted-foreground">
          Telegram group · {message.telegram.status}
          {message.telegram.error ? ' — ' + message.telegram.error : ''}
        </p>
      )}
    </article>
  );
}
export function TaskThreadDrawer({
  task: initialTask,
  project,
  open,
  onOpenChange,
  onTaskUpdated,
  onOpenSourceQuery,
  isFounder = true,
  projectMembers = [],
  siblings = [],
  onSelectTask,
}) {
  const namespace = isFounder ? 'founder' : 'employee';
  const [task, setTask] = useState(initialTask),
    [messages, setMessages] = useState([]),
    [resources, setResources] = useState([]),
    [people, setPeople] = useState([]),
    [draft, setDraft] = useState(''),
    [link, setLink] = useState(''),
    [attachmentOptions, setAttachmentOptions] = useState(false),
    [file, setFile] = useState(null),
    [isResource, setResource] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [cursor, setCursor] = useState(null),
    [editing, setEditing] = useState(false),
    [fields, setFields] = useState({}),
    [review, setReview] = useState(false),
    [shareMessage, setShareMessage] = useState(null),
    [recipients, setRecipients] = useState([]),
    [meetingOpen, setMeetingOpen] = useState(false),
    [taskMeeting, setTaskMeeting] = useState(null),
    [remove, setRemove] = useState(false);
  const key = useRef(crypto.randomUUID()),
    fileInput = useRef(null),
    version = useRef(0);
  useEffect(() => {
    key.current = crypto.randomUUID();
  }, [draft, link, file, isResource]);
  const load = async (taskId = task?.id, append = false) => {
    const current = version.current;
    setLoading(true);
    try {
      const data = await fetchTaskMessages(taskId, append ? cursor : '', 100, namespace);
      if (current !== version.current) return;
      setMessages((previous) => (append ? [...previous, ...data.messages] : data.messages));
      setCursor(data.pagination?.nextCursor || null);
      if (data.messages.length) await markTaskRead(taskId, data.messages.at(-1).id, namespace);
      const reference = await request(`/api/${namespace}/tasks/${taskId}/resources`);
      if (current === version.current) setResources(reference.resources);
    } catch (problem) {
      if (current === version.current) setError(problem.message);
    } finally {
      if (current === version.current) setLoading(false);
    }
  };
  useEffect(() => {
    if (!open || !initialTask) return;
    version.current++;
    setTask(initialTask);
    setMessages([]);
    setResources([]);
    setPeople([]);
    setDraft('');
    setLink('');
    setAttachmentOptions(false);
    setFile(null);
    setResource(false);
    setEditing(false);
    setReview(false);
    setShareMessage(null);
    setRecipients([]);
    setMeetingOpen(false);
    setTaskMeeting(null);
    request(`/api/${namespace}/meetings?projectId=${encodeURIComponent(initialTask.projectId)}`)
      .then((data) => {
        if (current === version.current)
          setTaskMeeting(
            data.meetings.find(
              (row) => row.taskId === initialTask.id && row.status === 'Scheduled',
            ) || null,
          );
      })
      .catch(() => {});
    setRemove(false);
    setError('');
    setCursor(null);
    key.current = crypto.randomUUID();
    load(initialTask.id);
    const current = version.current;
    request(`/api/${namespace}/tasks/${initialTask.id}/participants`)
      .then((data) => {
        if (current === version.current) setPeople(data.people);
      })
      .catch((problem) => {
        if (current === version.current) setError(problem.message);
      });
    return () => {
      version.current++;
    };
  }, [open, initialTask?.id, namespace]);
  if (!task) return null;
  const closed = ['Completed', 'Cancelled'].includes(task.status),
    projectClosed = ['Completed', 'Abandoned'].includes(project?.status);
  const upload = async (event) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      if (selected.size > 5 * 1024 * 1024) throw Error('Choose a file up to 5 MB.');
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(selected);
      });
      const result = await request(`/api/${namespace}/tasks/${task.id}/files`, {
        method: 'POST',
        body: { name: selected.name, type: selected.type, data },
      });
      setFile(result.file);
    } catch (problem) {
      setError(problem.message || 'Could not upload this file.');
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  };
  const send = async (publish) => {
    setBusy(true);
    setError('');
    let posted = false;
    try {
      let message = shareMessage;
      if (!message) {
        const result = await request(`/api/${namespace}/tasks/${task.id}/messages`, {
          method: 'POST',
          body: {
            text: draft,
            attachmentUrl: link,
            fileIds: file ? [file.id] : [],
            isResource,
            clientKey: key.current,
          },
        });
        message = result.message;
        posted = true;
        setMessages((previous) => [...previous.filter((row) => row.id !== message.id), message]);
      }
      if (publish) {
        const shared = await request(
          `/api/founder/tasks/${task.id}/messages/${message.id}/publish`,
          { method: 'POST', body: { confirm: true, recipientIds: recipients } },
        );
        message = shared.message;
      }
      setMessages((previous) => [...previous.filter((row) => row.id !== message.id), message]);
      if (!shareMessage) {
        setDraft('');
        setLink('');
        setFile(null);
        setResource(false);
        key.current = crypto.randomUUID();
      }
      setReview(false);
      setShareMessage(null);
      onTaskUpdated?.();
    } catch (problem) {
      setError((posted ? 'Saved internally. Telegram was not sent: ' : '') + problem.message);
    } finally {
      setBusy(false);
    }
  };
  const changeTask = async (updates) => {
    setBusy(true);
    setError('');
    try {
      const result = await updateTask(task.id, updates, 'founder');
      setTask(result.task);
      setEditing(false);
      onTaskUpdated?.();
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  };
  const ready = Boolean(draft.trim() || link.trim() || file) && !busy && !closed && !projectClosed;
  const startEdit = () => {
    setFields({
      title: task.title,
      description: task.description || '',
      status: task.status,
      deadline: task.deadline || '',
      assigneeId: task.assigneeId || '',
      stageId: task.stageId || '',
    });
    setEditing(true);
  };
  const stage = project?.stages?.find((row) => row.id === task.stageId);
  const chip = taskStatus(task, { stage });
  const assigneeLabel =
    task.assigneeId === 'founder'
      ? 'Founder'
      : projectMembers.find((member) => (member.employeeId || member.id) === task.assigneeId)
          ?.name ||
        task.assigneeName ||
        task.sourceAssigneeName ||
        task.sourceRole ||
        'Unassigned';
  const position = siblings.findIndex((row) => row.id === task.id);
  const canStep = Boolean(onSelectTask) && siblings.length > 1 && position >= 0;
  const step = (offset) => {
    const next = siblings[(position + offset + siblings.length) % siblings.length];
    if (next && !busy) onSelectTask(next);
  };
  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(value) => {
          if (!busy) onOpenChange(value);
        }}
      >
        <SheetContent className="task-thread-sheet" aria-describedby={undefined}>
          <SheetHeader className="task-thread-header">
            <div className="task-thread-heading-row">
              <div className="task-thread-context">
                <StatusChip status={chip} />
              </div>
              {canStep && (
                <div className="task-thread-steps">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Previous task"
                    disabled={busy}
                    onClick={() => step(-1)}
                  >
                    <ChevronUp />
                  </Button>
                  <span aria-live="polite">
                    {position + 1} / {siblings.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Next task"
                    disabled={busy}
                    onClick={() => step(1)}
                  >
                    <ChevronDown />
                  </Button>
                </div>
              )}
            </div>
            <SheetTitle>{task.title}</SheetTitle>
            <ul className="task-thread-chips">
              <li>
                <Badge variant="outline" className="bg-card" title="Project">
                  <FolderOpen aria-hidden="true" />
                  <span className="sr-only">Project: </span>
                  <span className="truncate">{project?.name || 'Task workspace'}</span>
                </Badge>
              </li>
              <li>
                <Badge variant="outline" className="bg-card" title="Assignee">
                  <Avatar size="sm" className="-my-1 -ml-1.5 size-5" aria-hidden="true">
                    <AvatarFallback className="bg-secondary text-xs font-medium text-secondary-foreground">
                      {assigneeLabel.trim().charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="sr-only">Assignee: </span>
                  <span className="truncate">{assigneeLabel}</span>
                </Badge>
              </li>
              <li>
                <Badge variant="outline" className="bg-card" title="Deadline">
                  <CalendarDays aria-hidden="true" />
                  <span className="sr-only">Deadline: </span>
                  {formatCalendar(task.deadline) || 'No deadline'}
                </Badge>
              </li>
              <li>
                <Badge variant="outline" className="bg-card" title="Stage">
                  <Layers aria-hidden="true" />
                  <span className="sr-only">Stage: </span>
                  <span className="truncate">{stage?.name || 'General'}</span>
                </Badge>
              </li>
            </ul>
            {isFounder && !projectClosed && !editing && (
              <div className="task-thread-header-actions">
                <Button variant="outline" size="sm" onClick={startEdit}>
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => changeTask({ status: closed ? 'Open' : 'Completed' })}
                >
                  <CheckCircle2 />
                  {closed ? 'Reopen task' : 'Mark done'}
                </Button>
                {!closed && (
                  <Button size="sm" onClick={() => setMeetingOpen(true)}>
                    <CalendarDays />
                    {taskMeeting ? 'Edit meeting' : 'Schedule'}
                  </Button>
                )}
              </div>
            )}
          </SheetHeader>
          {editing && isFounder ? (
            <form
              className="task-thread-edit"
              onSubmit={(e) => {
                e.preventDefault();
                changeTask(fields);
              }}
            >
              <div className="task-thread-edit-fields chat-scroll">
                {error && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}
                <label className="grid gap-1 text-sm">
                  Task title
                  <Input
                    required
                    maxLength={200}
                    value={fields.title}
                    onChange={(e) => setFields({ ...fields, title: e.target.value })}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  Description
                  <Textarea
                    maxLength={10000}
                    value={fields.description}
                    onChange={(e) => setFields({ ...fields, description: e.target.value })}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    Status
                    <select
                      value={fields.status}
                      onChange={(e) => setFields({ ...fields, status: e.target.value })}
                    >
                      {['Open', 'In progress', 'Blocked', 'Completed', 'Cancelled'].map((value) => (
                        <option key={value} value={value}>
                          {value === 'Completed' ? 'Done' : value}
                        </option>
                      ))}
                    </select>
                    {chip.text !== (fields.status === 'Completed' ? 'Done' : fields.status) && (
                      <small className="text-muted-foreground">Shown as {chip.text}</small>
                    )}
                  </label>
                  <label className="grid gap-1 text-sm">
                    Deadline
                    <Input
                      type="date"
                      value={fields.deadline}
                      onChange={(e) => setFields({ ...fields, deadline: e.target.value })}
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Assignee
                    <select
                      value={fields.assigneeId}
                      onChange={(e) => setFields({ ...fields, assigneeId: e.target.value })}
                    >
                      <option value="">Unassigned</option>
                      <option value="founder">Founder</option>
                      {projectMembers.map((member) => (
                        <option
                          key={member.employeeId || member.id}
                          value={member.employeeId || member.id}
                        >
                          {member.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm">
                    Stage
                    <select
                      value={fields.stageId}
                      onChange={(e) => setFields({ ...fields, stageId: e.target.value })}
                    >
                      <option value="">General</option>
                      {project?.stages?.map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
              <div className="task-thread-edit-footer">
                <Button
                  type="button"
                  variant="destructive-ghost"
                  disabled={busy}
                  onClick={() => setRemove(true)}
                >
                  <Trash2 />
                  Delete task
                </Button>
                <div className="task-thread-edit-actions">
                  <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                  <Button disabled={busy}>Save task</Button>
                </div>
              </div>
            </form>
          ) : (
            <div className="task-thread-body chat-scroll">
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
              {task.description && (
                <p className="task-thread-description whitespace-pre-wrap text-sm">
                  {task.description}
                </p>
              )}
              {task.sourceQueryId && onOpenSourceQuery && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenSourceQuery(task.sourceQueryId)}
                >
                  View source query
                </Button>
              )}
              {!isFounder && (
                <p className="text-xs text-muted-foreground">
                  View the whole project and contribute to discussions. Founders manage task details
                  and approvals.
                </p>
              )}
              {task.sourceBlockedReason && (
                <p className="text-xs text-warning">Blocked: {task.sourceBlockedReason}</p>
              )}
              <details className="task-thread-more">
                <summary>
                  More details
                  {resources.length > 0 ? ` · ${resources.length} from earlier work` : ''}
                </summary>
                <div className="task-thread-more-body">
                  <p className="text-sm text-muted-foreground">
                    Approval: {task.sourceApprovalStatus || 'Not required'}
                  </p>
                  {resources.length > 0 && (
                    <section className="space-y-2">
                      <h4 className="text-sm font-semibold">Resources from preceding work</h4>
                      {resources.map((row) => (
                        <div key={row.task.id} className="space-y-2">
                          <h5 className="text-sm font-medium">
                            {row.task.title} ·{' '}
                            {
                              taskStatus(row.task, {
                                stage: project?.stages?.find((st) => st.id === row.task.stageId),
                              }).text
                            }
                          </h5>
                          {row.messages.map((message) => (
                            <TaskMessage key={message.id} message={message} namespace={namespace} />
                          ))}
                        </div>
                      ))}
                    </section>
                  )}
                  {project?.id && (
                    <section className="space-y-2">
                      <h4 className="text-sm font-semibold">Shared project resources</h4>
                      <ProjectFiles projectId={project.id} namespace={namespace} />
                    </section>
                  )}
                </div>
              </details>
              <section className="task-thread-discussion">
                <div className="task-thread-discussion-heading">
                  <h3>
                    <MessageSquare /> Discussion ({messages.length}
                    {cursor ? '+' : ''})
                  </h3>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Refresh discussion"
                    disabled={loading}
                    onClick={() => load()}
                  >
                    <RefreshCw className={loading ? 'animate-spin' : ''} />
                  </Button>
                </div>
                {messages.map((message) => (
                  <div key={message.id} className="space-y-1">
                    <TaskMessage message={message} namespace={namespace} />
                    {isFounder &&
                      !projectClosed &&
                      project?.telegramGroupChatId &&
                      !message.queryId &&
                      (!message.telegram || message.telegram.status === 'Failed') && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setShareMessage(message);
                            setRecipients([]);
                            setReview(true);
                          }}
                        >
                          Review and send
                        </Button>
                      )}
                  </div>
                ))}
                {cursor && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={loading}
                    onClick={() => load(task.id, true)}
                  >
                    Load more messages
                  </Button>
                )}
                {!messages.length && (
                  <p className="task-thread-empty">
                    {loading
                      ? 'Loading discussion…'
                      : 'No messages yet. Start the discussion below.'}
                  </p>
                )}
              </section>
            </div>
          )}
          {editing && isFounder ? null : closed || projectClosed ? (
            <p className="task-thread-closed">
              This task is closed. A founder can reopen it to continue the discussion.
            </p>
          ) : (
            <form
              className="task-thread-composer"
              onSubmit={(event) => {
                event.preventDefault();
                send(false);
              }}
            >
              <div className="task-thread-compose-row">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Attach image or PDF"
                  title="Attach image or PDF"
                  disabled={busy}
                  onClick={() => fileInput.current?.click()}
                >
                  <Paperclip />
                </Button>
                <Textarea
                  aria-label="Task comment"
                  value={draft}
                  maxLength={2000}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Post team update or task comment…"
                  rows={1}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Reference link and resource options"
                  aria-expanded={attachmentOptions}
                  onClick={() => setAttachmentOptions(!attachmentOptions)}
                >
                  <Link2 />
                </Button>
              </div>
              {attachmentOptions && (
                <Input
                  aria-label="Attachment link"
                  value={link}
                  maxLength={2048}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="Optional HTTPS reference link"
                />
              )}
              {file && (
                <p className="text-xs">
                  Attached: {file.name}{' '}
                  <button
                    type="button"
                    className="underline"
                    disabled={busy}
                    onClick={() => setFile(null)}
                  >
                    Remove
                  </button>
                </p>
              )}
              <input
                ref={fileInput}
                className="hidden"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={upload}
              />
              {attachmentOptions && (
                <label className="flex gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={isResource}
                    onChange={(e) => setResource(e.target.checked)}
                  />
                  Keep this message as a resource for dependent work
                </label>
              )}
              <div className="task-thread-post-actions">
                <Button type="submit" size="sm" disabled={!ready}>
                  {busy ? 'Posting…' : 'Post to team'}
                </Button>
                {isFounder && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!ready || !project?.telegramGroupChatId}
                    onClick={() => {
                      setShareMessage(null);
                      setRecipients([]);
                      setReview(true);
                    }}
                  >
                    Review and send
                  </Button>
                )}
              </div>
            </form>
          )}
        </SheetContent>
      </Sheet>
      <Dialog
        open={review}
        onOpenChange={(value) => {
          if (!busy) setReview(value);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Send this message to Telegram?</DialogTitle>
            <DialogDescription>
              Project: {project?.name}. Everyone in its Telegram group can see this message and
              attachment.
            </DialogDescription>
          </DialogHeader>
          <div className="whitespace-pre-wrap break-words card-box text-sm">
            {shareMessage ? (
              <TaskMessage message={shareMessage} namespace={namespace} />
            ) : (
              <>
                {draft}
                {link && <p>{link}</p>}
                {file && <p>File: {file.name}</p>}
              </>
            )}
          </div>
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium">Tag people (optional)</legend>
            {people
              .filter((person) => /^\d+$/.test(person.id))
              .map((person) => (
                <label key={person.id} className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={recipients.includes(person.id)}
                    onChange={(e) =>
                      setRecipients(
                        e.target.checked
                          ? [...recipients, person.id]
                          : recipients.filter((id) => id !== person.id),
                      )
                    }
                  />
                  {person.name} · {person.role}
                </label>
              ))}
          </fieldset>
          <p className="text-xs text-muted-foreground">
            This message also stays in the task thread. Earlier private messages are not sent.
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setReview(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => send(true)}>
              {busy ? 'Sending…' : 'Send to Telegram'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MeetingEditor
        open={meetingOpen}
        onOpenChange={setMeetingOpen}
        task={task}
        meeting={taskMeeting}
        onSaved={() => {
          request(`/api/${namespace}/meetings?projectId=${encodeURIComponent(task.projectId)}`)
            .then((data) =>
              setTaskMeeting(
                data.meetings.find((row) => row.taskId === task.id && row.status === 'Scheduled') ||
                  null,
              ),
            )
            .catch(() => {});
          onTaskUpdated?.();
        }}
      />
      <Dialog open={remove} onOpenChange={setRemove}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this task?</DialogTitle>
            <DialogDescription>
              The task will be removed from the active project plan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setRemove(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              variant="destructive"
              onClick={async () => {
                setBusy(true);
                try {
                  await deleteTask(task.id);
                  setRemove(false);
                  onOpenChange(false);
                  onTaskUpdated?.();
                } catch (problem) {
                  setError(problem.message);
                  setRemove(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Delete task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
