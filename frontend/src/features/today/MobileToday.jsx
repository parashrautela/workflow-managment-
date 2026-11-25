import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Inbox,
  MessagesSquare,
  Sparkles,
} from 'lucide-react';
import { request } from '@/lib/api';
import { formatDate, formatDateTime, formatTime, STUDIO_TIME_ZONE } from '@/lib/dates';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshButton } from '@/components/ui/refresh-button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusChip } from '@/components/ui/status-chip';
import { Time } from '@/components/ui/time';
import {
  buildRecentActivity,
  dayGreeting,
  firstName,
  partitionMeetings,
  summarizeQueries,
  summarizeWorkQueue,
} from '@/features/today/lib/todaySummary';

const isActiveChatProject = (project) =>
  !['Completed', 'Abandoned', 'Setup', 'Needs setup'].includes(project.status) &&
  !project.telegramSetupPending;

export function MobileToday({
  projects = [],
  decisionRequests = [],
  founderProfile = null,
  onOpenActions,
  onOpenMeetings,
  onOpenQueries,
  onOpenChat,
  onOpenProject,
  onOpenAssistant,
}) {
  const [founderTasks, setFounderTasks] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [chatByProject, setChatByProject] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [founderQueueRes, allQueueRes, meetingsRes, activityRes] = await Promise.allSettled([
        request('/api/founder/work-queue?personId=founder&status=all'),
        request('/api/founder/work-queue?personId=all&status=all'),
        request('/api/founder/meetings'),
        request('/api/founder/activity'),
      ]);

      if (founderQueueRes.status === 'fulfilled') setFounderTasks(founderQueueRes.value.tasks || []);
      if (allQueueRes.status === 'fulfilled') setAllTasks(allQueueRes.value.tasks || []);
      if (meetingsRes.status === 'fulfilled') setMeetings(meetingsRes.value.meetings || []);

      const activeProjects = projects.filter(isActiveChatProject);
      const recentChatIds = [];
      if (activityRes.status === 'fulfilled') {
        for (const row of activityRes.value.activity || []) {
          if (
            row.action === 'team_message' &&
            row.projectId &&
            !recentChatIds.includes(row.projectId) &&
            activeProjects.some((p) => p.id === row.projectId)
          ) {
            recentChatIds.push(row.projectId);
          }
          if (recentChatIds.length >= 4) break;
        }
      }
      for (const project of activeProjects) {
        if (recentChatIds.length >= 4) break;
        if (!recentChatIds.includes(project.id)) recentChatIds.push(project.id);
      }

      if (recentChatIds.length) {
        const chats = await Promise.allSettled(
          recentChatIds.map((id) =>
            request(`/api/founder/projects/${encodeURIComponent(id)}/team-chat`).then((res) => [
              id,
              res.messages || [],
            ]),
          ),
        );
        const map = {};
        for (const result of chats) {
          if (result.status === 'fulfilled') {
            const [id, messages] = result.value;
            map[id] = messages;
          }
        }
        setChatByProject(map);
      } else {
        setChatByProject({});
      }

      if (
        founderQueueRes.status === 'rejected' &&
        allQueueRes.status === 'rejected' &&
        meetingsRes.status === 'rejected'
      ) {
        setError('Could not load today’s summary. Please retry.');
      }
    } finally {
      setLoading(false);
    }
  }, [projects]);

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 20000);
    return () => clearInterval(timer);
  }, [load]);

  const now = new Date();
  const founderQueue = summarizeWorkQueue(founderTasks);
  const studioQueue = summarizeWorkQueue(allTasks);
  const useStudioFallback = founderQueue.total === 0 && studioQueue.urgentCount > 0;
  const displayedQueue = useStudioFallback ? studioQueue : founderQueue;
  const queuePerson = useStudioFallback ? 'all' : 'founder';

  const meetingGroups = partitionMeetings(meetings, now);
  const querySummary = summarizeQueries(decisionRequests, projects, now.getTime());
  const recentActivity = buildRecentActivity({
    projects,
    decisionRequests,
    chatMessagesByProject: chatByProject,
  });

  const name = firstName(founderProfile?.name);
  const greeting = name ? `${dayGreeting(now)}, ${name}` : dayGreeting(now);
  const todayLabel = formatDate(now, { timeZone: STUDIO_TIME_ZONE });

  const hasUrgentWork = displayedQueue.urgentCount > 0;
  const attentionBreakdown = [
    displayedQueue.overdue > 0 ? `${displayedQueue.overdue} overdue` : '',
    displayedQueue.approvals > 0
      ? `${displayedQueue.approvals} approval${displayedQueue.approvals === 1 ? '' : 's'}`
      : '',
    displayedQueue.blocked > 0 ? `${displayedQueue.blocked} blocked` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1>{greeting}</h1>
          <p className="mt-1 text-xs text-muted-foreground">{todayLabel}</p>
        </div>
        <RefreshButton onRefresh={load} />
      </header>

      {error && (
        <p role="alert" className="card-box border-overdue-border bg-overdue-bg text-sm text-overdue">
          {error}
        </p>
      )}

      {/* Attention Summary + Urgent Work */}
      <div className="space-y-3">
        {loading && !founderTasks.length && !allTasks.length ? (
          <Skeleton className="h-24 w-full rounded-xl" />
        ) : (
          <div
            className={`overflow-hidden rounded-xl border ${
              displayedQueue.overdue > 0
                ? 'border-overdue-border bg-overdue-bg/40'
                : hasUrgentWork
                  ? 'border-warning-border bg-warning-bg/40'
                  : 'bg-card'
            }`}
          >
            <button
              type="button"
              onClick={() => onOpenActions(queuePerson)}
              className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-lg ${
                    displayedQueue.overdue > 0
                      ? 'bg-overdue-bg text-overdue'
                      : hasUrgentWork
                        ? 'bg-warning-bg text-warning'
                        : 'bg-success-bg text-success'
                  }`}
                >
                  {displayedQueue.total > 0 ? (
                    <AlertTriangle className="size-4" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="type-label-14-strong">
                    {displayedQueue.total > 0
                      ? `${displayedQueue.total} ${displayedQueue.total === 1 ? 'item needs' : 'items need'} attention`
                      : 'No overdue or pending tasks'}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {useStudioFallback
                      ? `Across active projects · ${attentionBreakdown}`
                      : attentionBreakdown || 'All active deliverables are on schedule'}
                  </p>
                </div>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>

            {displayedQueue.top.length > 0 && (
              <div className="border-t bg-card divide-y">
                {displayedQueue.top.map(({ task, status }) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onOpenActions(queuePerson)}
                    className="flex min-h-12 w-full flex-col gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/60 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                  >
                    <span className="w-full min-w-0 sm:flex-1">
                      <span className="block truncate text-sm font-medium">{task.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {task.projectName}
                        {task.stageName ? ` · ${task.stageName}` : ''}
                      </span>
                    </span>
                    <StatusChip status={status} className="self-start shrink-0 sm:self-center" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Today's Meetings */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="type-heading-20 flex items-center gap-2">
            <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />
            Today’s meetings
          </h2>
          <Button variant="ghost" size="sm" onClick={onOpenMeetings}>
            All meetings
            <ChevronRight className="size-4" />
          </Button>
        </div>

        {loading && !meetings.length ? (
          <Skeleton className="h-20 w-full rounded-xl" />
        ) : meetingGroups.today.length > 0 ? (
          <div className="overflow-hidden rounded-xl border bg-card divide-y">
            {meetingGroups.today.map((meeting) => {
              const pastTime = Date.parse(meeting.startsAt) < now.getTime();
              return (
                <button
                  key={meeting.id}
                  type="button"
                  onClick={onOpenMeetings}
                  className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold tabular-nums text-primary">
                        {formatTime(meeting.startsAt, { timeZone: STUDIO_TIME_ZONE })}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        · {meeting.projectName}
                      </span>
                      {pastTime && (
                        <Badge variant="secondary" className="px-1.5 py-0 text-xs">
                          Earlier
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-sm font-medium">{meeting.title}</p>
                    {meeting.location && (
                      <p className="truncate text-xs text-muted-foreground">{meeting.location}</p>
                    )}
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              );
            })}
          </div>
        ) : (
          <button
            type="button"
            onClick={onOpenMeetings}
            className="flex min-h-12 w-full items-center justify-between gap-3 card-box bg-card text-left transition-colors hover:bg-muted/50"
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium">No meetings today</span>
              <span className="block truncate text-xs text-muted-foreground">
                {meetingGroups.nextUpcoming
                  ? `Next: ${meetingGroups.nextUpcoming.projectName} · ${formatDateTime(
                      meetingGroups.nextUpcoming.startsAt,
                      { timeZone: STUDIO_TIME_ZONE },
                    )}`
                  : 'Open a task to schedule a site visit or review.'}
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Pending Queries */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="type-heading-20 flex items-center gap-2">
            <Inbox className="size-4 text-muted-foreground" aria-hidden="true" />
            Pending queries
          </h2>
          <Button variant="ghost" size="sm" onClick={() => onOpenQueries('')}>
            Open inbox
            <ChevronRight className="size-4" />
          </Button>
        </div>

        {querySummary.total > 0 ? (
          <div className="overflow-hidden rounded-xl border bg-card">
            <button
              type="button"
              onClick={() => onOpenQueries('')}
              className="flex min-h-12 w-full flex-wrap items-center justify-between gap-2 border-b px-4 py-3 text-left transition-colors hover:bg-muted/50"
            >
              <div className="flex flex-wrap items-center gap-2">
                {querySummary.over72h > 0 && (
                  <Badge variant="outline" className="border-overdue-border bg-overdue-bg text-overdue">
                    {querySummary.over72h} waiting &gt; 72h
                  </Badge>
                )}
                {querySummary.over24h > 0 && (
                  <Badge variant="outline" className="border-warning-border bg-warning-bg text-warning">
                    {querySummary.over24h} waiting &gt; 24h
                  </Badge>
                )}
                {querySummary.fresh > 0 && (
                  <Badge variant="secondary">{querySummary.fresh} recent</Badge>
                )}
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
            <div className="divide-y">
              {querySummary.top.map((query) => (
                <button
                  key={query.id}
                  type="button"
                  onClick={() => onOpenQueries(query.id)}
                  className="flex min-h-12 w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium text-muted-foreground">
                        {query.projectName} · {query.originalSenderName}
                      </span>
                      <Time
                        value={query.createdAt}
                        className="shrink-0 text-xs text-muted-foreground"
                      />
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm">
                      {query.originalMessage || query.context || 'Shared an attachment'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onOpenQueries('')}
            className="flex min-h-12 w-full items-center justify-between gap-3 card-box bg-card text-left transition-colors hover:bg-muted/50"
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium">All client queries handled</span>
              <span className="block text-xs text-muted-foreground">
                New questions from linked Telegram groups appear here.
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Recent Activity */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="type-heading-20 flex items-center gap-2">
            <MessagesSquare className="size-4 text-muted-foreground" aria-hidden="true" />
            Recent activity
          </h2>
          <Button variant="ghost" size="sm" onClick={() => onOpenChat('')}>
            Project chats
            <ChevronRight className="size-4" />
          </Button>
        </div>

        {loading && !recentActivity.length ? (
          <Skeleton className="h-28 w-full rounded-xl" />
        ) : recentActivity.length > 0 ? (
          <div className="overflow-hidden rounded-xl border bg-card divide-y">
            {recentActivity.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  item.kind === 'chat'
                    ? onOpenChat(item.projectId)
                    : item.queryId
                      ? onOpenQueries(item.queryId)
                      : onOpenProject(item.projectId)
                }
                className="flex min-h-12 w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium text-muted-foreground">
                      {item.projectName} · {item.kind === 'chat' ? 'Team chat' : 'Client query'}
                    </span>
                    <Time value={item.at} className="shrink-0 text-xs text-muted-foreground" />
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm">
                    <span className="font-medium">{item.sender}:</span> {item.snippet}
                  </p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="card-box bg-card text-sm text-muted-foreground">
            Recent team chat messages and client updates across ongoing projects appear here.
          </div>
        )}
      </div>

      {/* Quick Assistant Link (kept off the 4-tab bar per mobile strategy) */}
      <button
        type="button"
        onClick={onOpenAssistant}
        className="flex min-h-12 w-full items-center justify-between gap-3 card-box bg-card text-left transition-colors hover:bg-muted/50"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
            <Sparkles className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="type-label-14-strong">Ask Iksha Assistant</p>
            <p className="truncate text-xs text-muted-foreground">
              Summarize blockers, upcoming deadlines, or project status
            </p>
          </div>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </button>
    </section>
  );
}
