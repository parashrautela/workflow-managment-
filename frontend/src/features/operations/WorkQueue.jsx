import { PersonalReminders } from '@/features/operations/PersonalReminders';
import { matchesRole } from '@/features/people/lib/roles';
import { LocationProjectPicker } from '@/features/projects/LocationProjectPicker';
import { useEffect, useState } from 'react';
import { ArrowUpRight, CheckCircle2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TaskThreadDrawer } from '@/features/tasks/TaskThreadDrawer';
import { request } from '@/lib/api';
import { useNavigation, navigate, goBack } from '@/lib/navigation';
import { formatCalendar } from '@/lib/dates';
import { Time } from '@/components/ui/time';
import { StatusChip } from '@/components/ui/status-chip';
import { matchesTaskStatus, taskStatus } from '@/lib/taskStatus';
import { Empty } from '@/components/ui/empty';

const statusOf = (task) =>
  taskStatus(task, { stage: task.project?.stages?.find((stage) => stage.id === task.stageId) });
const matchesStatusFilter = (status, filter) =>
  ({
    approvals: status.key === 'waiting',
    overdue: status.overdue,
    blocked: status.key === 'blocked',
    'in-progress': matchesTaskStatus(status, 'active'),
  })[filter] ?? true;

export function WorkQueue({
  projects = [],
  isFounder = true,
  initialPersonId = 'founder',
  personName = 'Me',
  onChanged,
}) {
  const [person, setPerson] = useState(initialPersonId),
    [projectId, setProjectId] = useState(''),
    [status, setStatus] = useState('pending');
  const [tasks, setTasks] = useState([]),
    [employees, setEmployees] = useState([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [link, setLink] = useState(''),
    [syncWarning, setSyncWarning] = useState(''),
    [connected, setConnected] = useState(false);
  const navigation = useNavigation();
  const selected =
    navigation.section === 'actions'
      ? tasks.find((task) => task.id === navigation.taskId) || null
      : null;
  const namespace = isFounder ? 'founder' : 'employee';
  // The status filter uses the same words as the rows, so a row can never contradict its filter.
  const visibleTasks = tasks.filter((task) => matchesStatusFilter(statusOf(task), status));
  const load = async () => {
    try {
      const data = await request(
        `/api/${namespace}/work-queue?personId=${encodeURIComponent(person)}&projectId=${encodeURIComponent(projectId)}&status=pending`,
      );
      setTasks(data.tasks);
      setConnected(Boolean(data.telegramConnected));
      setSyncWarning(data.syncWarning || '');
      setEmployees(data.employees || []);
      setError('');
    } catch (problem) {
      setError(problem.message);
    }
  };
  useEffect(() => {
    setPerson(initialPersonId);
  }, [initialPersonId]);
  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 15000);
    return () => clearInterval(timer);
  }, [person, projectId, namespace]);
  const connect = async () => {
    try {
      const data = await request(`/api/${namespace}/personal-connection`);
      setLink(data.link);
    } catch (problem) {
      setError(problem.message);
    }
  };
  return (
    <section className="work-queue">
      <div className="work-queue-header flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1>Actions needed</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review approvals and follow up on project work
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            className="work-connection"
            data-connected={connected}
            variant="outline"
            size="sm"
            onClick={connect}
          >
            {connected ? 'Telegram connected' : 'Connect Telegram digests'}
          </Button>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
        </div>
      </div>
      {link && (
        <p className="card-box text-sm">
          Open{' '}
          <a className="underline" href={link} target="_blank" rel="noreferrer">
            the project bot
          </a>{' '}
          and press Start once. Each employee connects from their own Telegram account.
        </p>
      )}
      <div className="work-queue-filters grid gap-3 sm:grid-cols-3">
        {isFounder && (
          <label className="grid min-w-0 gap-1 text-xs">
            Person
            <select
              className="h-10 w-full min-w-0 truncate rounded-md border bg-background px-3 max-sm:h-11"
              value={person}
              onChange={(event) => setPerson(event.target.value)}
            >
              <option value="founder">My work (Founder)</option>
              <option value="all">Everyone</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="grid min-w-0 gap-1 text-xs">
          Project
          <select
            className="h-10 w-full min-w-0 truncate rounded-md border bg-background px-3 max-sm:h-11"
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
          >
            <option value="">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-xs">
          Status
          <select
            className="h-10 w-full min-w-0 truncate rounded-md border bg-background px-3 max-sm:h-11"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="pending">All pending work</option>
            <option value="approvals">Pending approvals</option>
            <option value="overdue">Overdue</option>
            <option value="blocked">Blocked</option>
            <option value="in-progress">In progress</option>
          </select>
        </label>
      </div>
      {syncWarning && (
        <p role="status" className="text-sm text-warning">
          {syncWarning}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="work-queue-list space-y-3">
        {visibleTasks.map((task) => (
          <button
            key={task.id}
            className="work-queue-item flex w-full items-center justify-between gap-3 card-box bg-card text-left hover:bg-muted"
            onClick={() => navigate({ section: 'actions', taskId: task.id })}
          >
            {isFounder ? (
              <>
                <span className="work-queue-item-content">
                  <span className="work-queue-item-title">{task.title}</span>
                  <span className="work-queue-item-context">
                    {task.projectName} · {task.stageName}
                    {task.spaces?.length ? ` · ${task.spaces.join(', ')}` : ''}
                  </span>
                </span>
                <span className="work-queue-item-meta">
                  {task.deadline && (
                    <span>
                      Due <Time value={task.deadline} format="calendar" />
                    </span>
                  )}
                  <StatusChip status={statusOf(task)} className="justify-self-end" />
                </span>
              </>
            ) : (
              <div>
                <p className="text-sm font-medium">
                  {task.projectName} — {task.stageName} — {task.title}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <StatusChip status={statusOf(task)} />
                  {task.deadline ? ` · Due ${formatCalendar(task.deadline)}` : ''}
                  {task.spaces?.length ? ` · ${task.spaces.join(', ')}` : ''}
                </p>
              </div>
            )}
            <ArrowUpRight className="work-queue-item-arrow size-4 shrink-0" />
          </button>
        ))}
        {!visibleTasks.length && !error && (
          <Empty
            kind={tasks.length ? 'no-results' : 'first-use'}
            icon={CheckCircle2}
            title={tasks.length ? 'No work matches these filters' : 'No pending work'}
            description={
              tasks.length
                ? 'Try another status, or clear the filter.'
                : 'Work that needs action appears here.'
            }
            action={
              tasks.length ? (
                <Button variant="outline" size="sm" onClick={() => setStatus('pending')}>
                  Show all pending work
                </Button>
              ) : null
            }
          />
        )}
      </div>
      <TaskThreadDrawer
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) goBack({ taskId: '' });
        }}
        task={selected}
        project={selected?.project}
        projectMembers={selected?.project.members || []}
        isFounder={isFounder}
        currentActor={personName}
        onTaskUpdated={() => {
          load();
          onChanged?.();
        }}
      />
      {isFounder && (
        <SupervisorTools
          employees={employees}
          projects={projects}
          onChanged={() => {
            load();
            onChanged?.();
          }}
        />
      )}
    </section>
  );
}

function SupervisorTools({ employees, projects, onChanged }) {
  const [form, setForm] = useState({ fromId: '', toId: '', projectIds: [] }),
    [preview, setPreview] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [settings, setSettings] = useState(null),
    [deliveries, setDeliveries] = useState([]),
    [connections, setConnections] = useState([]);
  const change = (next) => {
    setForm(next);
    setPreview(null);
    setNotice('');
  };
  const run = async (apply) => {
    setBusy(true);
    setError('');
    try {
      const result = await request(
        `/api/founder/supervisor-replacement/${apply ? 'apply' : 'preview'}`,
        {
          method: 'POST',
          body: { ...form, ...(apply ? { fingerprint: preview.fingerprint } : {}) },
        },
      );
      if (apply) {
        setPreview(null);
        setNotice('Supervisor responsibilities transferred. Completed work was preserved.');
        onChanged();
      } else setPreview(result);
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  };
  const loadSettings = async () => {
    try {
      const data = await request('/api/founder/operations-settings');
      setSettings(data.digest);
      setDeliveries(data.deliveries || []);
      setConnections(data.connections || []);
    } catch (problem) {
      setError(problem.message);
    }
  };
  const saveSettings = async () => {
    setBusy(true);
    try {
      await request('/api/founder/operations-settings', { method: 'POST', body: settings });
      setNotice('Morning digest schedule saved.');
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3 border-t pt-4">
      <details className="card-box">
        <summary className="cursor-pointer text-sm font-semibold">
          Replace a site supervisor
        </summary>
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ['fromId', 'Departing supervisor'],
              ['toId', 'Replacement'],
            ].map(([key, label]) => (
              <label key={key} className="grid gap-1 text-xs">
                {label}
                <select
                  className="h-10 w-full min-w-0 truncate rounded-md border bg-background px-3 max-sm:h-11"
                  value={form[key]}
                  onChange={(event) => change({ ...form, [key]: event.target.value })}
                >
                  <option value="">Choose employee…</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium">Projects to transfer</legend>
            {!form.fromId && (
              <p className="text-xs text-muted-foreground">
                Choose the departing supervisor to see their projects by city.
              </p>
            )}
            <LocationProjectPicker
              projects={projects.filter(
                (project) =>
                  !['Completed', 'Abandoned'].includes(project.status) &&
                  project.members?.some(
                    (member) =>
                      member.employeeId === form.fromId &&
                      member.active !== false &&
                      matchesRole(member.roles || member.role, 'Site Supervisor'),
                  ),
              )}
              selected={form.projectIds}
              onChange={(projectIds) => change({ ...form, projectIds })}
            />
          </fieldset>
          <Button
            disabled={busy || !form.fromId || !form.toId || !form.projectIds.length}
            variant="outline"
            onClick={() => run(false)}
          >
            Preview transfer
          </Button>
          {preview && (
            <div className="space-y-2 rounded-xl bg-muted p-3 text-sm">
              <p>
                {preview.tasks.length} pending tasks across {preview.projects.length} projects will
                transfer from {preview.from.name} to {preview.to.name}.
              </p>
              {preview.tasks.map((task) => (
                <p key={task.id} className="text-xs">
                  {task.title}
                </p>
              ))}
              <p className="text-xs">
                Add the replacement to each selected Telegram group first. Their personal digest
                requires pressing Start in the bot.
              </p>
              <Button disabled={busy} onClick={() => run(true)}>
                Confirm replacement
              </Button>
            </div>
          )}
        </div>
      </details>
      <details
        className="card-box"
        onToggle={(event) => {
          if (event.currentTarget.open && !settings) loadSettings();
        }}
      >
        <summary className="cursor-pointer text-sm font-semibold">Morning digest settings</summary>
        {settings && (
          <div className="mt-3 space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })}
              />
              Send personal morning digests
            </label>
            <label className="grid gap-1 text-xs">
              Time
              <Input
                type="time"
                value={settings.time}
                onChange={(event) => setSettings({ ...settings, time: event.target.value })}
              />
            </label>
            <label className="grid gap-1 text-xs">
              Timezone
              <Input
                value={settings.timeZone}
                onChange={(event) => setSettings({ ...settings, timeZone: event.target.value })}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.weekends}
                onChange={(event) => setSettings({ ...settings, weekends: event.target.checked })}
              />
              Include weekends
            </label>
            <p className="text-xs text-muted-foreground">
              Empty digests are skipped. Only active employees who connected the bot receive their
              work.
            </p>
            <Button disabled={busy} onClick={saveSettings}>
              Save schedule
            </Button>
            <PersonalReminders connections={connections} onChanged={loadSettings} />
            {deliveries
              .slice(-10)
              .reverse()
              .map((delivery) => (
                <p key={delivery.id} className="text-xs">
                  {employees.find((row) => row.id === delivery.employeeId)?.name ||
                    delivery.employeeId}{' '}
                  · {formatCalendar(delivery.date)} · {delivery.status}
                  {delivery.error ? ` · ${delivery.error}` : ''}
                </p>
              ))}
          </div>
        )}
      </details>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-success">
          {notice}
        </p>
      )}
    </div>
  );
}
