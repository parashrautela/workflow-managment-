// frontend/src/components/ClientQueryCard.jsx
import React, { useState } from "react";
import {
  AlertCircle, ArrowRight, CheckCircle2, ChevronDown, ChevronUp,
  Clock, ExternalLink, FileText, MessageSquare, Send, Sparkles, Plus,
  Share2, ShieldCheck, Check, Loader2, RefreshCw, XCircle, AlertTriangle
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  addDecisionComment, approveDecisionRequest, rejectDecisionRequest,
  convertDecisionRequest, publishDecisionReply, getAttachmentUrl,
  generateIdempotencyKey
} from "@/lib/api";

export function ClientQueryCard({
  query,
  project,
  onQueryChanged,
  onTaskCreated,
  onOpenTask,
  stages = [],
  projectMembers = [],
  isFounder = true
}) {
  const [expanded, setExpanded] = useState(false);
  const [internalCommentDraft, setInternalCommentDraft] = useState("");
  const [responseDraft, setResponseDraft] = useState(query.response || "");
  const [mode, setMode] = useState("discuss"); // 'discuss' | 'finalize'
  const [convertModalOpen, setConvertModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  // Convert task fields
  const [taskTitle, setTaskTitle] = useState(query.originalMessage || query.context || "Client query follow-up");
  const [taskDesc, setTaskDesc] = useState(`Telegram client query from ${query.originalSenderName || "Client"}:\n"${query.originalMessage || ""}"`);
  const [taskStageId, setTaskStageId] = useState(stages[0]?.id || "");
  const [taskAssigneeId, setTaskAssigneeId] = useState("founder");
  const [taskDeadline, setTaskDeadline] = useState("");

  const [busyAction, setBusyAction] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const namespace = isFounder ? "founder" : "employee";

  // Status mapping
  const isDone = query.status === "Done";
  const isPublished = query.status === "Published" || query.deliveryStatus === "Sent";
  const isRejected = query.status === "Rejected" || query.decisionStatus === "Rejected";
  const isApproved = query.status === "Approved" || query.decisionStatus === "Approved";
  const hasLinkedTask = Boolean(query.taskId);

  // Delivery status: 'Sending', 'Sent', 'Failed', 'Unknown'
  const deliveryStatus = query.deliveryStatus || (isPublished ? "Sent" : "");

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!internalCommentDraft.trim() || busyAction) return;

    setBusyAction("comment");
    setErrorMessage("");
    try {
      await addDecisionComment(query.id, internalCommentDraft.trim(), namespace);
      setInternalCommentDraft("");
      if (onQueryChanged) onQueryChanged();
    } catch (err) {
      setErrorMessage(err.message || "Failed to post comment.");
    } finally {
      setBusyAction("");
    }
  };

  const handleApprove = async () => {
    if (!isFounder || busyAction) return;
    setBusyAction("approve");
    setErrorMessage("");
    try {
      await approveDecisionRequest(query.id);
      setSuccessMessage("Query approved.");
      setTimeout(() => setSuccessMessage(""), 3000);
      if (onQueryChanged) onQueryChanged();
    } catch (err) {
      setErrorMessage(err.message || "Failed to approve query.");
    } finally {
      setBusyAction("");
    }
  };

  const handleReject = async (e) => {
    e.preventDefault();
    if (!isFounder || !rejectReason.trim() || busyAction) return;

    setBusyAction("reject");
    setErrorMessage("");
    try {
      await rejectDecisionRequest(query.id, rejectReason.trim());
      setRejectModalOpen(false);
      setRejectReason("");
      setSuccessMessage("Query marked as rejected.");
      setTimeout(() => setSuccessMessage(""), 3000);
      if (onQueryChanged) onQueryChanged();
    } catch (err) {
      setErrorMessage(err.message || "Failed to reject query.");
    } finally {
      setBusyAction("");
    }
  };

  const handlePublish = async (isRetry = false) => {
    if (!isFounder || busyAction) return;
    const textToPublish = responseDraft.trim();
    if (!textToPublish) {
      setErrorMessage("Please enter the response message to send to Telegram.");
      return;
    }

    setBusyAction("publish");
    setErrorMessage("");
    try {
      const idempotencyKey = generateIdempotencyKey(`pub-${query.id}`);
      await publishDecisionReply(query.id, {
        response: textToPublish,
        idempotencyKey
      });
      setSuccessMessage("Reply published to Telegram group successfully!");
      setTimeout(() => setSuccessMessage(""), 4000);
      if (onQueryChanged) onQueryChanged();
    } catch (err) {
      setErrorMessage(err.message || "Failed to publish reply to Telegram.");
    } finally {
      setBusyAction("");
    }
  };

  const handleConvert = async (e) => {
    e.preventDefault();
    if (!isFounder || !taskTitle.trim() || busyAction) return;

    setBusyAction("convert");
    setErrorMessage("");
    try {
      const res = await convertDecisionRequest(query.id, {
        title: taskTitle.trim(),
        description: taskDesc.trim(),
        stageId: taskStageId || undefined,
        assigneeId: taskAssigneeId || undefined,
        deadline: taskDeadline || undefined,
        status: "Open"
      });
      setConvertModalOpen(false);
      setSuccessMessage("Task created from client query!");
      setTimeout(() => setSuccessMessage(""), 3000);
      if (onTaskCreated && res.task) onTaskCreated(res.task);
      if (onQueryChanged) onQueryChanged();
    } catch (err) {
      setErrorMessage(err.message || "Failed to convert query to task.");
    } finally {
      setBusyAction("");
    }
  };

  // Safe attachments array
  let attachments = [];
  try {
    if (Array.isArray(query.attachments)) {
      attachments = query.attachments;
    } else if (query.AttachmentsJSON) {
      attachments = JSON.parse(query.AttachmentsJSON);
    }
  } catch {
    attachments = [];
  }

  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-card transition-all ${
        isPublished
          ? "border-emerald-300/80 shadow-2xs"
          : isRejected
          ? "border-destructive/30 bg-card/60"
          : isDone
          ? "border-muted"
          : "border-amber-300/80 shadow-xs"
      }`}
    >
      {/* Top Banner / Status Line */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">
            TG
          </span>
          <span className="font-semibold text-foreground">{query.originalSenderName || "Client"}</span>
          <span className="text-muted-foreground">via Telegram</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">
            {new Date(query.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })} · {new Date(query.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {hasLinkedTask && (
            <Badge variant="outline" className="border-indigo-300 bg-indigo-50 text-indigo-800 text-[10px]">
              Task Linked
            </Badge>
          )}

          {deliveryStatus === "Sent" && (
            <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800 text-[10px]">
              <Check className="size-3 mr-1" /> Published to Telegram
            </Badge>
          )}

          {deliveryStatus === "Failed" && (
            <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive text-[10px]">
              <XCircle className="size-3 mr-1" /> Delivery Failed
            </Badge>
          )}

          {deliveryStatus === "Unknown" && (
            <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-900 text-[10px]">
              <AlertTriangle className="size-3 mr-1" /> Delivery Unknown
            </Badge>
          )}

          {deliveryStatus === "Sending" && (
            <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-800 text-[10px]">
              <Loader2 className="size-3 mr-1 animate-spin" /> Sending…
            </Badge>
          )}

          {isRejected && (
            <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive text-[10px]">
              Rejected
            </Badge>
          )}

          {isApproved && !isPublished && (
            <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800 text-[10px]">
              Approved
            </Badge>
          )}

          {!isPublished && !isRejected && !isApproved && (
            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900 text-[10px]">
              <Clock className="size-3 mr-1" /> Needs Action
            </Badge>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-4 sm:p-5 space-y-3">
        {errorMessage && (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-2.5 text-xs text-emerald-800">
            <Check className="size-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium leading-relaxed text-foreground whitespace-pre-wrap">
            {query.originalMessage || "Client sent an attachment or query requiring project team input."}
          </p>

          {query.context && (
            <div className="rounded-xl border border-amber-200/70 bg-amber-50/50 p-2.5 text-xs text-amber-900">
              <span className="font-semibold">Context: </span>
              {query.context}
            </div>
          )}

          {query.reviewNote && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-2.5 text-xs text-destructive">
              <span className="font-semibold">Rejection reason: </span>
              {query.reviewNote}
            </div>
          )}

          {/* Photo & Attachments Section */}
          {attachments.length > 0 && (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap gap-3">
                {attachments.map((att, idx) => {
                  const mediaUrl = getAttachmentUrl(query.id, idx, namespace);
                  const isPhoto = att.type === "Photo" || /\.(png|jpe?g|webp|gif)$/i.test(att.fileName || "");

                  return (
                    <div key={idx} className="space-y-1.5">
                      {isPhoto ? (
                        <div className="group relative overflow-hidden rounded-xl border bg-muted/20">
                          <img
                            src={mediaUrl}
                            alt={att.fileName || `Attachment ${idx + 1}`}
                            className="max-h-56 max-w-full rounded-xl object-contain transition-transform group-hover:scale-102"
                            onError={(e) => {
                              // If image loading fails, replace with fallback box
                              e.currentTarget.style.display = "none";
                            }}
                          />
                          <a
                            href={mediaUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline px-1"
                          >
                            <FileText className="size-3" />
                            <span>{att.fileName || `Photo ${idx + 1}`}</span>
                            <ExternalLink className="size-2.5" />
                          </a>
                        </div>
                      ) : (
                        <a
                          href={mediaUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border bg-muted/50 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-muted"
                        >
                          <FileText className="size-3.5" />
                          <span className="truncate max-w-[200px]">{att.fileName || att.type || `Document ${idx + 1}`}</span>
                          <ExternalLink className="size-3" />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Action Toolbar */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setExpanded(!expanded)}
            >
              <MessageSquare className="size-3.5 mr-1 text-primary" />
              Discuss in Thread ({(query.comments?.length || 0)})
              {expanded ? <ChevronUp className="size-3.5 ml-1" /> : <ChevronDown className="size-3.5 ml-1" />}
            </Button>

            {hasLinkedTask && onOpenTask ? (
              <Button
                variant="outline"
                size="sm"
                className="text-xs text-indigo-700 border-indigo-200 hover:bg-indigo-50"
                onClick={() => onOpenTask(query.taskId)}
              >
                View Linked Task <ArrowRight className="size-3 ml-1" />
              </Button>
            ) : isFounder && !isRejected && !isDone && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs text-indigo-700 hover:bg-indigo-50"
                onClick={() => setConvertModalOpen(true)}
              >
                <Plus className="size-3.5 mr-1" /> Convert to Task
              </Button>
            )}
          </div>

          {/* Founder Decision Controls */}
          {isFounder && !isDone && !isPublished && (
            <div className="flex flex-wrap items-center gap-1.5">
              {!isApproved && !isRejected && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                    disabled={busyAction === "approve"}
                    onClick={handleApprove}
                  >
                    {busyAction === "approve" ? <Loader2 className="size-3 animate-spin mr-1" /> : <Check className="size-3.5 mr-1" />}
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => setRejectModalOpen(true)}
                  >
                    Reject…
                  </Button>
                </>
              )}

              <Button
                size="sm"
                className="text-xs"
                onClick={() => {
                  setExpanded(true);
                  setMode("finalize");
                }}
              >
                Finalize &amp; Reply <ArrowRight className="size-3.5 ml-1" />
              </Button>
            </div>
          )}
        </div>

        {/* Expandable Discussion & Finalization Thread */}
        {expanded && (
          <div className="mt-4 space-y-4 rounded-xl border bg-muted/20 p-4">
            {/* Step Progression Indicators */}
            <div className="flex items-center justify-between border-b pb-3 text-xs">
              <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                Workflow: Discuss Internally → Finalize &amp; Send
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setMode("discuss")}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    mode === "discuss" ? "bg-amber-100 text-amber-900 font-semibold" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  Internal Discussion
                </button>
                {isFounder && (
                  <button
                    type="button"
                    onClick={() => setMode("finalize")}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      mode === "finalize" ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    Final Reply (Telegram)
                  </button>
                )}
              </div>
            </div>

            {/* Mode 1: Internal Discussion Thread */}
            {mode === "discuss" && (
              <div className="space-y-3">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5 text-primary shrink-0" />
                  Internal discussion is private to your team and is never sent to Telegram.
                </p>

                <div className="space-y-2">
                  {query.comments && query.comments.length > 0 ? (
                    query.comments.map((c, i) => (
                      <div key={c.id || i} className="rounded-lg border bg-card p-3 text-xs shadow-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-primary">{c.author || "Team member"}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(c.at).toLocaleDateString([], { month: "short", day: "numeric" })} · {new Date(c.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                          </span>
                        </div>
                        <p className="text-foreground/90 whitespace-pre-wrap">{c.text}</p>
                      </div>
                    ))
                  ) : (
                    <p className="py-2 text-center text-xs text-muted-foreground">
                      No internal notes recorded yet. Add your thoughts or review before finalizing.
                    </p>
                  )}
                </div>

                <form onSubmit={handleAddComment} className="flex gap-2 pt-2">
                  <Input
                    value={internalCommentDraft}
                    onChange={(e) => setInternalCommentDraft(e.target.value)}
                    placeholder="Add private team note or internal review…"
                    className="h-9 text-xs"
                    disabled={busyAction === "comment"}
                  />
                  <Button type="submit" size="sm" disabled={!internalCommentDraft.trim() || busyAction === "comment"}>
                    {busyAction === "comment" ? <Loader2 className="size-3 animate-spin mr-1" /> : <Send className="size-3.5 mr-1" />}
                    Note
                  </Button>
                </form>
              </div>
            )}

            {/* Mode 2: Finalize & Publish to Telegram (Founder only) */}
            {mode === "finalize" && isFounder && (
              <div className="space-y-3">
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-primary-foreground">
                  <p className="font-semibold text-primary">Public Telegram Reply</p>
                  <p className="text-[11px] text-muted-foreground">
                    This message will be sent back directly to the project Telegram group in reply to the client.
                  </p>
                </div>

                {deliveryStatus === "Unknown" && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
                    <p className="font-bold flex items-center gap-1.5">
                      <AlertTriangle className="size-4 text-amber-700" />
                      Delivery Status Unknown
                    </p>
                    <p>
                      The previous attempt interrupted or timed out. Telegram delivery is not guaranteed to be idempotent.
                      <strong> Check the Telegram group manually before sending again; do not retry automatically.</strong>
                    </p>
                  </div>
                )}

                {deliveryStatus === "Failed" && (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive space-y-1">
                    <p className="font-bold">Telegram Send Failed</p>
                    <p>{query.deliveryError || "The message was rejected by Telegram. You may retry."}</p>
                  </div>
                )}

                <Textarea
                  value={responseDraft}
                  onChange={(e) => setResponseDraft(e.target.value)}
                  rows={3}
                  maxLength={3000}
                  placeholder="Type the official answer / resolution for the client here…"
                  className="text-xs"
                  disabled={busyAction === "publish" || isPublished}
                />

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <span className="text-[11px] text-muted-foreground">
                    {isPublished ? "Reply has been sent." : "One successful reply per query."}
                  </span>

                  {!isPublished && (
                    <Button
                      size="sm"
                      className="text-xs bg-primary"
                      disabled={busyAction === "publish" || !responseDraft.trim() || deliveryStatus === "Unknown"}
                      onClick={() => handlePublish(deliveryStatus === "Failed")}
                    >
                      {busyAction === "publish" ? (
                        <>
                          <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                          Publishing to Telegram…
                        </>
                      ) : (
                        <>
                          <Send className="size-3.5 mr-1.5" />
                          {deliveryStatus === "Failed" ? "Retry Publish" : "Publish Reply to Telegram"}
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Convert Query to Task Modal */}
      <Dialog open={convertModalOpen} onOpenChange={setConvertModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert Client Query to Task</DialogTitle>
            <DialogDescription>
              Create an actionable internal task in this project linked to this client inquiry.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConvert} className="space-y-4">
            <label className="grid gap-1.5 text-xs font-semibold">
              Task Title
              <Input
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                required
              />
            </label>

            <label className="grid gap-1.5 text-xs font-semibold">
              Description
              <Textarea
                value={taskDesc}
                onChange={(e) => setTaskDesc(e.target.value)}
                rows={3}
              />
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-xs font-semibold">
                Project Stage
                <NativeSelect
                  value={taskStageId}
                  onChange={(e) => setTaskStageId(e.target.value)}
                  className="w-full"
                >
                  {stages.map((st) => (
                    <option key={st.id} value={st.id}>{st.name}</option>
                  ))}
                  {!stages.length && <option value="">General</option>}
                </NativeSelect>
              </label>

              <label className="grid gap-1.5 text-xs font-semibold">
                Assignee
                <NativeSelect
                  value={taskAssigneeId}
                  onChange={(e) => setTaskAssigneeId(e.target.value)}
                  className="w-full"
                >
                  <option value="founder">Founder</option>
                  {projectMembers.map((m) => (
                    <option key={m.id || m.employeeId} value={m.employeeId || m.id}>
                      {m.name} ({m.role || "Member"})
                    </option>
                  ))}
                </NativeSelect>
              </label>
            </div>

            <label className="grid gap-1.5 text-xs font-semibold">
              Deadline
              <Input
                type="date"
                value={taskDeadline}
                onChange={(e) => setTaskDeadline(e.target.value)}
              />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setConvertModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busyAction === "convert"}>
                {busyAction === "convert" ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : null}
                Create Project Task
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reject Query Modal */}
      <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Client Request</DialogTitle>
            <DialogDescription>
              Provide an internal reason for rejecting this client request (e.g. Out of scope, Duplicate).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleReject} className="space-y-4">
            <label className="grid gap-1.5 text-xs font-semibold">
              Reason
              <Input
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Outside contracted scope"
                required
              />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setRejectModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={busyAction === "reject"}>
                {busyAction === "reject" ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : null}
                Confirm Rejection
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
