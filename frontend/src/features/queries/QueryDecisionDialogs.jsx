import { request as sendRequest } from '@/lib/api';
// Accept links the query to a task with a work action or a request for more context, or adds a new stage.
// Confirming a decision sends one status update as a reply to the source query.
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  Layers,
  Loader2,
  Octagon,
  Plus,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SuggestReply } from '@/features/queries/SuggestReply';
import {
  AddStageForm,
  emptyStage,
  stageNameProblem,
  stageSpec,
} from '@/features/timeline/AddStageForm';
import { useDefaultPlan, useStagePreview } from '@/features/timeline/AddStageDialog';
import {
  acceptDecisionRequest,
  fetchProjectWorkspace,
  previewAcceptDecision,
  rejectDecisionRequest,
} from '@/lib/api';
import { timelineItems, calendarDay as DAY } from '@/features/timeline/lib/timeline';
import { todayDate } from '@/features/timeline/lib/timelineStatus';
import { orderStagesForPicker, defaultTaskForStage } from '@/features/timeline/lib/stagePicker';
import { STAGE_TASKS } from '@/features/timeline/lib/stageTemplate';

const dayLabel = (value) =>
  value === null || value === undefined
    ? 'no dates'
    : new Date(value).toLocaleDateString([], { day: 'numeric', month: 'short', timeZone: 'UTC' });
const shortTitle = (title = '') => title.split(' — ').at(-1);
const isDone = (task) => ['Completed', 'completed', 'Done'].includes(task.status);
const niceDate = (iso) =>
  iso
    ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      })
    : '';
// What the client is told, in plain words. The internal summary ("10 later tasks moved") stays in the web app.
export function clientOutcome(target, preview, taskTitle) {
  if (!target || !preview) return '';
  const finish = preview.finish
    ? ` We now expect to finish the project around ${niceDate(preview.finish)}.`
    : '';
  if (target.kind === 'new-stage') {
    const stage = preview.stages?.[0];
    return `We've added "${stage?.name}" to the plan${stage?.startDate ? `, from ${niceDate(stage.startDate)} to ${niceDate(stage.endDate)}` : ''}.${finish}`;
  }
  const name = shortTitle(taskTitle);
  const moved = (preview.affected || []).find((item) => item.moved);
  if (target.action.type === 'hold')
    return `We've received your message about "${name}". Please share more context so we can act on it.`;
  if (target.action.type === 'complete') return `"${name}" is complete.`;
  if (target.action.type === 'attach') return `Thanks, we've noted this against "${name}".`;
  const end = moved?.forecastEnd ? ` and will now be ready by ${niceDate(moved.forecastEnd)}` : '';
  return target.action.type === 'redo'
    ? `We'll redo "${name}"${end}.${finish}`
    : `"${name}" needs a little more time${end}.${finish}`;
}
const GROUP_LABEL = { ongoing: 'In progress today', upcoming: 'Coming up', completed: 'Completed' };
const ACTIONS = [
  { type: 'delay', title: 'Delay', text: 'Give it more days. Later tasks move back.' },
  { type: 'redo', title: 'Redo', text: 'Send it back for rework with its full time again.' },
  { type: 'complete', title: 'Mark complete', text: "It's done. The next task can start." },
  {
    type: 'hold',
    title: 'Waiting for more context',
    text: 'Save the query here while waiting for clarification. Task dates and status stay unchanged.',
  },
];

function ReplyStep({ request, baseInstruction, outcome, value, onChange }) {
  return (
    <div className="space-y-3">
      <SuggestReply
        requestId={request.id}
        baseInstruction={baseInstruction}
        outcome={outcome}
        onUse={onChange}
      />
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        maxLength={3000}
        placeholder="Update sent with this decision"
      />
      <p className="text-[11px] text-muted-foreground">
        Sent as a reply to {request.originalSenderName || 'the sender'}'s original message when you
        confirm this decision.
      </p>
    </div>
  );
}

export function QueryAcceptWizard({ open, onOpenChange, request, onDone }) {
  const [workspace, setWorkspace] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [step, setStep] = useState('stage');
  const [search, setSearch] = useState('');
  const [stageId, setStageId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [action, setAction] = useState({ type: 'delay', days: 1 });
  const [newStage, setNewStage] = useState(null);
  const [linkTaskKey, setLinkTaskKey] = useState('site-check');
  const [reply, setReply] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [accepted, setAccepted] = useState(null);
  const isUpdate = request?.requestType === 'Update';
  const defaultPlan = useDefaultPlan(request?.projectId, open);

  useEffect(() => {
    if (!open || !request) return;
    setStep('stage');
    setSearch('');
    setStageId('');
    setTaskId('');
    setAction({ type: isUpdate ? 'attach' : 'delay', days: 1 });
    setNewStage(null);
    setReply('');
    setError('');
    setAccepted(null);
    setWorkspace(null);
    setLoadError('');
    fetchProjectWorkspace(request.projectId, 'founder')
      .then(setWorkspace)
      .catch((problem) => setLoadError(problem.message || 'Could not load the project plan.'));
  }, [open, request?.id]);

  const stages = workspace?.project?.stages || [];
  const items = useMemo(
    () => (workspace ? timelineItems(workspace.tasks || [], stages) : []),
    [workspace],
  );
  const rows = useMemo(() => orderStagesForPicker(stages, items), [workspace]);
  const visibleRows = rows.filter((row) =>
    row.stage.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const stage = stages.find((item) => item.id === stageId);
  const stageItems = items
    .filter((item) => item.stage?.id === stageId)
    .sort((a, b) => (Number(a.task.sourceSequence) || 0) - (Number(b.task.sourceSequence) || 0));
  const task = items.find((item) => item.task.id === taskId)?.task;

  const target =
    step === 'new-stage' || (newStage && step === 'reply')
      ? newStage && { kind: 'new-stage', stage: stageSpec(newStage), linkTaskKey }
      : taskId && {
          kind: 'task',
          taskId,
          action:
            action.type === 'delay'
              ? { type: 'delay', days: Number(action.days) }
              : { type: action.type },
        };
  const previewReady =
    Boolean(target) &&
    !accepted &&
    (step === 'action' || step === 'new-stage' || step === 'reply') &&
    (target.kind !== 'new-stage' || !stageNameProblem(newStage, stages));
  const waitingForContext = target?.kind === 'task' && target.action.type === 'hold';
  const schedulePreview = useStagePreview(target, open && previewReady && !waitingForContext, () =>
    previewAcceptDecision(request.id, target),
  );
  const holdPreview = useMemo(
    () => ({
      ok: true,
      summary: `Waiting for more context. Saved on "${task?.title || 'this task'}"; task dates and status stay unchanged.`,
      affected: [],
    }),
    [task?.title],
  );
  const preview = waitingForContext ? holdPreview : schedulePreview.preview;
  const previewing = !waitingForContext && schedulePreview.previewing;
  const previewError = waitingForContext ? '' : schedulePreview.error;
  const summary = accepted?.summary || preview?.summary || '';
  const baseInstruction = summary
    ? `The founder ${waitingForContext ? 'is waiting for more context on this' : 'accepted this'}. Outcome: ${summary} Tell the sender plainly.`
    : '';
  const [outcome, setOutcome] = useState('');
  useEffect(() => {
    if (preview && !accepted) setOutcome(clientOutcome(target, preview, task?.title));
  }, [preview]);

  const chooseStage = (row) => {
    if (!row.selectable && !isUpdate) {
      setNewStage(emptyStage({ stages, placement: { type: 'after', stageName: row.stage.name } }));
      setError(`${row.stage.name} is finished. Add a new stage for this work.`);
      setStep('new-stage');
      return;
    }
    setError('');
    setStageId(row.stage.id);
    setTaskId(defaultTaskForStage(items, row.stage.id)?.task.id || '');
    setStep('task');
  };
  const startNewStage = () => {
    setError('');
    setNewStage(
      emptyStage({
        stages,
        tailStageName: rows.find((row) => row.status === 'ongoing')?.stage.name,
      }),
    );
    setStep('new-stage');
  };

  const confirm = async () => {
    setSaving(true);
    setError('');
    let result = accepted;
    try {
      if (!result) {
        result = waitingForContext
          ? await sendRequest(
              `/api/founder/decision-requests/${encodeURIComponent(request.id)}/hold`,
              { method: 'POST', body: { taskId, notificationText: reply.trim() } },
            )
          : await acceptDecisionRequest(request.id, target, reply.trim());
        if (waitingForContext) result.summary = holdPreview.summary;
        setAccepted(result);
      }
    } catch (problem) {
      setError(problem.message || 'Could not accept this query.');
      setSaving(false);
      return;
    }
    setSaving(false);
    onOpenChange(false);
    onDone?.(result);
  };

  const steps = newStage ? ['stage', 'new-stage', 'reply'] : ['stage', 'task', 'action', 'reply'];
  const back = () => {
    const index = steps.indexOf(step);
    if (index > 0) setStep(steps[index - 1]);
    if (steps[index - 1] === 'stage') setNewStage(null);
    setError('');
  };
  const canNext =
    step === 'task'
      ? Boolean(taskId)
      : step === 'action'
        ? previewReady && preview?.ok !== false && !previewing && !previewError && Boolean(preview)
        : step === 'new-stage'
          ? previewReady && !previewing && !previewError && Boolean(preview)
          : false;
  const next = () => {
    if (step !== 'task') setReply(outcome);
    setStep(step === 'task' ? 'action' : 'reply');
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!saving) onOpenChange(value);
      }}
    >
      <DialogContent className="flex max-h-[92dvh] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12 text-left">
          <p className="text-[11px] font-medium text-primary">
            Accept · step {steps.indexOf(step) + 1} of {steps.length}
          </p>
          <DialogTitle>
            {
              {
                stage: 'Where does this belong?',
                task: `Which task in ${stage?.name || 'this stage'}?`,
                action: `What should happen to "${shortTitle(task?.title)}"?`,
                'new-stage': 'Add a stage for this work',
                reply: 'Reply to the group',
              }[step]
            }
          </DialogTitle>
          <DialogDescription className="line-clamp-2 text-xs">
            "{request?.originalMessage || 'Shared a file'}" · {request?.originalSenderName}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loadError && (
            <p className="text-sm text-destructive" role="alert">
              {loadError}
            </p>
          )}
          {!workspace && !loadError && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading the project plan…
            </p>
          )}

          {workspace && step === 'stage' && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 rounded-lg border px-3">
                <Search className="size-4 text-muted-foreground" />
                <input
                  autoFocus
                  className="h-9 flex-1 bg-transparent text-sm outline-none"
                  placeholder="Type to find a stage, e.g. plumbing"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              {['ongoing', 'upcoming', 'completed'].map((group) => {
                const list = visibleRows.filter((row) => row.status === group);
                if (!list.length) return null;
                return (
                  <div key={group} className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {GROUP_LABEL[group]}
                    </p>
                    {list.map((row) => (
                      <button
                        key={row.stage.id}
                        type="button"
                        onClick={() => chooseStage(row)}
                        className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left hover:bg-muted/60 ${row.selectable ? '' : 'opacity-60'}`}
                      >
                        <span className="min-w-0">
                          <strong className="block truncate text-sm font-medium">
                            {row.stage.name}
                          </strong>
                          <small className="text-xs text-muted-foreground">
                            {row.start !== null
                              ? `${dayLabel(row.start)} – ${dayLabel(row.end - DAY)}`
                              : 'No dates yet'}{' '}
                            · {row.taskCount} tasks
                            {row.selectable ? '' : ' · finished: add a new stage instead'}
                          </small>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                );
              })}
              {!visibleRows.length && (
                <p className="text-sm text-muted-foreground">
                  {stages.length ? 'No stage matches.' : 'This project has no stages yet.'}
                </p>
              )}
              <button
                type="button"
                onClick={startNewStage}
                className="flex w-full items-center gap-2 rounded-xl border border-dashed px-3 py-2.5 text-sm font-medium text-primary hover:bg-primary/5"
              >
                <Plus className="size-4" />
                Add a new stage
              </button>
            </div>
          )}

          {workspace && step === 'task' && (
            <div className="space-y-1.5" role="radiogroup">
              {stageItems.map((item) => {
                const finished = isDone(item.task);
                const disabled = finished && action.type !== 'attach';
                return (
                  <label
                    key={item.task.id}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${taskId === item.task.id ? 'border-primary bg-primary/5' : ''} ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
                  >
                    <input
                      type="radio"
                      name="task"
                      disabled={disabled}
                      checked={taskId === item.task.id}
                      onChange={() => setTaskId(item.task.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-sm font-medium">
                        {shortTitle(item.task.title)}
                      </strong>
                      <small className="text-xs text-muted-foreground">
                        {item.task.sourceAssigneeName || item.task.sourceRole || 'Unassigned'} ·{' '}
                        {item.start !== null
                          ? `${dayLabel(item.start)} – ${dayLabel(item.end - DAY)}`
                          : 'no dates'}
                        {finished
                          ? ' · done'
                          : item.start !== null &&
                              item.start <= todayDate() &&
                              item.end > todayDate()
                            ? ' · in progress'
                            : ''}
                      </small>
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          {workspace && step === 'action' && (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
                {[
                  ...ACTIONS,
                  ...(isUpdate
                    ? [
                        {
                          type: 'attach',
                          title: 'Just attach',
                          text: 'Keep it on the task. No date changes.',
                        },
                      ]
                    : []),
                ].map((option) => (
                  <label
                    key={option.type}
                    className={`cursor-pointer rounded-xl border p-3 ${action.type === option.type ? 'border-primary bg-primary/5' : ''}`}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="radio"
                        name="action"
                        checked={action.type === option.type}
                        onChange={() => setAction({ ...action, type: option.type })}
                      />
                      {option.title}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">{option.text}</span>
                  </label>
                ))}
              </div>
              {action.type === 'delay' && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm">By</span>
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    value={action.days}
                    onChange={(event) =>
                      setAction({
                        ...action,
                        days: Math.max(1, Math.min(60, Number(event.target.value) || 1)),
                      })
                    }
                    className="h-9 w-20"
                  />
                  <span className="text-sm">days</span>
                  {[1, 2, 3, 5].map((days) => (
                    <Button
                      key={days}
                      type="button"
                      size="sm"
                      variant={Number(action.days) === days ? 'default' : 'outline'}
                      onClick={() => setAction({ ...action, days })}
                    >
                      +{days}
                    </Button>
                  ))}
                </div>
              )}
              <PreviewPanel preview={preview} previewing={previewing} error={previewError} />
            </div>
          )}

          {step === 'new-stage' && newStage && (
            <div className="space-y-4">
              {error && (
                <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  {error}
                </p>
              )}
              <AddStageForm
                value={newStage}
                onChange={setNewStage}
                stages={stages}
                members={workspace?.project?.members || []}
                defaultPlan={defaultPlan}
                preview={
                  preview && {
                    stages: preview.stages,
                    finish: preview.finish,
                    warnings: preview.warnings,
                  }
                }
                previewing={previewing}
                previewError={previewError}
              />
              <label className="block space-y-1.5">
                <span className="text-xs font-medium">
                  Put this query on which task of the new stage?
                </span>
                <select
                  className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                  value={linkTaskKey}
                  onChange={(event) => setLinkTaskKey(event.target.value)}
                >
                  {STAGE_TASKS.filter(
                    (item) =>
                      Number(
                        newStage.tasks.find((taskValue) => taskValue.key === item.key)
                          ?.durationDays,
                      ) > 0,
                  ).map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {step === 'reply' && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-xl border bg-muted/40 px-3 py-2.5 text-sm">
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-700" />
                <span>{summary || 'Ready to accept.'}</span>
              </div>
              <ReplyStep
                request={request}
                baseInstruction={baseInstruction}
                outcome={outcome}
                value={reply}
                onChange={setReply}
              />
            </div>
          )}

          {error && step !== 'new-stage' && (
            <p className="mt-3 text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t px-5 py-3">
          <Button
            variant="ghost"
            disabled={step === 'stage' || saving || Boolean(accepted)}
            onClick={back}
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>
          {step === 'reply' ? (
            <Button disabled={saving || !reply.trim()} onClick={confirm}>
              {saving ? 'Saving…' : accepted ? 'Retry sending' : 'Confirm and send'}
            </Button>
          ) : (
            step !== 'stage' && (
              <Button disabled={!canNext} onClick={next}>
                Next
              </Button>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreviewPanel({ preview, previewing, error }) {
  if (previewing)
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Checking the schedule…
      </p>
    );
  if (error)
    return (
      <p
        className="flex items-start gap-1.5 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
        role="alert"
      >
        <Octagon className="mt-0.5 size-3.5 shrink-0" />
        {error}
      </p>
    );
  if (!preview) return null;
  const pushed = (preview.affected || []).filter((item) => !item.moved);
  return (
    <div className="space-y-1.5 rounded-xl bg-muted/50 px-3 py-2.5 text-xs">
      <p className="font-medium">{preview.summary}</p>
      {pushed.length > 0 && (
        <p className="text-muted-foreground">
          Moves back:{' '}
          {pushed
            .slice(0, 4)
            .map((item) => shortTitle(item.taskName))
            .join(', ')}
          {pushed.length > 4 ? ` and ${pushed.length - 4} more` : ''}.
        </p>
      )}
      {(preview.warnings || []).map((warning, index) => (
        <p key={index} className="flex items-start gap-1.5 text-amber-700">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {warning.reason}
        </p>
      ))}
    </div>
  );
}

export function QueryRejectDialog({ open, onOpenChange, request, onDone }) {
  const alreadyRejected = request?.decisionStatus === 'Rejected' && !request?.publishedMessageId;
  const [text, setText] = useState('');
  const [hint, setHint] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [rejected, setRejected] = useState(false);
  useEffect(() => {
    if (!open || !request) return;
    setText(request.rejectionReply || '');
    setHint('');
    setError('');
    setRejected(alreadyRejected);
  }, [open, request?.id]);

  const confirm = async () => {
    const message = text.trim() || "We're not able to go ahead with this request right now.";
    setSaving(true);
    setError('');
    try {
      if (!rejected) {
        await rejectDecisionRequest(request.id, message);
        setRejected(true);
      }
    } catch (problem) {
      setError(problem.message || 'Could not reject this query.');
      setSaving(false);
      return;
    }
    setSaving(false);
    onOpenChange(false);
    onDone?.();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!saving) onOpenChange(value);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Reject this query</DialogTitle>
          <DialogDescription>
            Reject with the default reply, or add context below. The reply is sent to{' '}
            {request?.originalSenderName || 'the sender'}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={hint}
            maxLength={200}
            onChange={(event) => setHint(event.target.value)}
            placeholder="Why? (only used to draft the message, never sent)"
          />
          <SuggestReply
            requestId={request?.id}
            baseInstruction={`Politely decline this request.${hint.trim() ? ` Reason from the founder: ${hint.trim()}.` : ''}`}
            outcome="We're not able to go ahead with this request right now."
            onUse={setText}
          />
          <Textarea
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={4}
            maxLength={3000}
            placeholder="Optional reason or reply. Leave blank to send: We’re not able to go ahead with this request right now."
          />
          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={saving} onClick={confirm}>
            {saving ? 'Sending…' : rejected ? 'Retry sending' : 'Reject and send'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// One line on a handled query: what was decided.
export function QueryOutcome({ request }) {
  return (
    <div className="space-y-1">
      <QueryDecisionOutcome request={request} />
      {request.notifications?.length > 0 &&
        (() => {
          const update = request.notifications.at(-1);
          return (
            <p
              className={`text-xs ${update.status === 'Sent' ? 'text-muted-foreground' : 'text-amber-800'}`}
            >
              {update.status === 'Sent'
                ? 'Sender updated in Telegram.'
                : `Decision saved. ${update.error || 'Telegram delivery is pending; check the group before sending again.'}`}
            </p>
          );
        })()}
    </div>
  );
}
function QueryDecisionOutcome({ request }) {
  if (request.status === 'On hold')
    return (
      <p className="text-xs text-amber-800">
        Waiting for more context · this query needs clarification. Saved in its task thread.
      </p>
    );
  if (request.acceptSummary)
    return (
      <p className="flex items-start gap-1.5 text-xs text-emerald-800">
        <Layers className="mt-0.5 size-3.5 shrink-0" />
        Accepted · {request.acceptSummary}
      </p>
    );
  if (request.rejectionReply)
    return <p className="text-xs text-destructive">Rejected · "{request.rejectionReply}"</p>;
  return null;
}

// Accept / Reject buttons, shown until the query has a decision.
export function QueryDecisionButtons({
  request,
  disabled,
  onAccept,
  onReject,
  onChanged,
  size = 'sm',
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const resume = async () => {
    setBusy(true);
    try {
      await sendRequest(`/api/founder/decision-requests/${encodeURIComponent(request.id)}/resume`, {
        method: 'POST',
        body: {},
      });
      onChanged?.();
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  };
  if (request.requestType === 'Message') return null;
  if (request.status === 'On hold')
    return (
      <>
        <Button variant="outline" size={size} disabled={busy || disabled} onClick={resume}>
          Return to review
        </Button>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </>
    );

  const decided =
    Boolean(request.decisionStatus) ||
    ['Rejected', 'Done', 'Published', 'Approved'].includes(request.status);
  if (decided) return null;
  return (
    <>
      <Button size={size} onClick={onAccept} disabled={disabled}>
        <Check className="size-3.5 mr-1" />
        Accept
      </Button>
      {request.canReject && (
        <Button
          size={size}
          variant="outline"
          className="text-destructive"
          onClick={onReject}
          disabled={disabled}
        >
          Reject
        </Button>
      )}
    </>
  );
}
