import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ProjectFiles } from "@/components/ProjectFiles";
import { MeetingEditor } from "@/components/MeetingEditor";
import {
  request,
  updateTask,
  deleteTask,
  fetchTaskMessages,
  markTaskRead,
  getAttachmentUrl,
} from "@/lib/api";

export function TaskMessage({ message, namespace = "founder" }) {
  return (
    <article className="space-y-2 rounded-xl border bg-card p-3 text-sm">
      <div className="flex justify-between gap-2 text-xs">
        <strong>{message.author}</strong>
        <time>{new Date(message.at).toLocaleString()}</time>
      </div>
      {message.text && (
        <p className="whitespace-pre-wrap break-words">{message.text}</p>
      )}
      {message.isResource && (
        <p className="text-xs text-primary">
          Marked as a resource for dependent work
        </p>
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
            {file.type.startsWith("image/") && (
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
                  alt={file.fileName || "Query photo"}
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
          {message.telegram.error ? " — " + message.telegram.error : ""}
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
}) {
  const namespace = isFounder ? "founder" : "employee";
  const [task, setTask] = useState(initialTask),
    [messages, setMessages] = useState([]),
    [resources, setResources] = useState([]),
    [people, setPeople] = useState([]),
    [draft, setDraft] = useState(""),
    [link, setLink] = useState(""),
    [file, setFile] = useState(null),
    [isResource, setResource] = useState(false),
    [error, setError] = useState(""),
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
      const data = await fetchTaskMessages(
        taskId,
        append ? cursor : "",
        100,
        namespace,
      );
      if (current !== version.current) return;
      setMessages((previous) =>
        append ? [...previous, ...data.messages] : data.messages,
      );
      setCursor(data.pagination?.nextCursor || null);
      if (data.messages.length)
        await markTaskRead(taskId, data.messages.at(-1).id, namespace);
      const reference = await request(
        `/api/${namespace}/tasks/${taskId}/resources`,
      );
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
    setDraft("");
    setLink("");
    setFile(null);
    setResource(false);
    setEditing(false);
    setReview(false);
    setShareMessage(null);
    setRecipients([]);
    setMeetingOpen(false);
    setTaskMeeting(null);
    request(
      `/api/${namespace}/meetings?projectId=${encodeURIComponent(initialTask.projectId)}`,
    )
      .then((data) => {
        if (current === version.current)
          setTaskMeeting(
            data.meetings.find(
              (row) =>
                row.taskId === initialTask.id && row.status === "Scheduled",
            ) || null,
          );
      })
      .catch(() => {});
    setRemove(false);
    setError("");
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
  const closed = ["Completed", "Cancelled"].includes(task.status),
    projectClosed = ["Completed", "Abandoned"].includes(project?.status);
  const upload = async (event) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      if (selected.size > 5 * 1024 * 1024)
        throw Error("Choose a file up to 5 MB.");
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(selected);
      });
      const result = await request(`/api/${namespace}/tasks/${task.id}/files`, {
        method: "POST",
        body: { name: selected.name, type: selected.type, data },
      });
      setFile(result.file);
    } catch (problem) {
      setError(problem.message || "Could not upload this file.");
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  };
  const send = async (publish) => {
    setBusy(true);
    setError("");
    let posted = false;
    try {
      let message = shareMessage;
      if (!message) {
        const result = await request(
          `/api/${namespace}/tasks/${task.id}/messages`,
          {
            method: "POST",
            body: {
              text: draft,
              attachmentUrl: link,
              fileIds: file ? [file.id] : [],
              isResource,
              clientKey: key.current,
            },
          },
        );
        message = result.message;
        posted = true;
        setMessages((previous) => [
          ...previous.filter((row) => row.id !== message.id),
          message,
        ]);
      }
      if (publish) {
        const shared = await request(
          `/api/founder/tasks/${task.id}/messages/${message.id}/publish`,
          { method: "POST", body: { confirm: true, recipientIds: recipients } },
        );
        message = shared.message;
      }
      setMessages((previous) => [
        ...previous.filter((row) => row.id !== message.id),
        message,
      ]);
      if (!shareMessage) {
        setDraft("");
        setLink("");
        setFile(null);
        setResource(false);
        key.current = crypto.randomUUID();
      }
      setReview(false);
      setShareMessage(null);
      onTaskUpdated?.();
    } catch (problem) {
      setError(
        (posted ? "Saved internally. Telegram was not sent: " : "") +
          problem.message,
      );
    } finally {
      setBusy(false);
    }
  };
  const changeTask = async (updates) => {
    setBusy(true);
    setError("");
    try {
      const result = await updateTask(task.id, updates, "founder");
      setTask(result.task);
      setEditing(false);
      onTaskUpdated?.();
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  };
  const ready =
    Boolean(draft.trim() || link.trim() || file) &&
    !busy &&
    !closed &&
    !projectClosed;
  const startEdit = () => {
    setFields({
      title: task.title,
      description: task.description || "",
      status: task.status,
      deadline: task.deadline || "",
      assigneeId: task.assigneeId || "",
      stageId: task.stageId || "",
    });
    setEditing(true);
  };
  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) onOpenChange(value);
        }}
      >
        <DialogContent className="flex max-h-[92dvh] flex-col overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{task.title}</DialogTitle>
            <DialogDescription>
              {project?.stages?.find((row) => row.id === task.stageId)?.name ||
                "Task workspace"}{" "}
              · {task.status} · Due {task.deadline || "not set"}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => load()}
              >
                Refresh discussion
              </Button>
              {isFounder && !projectClosed && (
                <>
                  <Button variant="outline" size="sm" onClick={startEdit}>
                    Edit task
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      changeTask({ status: closed ? "Open" : "Completed" })
                    }
                  >
                    {closed ? "Reopen task" : "Mark task complete"}
                  </Button>
                  {!closed && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setMeetingOpen(true)}
                    >
                      {taskMeeting ? "Edit meeting" : "Schedule meeting"}
                    </Button>
                  )}
                </>
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
            </div>
            {!isFounder && (
              <p className="text-xs text-muted-foreground">
                View the whole project and contribute to discussions. Founders
                manage task details and approvals.
              </p>
            )}
            {editing && isFounder && (
              <form
                className="space-y-3 rounded-xl border p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  changeTask(fields);
                }}
              >
                <label className="grid gap-1 text-xs">
                  Task title
                  <Input
                    required
                    maxLength={200}
                    value={fields.title}
                    onChange={(e) =>
                      setFields({ ...fields, title: e.target.value })
                    }
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  Description
                  <Textarea
                    maxLength={10000}
                    value={fields.description}
                    onChange={(e) =>
                      setFields({ ...fields, description: e.target.value })
                    }
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1 text-xs">
                    Status
                    <select
                      value={fields.status}
                      onChange={(e) =>
                        setFields({ ...fields, status: e.target.value })
                      }
                    >
                      {[
                        "Open",
                        "In progress",
                        "Blocked",
                        "Completed",
                        "Cancelled",
                      ].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs">
                    Deadline
                    <Input
                      type="date"
                      value={fields.deadline}
                      onChange={(e) =>
                        setFields({ ...fields, deadline: e.target.value })
                      }
                    />
                  </label>
                  <label className="grid gap-1 text-xs">
                    Assignee
                    <select
                      value={fields.assigneeId}
                      onChange={(e) =>
                        setFields({ ...fields, assigneeId: e.target.value })
                      }
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
                  <label className="grid gap-1 text-xs">
                    Stage
                    <select
                      value={fields.stageId}
                      onChange={(e) =>
                        setFields({ ...fields, stageId: e.target.value })
                      }
                    >
                      <option value="">General</option>
                      {project?.stages?.map((stage) => (
                        <option key={stage.id} value={stage.id}>
                          {stage.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={busy}>Save task</Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditing(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setRemove(true)}
                  >
                    Delete task
                  </Button>
                </div>
              </form>
            )}
            {task.description && (
              <p className="whitespace-pre-wrap rounded-lg bg-muted/30 p-3 text-sm">
                {task.description}
              </p>
            )}
            {task.sourceBlockedReason && (
              <p className="text-xs text-amber-800">
                Blocked: {task.sourceBlockedReason}
              </p>
            )}
            {task.sourceApprovalStatus && (
              <p className="text-xs">Approval: {task.sourceApprovalStatus}</p>
            )}
            {resources.length > 0 && (
              <details className="rounded-xl border p-3">
                <summary className="text-sm font-medium">
                  Resources from preceding work · {resources.length}
                </summary>
                <div className="space-y-3 pt-3">
                  {resources.map((row) => (
                    <section key={row.task.id} className="space-y-2">
                      <h4 className="text-sm font-semibold">
                        {row.task.title} · {row.task.status}
                      </h4>
                      {row.messages.map((message) => (
                        <TaskMessage
                          key={message.id}
                          message={message}
                          namespace={namespace}
                        />
                      ))}
                    </section>
                  ))}
                </div>
              </details>
            )}
            {project?.id && (
              <details className="rounded-xl border p-3">
                <summary className="text-sm">Shared project resources</summary>
                <ProjectFiles projectId={project.id} namespace={namespace} />
              </details>
            )}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">
                Task discussion · {messages.length}
                {cursor ? "+" : ""}
              </h3>
              {messages.map((message) => (
                <div key={message.id} className="space-y-1">
                  <TaskMessage message={message} namespace={namespace} />
                  {isFounder &&
                    !projectClosed &&
                    project?.telegramGroupChatId &&
                    !message.queryId &&
                    (!message.telegram ||
                      message.telegram.status === "Failed") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setShareMessage(message);
                          setRecipients([]);
                          setReview(true);
                        }}
                      >
                        Review & send this message to Telegram
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
                <p className="text-sm text-muted-foreground">
                  {loading ? "Loading discussion…" : "No messages yet."}
                </p>
              )}
            </section>
          </div>
          {closed || projectClosed ? (
            <p className="border-t pt-3 text-xs text-muted-foreground">
              This task is closed. A founder can reopen it to continue the
              discussion.
            </p>
          ) : (
            <form
              className="shrink-0 space-y-2 border-t pt-3"
              onSubmit={(event) => {
                event.preventDefault();
                send(false);
              }}
            >
              <Textarea
                aria-label="Task comment"
                value={draft}
                maxLength={2000}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Write an internal message or describe the attached file…"
                rows={2}
              />
              <Input
                aria-label="Attachment link"
                value={link}
                maxLength={2048}
                onChange={(e) => setLink(e.target.value)}
                placeholder="Optional HTTPS reference link"
              />
              {file && (
                <p className="text-xs">
                  Attached: {file.name}{" "}
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
              <label className="flex gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={isResource}
                  onChange={(e) => setResource(e.target.checked)}
                />
                Keep this message as a resource for dependent work
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => fileInput.current?.click()}
                >
                  Attach image or PDF
                </Button>
                <Button type="submit" size="sm" disabled={!ready}>
                  {busy ? "Saving…" : "Post internally"}
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
                    Review & send to Telegram
                  </Button>
                )}
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
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
              Project: {project?.name}. Everyone in its Telegram group can see
              this message and attachment.
            </DialogDescription>
          </DialogHeader>
          <div className="whitespace-pre-wrap break-words rounded-lg border p-3 text-sm">
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
            <legend className="text-xs font-medium">
              Tag people (optional)
            </legend>
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
            This message also stays in the task thread. Earlier private messages
            are not sent.
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button disabled={busy} onClick={() => send(true)}>
            {busy ? "Sending…" : "Confirm & send to Telegram"}
          </Button>
        </DialogContent>
      </Dialog>
      <MeetingEditor
        open={meetingOpen}
        onOpenChange={setMeetingOpen}
        task={task}
        meeting={taskMeeting}
        onSaved={() => {
          request(
            `/api/${namespace}/meetings?projectId=${encodeURIComponent(task.projectId)}`,
          )
            .then((data) =>
              setTaskMeeting(
                data.meetings.find(
                  (row) => row.taskId === task.id && row.status === "Scheduled",
                ) || null,
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
        </DialogContent>
      </Dialog>
    </>
  );
}
