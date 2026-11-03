import { needsQueryAttention, queryStatusLabel } from '@/features/queries/lib/queryStatus';
// frontend/src/components/ClientQueryCard.jsx
import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  FileText,
  MessageSquare,
  Send,
  Sparkles,
  Plus,
  Share2,
  ShieldCheck,
  Check,
  Loader2,
  RefreshCw,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { SuggestReply } from '@/features/queries/SuggestReply';
import {
  QueryAcceptWizard,
  QueryDecisionButtons,
  QueryOutcome,
  QueryRejectDialog,
} from '@/features/queries/QueryDecisionDialogs';
import {
  addDecisionComment,
  approveDecisionRequest,
  rejectDecisionRequest,
  convertDecisionRequest,
  publishDecisionReply,
  getAttachmentUrl,
  generateIdempotencyKey,
} from '@/lib/api';
import { Time } from '@/components/ui/time';
import { SegmentedControl } from '@/components/ui/segmented-control';

export function ClientQueryCard({
  query,
  project,
  onQueryChanged,
  onTaskCreated,
  onOpenTask,
  stages = [],
  projectMembers = [],
  isFounder = true,
}) {
  const [expanded, setExpanded] = useState(false);
  const [showHandled, setShowHandled] = useState(false);
  const [internalCommentDraft, setInternalCommentDraft] = useState('');
  const [responseDraft, setResponseDraft] = useState(query.response || '');
  const [mode, setMode] = useState('discuss'); // 'discuss' | 'finalize'
  const [convertModalOpen, setConvertModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [publishReview, setPublishReview] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  // Convert task fields
  const [taskTitle, setTaskTitle] = useState(
    query.originalMessage || query.context || 'Client query follow-up',
  );
  const [taskDesc, setTaskDesc] = useState(
    `Telegram client query from ${query.originalSenderName || 'Client'}:\n"${query.originalMessage || ''}"`,
  );
  const [taskStageId, setTaskStageId] = useState(stages[0]?.id || '');
  const [taskAssigneeId, setTaskAssigneeId] = useState('founder');
  const [taskDeadline, setTaskDeadline] = useState('');

  const [busyAction, setBusyAction] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const namespace = isFounder ? 'founder' : 'employee';

  // Status mapping
  const isDone = query.status === 'Done';
  const isPublished = query.status === 'Published' || query.deliveryStatus === 'Sent';
  const isRejected = query.status === 'Rejected' || query.decisionStatus === 'Rejected';
  const isApproved = query.status === 'Approved' || query.decisionStatus === 'Approved';
  const hasLinkedTask = Boolean(query.taskId);

  // Delivery status: 'Sending', 'Sent', 'Failed', 'Unknown'
  const deliveryStatus = query.deliveryStatus || (isPublished ? 'Sent' : '');

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!internalCommentDraft.trim() || busyAction) return;

    setBusyAction('comment');
    setErrorMessage('');
    try {
      await addDecisionComment(query.id, internalCommentDraft.trim(), namespace);
      setInternalCommentDraft('');
      if (onQueryChanged) onQueryChanged();
    } catch (err) {
      setErrorMessage(err.message || 'Failed to post comment.');
    } finally {
      setBusyAction('');
    }
  };

  const handleApprove = async () => {
    if (!isFounder || busyAction) return;
    setBusyAction('approve');
    setErrorMessage('');
    try {
      await approveDecisionRequest(query.id);
      setSuccessMessage('Query approved.');
      setTimeout(() => setSuccessMessage(''), 3000);
      if (onQueryChanged) onQueryChanged();
    } catch (err) {
      setErrorMessage(err.message || 'Failed to approve query.');
    } finally {
      setBusyAction('');
    }
  };

  const handleReject = async (e) => {
    e.preventDefault();
    if (!isFounder || !rejectReason.trim() || busyAction) return;

    setBusyAction('reject');
    setErrorMessage('');
    try {
      await rejectDecisionRequest(query.id, rejectReason.trim());
      setRejectModalOpen(false);
      setRejectReason('');
      setSuccessMessage('Query marked as rejected.');
      setTimeout(() => setSuccessMessage(''), 3000);
      if (onQueryChanged) onQueryChanged();
    } catch (err) {
      setErrorMessage(err.message || 'Failed to reject query.');
    } finally {
      setBusyAction('');
    }
  };

  const handlePublish = async () => {
    if (!isFounder || busyAction) return;
    const textToPublish = publishReview?.response;
    if (!textToPublish || isPublished || ['Sending', 'Unknown'].includes(deliveryStatus)) {
      setErrorMessage('Please enter the response message to send to Telegram.');
      return;
    }

    setBusyAction('publish');
    setErrorMessage('');
    try {
      const idempotencyKey = generateIdempotencyKey(`pub-${query.id}`);
      await publishDecisionReply(query.id, {
        response: textToPublish,
        idempotencyKey,
      });
      setPublishReview(null);
      setSuccessMessage('Reply published to Telegram group successfully!');
      setTimeout(() => setSuccessMessage(''), 4000);
      if (onQueryChanged) onQueryChanged();
    } catch (err) {
      setErrorMessage(err.message || 'Failed to publish reply to Telegram.');
    } finally {
      setBusyAction('');
    }
  };

  const handleConvert = async (e) => {
    e.preventDefault();
    if (!isFounder || !taskTitle.trim() || busyAction) return;

    setBusyAction('convert');
    setErrorMessage('');
    try {
      const res = await convertDecisionRequest(query.id, {
        title: taskTitle.trim(),
        description: taskDesc.trim(),
        stageId: taskStageId || undefined,
        assigneeId: taskAssigneeId || undefined,
        deadline: taskDeadline || undefined,
        status: 'Open',
      });
      setConvertModalOpen(false);
      setSuccessMessage('Task created from client query!');
      setTimeout(() => setSuccessMessage(''), 3000);
      if (onTaskCreated && res.task) onTaskCreated(res.task);
      if (onQueryChanged) onQueryChanged();
    } catch (err) {
      setErrorMessage(err.message || 'Failed to convert query to task.');
    } finally {
      setBusyAction('');
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

  if (query.requestType !== 'Message' && !needsQueryAttention(query) && !showHandled)
    return (
      <article className="flex items-center justify-between gap-3 card-box bg-card">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {query.originalSenderName} · {queryStatusLabel(query)}
          </p>
          <p className="truncate text-sm">{query.originalMessage || 'Shared a file'}</p>
          <QueryOutcome request={query} />
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowHandled(true)}>
          View history
        </Button>
      </article>
    );
  return (
    <div
      className={`overflow-hidden rounded-xl border bg-card transition-all ${
        query.requestType === 'Message'
          ? 'border-muted'
          : isPublished
            ? 'border-success-border/80 shadow-2xs'
            : isRejected
              ? 'border-destructive/30 bg-card/60'
              : isDone
                ? 'border-muted'
                : 'border-warning-border/80 shadow-xs'
      }`}
    >
      {/* Top Banner / Status Line */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-full bg-info-bg text-info text-xs font-semibold">
            TG
          </span>
          <span className="font-semibold text-foreground">
            {query.originalSenderName || 'Client'}
          </span>
          <span className="text-muted-foreground">via Telegram</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">
            <Time value={query.createdAt} />
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasLinkedTask && (
            <Badge variant="outline" className="border-info-border bg-info-bg text-info text-xs">
              Task linked
            </Badge>
          )}

          {deliveryStatus === 'Sent' && (
            <Badge
              variant="outline"
              className="border-success-border bg-success-bg text-success text-xs"
            >
              <Check className="size-3 mr-1" /> Sent to Telegram
            </Badge>
          )}

          {deliveryStatus === 'Failed' && (
            <Badge
              variant="outline"
              className="border-destructive/40 bg-destructive/10 text-destructive text-xs"
            >
              <XCircle className="size-3 mr-1" /> Delivery failed
            </Badge>
          )}

          {deliveryStatus === 'Unknown' && (
            <Badge
              variant="outline"
              className="border-warning-border bg-warning-bg text-warning text-xs"
            >
              <AlertTriangle className="size-3 mr-1" /> Delivery unknown
            </Badge>
          )}

          {deliveryStatus === 'Sending' && (
            <Badge variant="outline" className="border-info-border bg-info-bg text-info text-xs">
              <Loader2 className="size-3 mr-1 animate-spin" /> Sending…
            </Badge>
          )}

          {isRejected && (
            <Badge
              variant="outline"
              className="border-destructive/40 bg-destructive/10 text-destructive text-xs"
            >
              Rejected
            </Badge>
          )}

          {isApproved && !isPublished && (
            <Badge
              variant="outline"
              className="border-success-border bg-success-bg text-success text-xs"
            >
              Approved
            </Badge>
          )}

          {query.requestType === 'Message' && <Badge variant="outline">Group message</Badge>}
          {query.status === 'On hold' && <Badge variant="outline">Waiting for more context</Badge>}
          {query.requestType !== 'Message' &&
            !isPublished &&
            !isRejected &&
            !isApproved &&
            query.status !== 'On hold' && (
              <Badge
                variant="outline"
                className="border-warning-border bg-warning-bg text-warning text-xs"
              >
                <Clock className="size-3 mr-1" /> Needs action
              </Badge>
            )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-4 sm:p-4 space-y-3">
        {errorMessage && (
          <div className="flex items-center gap-2 card-box border-destructive/30 bg-destructive/10 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="flex items-center gap-2 card-box border-success-border bg-success-bg text-xs text-success">
            <Check className="size-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium leading-copy text-foreground whitespace-pre-wrap">
            {query.originalMessage ||
              'Client sent an attachment or query requiring project team input.'}
          </p>

          {query.context && (
            <div className="card-box border-warning-border/70 bg-warning-bg/50 text-xs text-warning">
              <span className="font-semibold">Context: </span>
              {query.context}
            </div>
          )}

          {query.reviewNote && (
            <div className="card-box border-destructive/20 bg-destructive/5 text-xs text-destructive">
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
                  const isPhoto =
                    att.type === 'Photo' || /\.(png|jpe?g|webp|gif)$/i.test(att.fileName || '');

                  return (
                    <div key={idx} className="space-y-2">
                      {isPhoto ? (
                        <div className="group relative overflow-hidden rounded-xl border bg-muted/20">
                          <img
                            src={mediaUrl}
                            alt={att.fileName || `Attachment ${idx + 1}`}
                            className="max-h-56 max-w-full rounded-xl object-contain transition-transform group-hover:scale-102"
                            onError={(e) => {
                              // If image loading fails, replace with fallback box
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                          <a
                            href={mediaUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline px-1"
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
                          className="inline-flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-xs text-primary transition-colors hover:bg-muted"
                        >
                          <FileText className="size-3.5" />
                          <span className="truncate max-w-[200px]">
                            {att.fileName || att.type || `Document ${idx + 1}`}
                          </span>
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
            <Button variant="outline" size="sm" onClick={() => setExpanded(!expanded)}>
              <MessageSquare className="size-3.5 mr-1 text-primary" />
              Discuss in thread ({query.comments?.length || 0})
              {expanded ? (
                <ChevronUp className="size-3.5 ml-1" />
              ) : (
                <ChevronDown className="size-3.5 ml-1" />
              )}
            </Button>

            {hasLinkedTask && onOpenTask ? (
              <Button variant="outline" size="sm" onClick={() => onOpenTask(query.taskId)}>
                View linked task <ArrowRight className="size-3 ml-1" />
              </Button>
            ) : null}
          </div>

          {/* Founder decision: Accept or Reject. Both confirm the reply before anything reaches Telegram. */}
          {isFounder && (
            <div className="flex flex-wrap items-center gap-2">
              <QueryDecisionButtons
                onChanged={onQueryChanged}
                request={query}
                onAccept={() => setAcceptOpen(true)}
                onReject={() => setRejectOpen(true)}
              />
            </div>
          )}
        </div>
        <div className="mt-2">
          <QueryOutcome request={query} />
        </div>

        {/* Expandable Discussion & Finalization Thread */}
        {expanded && (
          <div className="mt-4 space-y-4 card-box bg-muted/20">
            {/* Step Progression Indicators */}
            <div className="flex flex-col gap-3 border-b pb-3 text-xs sm:flex-row sm:items-center sm:justify-between">
              <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                Workflow: discuss internally, then finalize and send
              </span>
              <SegmentedControl
                label="Query step"
                value={mode}
                onValueChange={setMode}
                options={[
                  { value: 'discuss', label: 'Internal discussion' },
                  ...(isFounder ? [{ value: 'finalize', label: 'Final reply' }] : []),
                ]}
              />
            </div>

            {/* Mode 1: Internal Discussion Thread */}
            {mode === 'discuss' && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <ShieldCheck className="size-3.5 text-primary shrink-0" />
                  Internal discussion is private to your team and is never sent to Telegram.
                </p>

                <div className="space-y-2">
                  {query.comments && query.comments.length > 0 ? (
                    query.comments.map((c, i) => (
                      <div key={c.id || i} className="card-box bg-card text-xs shadow-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-primary">
                            {c.author || 'Team member'}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            <Time value={c.at} />
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
                    disabled={busyAction === 'comment'}
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!internalCommentDraft.trim() || busyAction === 'comment'}
                  >
                    {busyAction === 'comment' ? (
                      <Loader2 className="size-3 animate-spin mr-1" />
                    ) : (
                      <Send className="size-3.5 mr-1" />
                    )}
                    Add note
                  </Button>
                </form>
              </div>
            )}

            {/* Mode 2: Finalize & Publish to Telegram (Founder only) */}
            {mode === 'finalize' && isFounder && (
              <div className="space-y-3">
                <div className="card-box border-primary/20 bg-primary/5 text-xs text-primary-foreground">
                  <p className="font-semibold text-primary">Public Telegram reply</p>
                  <p className="text-xs text-muted-foreground">
                    This message will be sent back directly to the project Telegram group in reply
                    to the client.
                  </p>
                </div>

                {deliveryStatus === 'Unknown' && (
                  <div className="card-box border-warning-border bg-warning-bg text-xs text-warning space-y-1">
                    <p className="font-semibold flex items-center gap-2">
                      <AlertTriangle className="size-4 text-warning" />
                      Delivery status unknown
                    </p>
                    <p>
                      The previous attempt interrupted or timed out. Telegram delivery is not
                      guaranteed to be idempotent.
                      <strong>
                        {' '}
                        Check the Telegram group manually before sending again; do not retry
                        automatically.
                      </strong>
                    </p>
                  </div>
                )}

                {deliveryStatus === 'Failed' && (
                  <div className="card-box border-destructive/30 bg-destructive/10 text-xs text-destructive space-y-1">
                    <p className="font-semibold">Telegram send failed</p>
                    <p>
                      {query.deliveryError ||
                        'The message was rejected by Telegram. You may retry.'}
                    </p>
                  </div>
                )}

                {!isPublished && (
                  <SuggestReply
                    requestId={query.id}
                    disabled={busyAction === 'publish'}
                    onUse={setResponseDraft}
                  />
                )}

                <Textarea
                  value={responseDraft}
                  onChange={(e) => setResponseDraft(e.target.value)}
                  rows={3}
                  maxLength={3000}
                  placeholder="Type the official answer / resolution for the client here…"
                  disabled={busyAction === 'publish' || isPublished}
                />

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <span className="text-xs text-muted-foreground">
                    {isPublished ? 'Reply has been sent.' : 'One successful reply per query.'}
                  </span>

                  {!isPublished && (
                    <Button
                      size="sm"
                      disabled={
                        Boolean(busyAction) ||
                        !responseDraft.trim() ||
                        ['Sending', 'Unknown'].includes(deliveryStatus)
                      }
                      onClick={() => setPublishReview({ response: responseDraft.trim() })}
                    >
                      {busyAction === 'publish' ? (
                        <>
                          <Loader2 className="size-3.5 mr-2 animate-spin" />
                          Sending to Telegram…
                        </>
                      ) : (
                        <>
                          <Send className="size-3.5 mr-2" />
                          {deliveryStatus === 'Failed' ? 'Review and retry' : 'Review and send'}
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

      <Dialog
        open={Boolean(publishReview)}
        onOpenChange={(open) => {
          if (!open && busyAction !== 'publish') setPublishReview(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Telegram reply</DialogTitle>
            <DialogDescription>
              Review the destination and message before sending this public reply.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              <strong>Project:</strong> {project?.name || query.projectId}
            </p>
            <p>
              <strong>Destination:</strong> Project Telegram group
              {project?.telegramGroupChatId ? ` (${project.telegramGroupChatId})` : ''}
            </p>
            <div className="card-box bg-muted/30 whitespace-pre-wrap break-words">
              {publishReview?.response}
            </div>
            <p className="text-xs text-muted-foreground">
              Internal team notes will not be sent. One successful public reply is allowed per
              query.
            </p>
            {errorMessage && (
              <p role="alert" className="text-xs text-destructive">
                {errorMessage}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busyAction === 'publish'}
              onClick={() => setPublishReview(null)}
            >
              Back to draft
            </Button>
            <Button
              disabled={
                Boolean(busyAction) ||
                isPublished ||
                ['Sending', 'Unknown'].includes(deliveryStatus)
              }
              onClick={handlePublish}
            >
              {busyAction === 'publish' ? 'Sending…' : 'Send to Telegram'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isFounder && (
        <QueryAcceptWizard
          open={acceptOpen}
          onOpenChange={setAcceptOpen}
          request={query}
          onDone={(result) => {
            setSuccessMessage(result?.summary || 'Query updated.');
            if (onQueryChanged) onQueryChanged();
            if (onTaskCreated) onTaskCreated();
          }}
        />
      )}
      {isFounder && (
        <QueryRejectDialog
          open={rejectOpen}
          onOpenChange={setRejectOpen}
          request={query}
          onDone={() => {
            setSuccessMessage('Query rejected and the reply was sent.');
            if (onQueryChanged) onQueryChanged();
          }}
        />
      )}

      {!needsQueryAttention(query) && showHandled && (
        <Button variant="outline" size="sm" onClick={() => setShowHandled(false)}>
          Collapse history
        </Button>
      )}
      {/* Convert Query to Task Modal */}
      <Dialog open={convertModalOpen} onOpenChange={setConvertModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert client query to task</DialogTitle>
            <DialogDescription>
              Create an actionable internal task in this project linked to this client inquiry.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConvert} className="space-y-4">
            <label className="grid gap-2 text-xs font-semibold">
              Task title
              <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} required />
            </label>

            <label className="grid gap-2 text-xs font-semibold">
              Description
              <Textarea value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} rows={3} />
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-xs font-semibold">
                Project stage
                <NativeSelect
                  value={taskStageId}
                  onChange={(e) => setTaskStageId(e.target.value)}
                  className="w-full"
                >
                  {stages.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name}
                    </option>
                  ))}
                  {!stages.length && <option value="">General</option>}
                </NativeSelect>
              </label>

              <label className="grid gap-2 text-xs font-semibold">
                Assignee
                <NativeSelect
                  value={taskAssigneeId}
                  onChange={(e) => setTaskAssigneeId(e.target.value)}
                  className="w-full"
                >
                  <option value="founder">Founder</option>
                  {projectMembers.map((m) => (
                    <option key={m.id || m.employeeId} value={m.employeeId || m.id}>
                      {m.name} ({m.role || 'Member'})
                    </option>
                  ))}
                </NativeSelect>
              </label>
            </div>

            <label className="grid gap-2 text-xs font-semibold">
              Deadline
              <Input
                type="date"
                value={taskDeadline}
                onChange={(e) => setTaskDeadline(e.target.value)}
              />
            </label>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConvertModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busyAction === 'convert'}>
                {busyAction === 'convert' ? (
                  <Loader2 className="size-3.5 animate-spin mr-2" />
                ) : null}
                Create task
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reject Query Modal */}
      <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject client request</DialogTitle>
            <DialogDescription>
              Provide an internal reason for rejecting this client request (e.g. Out of scope,
              Duplicate).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleReject} className="space-y-4">
            <label className="grid gap-2 text-xs font-semibold">
              Reason
              <Input
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Outside contracted scope"
                required
              />
            </label>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRejectModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={busyAction === 'reject'}>
                {busyAction === 'reject' ? (
                  <Loader2 className="size-3.5 animate-spin mr-2" />
                ) : null}
                Reject query
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
