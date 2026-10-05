// frontend/src/components/TaskThreadDrawer.jsx
import React, { useEffect, useState, useRef } from "react";
import {
  Calendar, CheckCircle2, Clock, MessageSquare, Send, Trash2,
  User, AlertCircle, Check, Loader2, Link as LinkIcon, ExternalLink,
  Lock, RefreshCw
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  fetchTask, updateTask, deleteTask, fetchTaskMessages,
  sendTaskMessage, markTaskRead
} from "@/lib/api";

const statusColors = {
  "Open": "bg-slate-100 text-slate-800 border-slate-200",
  "In progress": "bg-blue-50 text-blue-700 border-blue-200",
  "Blocked": "bg-amber-50 text-amber-800 border-amber-200",
  "Completed": "bg-emerald-50 text-emerald-800 border-emerald-200",
  "Cancelled": "bg-red-50 text-red-700 border-red-200",
  // Backward compatibility with lowercase keys
  "todo": "bg-slate-100 text-slate-800 border-slate-200",
  "in_progress": "bg-blue-50 text-blue-700 border-blue-200",
  "review": "bg-amber-50 text-amber-800 border-amber-200",
  "completed": "bg-emerald-50 text-emerald-800 border-emerald-200",
  "cancelled": "bg-red-50 text-red-700 border-red-200"
};

export function TaskThreadDrawer({
  task: initialTask,
  project,
  open,
  onOpenChange,
  onTaskUpdated,
  onOpenSourceQuery,
  currentActor = "Founder",
  isFounder = true,
  projectMembers = []
}) {
  const [task, setTask] = useState(initialTask);
  const [messages, setMessages] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [showAttachmentInput, setShowAttachmentInput] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [savingEdits, setSavingEdits] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef(null);

  // Edit fields
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editStatus, setEditStatus] = useState("Open");
  const [editDeadline, setEditDeadline] = useState("");
  const [editAssigneeId, setEditAssigneeId] = useState("");
  const [editStageId, setEditStageId] = useState("");

  const namespace = isFounder ? "founder" : "employee";

  // Load task and messages when drawer opens
  useEffect(() => {
    if (open && initialTask?.id) {
      setTask(initialTask);
      setEditTitle(initialTask.title || "");
      setEditDesc(initialTask.description || "");
      setEditStatus(initialTask.status || "Open");
      setEditDeadline(initialTask.deadline || initialTask.dueDate || "");
      setEditAssigneeId(initialTask.assigneeId || "");
      setEditStageId(initialTask.stageId || "");
      setIsEditing(false);
      setError("");

      loadMessages(initialTask.id);
    }
  }, [open, initialTask?.id]);

  const loadMessages = async (taskId) => {
    setLoadingMessages(true);
    try {
      const data = await fetchTaskMessages(taskId, "", 100, namespace);
      const list = data.messages || [];
      setMessages(list);
      // Mark read position if messages exist
      if (list.length > 0) {
        markTaskRead(taskId, list[list.length - 1].id, namespace).catch(() => {});
      }
    } catch {
      // If messages endpoint returns empty or fails gracefully
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  if (!task) return null;

  const isClosed = task.status === "Completed" || task.status === "Cancelled";

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!commentText.trim() || sendingMessage || isClosed) return;

    setSendingMessage(true);
    setError("");
    try {
      const res = await sendTaskMessage(task.id, {
        text: commentText.trim(),
        attachmentUrl: attachmentUrl.trim() || undefined
      }, namespace);

      setCommentText("");
      setAttachmentUrl("");
      setShowAttachmentInput(false);
      if (res.message) {
        setMessages((prev) => [...prev, res.message]);
        markTaskRead(task.id, res.message.id, namespace).catch(() => {});
      } else {
        await loadMessages(task.id);
      }
      if (onTaskUpdated) onTaskUpdated();
    } catch (err) {
      setError(err.message || "Failed to send message.");
    } finally {
      setSendingMessage(false);
    }
  };

  const handleSaveEdits = async () => {
    setSavingEdits(true);
    setError("");
    try {
      const updates = {
        title: editTitle.trim(),
        description: editDesc.trim(),
        status: editStatus,
        deadline: editDeadline || undefined,
        stageId: editStageId || undefined
      };
      if (isFounder) {
        updates.assigneeId = editAssigneeId;
      }

      const res = await updateTask(task.id, updates, namespace);
      const updated = res.task || { ...task, ...updates };
      setTask(updated);
      setIsEditing(false);
      if (onTaskUpdated) onTaskUpdated();
    } catch (err) {
      setError(err.message || "Failed to save task changes.");
    } finally {
      setSavingEdits(false);
    }
  };

  const handleQuickStatus = async (newStatus) => {
    setError("");
    try {
      const res = await updateTask(task.id, { status: newStatus }, namespace);
      const updated = res.task || { ...task, status: newStatus };
      setTask(updated);
      setEditStatus(newStatus);
      if (onTaskUpdated) onTaskUpdated();
    } catch (err) {
      setError(err.message || "Failed to update task status.");
    }
  };

  const handleReopenTask = async () => {
    await handleQuickStatus("Open");
  };

  const handleDelete = async () => {
    if (!isFounder) return;
    if (confirm("Are you sure you want to delete this task? Soft deletion preserves audit history.")) {
      try {
        await deleteTask(task.id);
        onOpenChange(false);
        if (onTaskUpdated) onTaskUpdated();
      } catch (err) {
        setError(err.message || "Failed to delete task.");
      }
    }
  };

  const getAssigneeLabel = (id) => {
    if (!id) return "Unassigned";
    if (id === "founder") return "Founder";
    const found = projectMembers.find((m) => m.employeeId === id || m.id === id);
    return found ? `${found.name} (${found.role || "Member"})` : id;
  };

  const currentStageName = project?.stages?.find((s) => s.id === task.stageId)?.name || task.stageName || "General";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] w-full max-w-2xl overflow-hidden p-0 sm:rounded-2xl">
        {/* Header */}
        <div className="border-b bg-card px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={statusColors[task.status] || "bg-muted"}>
                  {task.status}
                </Badge>
                {currentStageName && (
                  <span className="text-xs text-muted-foreground">· {currentStageName}</span>
                )}
                {task.sourceQueryId && (
                  <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900 text-[10px]">
                    Telegram Query
                  </Badge>
                )}
              </div>
              <DialogTitle className="mt-2 text-lg font-semibold tracking-tight text-foreground">
                {task.title}
              </DialogTitle>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                variant={isEditing ? "secondary" : "outline"}
                size="sm"
                onClick={() => {
                  if (isEditing) handleSaveEdits();
                  else setIsEditing(true);
                }}
                disabled={savingEdits}
              >
                {savingEdits ? (
                  <Loader2 className="size-3.5 animate-spin mr-1" />
                ) : isEditing ? (
                  <Check className="size-3.5 mr-1 text-emerald-600" />
                ) : null}
                {isEditing ? "Save" : "Edit"}
              </Button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-3 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="chat-scroll max-h-[calc(92dvh-200px)] space-y-4 overflow-y-auto p-5">
          {/* Editing Mode */}
          {isEditing ? (
            <div className="space-y-3.5 rounded-xl border bg-muted/20 p-4">
              <label className="grid gap-1.5 text-xs font-semibold">
                Title
                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required />
              </label>

              <label className="grid gap-1.5 text-xs font-semibold">
                Description
                <Textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={3} />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5 text-xs font-semibold">
                  Status
                  <NativeSelect value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                    <option value="Open">Open</option>
                    <option value="In progress">In progress</option>
                    <option value="Blocked">Blocked</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </NativeSelect>
                </label>

                <label className="grid gap-1.5 text-xs font-semibold">
                  Deadline
                  <Input
                    type="date"
                    value={editDeadline}
                    onChange={(e) => setEditDeadline(e.target.value)}
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5 text-xs font-semibold">
                  Assignee
                  {isFounder ? (
                    <NativeSelect value={editAssigneeId} onChange={(e) => setEditAssigneeId(e.target.value)}>
                      <option value="">Unassigned</option>
                      <option value="founder">Founder</option>
                      {projectMembers.map((m) => (
                        <option key={m.id || m.employeeId} value={m.employeeId || m.id}>
                          {m.name} ({m.role || "Member"})
                        </option>
                      ))}
                    </NativeSelect>
                  ) : (
                    <Input
                      value={getAssigneeLabel(task.assigneeId)}
                      disabled
                      className="bg-muted text-muted-foreground text-xs"
                      title="Only the founder may change task assignments."
                    />
                  )}
                  {!isFounder && (
                    <span className="text-[10px] text-muted-foreground">Only founder can change assignee</span>
                  )}
                </label>

                {project?.stages && project.stages.length > 0 && (
                  <label className="grid gap-1.5 text-xs font-semibold">
                    Stage
                    <NativeSelect value={editStageId} onChange={(e) => setEditStageId(e.target.value)}>
                      {project.stages.map((st) => (
                        <option key={st.id} value={st.id}>{st.name}</option>
                      ))}
                    </NativeSelect>
                  </label>
                )}
              </div>

              <div className="flex justify-between items-center pt-2">
                {isFounder && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 text-xs"
                    onClick={handleDelete}
                  >
                    <Trash2 className="size-3.5 mr-1" /> Delete Task
                  </Button>
                )}
                <Button size="sm" onClick={handleSaveEdits} disabled={savingEdits} className="ml-auto">
                  {savingEdits ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
                  Save Changes
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Task Metadata Bar */}
              <div className="grid grid-cols-2 gap-2 rounded-xl border bg-muted/30 p-3 sm:grid-cols-3">
                <div className="space-y-0.5">
                  <span className="text-[11px] font-medium text-muted-foreground">Assignee</span>
                  <p className="flex items-center gap-1.5 text-xs font-semibold truncate">
                    <User className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{getAssigneeLabel(task.assigneeId) || task.assigneeName || "Unassigned"}</span>
                  </p>
                </div>

                <div className="space-y-0.5">
                  <span className="text-[11px] font-medium text-muted-foreground">Deadline</span>
                  <p className="flex items-center gap-1.5 text-xs font-semibold">
                    <Calendar className="size-3.5 text-muted-foreground shrink-0" />
                    <span>{task.deadline || task.dueDate ? new Date(task.deadline || task.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "No deadline"}</span>
                  </p>
                </div>

                <div className="col-span-2 sm:col-span-1 space-y-0.5">
                  <span className="text-[11px] font-medium text-muted-foreground">Quick Action</span>
                  <div>
                    {task.status !== "Completed" ? (
                      <Button
                        size="icon-sm"
                        variant="outline"
                        className="h-7 px-2.5 text-xs text-emerald-700 hover:bg-emerald-50 font-semibold"
                        onClick={() => handleQuickStatus("Completed")}
                      >
                        <CheckCircle2 className="size-3.5 mr-1" /> Mark Done
                      </Button>
                    ) : (
                      <Button
                        size="icon-sm"
                        variant="outline"
                        className="h-7 px-2.5 text-xs text-muted-foreground font-semibold"
                        onClick={() => handleQuickStatus("Open")}
                      >
                        Reopen Task
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Description */}
              {task.description && (
                <div className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed rounded-xl border bg-card p-3">
                  {task.description}
                </div>
              )}

              {/* Source client query link */}
              {task.sourceQueryId && (
                <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="size-4 shrink-0 text-amber-700" />
                    <span>Converted from Telegram client query</span>
                  </div>
                  {onOpenSourceQuery && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs border-amber-300 bg-white text-amber-900 hover:bg-amber-100/50"
                      onClick={() => onOpenSourceQuery(task.sourceQueryId)}
                    >
                      View Query <ExternalLink className="size-3 ml-1" />
                    </Button>
                  )}
                </div>
              )}
            </>
          )}

          {/* Discussion Thread Section */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between pb-3">
              <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <MessageSquare className="size-3.5 text-primary" />
                Task Discussion Thread ({messages.length})
              </h4>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => loadMessages(task.id)}
                disabled={loadingMessages}
                aria-label="Refresh thread"
              >
                <RefreshCw className={`size-3.5 ${loadingMessages ? "animate-spin" : ""}`} />
              </Button>
            </div>

            {loadingMessages && messages.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-xs text-muted-foreground gap-2">
                <Loader2 className="size-4 animate-spin text-primary" />
                <span>Loading messages…</span>
              </div>
            ) : messages.length > 0 ? (
              <div className="space-y-2.5">
                {messages.map((msg) => (
                  <div key={msg.id} className="rounded-xl border bg-card p-3 shadow-xs space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-primary">{msg.author || "Team member"}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(msg.at).toLocaleDateString([], { month: "short", day: "numeric" })} · {new Date(msg.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed">
                      {msg.text}
                    </p>
                    {msg.attachmentUrl && (
                      <a
                        href={msg.attachmentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border bg-muted/40 px-2.5 py-1 text-xs text-primary hover:underline"
                      >
                        <LinkIcon className="size-3" />
                        <span className="truncate max-w-xs">{msg.attachmentUrl}</span>
                        <ExternalLink className="size-2.5" />
                      </a>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            ) : (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No discussion messages yet in this task thread.
              </p>
            )}
          </div>
        </div>

        {/* Message Input Footer / Reopen Banner */}
        {isClosed ? (
          <div className="flex items-center justify-between gap-3 border-t bg-amber-50/70 p-3 sm:px-5 text-xs text-amber-900">
            <span className="flex items-center gap-1.5">
              <Lock className="size-3.5 text-amber-700 shrink-0" />
              This task is {task.status.toLowerCase()}. Reopen it to send new messages.
            </span>
            <Button size="sm" variant="outline" className="border-amber-300 bg-white" onClick={handleReopenTask}>
              Reopen Task
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSendMessage} className="space-y-2 border-t bg-muted/20 p-3 sm:px-5">
            {showAttachmentInput && (
              <div className="flex items-center gap-2">
                <Input
                  value={attachmentUrl}
                  onChange={(e) => setAttachmentUrl(e.target.value)}
                  placeholder="https://... attachment or document URL (HTTPS)"
                  className="h-8 text-xs font-mono"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-muted-foreground"
                  onClick={() => {
                    setAttachmentUrl("");
                    setShowAttachmentInput(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}

            <div className="flex items-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={`size-9 shrink-0 ${showAttachmentInput ? "text-primary" : "text-muted-foreground"}`}
                onClick={() => setShowAttachmentInput((v) => !v)}
                title="Add attachment link"
              >
                <LinkIcon className="size-4" />
              </Button>

              <Textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                rows={1}
                maxLength={2000}
                placeholder="Post team update or task comment…"
                className="min-h-9 max-h-24 flex-1 resize-none text-xs"
                disabled={sendingMessage}
              />

              <Button
                type="submit"
                size="icon"
                disabled={!commentText.trim() || sendingMessage}
                className="size-9 shrink-0"
              >
                {sendingMessage ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
