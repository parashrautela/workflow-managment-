import { STUDIO_TIME_ZONE } from '../../../lib/dates.js';
import { taskStatus } from '../../../lib/taskStatus.js';
import { needsQueryAttention } from '../../queries/lib/queryStatus.js';

const DAY_MS = 86400000;

export function studioDateKey(value, timeZone = STUDIO_TIME_ZONE) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function dayGreeting(now = new Date(), timeZone = STUDIO_TIME_ZONE) {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(now),
  );
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function firstName(fullName = '') {
  return String(fullName).trim().split(/\s+/).filter(Boolean)[0] || '';
}

export function partitionMeetings(meetings = [], now = new Date(), timeZone = STUDIO_TIME_ZONE) {
  const todayKey = studioDateKey(now, timeZone);
  const tomorrowKey = studioDateKey(new Date(now.getTime() + DAY_MS), timeZone);
  const scheduled = [...meetings]
    .filter((m) => m.status === 'Scheduled')
    .sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)));

  const today = [];
  const tomorrow = [];
  const upcoming = [];
  const past = [];

  for (const meeting of scheduled) {
    const key = studioDateKey(meeting.startsAt, timeZone);
    if (!key) continue;
    if (key < todayKey) past.push(meeting);
    else if (key === todayKey) today.push(meeting);
    else if (key === tomorrowKey) tomorrow.push(meeting);
    else upcoming.push(meeting);
  }

  return {
    today,
    tomorrow,
    upcoming,
    past: past.reverse(),
    nextUpcoming: tomorrow[0] || upcoming[0] || null,
  };
}

export function summarizeWorkQueue(tasks = []) {
  const resolveStatus = (task) =>
    task.statusState ||
    taskStatus(task, { stage: task.project?.stages?.find((stage) => stage.id === task.stageId) });

  const nowTasks = [];
  let overdue = 0;
  let approvals = 0;
  let blocked = 0;

  for (const task of tasks) {
    const status = resolveStatus(task);
    if (status.key === 'upcoming') continue;
    if (status.overdue) overdue += 1;
    if (status.key === 'waiting') approvals += 1;
    if (status.key === 'blocked') blocked += 1;
    nowTasks.push({ task, status });
  }

  const priorityRank = ({ status }) => {
    if (status.overdue) return 0;
    if (status.key === 'waiting') return 1;
    if (status.key === 'blocked') return 2;
    return 3;
  };

  nowTasks.sort(
    (a, b) =>
      priorityRank(a) - priorityRank(b) ||
      String(a.task.deadline || '9999').localeCompare(String(b.task.deadline || '9999')),
  );

  return {
    total: nowTasks.length,
    overdue,
    approvals,
    blocked,
    urgentCount: overdue + approvals + blocked,
    top: nowTasks.slice(0, 3).map(({ task, status }) => ({ task, status })),
  };
}

export function summarizeQueries(requests = [], projects = [], now = Date.now()) {
  const openIds = new Set(
    projects.filter((p) => !['Completed', 'Abandoned'].includes(p.status)).map((p) => p.id),
  );
  const projectNames = new Map(projects.map((p) => [p.id, p.name]));

  const pending = requests.filter(
    (req) => needsQueryAttention(req) && (!req.projectId || openIds.has(req.projectId)),
  );

  let over72h = 0;
  let over24h = 0;
  let fresh = 0;

  for (const item of pending) {
    const hours = (now - Date.parse(item.createdAt)) / 3600000;
    if (hours >= 72) over72h += 1;
    else if (hours >= 24) over24h += 1;
    else fresh += 1;
  }

  const prioritized = [...pending].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );

  return {
    total: pending.length,
    over72h,
    over24h,
    fresh,
    top: prioritized.slice(0, 2).map((item) => ({
      ...item,
      projectName: projectNames.get(item.projectId) || 'Project',
    })),
  };
}

export function buildRecentActivity({
  projects = [],
  decisionRequests = [],
  chatMessagesByProject = {},
  limit = 5,
}) {
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const openProjectIds = new Set(
    projects.filter((p) => !['Completed', 'Abandoned'].includes(p.status)).map((p) => p.id),
  );
  const items = [];

  for (const [projectId, messages] of Object.entries(chatMessagesByProject)) {
    const project = projectMap.get(projectId);
    if (!project || !Array.isArray(messages) || !messages.length) continue;
    const latest = messages[messages.length - 1];
    if (!latest?.at) continue;
    items.push({
      id: `chat-${projectId}-${latest.id || latest.at}`,
      kind: 'chat',
      projectId,
      projectName: project.name,
      sender: latest.senderName || 'Team',
      snippet: latest.text || '',
      at: latest.at,
    });
  }

  for (const req of decisionRequests) {
    if (req.projectId && !openProjectIds.has(req.projectId)) continue;
    const project = projectMap.get(req.projectId);
    const snippet =
      req.originalMessage ||
      req.context ||
      (req.attachments?.length ? 'Shared an attachment' : '');
    if (!req.createdAt) continue;
    items.push({
      id: `query-${req.id}`,
      kind: 'query',
      queryId: req.id,
      projectId: req.projectId,
      projectName: project?.name || 'Client query',
      sender: req.originalSenderName || 'Client',
      snippet,
      at: req.createdAt,
    });
  }

  return items
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, limit);
}
