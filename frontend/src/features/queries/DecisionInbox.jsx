import {
  INBOX_TABS,
  needsQueryAttention,
  queryInboxTab,
  queryStatusLabel,
} from '@/features/queries/lib/queryStatus';
import { useNavigation, navigate, goBack } from '@/lib/navigation';
// frontend/src/components/DecisionInbox.jsx
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ExternalLink,
  MessageSquare,
  Search,
  Send,
  Settings2,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Plus,
  XCircle,
  FileText,
  FolderOpen,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshButton } from '@/components/ui/refresh-button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { SuggestReply } from '@/features/queries/SuggestReply';
import {
  QueryAcceptWizard,
  QueryDecisionButtons,
  QueryOutcome,
  QueryRejectDialog,
} from '@/features/queries/QueryDecisionDialogs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { generateIdempotencyKey, getAttachmentUrl } from '@/lib/api';
import { Time } from '@/components/ui/time';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Empty } from '@/components/ui/empty';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

async function api(url, method = 'GET', data) {
  const response = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Request failed.');
  return result;
}

const initials = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';
const preview = (item) =>
  item.originalMessage || item.context || (item.attachments?.length ? 'Attachment' : 'Request');

// Open queries turn amber after a day and red after three, so the longest waits stand out.
const waitingTone = (item) => {
  if (queryInboxTab(item) !== 'action') return 'text-muted-foreground';
  const hours = (Date.now() - new Date(item.createdAt).getTime()) / 3600000;
  if (hours >= 72) return 'font-medium text-overdue';
  if (hours >= 24) return 'font-medium text-warning';
  return 'text-muted-foreground';
};

const emptyTab = {
  action: ['Nothing needs action', 'New questions from linked Telegram groups appear here.'],
  waiting: [
    'Nothing is waiting',
    'Queries marked Waiting for more context stay here until you return them to review.',
  ],
  handled: ['Nothing handled yet', 'Accepted, rejected and answered queries appear here.'],
  group: ['No group messages', 'Everyday messages from linked Telegram groups appear here.'],
  all: ['No client queries', 'Questions from linked Telegram groups appear here.'],
};

export function DecisionInbox({ projects, onProjectsChanged }) {
  const [requests, setRequests] = useState([]);
  const navigation = useNavigation();
  const selectedId = navigation.queryId;
  const [tab, setTab] = useState('action');
  const [projectFilter, setProjectFilter] = useState('All projects');
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState('internal');
  const [drafts, setDrafts] = useState({});
  const [notes, setNotes] = useState({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsProjectId, setSettingsProjectId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  // Accept / Reject are the only decisions; both dialogs confirm before anything reaches Telegram.
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  const scrollRef = useRef(null);
  // The inbox fills exactly the rest of the screen, so its bottom edge is always visible and only the
  // conversation list and the thread scroll inside it, like a mail app. Below 420px tall it falls back to page scrolling.
  const panelRef = useRef(null);
  const [panelHeight, setPanelHeight] = useState(null);
  useLayoutEffect(() => {
    const fit = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const top = panel.getBoundingClientRect().top + window.scrollY;
      const bottomGap = window.matchMedia('(min-width: 768px)').matches ? 32 : 104; // page padding, plus the phone tab bar
      const next = Math.max(420, Math.floor(window.innerHeight - top - bottomGap));
      setPanelHeight((current) => (current === next ? current : next));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  });

  const load = async () => {
    try {
      const data = await api('/api/founder/decision-requests');
      setRequests(data.requests || []);
      setError('');
    } catch (failure) {
      setError(failure.message);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const project = projects.find((item) => item.id === settingsProjectId) || projects[0];
    if (project) {
      setSettingsProjectId(project.id);
      setGroupId(project.telegramGroupChatId || '');
    }
  }, [projects, settingsProjectId]);

  const inProject = (item) => projectFilter === 'All projects' || item.projectId === projectFilter;
  const tabCounts = Object.fromEntries(INBOX_TABS.map(({ value }) => [value, 0]));
  for (const item of requests) {
    if (!inProject(item)) continue;
    tabCounts[queryInboxTab(item)] += 1;
    tabCounts.all += 1;
  }

  // A link to a query opens the tab it sits in. Picking a row or deciding on a query never switches tabs.
  const linkedIdRef = useRef(null);
  useEffect(() => {
    if (!selectedId || linkedIdRef.current === selectedId) return;
    const linked = requests.find((item) => item.id === selectedId);
    if (!linked) return;
    linkedIdRef.current = selectedId;
    if (tab !== 'all' && queryInboxTab(linked) !== tab) setTab(queryInboxTab(linked));
  }, [selectedId, requests]);

  const visible = requests.filter((item) => {
    if (tab !== 'all' && queryInboxTab(item) !== tab) return false;
    if (!inProject(item)) return false;
    const project = projects.find((candidate) => candidate.id === item.projectId);
    return `${project?.name || ''} ${item.originalSenderName} ${item.originalMessage} ${item.context}`
      .toLowerCase()
      .includes(search.toLowerCase());
  });

  const selected = visible.find((item) => item.id === selectedId) || visible[0];
  const mobileThread = Boolean(navigation.queryId && selected);
  const selectedProject = projects.find((item) => item.id === selected?.projectId);
  const openCount = requests.filter((item) => needsQueryAttention(item)).length;
  const text = selected
    ? mode === 'internal'
      ? notes[selected.id] || ''
      : drafts[selected.id] || ''
    : '';

  const followUps = selected
    ? [
        ...(selected.comments || []).map((comment) => ({
          type: 'comment',
          at: comment.at,
          value: comment,
        })),
        ...(selected.response
          ? [{ type: 'response', at: selected.publishedAt, value: selected.response }]
          : []),
      ].sort((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime())
    : [];

  const openedIdRef = useRef(null);
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const justOpened = openedIdRef.current !== selected?.id;
    openedIdRef.current = selected?.id;
    // On phones a newly opened long message starts at its beginning; new replies still scroll to the end.
    const phone = window.matchMedia?.('(max-width: 639px)').matches;
    element.scrollTop = phone && justOpened ? 0 : element.scrollHeight;
  }, [selected?.id, selected?.comments?.length, selected?.status]);

  useEffect(() => {
    if (selected?.status !== 'Pending' && selected?.deliveryStatus !== 'Failed') {
      setMode('internal');
    }
  }, [selected?.id, selected?.status, selected?.deliveryStatus]);

  const run = async (action, success) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      await load();
      setNotice(success);
      return true;
    } catch (failure) {
      setError(failure.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveGroup = () =>
    run(async () => {
      await api(`/api/founder/projects/${settingsProjectId}`, 'PATCH', {
        telegramGroupChatId: groupId.trim(),
      });
      await onProjectsChanged();
    }, 'Telegram group linked to this project.');

  const send = async (event) => {
    event.preventDefault();
    if (!selected || !text.trim() || busy) return;

    if (mode === 'publish' && selected.deliveryStatus === 'Unknown') {
      setError(
        'Cannot retry automatically while delivery status is Unknown. Check the Telegram group manually.',
      );
      return;
    }

    const kind = mode === 'internal' ? 'comment' : 'publish';
    const body =
      kind === 'comment'
        ? { text: text.trim() }
        : { response: text.trim(), idempotencyKey: generateIdempotencyKey(`pub-${selected.id}`) };

    const sent = await run(
      () =>
        api(
          `/api/founder/decision-requests/${encodeURIComponent(selected.id)}/${kind}`,
          'POST',
          body,
        ),
      kind === 'comment' ? 'Private note saved.' : 'Reply published to Telegram.',
    );

    if (sent) {
      if (kind === 'comment') setNotes((current) => ({ ...current, [selected.id]: '' }));
      else {
        setDrafts((current) => ({ ...current, [selected.id]: '' }));
        setMode('internal');
      }
    }
  };

  const markDone = () =>
    selected &&
    run(
      () =>
        api(
          `/api/founder/decision-requests/${encodeURIComponent(selected.id)}/resolve`,
          'POST',
          {},
        ),
      'Request marked done.',
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>Client queries</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {openCount} conversation{openCount === 1 ? '' : 's'} need attention.
          </p>
        </div>
        <div className="flex gap-2">
          <RefreshButton onRefresh={load} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSettingsOpen((current) => !current)}
            aria-expanded={settingsOpen}
          >
            <Settings2 />
            Group links
          </Button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="card-box border-overdue-border bg-overdue-bg text-sm text-overdue"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="card-box border-success-border bg-success-bg text-sm text-success"
        >
          {notice}
        </p>
      )}

      {settingsOpen && (
        <div className="flex flex-wrap items-end gap-3 card-box bg-card">
          <label className="min-w-44 flex-1 space-y-1 text-xs font-medium">
            Web project
            <NativeSelect
              value={settingsProjectId}
              onChange={(event) => setSettingsProjectId(event.target.value)}
              className="w-full"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="min-w-44 flex-1 space-y-1 text-xs font-medium">
            Telegram group chat ID
            <Input
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
              placeholder="-1001234567890"
            />
          </label>
          <Button onClick={saveGroup} disabled={!settingsProjectId || busy}>
            Save link
          </Button>
          <p className="w-full text-xs text-muted-foreground">
            Use the group ID in the bot’s /start message. Each group links to one project.
          </p>
        </div>
      )}

      <div
        ref={panelRef}
        style={panelHeight ? { height: panelHeight } : undefined}
        className="flex min-h-[420px] flex-col overflow-hidden rounded-2xl border bg-card shadow-sm"
      >
        <Tabs
          value={tab}
          onValueChange={setTab}
          className={`${mobileThread ? 'hidden lg:flex' : 'flex'} shrink-0 border-b px-3`}
        >
          <TabsList
            variant="line"
            aria-label="Query status"
            className="h-auto w-full justify-start overflow-x-auto px-2 pt-1 pb-[5px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {INBOX_TABS.map(({ value, label }) => (
              <TabsTrigger key={value} value={value} className="flex-none px-3 pb-2">
                {label}
                {value !== 'all' && tabCounts[value] > 0 && (
                  <span
                    className={`rounded-full px-1.5 text-xs tabular-nums ${value === 'action' ? 'bg-warning-bg text-warning' : 'bg-muted text-muted-foreground'}`}
                  >
                    {tabCounts[value]}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* Left conversations list */}
          <aside
            className={`${mobileThread ? 'hidden lg:flex' : 'flex'} min-h-0 min-w-0 flex-col border-r`}
            aria-label="Decision conversations"
          >
            <div className="flex gap-2 border-b p-3">
              <label className="relative block min-w-0 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search"
                  className="pl-8"
                  aria-label="Search decision conversations"
                />
              </label>
              <NativeSelect
                value={projectFilter}
                onChange={(event) => setProjectFilter(event.target.value)}
                aria-label="Filter by project"
                className="w-32 shrink-0"
              >
                <option>All projects</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="chat-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {visible.length ? (
                visible.map((item) => {
                  const project = projects.find((candidate) => candidate.id === item.projectId);
                  const isSelected = selected?.id === item.id;
                  const showStatus = tab === 'all' || tab === 'handled';
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        navigate({ queryId: item.id });
                        setMode('internal');
                      }}
                      className={`relative w-full overflow-hidden border-b px-4 py-3 text-left transition-colors hover:bg-muted/70 ${isSelected ? 'bg-accent/70 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-primary' : ''}`}
                      aria-current={isSelected ? 'true' : undefined}
                    >
                      <span className="flex items-start gap-3">
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                          {initials(item.originalSenderName)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 items-baseline gap-2">
                            <strong
                              className={`min-w-0 flex-1 truncate text-sm ${needsQueryAttention(item) ? 'font-semibold' : 'font-medium'}`}
                            >
                              {item.originalSenderName}
                            </strong>
                            <Time
                              value={item.createdAt}
                              className={`shrink-0 text-xs ${waitingTone(item)}`}
                            />
                          </span>
                          <span className="mt-0.5 line-clamp-2 text-sm text-foreground/80">
                            {preview(item)}
                          </span>
                          <span className="mt-1.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                            <span className="min-w-0 truncate">
                              {project?.name || 'Project'}
                              {(showStatus || item.requestType !== 'Question') &&
                                ` · ${item.requestType}`}
                              {showStatus && ` · ${queryStatusLabel(item)}`}
                            </span>
                            {item.taskId && (
                              <Badge
                                variant="outline"
                                className="shrink-0 border-info-border bg-info-bg px-1 py-0 text-xs text-info"
                              >
                                Task
                              </Badge>
                            )}
                            {item.deliveryStatus === 'Unknown' && (
                              <Badge
                                variant="outline"
                                className="shrink-0 border-warning-border bg-warning-bg px-1 py-0 text-xs text-warning"
                              >
                                Unknown
                              </Badge>
                            )}
                          </span>
                        </span>
                      </span>
                    </button>
                  );
                })
              ) : (
                <Empty
                  kind={search.trim() ? 'no-results' : 'first-use'}
                  className="m-4"
                  icon={MessageSquare}
                  title={search.trim() ? 'No conversations match' : emptyTab[tab][0]}
                  description={search.trim() ? 'Try another search.' : emptyTab[tab][1]}
                />
              )}
            </div>
          </aside>

          {/* Right conversation view */}
          <section
            className={`${mobileThread ? 'flex' : 'hidden lg:flex'} min-h-0 min-w-0 flex-col`}
            aria-label="Selected decision conversation"
          >
            {selected ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="lg:hidden"
                      onClick={() => goBack({ queryId: '' })}
                      aria-label="Back to conversations"
                    >
                      <ArrowLeft className="size-4" />
                    </Button>
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold">
                      {initials(selected.originalSenderName)}
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate type-label-14-strong">
                        {selected.originalSenderName}
                      </h2>
                      <div className="mt-1 flex min-w-0 flex-wrap gap-1">
                        <Badge variant="outline" className="bg-card" title="Project">
                          <FolderOpen aria-hidden="true" />
                          <span className="truncate">{selectedProject?.name || 'Project'}</span>
                        </Badge>
                        {selected.requestType !== 'Question' && (
                          <Badge variant="outline" className="bg-card">
                            {selected.requestType}
                          </Badge>
                        )}
                        <Badge variant="outline" className="bg-card">
                          {queryStatusLabel(selected)}
                          {selected.decisionStatus && ` (${selected.decisionStatus})`}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <QueryDecisionButtons
                      onChanged={() => {
                        load();
                        onProjectsChanged?.();
                      }}
                      request={selected}
                      disabled={busy}
                      onAccept={() => setAcceptOpen(true)}
                      onReject={() => setRejectOpen(true)}
                    />
                    {selected.status !== 'Done' && (
                      <Button variant="outline" size="sm" disabled={busy} onClick={markDone}>
                        Done
                      </Button>
                    )}
                  </div>
                </div>

                <div
                  ref={scrollRef}
                  className="chat-scroll min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain bg-muted/30 px-4 py-6 sm:px-6"
                >
                  {/* Delivery Status Warning */}
                  {selected.deliveryStatus === 'Unknown' && (
                    <div className="mx-auto max-w-[85%] card-box border-warning-border bg-warning-bg text-xs text-warning flex items-start gap-2">
                      <AlertTriangle className="size-4 shrink-0 text-warning mt-1" />
                      <div>
                        <strong>Delivery status unknown:</strong> A previous send attempt timed out
                        or interrupted. Check the Telegram group manually before sending again. Do
                        not retry automatically.
                      </div>
                    </div>
                  )}

                  {selected.deliveryStatus === 'Failed' && (
                    <div className="mx-auto max-w-[85%] card-box border-destructive/30 bg-destructive/10 text-xs text-destructive flex items-start gap-2">
                      <XCircle className="size-4 shrink-0 text-destructive mt-1" />
                      <div>
                        <strong>Delivery failed:</strong>{' '}
                        {selected.deliveryError ||
                          'Telegram rejected the message. You may retry publishing.'}
                      </div>
                    </div>
                  )}

                  {/* The client's message reads as a card: who, where and when on top, then the message. */}
                  <article className="rounded-xl border bg-card">
                    <header className="flex items-center gap-3 px-4 pt-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold">
                        {initials(selected.originalSenderName)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate type-label-14-strong">
                          {selected.originalSenderName}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">Telegram</p>
                      </div>
                      <Time
                        value={selected.createdAt}
                        className="shrink-0 text-xs text-muted-foreground"
                      />
                    </header>
                    <div className="space-y-2 px-4 pt-3 pb-4 type-copy-14">
                      <p className="whitespace-pre-wrap">
                        {selected.originalMessage || 'Shared an attachment'}
                      </p>

                      {/* Photo / Attachment previews */}
                      {selected.attachments?.length > 0 && (
                        <div className="mt-3 space-y-3">
                          {selected.attachments.map((attachment, index) => {
                            const isPhoto =
                              attachment.type === 'Photo' ||
                              /\.(png|jpe?g|webp|gif)$/i.test(attachment.fileName || '');
                            const mediaUrl = getAttachmentUrl(selected.id, index, 'founder');

                            return (
                              <div key={index} className="space-y-1">
                                {isPhoto ? (
                                  <div className="overflow-hidden rounded-xl border bg-muted/20">
                                    <img
                                      src={mediaUrl}
                                      alt={attachment.fileName || `Photo ${index + 1}`}
                                      className="max-h-56 max-w-full rounded-xl object-contain"
                                      onError={(e) => {
                                        e.currentTarget.style.display = 'none';
                                      }}
                                    />
                                    <a
                                      className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline px-2 py-1"
                                      href={mediaUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      <FileText className="size-3" />
                                      {attachment.fileName || 'View full image'}
                                      <ExternalLink className="size-2.5" />
                                    </a>
                                  </div>
                                ) : (
                                  <a
                                    key={index}
                                    className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-2 text-xs text-primary hover:underline"
                                    href={mediaUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    <FileText className="size-3" />
                                    {attachment.fileName || attachment.type || 'Document'}
                                    <ExternalLink className="size-3" />
                                  </a>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </article>

                  {selected.context && (
                    <div className="mx-auto max-w-[85%] rounded-xl border border-warning-border bg-warning-bg px-4 py-2 text-xs text-warning">
                      <strong>{selected.requestedByName} added:</strong> {selected.context}
                    </div>
                  )}

                  {selected.reviewNote && (
                    <div className="mx-auto max-w-[85%] rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-2 text-xs text-destructive">
                      <strong>Rejection reason:</strong> {selected.reviewNote}
                    </div>
                  )}

                  {followUps.map((event, idx) =>
                    event.type === 'comment' ? (
                      <div key={event.value.id || idx} className="flex justify-end">
                        <div className="max-w-[85%] space-y-1">
                          <p className="text-right text-xs text-muted-foreground">
                            {event.value.author} · private note · <Time value={event.at} />
                          </p>
                          <p className="whitespace-pre-wrap rounded-2xl rounded-br-sm border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning">
                            {event.value.text}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div key="published" className="flex justify-end">
                        <div className="max-w-[85%] space-y-1">
                          <p className="text-right text-xs text-muted-foreground">
                            Sent to Telegram · <Time value={event.at} />
                          </p>
                          <p className="whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-4 py-3 text-sm text-primary-foreground">
                            {event.value}
                          </p>
                        </div>
                      </div>
                    ),
                  )}

                  <div className="flex justify-center">
                    <QueryOutcome request={selected} />
                  </div>
                  {selected.status === 'Done' && (
                    <p className="text-center text-xs text-success">
                      Marked done <Time value={selected.resolvedAt} format="datetime" />
                    </p>
                  )}
                </div>

                {selected.status !== 'Done' && (
                  <form onSubmit={send} className="space-y-2 border-t p-3 sm:p-4">
                    <div className="flex items-center gap-2">
                      <SegmentedControl
                        className="flex-nowrap whitespace-nowrap"
                        label="Message type"
                        value={mode}
                        onValueChange={setMode}
                        options={[
                          { value: 'internal', label: 'Private note' },
                          ...(selected.status === 'Pending' || selected.deliveryStatus === 'Failed'
                            ? [{ value: 'publish', label: 'Reply to Telegram' }]
                            : []),
                        ]}
                      />
                      <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">
                        {mode === 'internal' ? 'Stays in web app' : 'The group will see this'}
                      </span>
                    </div>

                    {mode === 'publish' && (
                      <SuggestReply
                        key={selected.id}
                        requestId={selected.id}
                        disabled={busy}
                        onUse={(suggested) =>
                          setDrafts((current) => ({ ...current, [selected.id]: suggested }))
                        }
                      />
                    )}

                    <div className="flex items-end gap-2">
                      <Textarea
                        value={text}
                        onChange={(event) =>
                          mode === 'internal'
                            ? setNotes((current) => ({
                                ...current,
                                [selected.id]: event.target.value,
                              }))
                            : setDrafts((current) => ({
                                ...current,
                                [selected.id]: event.target.value,
                              }))
                        }
                        rows={2}
                        maxLength={mode === 'internal' ? 2000 : 3000}
                        placeholder={
                          mode === 'internal'
                            ? 'Discuss or record an internal decision…'
                            : 'Write the final answer for the Telegram group…'
                        }
                        aria-label={mode === 'internal' ? 'Private note' : 'Telegram reply'}
                        className="max-h-32 flex-1 resize-y text-xs"
                      />
                      <Button
                        type="submit"
                        disabled={
                          busy ||
                          !text.trim() ||
                          (mode === 'publish' && selected.deliveryStatus === 'Unknown')
                        }
                        aria-label={mode === 'internal' ? 'Save note' : 'Send to Telegram'}
                      >
                        <Send className="size-4 mr-1" />
                        <span className="hidden sm:inline">
                          {mode === 'internal' ? 'Save note' : 'Send to Telegram'}
                        </span>
                      </Button>
                    </div>
                  </form>
                )}
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
                <MessageSquare className="size-9 opacity-50" />
                <p className="text-sm font-medium">Select a conversation</p>
                <p className="text-xs">Telegram requests and founder decisions appear here.</p>
              </div>
            )}
          </section>
        </div>
      </div>

      {selected && (
        <QueryAcceptWizard
          open={acceptOpen}
          onOpenChange={setAcceptOpen}
          request={selected}
          onDone={async (result) => {
            await load();
            setNotice(result?.summary || 'Query updated.');
          }}
        />
      )}
      {selected && (
        <QueryRejectDialog
          open={rejectOpen}
          onOpenChange={setRejectOpen}
          request={selected}
          onDone={async () => {
            await load();
            setNotice('Client query rejected and the reply was sent.');
          }}
        />
      )}
    </div>
  );
}
