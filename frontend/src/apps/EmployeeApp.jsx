import { MeetingsView } from '@/features/meetings/Meetings';
import { countUpcomingEmployeeMeetings } from '@/features/meetings/lib/meetingNotice';
import { ProjectConversations } from '@/features/collaboration/ProjectConversations';
import { needsQueryAttention } from '@/features/queries/lib/queryStatus';
import { WorkQueue } from '@/features/operations/WorkQueue';
import { WorkspaceAccess, IkshaBrand } from '@/features/auth/WorkspaceAccess';
import { ProjectTimelineWorkspace as ProjectTimeline } from '@/features/timeline/ProjectTimelineWorkspace';
import { ProjectFiles } from '@/features/projects/ProjectFiles';
// frontend/src/EmployeeApp.jsx
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  useNavigation,
  navigate,
  goBack,
  founderSections,
  founderSectionLabel,
} from '@/lib/navigation';
import { pageTitle, useDocumentTitle } from '@/lib/pageTitle';
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  FolderKanban,
  LogOut,
  Menu,
  MessageSquare,
  User,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { SidebarGroup, SidebarGroupLabel, SidebarItem } from '@/components/ui/sidebar';
import { PROJECT_STATUS_TONES } from '@/lib/taskStatus';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TeamChat } from '@/features/collaboration/TeamChat';
import { TaskThreadDrawer } from '@/features/tasks/TaskThreadDrawer';
import { ProjectTaskList, useTaskFilters } from '@/features/tasks/ProjectTaskList';
import { ClientQueryCard } from '@/features/queries/ClientQueryCard';
import { request, fetchTasks, fetchProjectWorkspace, fetchDecisionRequests } from '@/lib/api';
import { StatusChip } from '@/components/ui/status-chip';
import { Empty } from '@/components/ui/empty';

// Employees get the founder app's sections that apply to them, each on its own page.
const EMPLOYEE_SECTIONS = ['actions', 'meetings', 'chats', 'projects'];
const sectionIcons = {
  actions: CheckCircle2,
  meetings: CalendarDays,
  chats: MessageSquare,
  projects: FolderKanban,
};
const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');

export default function EmployeeApp() {
  const [auth, setAuth] = useState('checking');
  const [employee, setEmployee] = useState(null);
  const [projects, setProjects] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigation = useNavigation();
  const section = EMPLOYEE_SECTIONS.includes(navigation.section) ? navigation.section : 'actions';
  // A project opens only when chosen: the Projects page lists them, a project has its own page.
  const selectedId = section === 'projects' ? navigation.projectId || null : null;
  const [tasks, setTasks] = useState([]);
  const [decisionRequests, setDecisionRequests] = useState([]);
  const [meetings, setMeetings] = useState([]);
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
  const [staleData, setStaleData] = useState(false);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [error, setError] = useState('');
  const [revocationMessage, setRevocationMessage] = useState('');

  const load = async ({ background = false } = {}) => {
    try {
      const data = await request('/api/employee/me');
      setEmployee(data.employee);
      setProjects(data.projects || []);
      setAuth('signed-in');
    } catch (problem) {
      if (problem.status === 401) {
        if (auth === 'signed-in') {
          setRevocationMessage('Your access was removed. Contact the founder.');
        }
        setAuth('signed-out');
      } else if (!background) {
        setError('Could not connect to the workspace. Please retry.');
        setAuth((current) => (current === 'checking' ? 'signed-out' : current));
      }
    }
  };

  useEffect(() => {
    load();
    const expired = () => {
      setRevocationMessage('Your access was removed. Contact the founder.');
      setAuth('signed-out');
    };
    window.addEventListener('studio-iksha:unauthorized', expired);
    return () => window.removeEventListener('studio-iksha:unauthorized', expired);
  }, []);

  const selected = projects.find((project) => project.id === selectedId);
  useDocumentTitle(
    auth === 'signed-out'
      ? pageTitle('Sign in')
      : pageTitle(selected?.name || founderSectionLabel(section)),
  );
  // Same Tasks tab as the founder's (shared component), read-only; filters reset per project.
  const taskFilters = useTaskFilters(tasks, selected?.stages || []);
  useEffect(() => {
    taskFilters.clear();
  }, [selectedId]);

  // Load project workspace tasks and queries
  // background: the silent poll. No spinner, no banner, keeps the last good data on failure.
  const loadWorkspaceData = useCallback(async ({ background = false } = {}) => {
    if (!selected?.id) return;
    if (!background) {
      setLoadingWorkspace(true);
      setError('');
    }
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
      if (!background) setError(problem.message || 'Could not refresh the workspace. Please retry.');
    } finally {
      if (!background) setLoadingWorkspace(false);
    }
  }, [selected?.id]);

  useEffect(() => {
    if (selected?.id) {
      loadWorkspaceData();
    }
  }, [selected?.id, loadWorkspaceData]);

  const loadMeetings = useCallback(async () => {
    try {
      const data = await request('/api/employee/meetings');
      setMeetings(data.meetings || []);
    } catch {
      // Keep last good data on failure
    }
  }, []);

  // Same 8 s cadence as the founder app. Skips hidden tabs and ticks whose previous poll is still running.
  const polling = useRef(false);
  useEffect(() => {
    if (auth !== 'signed-in') return undefined;
    loadMeetings();
    const timer = setInterval(async () => {
      if (document.visibilityState !== 'visible' || polling.current) return;
      polling.current = true;
      try {
        await Promise.all([
          load({ background: true }),
          loadWorkspaceData({ background: true }),
          loadMeetings(),
        ]);
      } finally {
        polling.current = false;
      }
    }, 8000);
    return () => clearInterval(timer);
  }, [auth, loadWorkspaceData, loadMeetings]);

  const logout = async () => {
    setRevocationMessage('');
    await request('/api/employee/logout', { method: 'POST' }).catch(() => {});
    setAuth('signed-out');
    setEmployee(null);
    setProjects([]);
    setTasks([]);
    setDecisionRequests([]);
    setMeetings([]);
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
    return (
      <WorkspaceAccess team>
        {revocationMessage && (
          <div
            role="alert"
            className="my-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive"
          >
            {revocationMessage}
          </div>
        )}
      </WorkspaceAccess>
    );
  }

  // Filter queries for selected project
  const projectQueries = decisionRequests.filter((r) => r.projectId === selected?.id);
  const pendingQueriesCount = projectQueries.filter(needsQueryAttention).length;

  const upcomingMeetingsCount = countUpcomingEmployeeMeetings(meetings, employee?.id);
  const sectionBadges = {
    meetings: upcomingMeetingsCount,
  };

  const openSection = (id) => {
    setSidebarOpen(false);
    navigate({ section: id });
  };
  const openProject = (id) => {
    setSidebarOpen(false);
    navigate({ section: 'projects', projectId: id });
  };

  // Same sidebar as the founder app: sections, then the person's projects, then who is signed in.
  const sidebar = (
    <div className="iksha-navigation flex h-full min-h-0 flex-col">
      <IkshaBrand compact />
      <div className="iksha-nav-scroll -mx-1 min-h-0 flex-1 space-y-3 overflow-y-auto px-1 py-1">
        <nav aria-label="Workspace" className="grid gap-3">
          {['main', 'workspace'].map((group) => (
            <SidebarGroup key={group}>
              {group === 'workspace' && <SidebarGroupLabel>Workspace</SidebarGroupLabel>}
              {founderSections
                .filter((item) => item.group === group && EMPLOYEE_SECTIONS.includes(item.id))
                .map((item) => (
                  <SidebarItem
                    key={item.id}
                    icon={sectionIcons[item.id]}
                    badge={sectionBadges[item.id]}
                    active={section === item.id && !selected}
                    onClick={() => openSection(item.id)}
                  >
                    {item.label}
                  </SidebarItem>
                ))}
            </SidebarGroup>
          ))}
        </nav>

        <Separator />

        <SidebarGroup>
          <SidebarGroupLabel count={projects.length}>Your projects</SidebarGroupLabel>
          {projects.map((project) => (
            <SidebarItem
              key={project.id}
              active={project.id === selectedId}
              title={`${project.name}${project.clientName ? ` · ${project.clientName}` : ''}`}
              dot={
                project.status === 'Completed'
                  ? 'bg-neutral-fill'
                  : project.status === 'At risk'
                    ? 'bg-warning-fill'
                    : 'bg-success-fill'
              }
              onClick={() => openProject(project.id)}
            >
              {project.name}
            </SidebarItem>
          ))}
        </SidebarGroup>
      </div>

      <div className="flex items-center gap-3 pt-3">
        <Avatar>
          <AvatarFallback className="bg-accent font-semibold text-accent-foreground">
            {initials(employee?.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">{employee?.name}</p>
          <p className="text-xs text-muted-foreground">Team member</p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Sign out" onClick={logout}>
          <LogOut />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="iksha-workspace app-glow min-h-dvh bg-background pb-[max(24px,env(safe-area-inset-bottom))] lg:pb-0">
      <aside className="iksha-sidebar fixed inset-y-0 left-0 hidden w-64 px-3 py-3 lg:block">
        {sidebar}
      </aside>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-[min(88vw,19rem)] gap-0 px-3 py-3">
          <SheetHeader className="sr-only">
            <SheetTitle>Workspace navigation</SheetTitle>
            <SheetDescription>Choose a project or section</SheetDescription>
          </SheetHeader>
          {sidebar}
        </SheetContent>
      </Sheet>

      {/* On desktop the page is a white sheet floating on the canvas; this band keeps the gap above it clear while scrolling. */}
      <div
        aria-hidden="true"
        className="fixed inset-x-0 top-0 z-30 hidden h-2 bg-background lg:block"
      />
      <div className="lg:py-2 lg:pr-2 lg:pl-64">
        <div className="iksha-sheet lg:min-h-[calc(100dvh-1rem)] lg:rounded-xl lg:bg-card">
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-card/95 px-4 backdrop-blur sm:px-8 lg:top-2 lg:rounded-t-xl lg:border-transparent">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="Open navigation"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu />
              </Button>
              <nav aria-label="Breadcrumb" className="min-w-0 text-sm">
                {selected ? (
                  <ol className="flex min-w-0 items-center gap-2">
                    <li className="shrink-0">
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => openSection('projects')}
                      >
                        Projects
                      </button>
                    </li>
                    <li aria-hidden="true" className="shrink-0 text-muted-foreground">
                      /
                    </li>
                    <li className="min-w-0 truncate font-semibold" aria-current="page">
                      {selected.name}
                    </li>
                  </ol>
                ) : (
                  <strong className="block truncate lg:sr-only" aria-current="page">
                    {founderSectionLabel(section)}
                  </strong>
                )}
              </nav>
            </div>
            <Avatar>
              <AvatarFallback className="bg-accent font-semibold text-accent-foreground">
                {initials(employee?.name)}
              </AvatarFallback>
            </Avatar>
          </header>

          <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
            {error && (
              <p
                role="alert"
                className="card-box border-destructive/30 bg-destructive/10 text-sm text-destructive"
              >
                {error}
              </p>
            )}
            {section === 'actions' ? (
              <WorkQueue
                projects={projects}
                isFounder={false}
                initialPersonId={employee?.id || ''}
                personName={employee?.name || 'Me'}
                onChanged={loadWorkspaceData}
              />
            ) : section === 'meetings' ? (
              <MeetingsView namespace="employee" />
            ) : section === 'chats' ? (
              <ProjectConversations projects={projects} namespace="employee" actor={employee.id} />
            ) : !selected ? (
              <>
                <div>
                  <h1>Projects</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {navigation.projectId
                      ? 'That project is not assigned to you. Choose one of yours.'
                      : `You are assigned to ${projects.length} ${projects.length === 1 ? 'project' : 'projects'}.`}
                  </p>
                </div>
                {projects.length ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {projects.map((project) => (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => openProject(project.id)}
                        className="card-box bg-card text-left shadow-xs transition-colors duration-200 hover:border-primary/40"
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
                    description="Ask your founder to add you to a project."
                  />
                )}
              </>
            ) : (
              <section className="space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex min-w-0 items-start gap-3">
                      <h1
                        className="line-clamp-2 min-w-0 [overflow-wrap:anywhere]"
                        title={selected.name}
                      >
                        {selected.name}
                      </h1>
                      <StatusChip
                        tone={PROJECT_STATUS_TONES[selected.status]}
                        className="mt-1 shrink-0"
                      >
                        {selected.status || 'Setup'}
                      </StatusChip>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {[selected.clientName, selected.location].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadWorkspaceData}
                    disabled={loadingWorkspace}
                  >
                    <RefreshCw className={`size-3.5 ${loadingWorkspace ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>

                <Tabs
                  key={selected.id}
                  value={navigation.projectTab || 'timeline'}
                  onValueChange={(projectTab) =>
                    navigate({
                      section: 'projects',
                      projectId: selected.id,
                      projectTab,
                    })
                  }
                  className="space-y-4"
                >
                  <TabsList className="iksha-project-tabs" aria-label="Project sections">
                    <TabsTrigger value="timeline">Timeline</TabsTrigger>
                    <TabsTrigger value="tasks">
                      Tasks <span className="ml-1 font-normal tabular-nums">{tasks.length}</span>
                    </TabsTrigger>
                    <TabsTrigger value="queries">
                      Client queries
                      {pendingQueriesCount > 0 && (
                        <Badge
                          variant="secondary"
                          className="ml-2 h-5 min-w-5 justify-center bg-warning-bg px-1 text-xs text-warning"
                        >
                          {pendingQueriesCount}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="chat">Team chat</TabsTrigger>
                    <TabsTrigger value="files">Files</TabsTrigger>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
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
                  <TabsContent value="tasks" className="space-y-4">
                    <ProjectTaskList
                      project={selected}
                      tasks={tasks}
                      stages={selected.stages || []}
                      employees={(selected.members || []).map((m) => ({
                        id: m.employeeId,
                        name: m.name,
                      }))}
                      filters={taskFilters}
                      onOpenTask={openTask}
                      onRefresh={loadWorkspaceData}
                      refreshing={loadingWorkspace}
                      staleData={staleData}
                      emptyDescription="Tasks appear here once the founder starts this project's workflow."
                    />
                  </TabsContent>

                  {/* Client Queries Tab (Phase 4) */}
                  <TabsContent value="queries" className="space-y-3">
                    <div className="card-box bg-muted/20 text-xs">
                      <p className="font-semibold text-foreground">
                        Assigned project Telegram queries
                      </p>
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
                          <CardTitle className="text-xs text-muted-foreground">
                            Current phase
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm font-semibold">
                          {selected.phase || 'Not set'}
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-xs text-muted-foreground">
                            Team members
                          </CardTitle>
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
      </div>
    </div>
  );
}
