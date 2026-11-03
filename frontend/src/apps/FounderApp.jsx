import { CalendarDays } from 'lucide-react';
import { MeetingsView } from '@/features/meetings/Meetings';
import { ProjectConversations } from '@/features/collaboration/ProjectConversations';
import { needsQueryAttention } from '@/features/queries/lib/queryStatus';
import { WorkQueue } from '@/features/operations/WorkQueue';
import React, { useEffect, useState } from 'react';
import {
  useNavigation,
  navigate,
  goBack,
  founderSections,
  founderSectionLabel,
} from '@/lib/navigation';
import { founderPageTitle, useDocumentTitle } from '@/lib/pageTitle';
import { IkshaBrand, WorkspaceAccess } from '@/features/auth/WorkspaceAccess';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Clock3,
  FolderKanban,
  History,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Trash2,
  Users,
  UserPlus,
  X,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SidebarGroup, SidebarGroupLabel, SidebarItem } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { GooeyNewButton } from '@/components/GooeyNewButton';
import { EmployeeDialog, EmployeeManager } from '@/features/people/EmployeeManager';
import { FounderAssistant } from '@/features/assistant/FounderAssistant';
import { DecisionInbox } from '@/features/queries/DecisionInbox';
import { TelegramGroups } from '@/features/telegram/TelegramGroups';
import { ProjectDetailView } from '@/features/projects/ProjectDetailView';
import { ProjectDirectoryView } from '@/features/projects/ProjectDirectoryView';
import { todayInput } from '@/lib/dates';
import { Time } from '@/components/ui/time';
import { Empty } from '@/components/ui/empty';

const api = async (url, options = {}) => {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Request failed.');
    error.status = response.status;
    if (response.status === 401 && !url.endsWith('/login')) {
      window.dispatchEvent(new CustomEvent('studio-iksha:unauthorized', { detail: { url } }));
    }
    throw error;
  }
  return data;
};
const post = (url, data = {}) => api(url, { method: 'POST', body: JSON.stringify(data) });
const patch = (url, data = {}) => api(url, { method: 'PATCH', body: JSON.stringify(data) });
const initials = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'P';
const phaseOptions = [
  'Design',
  'Planning',
  'Procurement',
  'Site execution',
  'Finishing',
  'Handover',
];
const statusOptions = ['Setup', 'On track', 'At risk', 'On hold', 'Completed'];

// Activity rows read as "who did what", from whatever the activity API returns.
const activityWho = {
  client_link_claimed: 'Client',
  client_link_created: 'Founder',
  decision_request_received: 'Client',
  telegram_project_discovered: 'Telegram',
};
const activityWhat = {
  client_assigned: 'assigned a client',
  client_link_claimed: 'opened the client link',
  client_link_created: 'created a client link',
  decision_request_comment: 'commented on a client query',
  decision_request_received: 'sent a query',
  decision_request_resolved: 'resolved a client query',
  employee_assigned: 'assigned a team member',
  employee_created: 'added an employee',
  employee_updated: 'updated an employee',
  founder_invited: 'invited a founder',
  google_access_requested: 'requested access',
  member_added: 'added a team member',
  project_closed: 'closed the project',
  project_created: 'created the project',
  project_member_removed: 'removed a team member',
  project_moved_to_trash: 'moved the project to trash',
  project_restored: 'restored the project',
  project_spaces_updated: 'updated the project spaces',
  query_accepted: 'accepted a client query',
  reply_suggested: 'drafted a reply',
  schedule_changed: 'changed the schedule',
  stage_added: 'added a stage',
  stage_connections_updated: 'updated stage links',
  stage_order_changed: 'reordered stages',
  stage_renamed: 'renamed a stage',
  stage_task_added: 'added a task to a stage',
  task_created: 'created a task',
  task_deleted: 'deleted a task',
  task_message: 'posted in a task thread',
  task_message_published: 'sent a task update',
  task_plan_edited: 'edited a task plan',
  task_updated: 'updated a task',
  team_message: 'posted in the project chat',
  telegram_project_discovered: 'found a new Telegram group',
  workflow_started: 'started the workflow',
};
function describeActivity(item, { projects, employees }) {
  const details = item.details || {};
  const action = item.action || '';
  const person = (id) => employees.find((employee) => employee.id === id)?.name;
  const who =
    details.sender ||
    person(details.actorId) ||
    activityWho[action] ||
    (action.startsWith('google_access_') ? 'A teammate' : 'Founder');
  let what =
    activityWhat[action] ||
    (action.startsWith('query_') ? `${action.slice(6).replace(/_/g, ' ')} a client query` : '') ||
    action.replace(/_/g, ' ');
  if (action === 'project_update') {
    const changes = details.changes;
    const fields = Array.isArray(changes) ? changes : Object.keys(changes || {});
    what = fields.length ? `changed ${fields.join(', ')}` : 'edited project details';
  }
  if (action === 'stage_renamed' && details.name) what = `renamed a stage to ${details.name}`;
  if (action === 'project_created' && details.name) what = `created ${details.name}`;
  const target = person(details.employeeId || details.memberId);
  if (target && /member|employee/.test(action)) what += `: ${target}`;
  const project = projects.find((p) => p.id === item.projectId)?.name;
  return { who, what, project };
}

function Brand({ compact = false }) {
  return <IkshaBrand compact={compact} />;
}

function InitialAvatar({ name, className = '' }) {
  return (
    <Avatar className={className}>
      <AvatarFallback className="bg-accent font-semibold text-accent-foreground">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

function Field({ label, children }) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}

export default function FounderApp() {
  const [authState, setAuthState] = useState('checking');
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [trashedProjects, setTrashedProjects] = useState([]);
  const [decisionRequests, setDecisionRequests] = useState([]);
  const navigationState = useNavigation();
  const currentTab = navigationState.section;
  const selectedProjectId = navigationState.projectId;
  const viewMode = selectedProjectId ? 'detail' : 'directory';
  const [activities, setActivities] = useState([]);
  const [workPerson, setWorkPerson] = useState('founder');
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);
  const [memberDialogLabel, setMemberDialogLabel] = useState('Add employee');
  const [factsOpen, setFactsOpen] = useState(false);
  const [trashConfirmOpen, setTrashConfirmOpen] = useState(false);
  const [completeConfirmOpen, setCompleteConfirmOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;
  useDocumentTitle(
    founderPageTitle({
      authState,
      section: currentTab,
      projectId: selectedProjectId,
      projectName: selectedProject?.name,
      projectTab: navigationState.projectTab,
    }),
  );
  const filteredProjects = projects.filter((project) =>
    `${project.name} ${project.clientName} ${project.location || ''}`
      .toLowerCase()
      .includes(searchQuery.toLowerCase()),
  );

  // Unread badge counts (Actionable 9)
  const pendingDecisionsCount = decisionRequests.filter(needsQueryAttention).length;
  const pendingGroupsCount = projects.filter((p) => p.telegramSetupPending).length;

  const showNotice = (message, error = false) => {
    setNotice({ message, error });
    setTimeout(() => setNotice(null), 3500);
  };

  const loadProjects = async () => {
    try {
      const data = await api('/api/founder/projects');
      setProjects(data.projects || []);
      setAuthState('signed-in');
    } catch (error) {
      if (error.status === 401) setAuthState('signed-out');
      else {
        setAuthState((current) => (current === 'checking' ? 'load-failed' : current));
        showNotice('Could not refresh projects. Please retry.', true);
      }
    }
  };

  const loadDecisionRequests = async () => {
    try {
      const data = await api('/api/founder/decision-requests');
      setDecisionRequests(data.requests || []);
    } catch {
      // Preserve the last loaded queries during temporary connection failures.
    }
  };

  const loadActivities = async () => {
    try {
      const data = await api('/api/founder/activity');
      setActivities(data.activity || []);
    } catch {
      setActivities([]);
    }
  };

  const loadEmployees = async () => {
    try {
      const data = await api('/api/founder/employees');
      setEmployees(data.employees || []);
    } catch {
      setEmployees([]);
    }
  };

  const loadTrash = async () => {
    try {
      const data = await api('/api/founder/trash');
      setTrashedProjects(data.projects || []);
    } catch {
      setTrashedProjects([]);
    }
  };

  useEffect(() => {
    loadProjects();
    loadDecisionRequests();

    const handleUnauthorized = () => {
      setAuthState('signed-out');
      showNotice('Session expired. Please sign in again.', true);
    };
    window.addEventListener('studio-iksha:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('studio-iksha:unauthorized', handleUnauthorized);
  }, []);

  useEffect(() => {
    if (authState !== 'signed-in') return;
    const timer = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const [projData, decData] = await Promise.allSettled([
          api('/api/founder/projects'),
          api('/api/founder/decision-requests'),
        ]);
        if (projData.status === 'fulfilled') setProjects(projData.value.projects || []);
        if (decData.status === 'fulfilled') setDecisionRequests(decData.value.requests || []);
      } catch {
        /* Preserve current screen during momentary network refresh failure */
      }
    }, 8000);
    return () => clearInterval(timer);
  }, [authState]);

  useEffect(() => {
    const isLogin = authState === 'signed-out';
    document.documentElement.classList.toggle('founder-login', isLogin);
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = '#fafbf7';
    return () => document.documentElement.classList.remove('founder-login');
  }, [authState]);

  const openTab = (tab) => {
    navigate({ section: tab });
    setSidebarOpen(false);
  };

  useEffect(() => {
    if (authState !== 'signed-in') return;
    if (currentTab === 'activity') {
      loadActivities();
      loadEmployees();
    }
    if (currentTab === 'employees') loadEmployees();
    if (currentTab === 'trash') loadTrash();
    if (currentTab === 'decisions') loadDecisionRequests();
    setSidebarOpen(false);
  }, [currentTab, authState]);

  const handleSelectProjectFromDir = (projectId) => {
    navigate({ section: 'projects', projectId });
    setSidebarOpen(false);
  };

  const handleLogout = async () => {
    await post('/api/founder/logout');
    setAuthState('signed-out');
  };

  const completeProject = async () => {
    if (!selectedProject || busy) return;
    setBusy(true);
    try {
      const result = await post(`/api/founder/projects/${selectedProject.id}/complete`);
      setCompleteConfirmOpen(false);
      await loadProjects();
      showNotice(
        result.announcementStatus === 'Failed'
          ? 'Project completed, but its Telegram group could not be found. No group message was sent.'
          : result.announcementStatus === 'Unknown'
            ? 'Project completed. Telegram delivery is unconfirmed; check the group.'
            : 'Project marked complete.',
      );
    } catch (error) {
      showNotice(error.message, true);
    } finally {
      setBusy(false);
    }
  };

  const moveToTrash = async () => {
    if (!selectedProject || busy) return;
    setBusy(true);
    try {
      const result = await post(`/api/founder/projects/${selectedProject.id}/trash`);
      setTrashConfirmOpen(false);
      navigate({ section: 'projects' }, { replace: true });
      await loadProjects();
      showNotice(
        result.announcementStatus === 'Failed'
          ? 'Project moved to trash, but its Telegram group could not be found. No group message was sent.'
          : result.announcementStatus === 'Unknown'
            ? 'Project moved to trash. Telegram delivery is unconfirmed; check the group.'
            : 'Project moved to trash. You can restore it later.',
      );
    } catch (error) {
      showNotice(error.message, true);
    } finally {
      setBusy(false);
    }
  };

  const restoreProject = async (id) => {
    try {
      await post(`/api/founder/trash/${id}/restore`);
      await Promise.all([loadProjects(), loadTrash()]);
      showNotice('Project restored.');
    } catch (error) {
      showNotice(error.message, true);
    }
  };

  const saveForm = async (event, url, method, after, success) => {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await (method === 'PATCH' ? patch : post)(
        url,
        Object.fromEntries(new FormData(event.currentTarget)),
      );
      await loadProjects();
      if (data.project?.id) {
        navigate({ section: 'projects', projectId: data.project.id });
      }
      after();
      showNotice(success);
    } catch (error) {
      showNotice(error.message, true);
    } finally {
      setBusy(false);
    }
  };

  if (authState === 'checking') {
    return (
      <main className="grid min-h-dvh place-items-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <Brand />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </main>
    );
  }

  if (authState === 'load-failed') {
    return (
      <main className="grid min-h-dvh place-items-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <Brand />
          <Empty
            title="Could not connect to the workspace"
            description="Check your connection, then try again."
            action={
              <Button
                onClick={() => {
                  setAuthState('checking');
                  loadProjects();
                }}
              >
                Try again
              </Button>
            }
          />
        </div>
      </main>
    );
  }

  if (authState === 'signed-out') {
    return <WorkspaceAccess />;
  }

  const sectionIcons = {
    actions: CheckCircle2,
    decisions: MessageSquare,
    meetings: CalendarDays,
    chats: MessageSquare,
    assistant: Sparkles,
    projects: FolderKanban,
    groups: Send,
    employees: Users,
    activity: Clock3,
    trash: Trash2,
  };
  const sectionBadges = { decisions: pendingDecisionsCount };
  const needsSetup = (project) =>
    project.status !== 'Completed' && (project.telegramSetupPending || project.status === 'Setup');
  const ongoingProjects = filteredProjects.filter(
    (project) => project.status !== 'Completed' && !needsSetup(project),
  );
  const setupProjects = filteredProjects.filter(needsSetup);
  const renderSectionItem = (section) => (
    <SidebarItem
      key={section.id}
      icon={sectionIcons[section.id]}
      badge={sectionBadges[section.id]}
      active={currentTab === section.id && !(section.id === 'projects' && viewMode === 'detail')}
      onClick={() => openTab(section.id)}
    >
      {section.label}
    </SidebarItem>
  );
  const renderProjectItem = (project) => {
    const isSelected =
      project.id === selectedProjectId && currentTab === 'projects' && viewMode === 'detail';
    return (
      <SidebarItem
        key={project.id}
        active={isSelected}
        title={`${project.name}${project.clientName ? ` · ${project.clientName}` : ''}`}
        dot={
          project.status === 'At risk' || needsSetup(project)
            ? 'bg-warning-fill'
            : 'bg-success-fill'
        }
        onClick={() => handleSelectProjectFromDir(project.id)}
      >
        {project.name}
      </SidebarItem>
    );
  };

  const navigation = (
    <div className="iksha-navigation flex h-full min-h-0 flex-col">
      <Brand compact />
      <div className="iksha-nav-scroll -mx-1 min-h-0 flex-1 space-y-3 overflow-y-auto px-1 py-1">
        <nav aria-label="Workspace" className="grid gap-3">
          <SidebarGroup>
            {founderSections.filter((s) => s.group === 'main').map(renderSectionItem)}
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            {founderSections.filter((s) => s.group === 'workspace').map(renderSectionItem)}
          </SidebarGroup>
        </nav>

        <Separator />

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects"
            aria-label="Search projects"
            className="pl-8"
          />
        </div>

        <div className="space-y-3">
          <SidebarGroup>
            <SidebarGroupLabel count={ongoingProjects.length}>Ongoing projects</SidebarGroupLabel>
            {ongoingProjects.map(renderProjectItem)}
          </SidebarGroup>
          {setupProjects.length > 0 && (
            <SidebarGroup>
              <SidebarGroupLabel count={setupProjects.length}>Needs setup</SidebarGroupLabel>
              {setupProjects.map(renderProjectItem)}
            </SidebarGroup>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 border-t pt-3">
        <InitialAvatar name="Project founder" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">Project founder</p>
          <p className="text-xs text-muted-foreground">Workspace founder</p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Sign out" onClick={handleLogout}>
          <LogOut />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="iksha-workspace app-glow min-h-dvh bg-background pb-20 lg:pb-0">
      {/* Desktop Sidebar Navigation */}
      <aside className="iksha-sidebar fixed inset-y-0 left-0 hidden w-64 border-r px-3 py-3 lg:block">
        {navigation}
      </aside>

      {/* Mobile Drawer Navigation */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-[min(88vw,19rem)] gap-0 px-3 py-3">
          <SheetHeader className="sr-only">
            <SheetTitle>Workspace navigation</SheetTitle>
            <SheetDescription>Choose a project or section</SheetDescription>
          </SheetHeader>
          {navigation}
        </SheetContent>
      </Sheet>

      <div className="lg:pl-64">
        {/* Sticky App Header */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-card/95 px-4 backdrop-blur sm:px-8">
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
              {currentTab === 'projects' && viewMode === 'detail' ? (
                <ol className="flex min-w-0 items-center gap-2">
                  <li className="shrink-0">
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => openTab('projects')}
                    >
                      Projects
                    </button>
                  </li>
                  <li aria-hidden="true" className="shrink-0 text-muted-foreground">
                    /
                  </li>
                  <li
                    className="min-w-0 truncate font-semibold"
                    aria-current="page"
                    title={selectedProject?.name}
                  >
                    {selectedProject?.name || 'Project not found'}
                  </li>
                </ol>
              ) : (
                <strong className="block truncate" aria-current="page">
                  {founderSectionLabel(currentTab)}
                </strong>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <InitialAvatar name="Project founder" />
          </div>
        </header>

        {/* Main Content Area */}
        <main
          className={
            currentTab === 'assistant'
              ? 'h-[calc(100dvh-9rem)] lg:h-[calc(100dvh-4rem)]'
              : 'mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-8 sm:py-8'
          }
        >
          {currentTab === 'assistant' ? (
            <FounderAssistant />
          ) : currentTab === 'meetings' ? (
            <MeetingsView />
          ) : currentTab === 'chats' ? (
            <ProjectConversations projects={projects} />
          ) : currentTab === 'actions' ? (
            <WorkQueue
              projects={projects}
              initialPersonId={workPerson}
              onChanged={() => {
                loadProjects();
                loadEmployees();
              }}
            />
          ) : currentTab === 'groups' ? (
            <TelegramGroups projects={projects} onProjectsChanged={loadProjects} />
          ) : currentTab === 'decisions' ? (
            <DecisionInbox
              projects={projects}
              onProjectsChanged={() => {
                loadProjects();
                loadDecisionRequests();
              }}
            />
          ) : currentTab === 'employees' ? (
            <EmployeeManager
              onViewWork={(employee) => {
                setWorkPerson(employee.id);
                openTab('actions');
              }}
              employees={employees}
              projects={projects}
              onAdd={() => {
                setMemberDialogLabel('Add employee');
                setMemberOpen(true);
              }}
              onUpdated={loadEmployees}
            />
          ) : currentTab === 'trash' ? (
            <div className="space-y-6">
              <div>
                <h1>Trash</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Projects here are hidden from employees. Restore them whenever you need to.
                </p>
              </div>
              {trashedProjects.length ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {trashedProjects.map((proj) => (
                    <Card key={proj.id}>
                      <CardContent className="flex items-center gap-3">
                        <FolderKanban className="size-5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{proj.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {proj.clientName}
                          </p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => restoreProject(proj.id)}>
                          Restore
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Empty
                  icon={Trash2}
                  title="Trash is empty"
                  description="Projects you move to trash stay here until you restore them."
                />
              )}
            </div>
          ) : currentTab === 'activity' ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1>Activity</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Recent updates across your projects.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={loadActivities}>
                  <RefreshCw /> Refresh
                </Button>
              </div>
              <Card>
                <CardContent className="divide-y">
                  {activities.length ? (
                    activities.map((item, index) => {
                      const { who, what, project } = describeActivity(item, {
                        projects,
                        employees,
                      });
                      return (
                        <div key={item.id || index} className="flex gap-3 py-4 first:pt-0">
                          <InitialAvatar name={who} className="size-8" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm">
                              <strong className="font-semibold">{who}</strong> {what}
                            </p>
                            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              {project && <span className="truncate">{project}</span>}
                              <Time value={item.at} />
                            </p>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <Empty
                      className="border-0"
                      icon={History}
                      title="No activity yet"
                      description="Project changes appear here as they happen."
                    />
                  )}
                </CardContent>
              </Card>
            </>
          ) : currentTab === 'projects' && viewMode === 'directory' ? (
            /* Actionable 21: Obvious All Projects Directory Screen */
            <ProjectDirectoryView
              projects={projects}
              decisionRequests={decisionRequests}
              onSelectProject={handleSelectProjectFromDir}
              onCreateProject={() => setCreateOpen(true)}
              onOpenGroups={() => openTab('groups')}
            />
          ) : currentTab === 'projects' && viewMode === 'detail' && selectedProject ? (
            /* Actionables 1, 3, 4, 5, 6, 7, 8, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20: Detailed Project Workspace */
            <ProjectDetailView
              key={selectedProject.id}
              project={selectedProject}
              allProjects={projects}
              employees={employees}
              decisionRequests={decisionRequests}
              onBack={() => goBack({ section: 'projects' })}
              onProjectUpdated={loadProjects}
              onQueriesUpdated={loadDecisionRequests}
              onOpenTrashModal={() => setTrashConfirmOpen(true)}
              onOpenCompleteModal={() => setCompleteConfirmOpen(true)}
              onOpenFactsModal={() => setFactsOpen(true)}
              onOpenMemberModal={() => {
                setMemberDialogLabel('Add team member');
                setMemberOpen(true);
              }}
            />
          ) : (
            <div className="space-y-4">
              <h1>Project not found</h1>
              <Empty
                kind="no-results"
                icon={FolderKanban}
                title="No project at this link"
                description="This link may be out of date, or the project may have moved to trash."
                action={
                  <Button size="sm" onClick={() => openTab('projects')}>
                    View all projects
                  </Button>
                }
              />
            </div>
          )}
        </main>
      </div>

      {/* Mobile Sticky Navigation Footer (Actionable 22: Responsive mobile usability) */}
      <nav
        className={`safe-bottom fixed inset-x-0 bottom-0 z-30 grid ${selectedProject ? 'grid-cols-4' : 'grid-cols-3'} items-center overflow-visible border-t bg-card/95 px-2 pt-3 backdrop-blur lg:hidden`}
        aria-label="Mobile navigation"
      >
        {['projects', 'decisions', 'actions'].map((id) => {
          const Icon = sectionIcons[id];
          const label = founderSections.find((section) => section.id === id).phone;
          return (
            <Button
              key={id}
              variant="ghost"
              className={`relative h-12 flex-col gap-1 text-xs ${currentTab === id ? 'text-primary font-semibold' : 'text-muted-foreground'}`}
              aria-current={currentTab === id ? 'page' : undefined}
              onClick={() => openTab(id)}
            >
              <Icon className="size-4" />
              {label}
              {id === 'decisions' && pendingDecisionsCount > 0 && (
                <span className="size-1.5 rounded-full bg-warning-fill absolute top-2 right-6" />
              )}
            </Button>
          );
        })}
        <GooeyNewButton
          hasProject={!!selectedProject}
          onAddMember={() => {
            setMemberDialogLabel('Add team member');
            setMemberOpen(true);
          }}
        />
      </nav>

      {/* Create Project Modal (Phase 2) */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create project</DialogTitle>
            <DialogDescription>
              Set up the basics. New projects start in Setup. You can assign the client and select a
              workflow next.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) =>
              saveForm(
                e,
                '/api/founder/projects',
                'POST',
                () => setCreateOpen(false),
                'Project created in Setup.',
              )
            }
            className="space-y-4"
          >
            <Field label="Project name">
              <Input name="name" placeholder="Kumar Residence" required />
            </Field>
            <Field label="Client name (optional)">
              <Input name="clientName" placeholder="Asha Kumar" />
            </Field>
            <Field label="Location (optional)">
              <Input name="location" placeholder="Pune, Maharashtra" />
            </Field>
            <Field label="Start date (optional)">
              <Input name="startDate" type="date" defaultValue={todayInput()} />
            </Field>
            <div className="card-box bg-muted/30 text-xs text-muted-foreground leading-copy">
              New projects begin in <strong>Setup</strong> status. You can assign an identified
              client and select a workflow template to generate sequential stages and tasks.
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Creating project…' : 'Create project'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Employee Modal */}
      <EmployeeDialog
        open={memberOpen}
        onOpenChange={setMemberOpen}
        label={memberDialogLabel}
        projects={projects}
        defaultProjectId={selectedProject?.id}
        onUpdated={() => Promise.all([loadProjects(), loadEmployees()])}
      />

      <Dialog
        open={completeConfirmOpen}
        onOpenChange={(open) => {
          if (!busy) setCompleteConfirmOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete {selectedProject?.name}?</DialogTitle>
            <DialogDescription>
              The project will be marked completed and unfinished work will be closed.{' '}
              {selectedProject?.telegramGroupChatId
                ? 'Its Telegram group will receive: This project is now completed.'
                : 'No Telegram group is linked.'}{' '}
              History stays available.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setCompleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={completeProject}>
              {busy ? 'Completing…' : 'Complete project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Move to Trash Modal */}
      <Dialog
        open={trashConfirmOpen}
        onOpenChange={(open) => {
          if (!busy) setTrashConfirmOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedProject?.status === 'Completed' ? 'Move to trash' : 'Abandon project'}:{' '}
              {selectedProject?.name}?
            </DialogTitle>
            <DialogDescription>
              {selectedProject?.status === 'Completed'
                ? 'The completed project will move to recoverable trash.'
                : 'The project will be marked abandoned, its unfinished work will be closed, and its linked Telegram group will be notified.'}{' '}
              You can restore its history from Trash later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setTrashConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={busy} onClick={moveToTrash}>
              {busy
                ? 'Closing…'
                : selectedProject?.status === 'Completed'
                  ? 'Move to trash'
                  : 'Abandon & move to trash'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Project Facts Modal */}
      <Dialog open={factsOpen} onOpenChange={setFactsOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Project details</DialogTitle>
            <DialogDescription>
              Set the client, location and spaces for this project.
            </DialogDescription>
          </DialogHeader>
          {selectedProject && (
            <form
              key={selectedProject.id}
              onSubmit={(e) =>
                saveForm(
                  e,
                  `/api/founder/projects/${selectedProject.id}`,
                  'PATCH',
                  () => setFactsOpen(false),
                  'Project details updated.',
                )
              }
              className="space-y-4"
            >
              <Field label="Client name">
                <Input name="clientName" defaultValue={selectedProject.clientName} />
              </Field>
              <Field label="Location / city">
                <datalist id="iksha-cities">
                  {[
                    ...new Set([
                      'Bangalore',
                      'Nellore',
                      'Coimbatore',
                      ...projects.map((project) => project.location).filter(Boolean),
                    ]),
                  ].map((city) => (
                    <option key={city} value={city} />
                  ))}
                </datalist>
                <Input
                  list="iksha-cities"
                  name="location"
                  maxLength={200}
                  defaultValue={selectedProject.location}
                  placeholder="Bangalore, Nellore, Coimbatore…"
                />
              </Field>
              <Field label="Spaces, one per line">
                <Textarea
                  name="spacesText"
                  maxLength={6100}
                  defaultValue={(selectedProject.spaces || []).join('\n')}
                  className="min-h-28"
                  placeholder={'Living room\nKitchen\nBedroom 1'}
                />
              </Field>
              <DialogFooter>
                <Button
                  type="button"
                  variant="destructive-outline"
                  className="mr-auto"
                  onClick={() => {
                    setFactsOpen(false);
                    setTrashConfirmOpen(true);
                  }}
                >
                  <Trash2 /> Move to trash
                </Button>
                <Button type="button" variant="outline" onClick={() => setFactsOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  Save changes
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Toast Notice */}
      {notice && (
        <div
          role="status"
          className="fixed right-4 bottom-24 z-[60] max-w-sm rounded-lg border bg-card px-4 py-3 text-sm shadow-lg md:bottom-4"
        >
          {notice.error ? (
            <X className="mr-2 inline size-4 text-destructive" />
          ) : (
            <Check className="mr-2 inline size-4 text-success" />
          )}
          {notice.message}
        </div>
      )}
    </div>
  );
}
