import { MeetingsView } from '@/features/meetings/Meetings';
import { ProjectConversations } from '@/features/collaboration/ProjectConversations';
import { needsQueryAttention } from '@/features/queries/lib/queryStatus';
import { WorkQueue } from '@/features/operations/WorkQueue';
import { WorkspaceAccess, IkshaBrand } from '@/features/auth/WorkspaceAccess';
import { ProjectTimelineWorkspace as ProjectTimeline } from '@/features/timeline/ProjectTimelineWorkspace';
import { ProjectFiles } from '@/features/projects/ProjectFiles';
// frontend/src/EmployeeApp.jsx
import { useEffect, useState, useCallback } from 'react';
import { useNavigation, navigate, goBack } from '@/lib/navigation';
import {
  Building2,
  CheckCircle2,
  FolderKanban,
  LogOut,
  MessageSquare,
  Check,
  Calendar,
  User,
  AlertCircle,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TeamChat } from '@/features/collaboration/TeamChat';
import { TaskThreadDrawer } from '@/features/tasks/TaskThreadDrawer';
import { ClientQueryCard } from '@/features/queries/ClientQueryCard';
import { ProjectDependencyGraph } from '@/features/timeline/ProjectDependencyGraph';
import { request, fetchTasks, fetchProjectWorkspace, fetchDecisionRequests } from '@/lib/api';
import { formatCalendar } from '@/lib/dates';
import { StatusChip } from '@/components/ui/status-chip';
import { matchesTaskStatus, TASK_STATUS_OPTIONS, taskStatus } from '@/lib/taskStatus';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Empty } from '@/components/ui/empty';

export default function EmployeeApp() {
  const [auth, setAuth] = useState('checking');
  const [employee, setEmployee] = useState(null);
  const [projects, setProjects] = useState([]);
  const navigation = useNavigation();
  const selectedId = navigation.projectId || projects[0]?.id || null;
  const [tasks, setTasks] = useState([]);
  const [decisionRequests, setDecisionRequests] = useState([]);
  const [taskSelection, setTaskSelection] = useState(null);
  const selectedTask =
    navigation.section === 'projects'
      ? tasks.find((task) => task.id === navigation.taskId) ||
        (taskSelection?.id === navigation.taskId ? taskSelection : null)
      : null;
  const taskDrawerOpen = Boolean(selectedTask);
  const openTask = (task) => {
    setTaskSelection(task);
    navigate({
      section: 'projects',
      projectId: selectedId,
      projectTab: navigation.projectTab || 'timeline',
      taskId: task.id,
    });
  };
  const [taskViewMode, setTaskViewMode] = useState('list');
  const [taskSearch, setTaskSearch] = useState(''),
    [taskStatusFilter, setTaskStatusFilter] = useState('all');
  const [staleData, setStaleData] = useState(false);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const data = await request('/api/employee/me');
      setEmployee(data.employee);
      setProjects(data.projects || []);
      setAuth('signed-in');
    } catch (problem) {
      if (problem.status === 401) setAuth('signed-out');
      else {
        setError('Could not connect to the workspace. Please retry.');
        setAuth((current) => (current === 'checking' ? 'signed-out' : current));
      }
    }
  };

  useEffect(() => {
    load();
    const expired = () => setAuth('signed-out');
    window.addEventListener('studio-iksha:unauthorized', expired);
    return () => window.removeEventListener('studio-iksha:unauthorized', expired);
  }, []);

  const selected = projects.find((project) => project.id === selectedId);
  const statusOfTask = (t) =>
    taskStatus(t, { stage: selected?.stages?.find((stage) => stage.id === t.stageId) });

  // Load project workspace tasks and queries
  const loadWorkspaceData = useCallback(async () => {
    if (!selected?.id) return;
    setLoadingWorkspace(true);
    setError('');
    try {
      // 1. Load tasks (via workspace or tasks endpoint)
      const wsData = await fetchProjectWorkspace(selected.id, 'employee').catch(() => null);
      if (wsData && Array.isArray(wsData.tasks)) {
        setTasks(wsData.tasks);
        setStaleData(Boolean(wsData.staleData));
      } else {
        const tData = await fetchTasks(selected.id, 'employee');
        setTasks(tData.tasks || []);
        setStaleData(false);
      }

      // 2. Load decision requests for assigned projects
      const decData = await fetchDecisionRequests('employee');
      setDecisionRequests(decData.requests || []);
    } catch (problem) {
      setError(problem.message || 'Could not refresh the workspace. Please retry.');
    } finally {
      setLoadingWorkspace(false);
    }
  }, [selected?.id]);

  useEffect(() => {
    if (selected?.id) {
      loadWorkspaceData();
    }
  }, [selected?.id, loadWorkspaceData]);

  const logout = async () => {
    await request('/api/employee/logout', { method: 'POST' });
    setAuth('signed-out');
    setEmployee(null);
    setProjects([]);
    setTasks([]);
    setDecisionRequests([]);
  };

  if (auth === 'checking') {
    return (
      <main className="grid min-h-dvh place-items-center bg-background p-6">
        <div className="w-full max-w-md space-y-4">
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-52 w-full" />
        </div>
      </main>
    );
  }

  if (auth === 'signed-out') {
    return <WorkspaceAccess team />;
  }

  // Filter queries for selected project
  const projectQueries = decisionRequests.filter((r) => r.projectId === selected?.id);
  const pendingQueriesCount = projectQueries.filter(needsQueryAttention).length;

  return (
    <div className="iksha-workspace app-glow min-h-dvh bg-background pb-[max(24px,env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-20 border-b bg-card/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <IkshaBrand compact />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">Studio Iksha</p>
            <p className="truncate text-xs text-muted-foreground">
              {employee?.name} · Team workspace
            </p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Sign out" onClick={logout}>
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
        <WorkQueue
          projects={projects}
          isFounder={false}
          initialPersonId={employee?.id || ''}
          personName={employee?.name || 'Me'}
          onChanged={loadWorkspaceData}
        />
        <details className="card-box bg-card">
          <summary className="text-sm font-semibold">Project conversations</summary>
          <div className="pt-4">
            <ProjectConversations
              projects={projects}
              namespace="employee"
              actor={employee.id}
              embedded
            />
          </div>
        </details>
        <details className="card-box bg-card">
          <summary className="text-sm font-semibold">Scheduled meetings</summary>
          <div className="pt-4">
            <MeetingsView namespace="employee" embedded />
          </div>
        </details>
        {error && (
          <p
            role="alert"
            className="card-box border-destructive/30 bg-destructive/10 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <div>
          <p className="iksha-eyebrow">My workspace</p>
          <h2 className="mt-1">Your projects</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            You are assigned to {projects.length} {projects.length === 1 ? 'project' : 'projects'}.
          </p>
        </div>

        {projects.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => navigate({ section: 'projects', projectId: project.id })}
                className={`card-box bg-card text-left shadow-xs transition-colors duration-200 hover:border-primary/40 ${selectedId === project.id ? 'border-primary' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <FolderKanban className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-sm">{project.name}</strong>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {project.location || project.clientName}
                    </p>
                  </div>
                  <Badge variant="secondary">{project.status || 'Setup'}</Badge>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <Empty
            icon={FolderKanban}
            title="No projects assigned yet"
            description="Ask your founder to add your employee ID to a project."
          />
        )}

        {selected && (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="iksha-eyebrow">Selected project</p>
                <h2 className="mt-1">{selected.name}</h2>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadWorkspaceData}
                  disabled={loadingWorkspace}
                >
                  <RefreshCw
                    className={`size-3.5 mr-1 ${loadingWorkspace ? 'animate-spin' : ''}`}
                  />
                  Refresh
                </Button>
                <Badge variant="outline">{selected.status}</Badge>
              </div>
            </div>

            <Tabs
              key={selected.id}
              value={navigation.projectTab || 'timeline'}
              onValueChange={(projectTab) =>
                navigate({ section: 'projects', projectId: selected.id, projectTab })
              }
              className="gap-4"
            >
              <TabsList className="flex flex-wrap w-full justify-start h-auto gap-1 bg-muted/60 p-1 rounded-xl">
                <TabsTrigger value="timeline" className="font-semibold text-xs px-3 py-2">
                  <Calendar className="size-4 mr-2" />
                  Timeline
                </TabsTrigger>
                <TabsTrigger value="tasks" className="font-semibold text-xs px-3 py-2">
                  <CheckCircle2 className="size-4 mr-2" />
                  Tasks ({tasks.length})
                </TabsTrigger>
                <TabsTrigger value="queries" className="font-semibold text-xs px-3 py-2">
                  <AlertCircle className="size-4 mr-2" />
                  Client queries
                  {pendingQueriesCount > 0 && (
                    <Badge
                      variant="secondary"
                      className="ml-2 size-4 p-0 text-xs justify-center bg-warning-bg text-warning"
                    >
                      {pendingQueriesCount}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="chat" className="font-semibold text-xs px-3 py-2">
                  <MessageSquare className="size-4 mr-2" />
                  Team chat
                </TabsTrigger>
                <TabsTrigger value="files" className="font-semibold text-xs px-3 py-2">
                  Files
                </TabsTrigger>
                <TabsTrigger value="overview" className="font-semibold text-xs px-3 py-2">
                  Overview
                </TabsTrigger>
              </TabsList>

              <TabsContent value="timeline">
                <ProjectTimeline
                  projectId={selected.id}
                  projectStartDate={selected.startDate}
                  namespace="employee"
                  tasks={tasks}
                  stages={selected.stages || []}
                  members={selected.members || []}
                  onOpenTask={(task) => {
                    openTask(task);
                  }}
                />
              </TabsContent>
              {/* Tasks Tab */}
              <TabsContent value="tasks" className="space-y-3">
                <div className="flex items-center justify-between gap-2 pb-1">
                  <SegmentedControl
                    label="Task view"
                    value={taskViewMode}
                    onValueChange={setTaskViewMode}
                    options={[
                      { value: 'list', label: 'List' },
                      { value: 'graph', label: 'Dependency graph' },
                    ]}
                  />
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    aria-label="Find project tasks"
                    value={taskSearch}
                    onChange={(e) => setTaskSearch(e.target.value)}
                    placeholder="Find task, stage or role…"
                  />
                  <label className="grid gap-1 text-xs">
                    Task status
                    <select
                      value={taskStatusFilter}
                      onChange={(e) => setTaskStatusFilter(e.target.value)}
                    >
                      <option value="all">All statuses</option>
                      {TASK_STATUS_OPTIONS.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {taskViewMode === 'graph' ? (
                  <ProjectDependencyGraph
                    tasks={tasks}
                    employees={
                      selected?.members
                        ? selected.members.map((m) => ({ id: m.employeeId, name: m.name }))
                        : []
                    }
                    stages={selected.stages || []}
                    onOpenTask={(taskItem) => {
                      openTask(taskItem);
                    }}
                    onSwitchToList={() => setTaskViewMode('list')}
                    isFounder={false}
                    staleDataNotice={staleData}
                  />
                ) : tasks.length ? (
                  tasks
                    .filter(
                      (t) =>
                        (taskStatusFilter === 'all' ||
                          matchesTaskStatus(statusOfTask(t), taskStatusFilter)) &&
                        `${t.title} ${t.sourceRole || ''} ${selected.stages?.find((stage) => stage.id === t.stageId)?.name || ''}`
                          .toLowerCase()
                          .includes(taskSearch.toLowerCase()),
                    )
                    .map((t) => {
                      const isCompleted = t.status === 'Completed' || t.status === 'completed';
                      return (
                        <div
                          key={t.id}
                          className="flex flex-col items-stretch justify-between gap-3 card-box bg-card sm:flex-row sm:items-center shadow-2xs hover:border-primary/40 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span
                              aria-label={isCompleted ? 'Completed' : 'Pending'}
                              className="grid size-5 shrink-0 place-items-center rounded-md border"
                            >
                              {isCompleted && <Check className="size-3.5" />}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p
                                className={`break-words text-sm font-semibold cursor-pointer hover:text-primary transition-colors ${
                                  isCompleted
                                    ? 'line-through text-muted-foreground'
                                    : 'text-foreground'
                                }`}
                                onClick={() => {
                                  openTask(t);
                                }}
                              >
                                {t.title}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {selected.stages?.find((stage) => stage.id === t.stageId)?.name ||
                                  t.stageName ||
                                  'General'}
                                {t.deadline && ` · Due ${formatCalendar(t.deadline)}`}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <StatusChip status={statusOfTask(t)} />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                openTask(t);
                              }}
                            >
                              <MessageSquare className="size-3.5 text-primary" />
                              <span>Discussion</span>
                            </Button>
                          </div>
                        </div>
                      );
                    })
                ) : (
                  <Empty icon={CheckCircle2} title="No active tasks in this project yet" />
                )}
              </TabsContent>

              {/* Client Queries Tab (Phase 4) */}
              <TabsContent value="queries" className="space-y-3">
                <div className="card-box bg-muted/20 text-xs">
                  <p className="font-semibold text-foreground">Assigned project Telegram queries</p>
                  <p className="text-muted-foreground mt-1">
                    View questions and photos received from the client. Contribute internal team
                    notes to discuss resolutions.
                  </p>
                </div>

                {projectQueries.length ? (
                  projectQueries.map((query) => (
                    <ClientQueryCard
                      key={query.id}
                      query={query}
                      project={selected}
                      stages={selected.stages || []}
                      projectMembers={selected.members || []}
                      isFounder={false}
                      onQueryChanged={loadWorkspaceData}
                      onOpenTask={(taskId) => {
                        const found = tasks.find((t) => t.id === taskId);
                        if (found) {
                          openTask(found);
                        }
                      }}
                    />
                  ))
                ) : (
                  <Empty
                    icon={MessageSquare}
                    title="No client queries"
                    description="Questions from the client in Telegram appear here for team review."
                  />
                )}
              </TabsContent>

              {/* Chat Tab */}
              <TabsContent value="chat">
                <TeamChat
                  key={selected.id}
                  endpoint={`/api/employee/projects/${selected.id}/team-chat`}
                  currentActor={employee.id}
                  members={selected.members}
                />
              </TabsContent>

              {/* Overview Tab */}
              <TabsContent value="files">
                <ProjectFiles projectId={selected.id} namespace="employee" />
              </TabsContent>
              <TabsContent value="overview" className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs text-muted-foreground">Current phase</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm font-semibold">
                      {selected.phase || 'Not set'}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs text-muted-foreground">Team members</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm font-semibold">
                      {selected.members?.length || 0}
                    </CardContent>
                  </Card>
                </div>
                <Card>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-2 text-primary">
                      <Building2 className="size-4" />
                      <h3 className="type-label-14-strong">Current work</h3>
                    </div>
                    <p className="text-sm">
                      {selected.recentTask || 'No recent work recorded yet.'}
                    </p>
                    <div className="border-t pt-4">
                      <p className="text-xs text-muted-foreground">Next milestone</p>
                      <p className="mt-1 text-sm font-medium">
                        {selected.nextMilestone || 'Not scheduled'}
                      </p>
                    </div>
                    {selected.blocker && (
                      <div className="rounded-xl bg-warning-bg p-3 text-sm text-warning">
                        Blocker: {selected.blocker}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Task Thread Drawer Dialog for Employee */}
            <TaskThreadDrawer
              task={selectedTask}
              project={selected}
              open={taskDrawerOpen}
              onOpenChange={(open) => {
                if (!open) goBack({ taskId: '' });
              }}
              onTaskUpdated={loadWorkspaceData}
              currentActor={employee.name || 'Team Member'}
              isFounder={false}
              projectMembers={selected.members || []}
            />
          </section>
        )}
      </main>
    </div>
  );
}
