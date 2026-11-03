import { MeetingsView } from '@/features/meetings/Meetings';
import { needsQueryAttention } from '@/features/queries/lib/queryStatus';
// frontend/src/components/ProjectDetailView.jsx
import React, { useEffect, useState, useCallback } from 'react';
import { founderProjectTab, useNavigation, navigate, goBack } from '@/lib/navigation';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Filter,
  FolderKanban,
  Layers,
  Link as LinkIcon,
  MessageSquare,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  UserPlus,
  Users,
  X,
  Lock,
  Loader2,
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
import { NativeSelect } from '@/components/ui/native-select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu } from 'radix-ui';
import { Textarea } from '@/components/ui/textarea';

import { TelegramGroups } from '@/features/telegram/TelegramGroups';
import { ProjectFiles } from '@/features/projects/ProjectFiles';
import { TeamChat } from '@/features/collaboration/TeamChat';
import { TaskThreadDrawer } from '@/features/tasks/TaskThreadDrawer';
import { ClientQueryCard } from '@/features/queries/ClientQueryCard';
import { WorkflowTemplateModal } from '@/features/timeline/WorkflowTemplateModal';
import { ProjectTimelineWorkspace as ProjectTimeline } from '@/features/timeline/ProjectTimelineWorkspace';
import { ProjectDependencyGraph } from '@/features/timeline/ProjectDependencyGraph';
import {
  fetchProjectWorkspace,
  fetchTasks,
  createTask,
  updateTask,
  assignClient,
  removeProjectMember,
  previewSchedule,
  applySchedule,
} from '@/lib/api';
import {
  getProjectWorkflow,
  updateDriveSettings,
  addDriveLink,
  setMemberDriveAccess,
  computeStageSchedule,
  updateProjectWorkflow,
} from '@/features/timeline/lib/projectWorkflowStore';
import { formatCalendar, formatDate } from '@/lib/dates';
import { Time } from '@/components/ui/time';
import { StatusChip } from '@/components/ui/status-chip';
import {
  isTaskClosed,
  matchesTaskStatus,
  PROJECT_STATUS_TONES,
  TASK_STATUS_OPTIONS,
  taskStatus,
} from '@/lib/taskStatus';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Empty } from '@/components/ui/empty';

export function ProjectDetailView({
  project,
  allProjects = [],
  employees = [],
  decisionRequests = [],
  onBack,
  onProjectUpdated,
  onQueriesUpdated,
  onOpenTrashModal,
  onOpenCompleteModal,
  onOpenFactsModal,
  onOpenMemberModal,
}) {
  const [localWorkflow, setLocalWorkflow] = useState(() =>
    getProjectWorkflow(project?.id, project),
  );
  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [taskViewMode, setTaskViewMode] = useState('list');
  const [staleData, setStaleData] = useState(false);
  const navigation = useNavigation();
  const activeTab = founderProjectTab(navigation.projectTab);
  const setActiveTab = (projectTab) => navigate({ projectTab });
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [taskSelection, setTaskSelection] = useState(null);
  const selectedTask =
    tasks.find((task) => task.id === navigation.taskId) ||
    (taskSelection?.id === navigation.taskId ? taskSelection : null);
  const taskDrawerOpen = Boolean(selectedTask);
  const openTask = (task) => {
    setTaskSelection(task);
    navigate({ taskId: task.id });
  };
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [addDriveLinkOpen, setAddDriveLinkOpen] = useState(false);
  const [assignClientModalOpen, setAssignClientModalOpen] = useState(false);
  const [assigningClient, setAssigningClient] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);

  // Client form
  const [clientNameInput, setClientNameInput] = useState(project?.clientName || '');
  const [clientTelegramIdInput, setClientTelegramIdInput] = useState(
    project?.clientTelegramId || '',
  );

  // Task filtering & search
  const [taskStatusFilter, setTaskStatusFilter] = useState('all');
  const [taskStageFilter, setTaskStageFilter] = useState('all');
  const [taskSearch, setTaskSearch] = useState('');
  const [personFilter, setPersonFilter] = useState('all'),
    [spaceFilter, setSpaceFilter] = useState('all');

  // Drive edit state
  const [driveFolderInput, setDriveFolderInput] = useState(localWorkflow?.drive?.folderUrl || '');
  const [isEditingDriveFolder, setIsEditingDriveFolder] = useState(false);
  const [newLinkName, setNewLinkName] = useState('');
  const [newLinkCategory, setNewLinkCategory] = useState('Drawings');
  const [newLinkUrl, setNewLinkUrl] = useState('');

  // New task form state
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskStageId, setNewTaskStageId] = useState('');
  const [newTaskAssigneeId, setNewTaskAssigneeId] = useState('founder');
  const [newTaskDeadline, setNewTaskDeadline] = useState('');
  const [newTaskStatus, setNewTaskStatus] = useState('Open');

  // Project summary visibility
  const [tldrExpanded, setTldrExpanded] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [removingMember, setRemovingMember] = useState(false);

  const [notice, setNotice] = useState(null);

  const showNotice = (message, error = false) => {
    setNotice({ message, error });
    setTimeout(() => setNotice(null), 3500);
  };

  // Load project tasks from API or workspace
  const loadProjectTasks = useCallback(
    async ({ background = false } = {}) => {
      if (!project?.id) return;
      if (!background) setLoadingTasks(true);
      try {
        // First try workspace endpoint
        const wsData = await fetchProjectWorkspace(project.id, 'founder').catch(() => null);
        if (wsData && Array.isArray(wsData.tasks)) {
          setTasks(wsData.tasks);
          setStaleData(Boolean(wsData.staleData));
          if (wsData.syncWarning) showNotice(wsData.syncWarning);
          return;
        }
        // Or tasks endpoint
        const tData = await fetchTasks(project.id, 'founder').catch(() => null);
        if (tData && Array.isArray(tData.tasks)) {
          setTasks(tData.tasks);
          setStaleData(false);
          return;
        }
        showNotice(
          'Could not refresh tasks. Please retry; your last loaded tasks are still shown.',
          true,
        );
      } catch {
        showNotice('Could not refresh tasks. Please retry.', true);
      } finally {
        setLoadingTasks(false);
      }
    },
    [project?.id],
  );

  useEffect(() => {
    if (project?.id) {
      const localData = getProjectWorkflow(project.id, project);
      setLocalWorkflow(localData);
      setDriveFolderInput(localData?.drive?.folderUrl || '');
      setClientNameInput(
        project.clientName && project.clientName !== 'Unassigned Client' ? project.clientName : '',
      );
      setClientTelegramIdInput(project.clientTelegramId || '');
      loadProjectTasks();
    }
  }, [project?.id, project?.status, loadProjectTasks]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') loadProjectTasks({ background: true });
    }, 8000);
    return () => clearInterval(timer);
  }, [loadProjectTasks]);

  if (!project) return null;

  // Use the saved server workflow, rather than an old browser template cache.
  const stages = project.stages || [];
  const schedule = computeStageSchedule(project.startDate || project.createdAt, stages);

  // Telegram client queries linked to this project
  const projectQueries = decisionRequests.filter((req) => req.projectId === project.id);
  const pendingQueriesCount = projectQueries.filter(needsQueryAttention).length;

  // TL;DR metrics
  const blockedTasks = tasks.filter((t) => t.status === 'Blocked');
  const inProgressTasksCount = tasks.filter(
    (t) => t.status === 'In progress' || t.status === 'in_progress',
  ).length;
  const currentStage = stages.find((stage) => stage.name === project.currentStage) || stages[0];
  const currentStageSchedule = schedule.find((stage) => stage.id === currentStage?.id);
  const latestQuery = projectQueries[0];

  // Client assignment check: required for pilot workflow start
  const isClientAssigned = Boolean(
    project.clientName &&
    project.clientName.trim() !== '' &&
    !['Unassigned Client', 'Client pending'].includes(project.clientName) &&
    !project.telegramSetupPending,
  );

  // Workflow template check: started if workflowId or stages exist
  const hasWorkflowStarted = Boolean(
    project.workflowStartedAt ||
    project.workflowId ||
    (stages.length > 0 && project.status !== 'Setup'),
  );

  const statusOfTask = (t) =>
    taskStatus(t, { stage: stages.find((stage) => stage.id === t.stageId) });

  // Filtered tasks
  const filteredTasks = tasks.filter((t) => {
    if (personFilter !== 'all' && (t.assigneeId || 'unassigned') !== personFilter) return false;
    if (
      spaceFilter !== 'all' &&
      !(stages.find((stage) => stage.id === t.stageId)?.spaces || []).includes(spaceFilter)
    )
      return false;
    if (taskStatusFilter === 'unfinished' && isTaskClosed(t)) return false;
    if (
      !['all', 'unfinished'].includes(taskStatusFilter) &&
      !matchesTaskStatus(statusOfTask(t), taskStatusFilter)
    )
      return false;
    if (taskStageFilter !== 'all' && t.stageId !== taskStageFilter) return false;
    if (taskSearch.trim()) {
      const query = taskSearch.toLowerCase();
      return (
        t.title.toLowerCase().includes(query) || (t.description || '').toLowerCase().includes(query)
      );
    }
    return true;
  });

  const completedTasksCount = tasks.filter(
    (t) => t.status === 'Completed' || t.status === 'completed',
  ).length;
  const activeTaskCount = tasks.filter(
    (task) => !['Cancelled', 'cancelled'].includes(task.status),
  ).length;
  const progressPercent = activeTaskCount
    ? Math.round((completedTasksCount / activeTaskCount) * 100)
    : 0;

  const overdueTasksCount = tasks.filter((t) => statusOfTask(t).key === 'overdue').length;
  const teamCount = (project.members || []).length;
  const isEmptyProject = !loadingTasks && tasks.length === 0 && stages.length === 0;
  const activeFilterCount = [personFilter, spaceFilter, taskStatusFilter, taskStageFilter].filter(
    (value) => value !== 'all',
  ).length;

  // Assign Client submission
  const handleAssignClientSubmit = async (e) => {
    e.preventDefault();
    if (!clientNameInput.trim() || assigningClient) return;

    setAssigningClient(true);
    try {
      await assignClient(project.id, {
        clientName: clientNameInput.trim(),
        clientTelegramId: clientTelegramIdInput.trim(),
      });
      updateProjectWorkflow(project.id, { clientAssigned: true });
      setAssignClientModalOpen(false);
      showNotice('Client assigned successfully.');
      if (onProjectUpdated) onProjectUpdated();
    } catch (err) {
      showNotice(err.message || 'Failed to assign client.', true);
    } finally {
      setAssigningClient(false);
    }
  };

  // Add task submission
  const handleCreateTaskSubmit = async (e) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || creatingTask) return;

    setCreatingTask(true);
    try {
      const res = await createTask(project.id, {
        title: newTaskTitle.trim(),
        description: newTaskDesc.trim(),
        stageId: newTaskStageId || stages[0]?.id || undefined,
        assigneeId: newTaskAssigneeId || undefined,
        deadline: newTaskDeadline || undefined,
        status: newTaskStatus || 'Open',
      });

      setNewTaskTitle('');
      setNewTaskDesc('');
      setNewTaskDeadline('');
      setCreateTaskOpen(false);
      showNotice('Task created.');
      await loadProjectTasks();
      if (onProjectUpdated) onProjectUpdated();
    } catch (err) {
      showNotice(err.message || 'Failed to create task.', true);
    } finally {
      setCreatingTask(false);
    }
  };

  // Toggle quick status
  const handleToggleTaskStatus = async (taskItem) => {
    const isDone = taskItem.status === 'Completed' || taskItem.status === 'completed';
    const nextStatus = isDone ? 'Open' : 'Completed';
    try {
      await updateTask(taskItem.id, { status: nextStatus }, 'founder');
      setTasks((prev) =>
        prev.map((t) => (t.id === taskItem.id ? { ...t, status: nextStatus } : t)),
      );
      if (onProjectUpdated) onProjectUpdated();
    } catch (err) {
      showNotice(err.message || 'Could not update task.', true);
    }
  };

  // Remove Project Member
  const handleRemoveMember = async () => {
    const member = removeTarget;
    if (!member || removingMember) return;
    setRemovingMember(true);
    try {
      await removeProjectMember(project.id, member.id || member.employeeId);
      setRemoveTarget(null);
      showNotice(`Removed ${member.name} from project.`);
      if (onProjectUpdated) onProjectUpdated();
      await loadProjectTasks();
    } catch (err) {
      showNotice(err.message || 'Could not remove member.', true);
    } finally {
      setRemovingMember(false);
    }
  };

  // Drive folder save
  const handleSaveDriveFolder = () => {
    updateDriveSettings(project.id, driveFolderInput.trim());
    setIsEditingDriveFolder(false);
    setLocalWorkflow(getProjectWorkflow(project.id, project));
  };

  // Add Drive Link
  const handleAddDriveLink = (e) => {
    e.preventDefault();
    if (!newLinkName.trim() || !newLinkUrl.trim()) return;
    addDriveLink(project.id, newLinkName, newLinkCategory, newLinkUrl);
    setNewLinkName('');
    setNewLinkUrl('');
    setAddDriveLinkOpen(false);
    setLocalWorkflow(getProjectWorkflow(project.id, project));
  };

  // Member Drive access control (Actionable 20)
  const handleDriveAccessChange = (memberId, level) => {
    setMemberDriveAccess(project.id, memberId, level);
    setLocalWorkflow(getProjectWorkflow(project.id, project));
    showNotice(`Updated Drive permission to ${level}.`);
  };

  const getAssigneeName = (assigneeId) => {
    if (!assigneeId) return 'Unassigned';
    if (assigneeId === 'founder') return 'Founder';
    const found = (project.members || []).find(
      (m) => m.employeeId === assigneeId || m.id === assigneeId,
    );
    return found ? found.name : assigneeId;
  };

  const roster = project.telegramMembers || [];
  const profilesReady =
    roster.length >= 2 &&
    roster.every((member) => member.assignedName && member.assignedRole) &&
    roster.filter((member) => /\bclient\b/i.test(member.assignedRole)).length >= 1 &&
    roster.some((member) => !/\b(client|founder)\b/i.test(member.assignedRole));
  if (
    !['Completed', 'Abandoned'].includes(project.status) &&
    project.telegramGroupChatId &&
    (project.telegramSetupPending || !profilesReady)
  )
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <h2 className="type-heading-20">{project.name}</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onOpenCompleteModal}>
            Complete project
          </Button>
          <Button variant="destructive-outline" onClick={onOpenTrashModal}>
            Abandon & move to trash
          </Button>
        </div>
        <TelegramGroups project={project} embedded onProjectsChanged={onProjectUpdated} />
      </div>
    );
  if (
    !['Completed', 'Abandoned'].includes(project.status) &&
    project.telegramGroupChatId &&
    !hasWorkflowStarted
  )
    return (
      <section className="space-y-4">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <div className="card-box bg-card space-y-3">
          <p className="text-xs font-medium text-primary">Step 2 · Project type</p>
          <h1>{project.name}</h1>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onOpenCompleteModal}>
              Complete project
            </Button>
            <Button variant="destructive-outline" onClick={onOpenTrashModal}>
              Abandon & move to trash
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Members and client are ready. Choose the type of project to generate its tasks and
            announce the start in the Telegram group.
          </p>
          <Button onClick={() => setTemplateModalOpen(true)}>Choose project type</Button>
        </div>
        <WorkflowTemplateModal
          open={templateModalOpen}
          onOpenChange={setTemplateModalOpen}
          projectId={project.id}
          telegramLinked
          projectStartDate={project.startDate}
          clientAssigned
          projectMembers={project.members || []}
          onApplied={() => {
            if (onProjectUpdated) onProjectUpdated();
            loadProjectTasks();
          }}
        />
      </section>
    );

  return (
    <div className="iksha-project-detail space-y-6">
      {/* Toast Notice */}
      {notice && (
        <div
          role="status"
          className="fixed right-4 bottom-24 z-[60] max-w-sm rounded-lg border bg-card px-4 py-3 text-sm shadow-lg lg:bottom-4"
        >
          {notice.error ? (
            <AlertCircle className="mr-2 inline size-4 text-destructive" />
          ) : (
            <Check className="mr-2 inline size-4 text-success" />
          )}
          {notice.message}
        </div>
      )}

      {project.workflowAnnouncementStatus && project.workflowAnnouncementStatus !== 'Sent' && (
        <p role="alert" className="card-box border-warning-border bg-warning-bg text-sm">
          The project plan is saved, but the Telegram start announcement could not be confirmed.
          Check the group before sending another announcement.
        </p>
      )}
      {/* Compact header: back link, name, status, client and place, one summary line */}
      <header className="iksha-project-header space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="-ml-2 text-muted-foreground"
          >
            <ArrowLeft className="size-4" />
            Projects
          </Button>
          <div className="flex items-center gap-2">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button variant="outline" size="icon-sm" aria-label="More project actions">
                  <MoreVertical />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={4}
                  className="z-50 min-w-48 rounded-lg border bg-card p-1 shadow-md"
                >
                  <DropdownMenu.Item
                    className="flex h-9 cursor-pointer items-center rounded-md px-2 text-sm outline-none data-[highlighted]:bg-muted"
                    onSelect={onOpenFactsModal}
                  >
                    Project details
                  </DropdownMenu.Item>
                  {!['Completed', 'Abandoned'].includes(project.status) && !isEmptyProject && (
                    <DropdownMenu.Item
                      className="flex h-9 cursor-pointer items-center rounded-md px-2 text-sm outline-none data-[highlighted]:bg-muted"
                      onSelect={onOpenCompleteModal}
                    >
                      Complete project
                    </DropdownMenu.Item>
                  )}
                  <DropdownMenu.Item
                    className="flex h-9 cursor-pointer items-center rounded-md px-2 text-sm text-destructive outline-none data-[highlighted]:bg-overdue-bg"
                    onSelect={onOpenTrashModal}
                  >
                    {project.status === 'Completed' ? 'Move to trash' : 'Abandon & move to trash'}
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <h1 className="line-clamp-2 min-w-0 [overflow-wrap:anywhere]" title={project.name}>
            {project.name}
          </h1>
          <StatusChip tone={PROJECT_STATUS_TONES[project.status]} className="mt-1 shrink-0">
            {project.status || 'Setup'}
          </StatusChip>
        </div>

        <p className="truncate text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{project.clientName || 'Unassigned'}</span>
          {' · '}
          {project.location || 'Location not set'}
          {!isEmptyProject &&
            ` · Started ${formatCalendar(project.startDate) || formatDate(project.createdAt)}`}
        </p>

        {(tasks.length > 0 || teamCount > 0) && (
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <span>
              {completedTasksCount} of {activeTaskCount} done
            </span>
            {overdueTasksCount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-overdue">{overdueTasksCount} overdue</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>{teamCount} team</span>
            {pendingQueriesCount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  className="text-warning underline-offset-4 hover:underline"
                  onClick={() => setActiveTab('queries')}
                >
                  {pendingQueriesCount} {pendingQueriesCount === 1 ? 'query' : 'queries'} to review
                </button>
              </>
            )}
            <span aria-hidden="true">·</span>
            <button
              type="button"
              aria-expanded={tldrExpanded}
              className="inline-flex items-center gap-1 text-foreground underline-offset-4 hover:underline"
              onClick={() => setTldrExpanded(!tldrExpanded)}
            >
              Project summary
              {tldrExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </button>
          </p>
        )}
      </header>

      {/* Client Assignment Gate Banner (shown when no client assigned) */}
      {!isClientAssigned && !['Completed', 'Abandoned'].includes(project.status) && (
        <Alert className="border-warning-border bg-warning-bg text-warning shadow-xs">
          <AlertCircle className="size-5 text-warning" />
          <AlertTitle className="text-sm font-semibold text-warning">
            Add client details when ready
          </AlertTitle>
          <AlertDescription className="mt-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-warning">
            <span>
              You can create a custom timeline below. Assign a client to use workflow templates and
              receive client queries.
            </span>
            <Button
              size="sm"
              className="shrink-0"
              onClick={() => {
                setClientNameInput(
                  project.clientName && project.clientName !== 'Unassigned Client'
                    ? project.clientName
                    : '',
                );
                setClientTelegramIdInput(project.clientTelegramId || '');
                setAssignClientModalOpen(true);
              }}
            >
              <UserPlus className="size-3.5 mr-1" />
              Assign client
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Workflow Start Prompt (Shown once client is assigned but workflow not started) */}
      {isClientAssigned && !hasWorkflowStarted && (
        <Card className="border-primary/30 bg-primary/5 shadow-xs">
          <CardContent className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-xs">
                <Sparkles className="size-5" />
              </span>
              <div>
                <h3 className="type-label-14-strong text-foreground">
                  Client assigned. Next, select and start a workflow
                </h3>
                <p className="mt-1 text-xs text-muted-foreground leading-copy">
                  Build a custom plan or start from a Design or Painting template. You can edit the
                  tasks, work types, and schedule after starting.
                </p>
              </div>
            </div>
            <Button className="shrink-0" onClick={() => setTemplateModalOpen(true)}>
              <Layers className="size-4 mr-2" />
              Select and start workflow
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Project summary: closed until asked for, so no empty band sits above the tabs */}
      {tldrExpanded && (
        <Card className="border-border/60 bg-card/60 shadow-2xs overflow-hidden">
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Telegram query Status */}
              <div className="card-box bg-background/80 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Queries & Group Chat
                  </span>
                  {pendingQueriesCount > 0 ? (
                    <Badge
                      variant="outline"
                      className="border-warning-border bg-warning-bg text-warning text-xs"
                    >
                      {pendingQueriesCount} Pending
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-success-border bg-success-bg text-success text-xs"
                    >
                      Up to date
                    </Badge>
                  )}
                </div>
                <p className="text-xs font-medium text-foreground">
                  {pendingQueriesCount > 0
                    ? `${pendingQueriesCount} query awaiting team discussion or reply to Telegram.`
                    : 'No unresolved client inquiries.'}
                </p>
                {latestQuery && (
                  <p className="text-xs text-muted-foreground line-clamp-1 italic">
                    Latest: &ldquo;{latestQuery.originalMessage || latestQuery.context}&rdquo;
                  </p>
                )}
              </div>

              {/* Tasks & Blockers Status */}
              <div className="card-box bg-background/80 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Tasks &amp; blockers
                  </span>
                  {blockedTasks.length > 0 ? (
                    <Badge variant="destructive" className="text-xs">
                      {blockedTasks.length} Blocked
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      {inProgressTasksCount} Active
                    </Badge>
                  )}
                </div>
                <p className="text-xs font-medium text-foreground">
                  {blockedTasks.length > 0
                    ? `${blockedTasks.length} task flagged as blocked!`
                    : `${inProgressTasksCount} active deliverables, ${completedTasksCount} done (${progressPercent}%).`}
                </p>
                {blockedTasks.length > 0 && (
                  <p className="text-xs text-destructive line-clamp-1">
                    Blocked: {blockedTasks[0].title}
                  </p>
                )}
              </div>

              {/* Active Stage & Next Milestone */}
              <div className="card-box bg-background/80 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Stage &amp; milestone
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {currentStage ? currentStage.name : 'Setup'}
                  </Badge>
                </div>
                <p className="text-xs font-medium text-foreground">
                  {currentStage
                    ? `Current pipeline: ${currentStage.name}${currentStageSchedule?.endDate ? ` (Target: ${currentStageSchedule.endLabel})` : ''}`
                    : 'Assign client to start workflow pipeline.'}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="size-3 text-primary" />
                  <span>{stages.length} workflow stages scheduled</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs System */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="iksha-project-tabs" aria-label="Project sections">
          <TabsTrigger value="schedule">Timeline</TabsTrigger>
          <TabsTrigger value="tasks">
            Tasks <span className="ml-1 font-normal tabular-nums">{tasks.length}</span>
          </TabsTrigger>
          <TabsTrigger value="meetings">Meetings</TabsTrigger>
          <TabsTrigger value="chat">Project chat</TabsTrigger>
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
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="team">
            Team <span className="ml-1 font-normal tabular-nums">{teamCount}</span>
          </TabsTrigger>
        </TabsList>

        {/* ----------------- TAB 1: TASKS ----------------- */}
        <TabsContent value="tasks" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-44 max-w-sm flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
                placeholder="Search tasks"
                aria-label="Search tasks"
                className="pl-8"
              />
            </div>
            <Button
              variant="outline"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <Filter className="size-4" />
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <SegmentedControl
                label="Task view"
                value={taskViewMode}
                onValueChange={setTaskViewMode}
                options={[
                  { value: 'list', label: 'List' },
                  { value: 'graph', label: 'Graph' },
                ]}
              />
              <Button
                variant="outline"
                size="icon"
                aria-label="Refresh tasks"
                onClick={loadProjectTasks}
                disabled={loadingTasks}
              >
                <RefreshCw className={loadingTasks ? 'animate-spin' : ''} />
              </Button>
              <Button
                onClick={() => setCreateTaskOpen(true)}
                disabled={!hasWorkflowStarted}
                title={
                  !hasWorkflowStarted ? 'Start a workflow before adding custom tasks.' : undefined
                }
              >
                <Plus className="size-4" /> Add task
              </Button>
            </div>
          </div>
          {filtersOpen && (
            <div className="grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="grid gap-1 text-xs">
                Person
                <select value={personFilter} onChange={(e) => setPersonFilter(e.target.value)}>
                  <option value="all">All people</option>
                  <option value="founder">Founder</option>
                  <option value="unassigned">Role-based / unassigned</option>
                  {(project.members || []).map((member) => (
                    <option
                      key={member.employeeId || member.id}
                      value={member.employeeId || member.id}
                    >
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs">
                Space
                <select value={spaceFilter} onChange={(e) => setSpaceFilter(e.target.value)}>
                  <option value="all">All spaces</option>
                  {(project.spaces || []).map((space) => (
                    <option key={space}>{space}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs">
                Status
                <NativeSelect
                  value={taskStatusFilter}
                  onChange={(e) => setTaskStatusFilter(e.target.value)}
                >
                  <option value="all">All statuses</option>
                  <option value="unfinished">All unfinished</option>
                  {TASK_STATUS_OPTIONS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              {stages.length > 0 && (
                <label className="grid gap-1 text-xs">
                  Stage
                  <NativeSelect
                    value={taskStageFilter}
                    onChange={(e) => setTaskStageFilter(e.target.value)}
                  >
                    <option value="all">All stages</option>
                    {stages.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              )}
            </div>
          )}

          {/* Task View Mode: Dependency Graph or List */}
          {taskViewMode === 'graph' ? (
            <ProjectDependencyGraph
              tasks={filteredTasks}
              employees={employees}
              stages={stages}
              onOpenTask={(taskItem) => {
                openTask(taskItem);
              }}
              onSwitchToList={() => setTaskViewMode('list')}
              isFounder={true}
              staleDataNotice={staleData}
            />
          ) : (
            <div className="space-y-3">
              {filteredTasks.length ? (
                filteredTasks.map((t) => {
                  const isCompleted = t.status === 'Completed' || t.status === 'completed';
                  const stageName =
                    stages.find((s) => s.id === t.stageId)?.name || t.stageName || 'General';

                  return (
                    <div
                      key={t.id}
                      className="group grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 card-box bg-card transition-all hover:border-primary/40 sm:grid-cols-[32px_minmax(0,1fr)_112px_136px_112px_auto]"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleTaskStatus(t)}
                        className={`grid size-8 place-items-center rounded-md border transition-colors ${
                          isCompleted
                            ? 'bg-success-fill border-success-fill text-white'
                            : 'border-muted-foreground/30 hover:border-primary'
                        }`}
                        aria-label="Toggle task completion"
                      >
                        {isCompleted && <Check className="size-4" />}
                      </button>

                      <div className="min-w-0">
                        <h4
                          title={t.title}
                          className={`cursor-pointer truncate text-sm font-semibold transition-colors hover:text-primary ${
                            isCompleted ? 'line-through text-muted-foreground' : 'text-foreground'
                          }`}
                          onClick={() => {
                            openTask(t);
                          }}
                        >
                          {t.title}
                        </h4>
                        <p className="truncate text-xs text-muted-foreground" title={stageName}>
                          {stageName}
                          {t.sourceQueryId && ' · Telegram query'}
                        </p>
                      </div>

                      <div className="justify-self-end sm:justify-self-start">
                        <StatusChip status={statusOfTask(t)} />
                      </div>

                      <span className="col-start-2 flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground sm:col-start-auto">
                        <User className="size-3 shrink-0" />
                        <span className="truncate">
                          {getAssigneeName(t.assigneeId) || t.assigneeName || 'Unassigned'}
                        </span>
                      </span>

                      <span className="whitespace-nowrap flex items-center gap-1 text-xs text-muted-foreground">
                        {(t.deadline || t.dueDate) && (
                          <>
                            <Calendar className="size-3 shrink-0" />
                            <Time value={t.deadline || t.dueDate} format="calendar" />
                          </>
                        )}
                      </span>

                      <Button
                        variant="outline"
                        size="sm"
                        className="col-start-3 row-start-2 sm:col-start-auto sm:row-start-auto"
                        onClick={() => {
                          openTask(t);
                        }}
                      >
                        <MessageSquare className="size-4 text-primary" />
                        <span>Thread</span>
                      </Button>
                    </div>
                  );
                })
              ) : (
                <Empty
                  kind={tasks.length ? 'no-results' : 'first-use'}
                  icon={CheckCircle2}
                  title={tasks.length ? 'No tasks match these filters' : 'No tasks yet'}
                  description={
                    tasks.length
                      ? 'Try another status, person or stage, or clear the search.'
                      : hasWorkflowStarted
                        ? 'Add the first deliverable for this project.'
                        : 'Start a workflow to generate the starter tasks.'
                  }
                  action={
                    tasks.length ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setTaskStatusFilter('all');
                          setTaskStageFilter('all');
                          setPersonFilter('all');
                          setSpaceFilter('all');
                          setTaskSearch('');
                        }}
                      >
                        Clear filters
                      </Button>
                    ) : hasWorkflowStarted ? (
                      <Button size="sm" onClick={() => setCreateTaskOpen(true)}>
                        <Plus />
                        Add task
                      </Button>
                    ) : isClientAssigned ? (
                      <Button size="sm" onClick={() => setTemplateModalOpen(true)}>
                        <Layers />
                        Start workflow
                      </Button>
                    ) : null
                  }
                />
              )}
            </div>
          )}
        </TabsContent>

        {/* ----------------- TAB 2: INTERNAL TEAM CHAT ----------------- */}
        <TabsContent value="chat" className="space-y-4">
          <TeamChat
            key={project.id}
            endpoint={`/api/founder/projects/${project.id}/team-chat`}
            currentActor="founder"
            members={project.members}
          />
        </TabsContent>

        {/* ----------------- TAB 3: STAGES & SCHEDULE ----------------- */}
        <TabsContent value="meetings">
          <MeetingsView projectId={project.id} embedded />
        </TabsContent>
        <TabsContent value="schedule">
          <ProjectTimeline
            spaces={project.spaces || []}
            key={project.id}
            projectId={project.id}
            projectStartDate={project.startDate}
            tasks={tasks}
            stages={stages}
            members={project.members || employees}
            telegramLinked={Boolean(project.telegramGroupChatId)}
            onOpenTask={(task) => {
              openTask(task);
            }}
            onSchedulePreview={
              !['Completed', 'Abandoned'].includes(project.status)
                ? (moves, options) => previewSchedule(project.id, moves, options)
                : undefined
            }
            onScheduleApply={
              !['Completed', 'Abandoned'].includes(project.status)
                ? async (moves, options) => {
                    const result = await applySchedule(project.id, moves, options);
                    setTasks(result.tasks);
                    return result;
                  }
                : undefined
            }
            onPlanChanged={
              !['Completed', 'Abandoned'].includes(project.status)
                ? (result) => {
                    if (Array.isArray(result.tasks)) setTasks(result.tasks);
                    if (onProjectUpdated) onProjectUpdated();
                  }
                : undefined
            }
          />
        </TabsContent>

        {/* ----------------- TAB 4: CLIENT QUERIES ----------------- */}
        <TabsContent value="queries" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">Telegram queries & group chat</h3>
              <p className="text-xs text-muted-foreground">
                Messages, questions, updates, and shared files from everyone in the Telegram group.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {projectQueries.length > 0 ? (
              projectQueries.map((query) => (
                <ClientQueryCard
                  key={query.id}
                  query={query}
                  project={project}
                  stages={stages}
                  projectMembers={project.members || []}
                  isFounder={true}
                  onQueryChanged={() => {
                    if (onQueriesUpdated) onQueriesUpdated();
                    if (onProjectUpdated) onProjectUpdated();
                    loadProjectTasks();
                  }}
                  onTaskCreated={(newTask) => {
                    loadProjectTasks();
                    openTask(newTask);
                  }}
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
                description="Questions from your linked Telegram group appear here for you to answer."
              />
            )}
          </div>
        </TabsContent>

        {/* ----------------- TAB 5: FILES & DRIVE ----------------- */}
        <TabsContent value="files">
          <ProjectFiles projectId={project.id} />
        </TabsContent>

        {/* ----------------- TAB 6: TEAM & ACCESS ----------------- */}
        <TabsContent value="team" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="type-heading-20">Team</h2>
              <p className="text-xs text-muted-foreground">
                Assign designers and supervisors. Removing a member revokes project access and
                clears their assigned tasks.
              </p>
            </div>
            <Button size="sm" onClick={onOpenMemberModal}>
              <UserPlus className="size-3.5 mr-1" /> Add team member
            </Button>
          </div>

          <div className="space-y-2">
            {project.members && project.members.length > 0 ? (
              project.members.map((member, idx) => {
                const memberId = member.employeeId || member.id;
                const memberTasksCount = tasks.filter((t) => t.assigneeId === memberId).length;

                return (
                  <Card key={memberId || idx} className="py-0">
                    <CardContent className="flex items-center justify-between gap-3 py-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar className="size-9">
                          <AvatarFallback className="bg-secondary text-xs font-semibold">
                            {member.name?.slice(0, 2).toUpperCase() || 'TM'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground">{member.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {member.designation || member.role || 'Member'}
                          </p>
                        </div>
                        <Badge variant="secondary" className="ml-1 min-w-0 shrink text-xs">
                          <span className="truncate">{member.role || 'Designer'}</span>
                        </Badge>
                      </div>

                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-xs text-muted-foreground">
                          {memberTasksCount} task{memberTasksCount === 1 ? '' : 's'}
                        </span>

                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:bg-overdue-bg hover:text-destructive"
                          aria-label={`Remove ${member.name}`}
                          onClick={() => setRemoveTarget(member)}
                        >
                          Remove
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            ) : (
              <Empty
                icon={Users}
                title="No team members yet"
                description="Add designers, supervisors or trades to work on tasks and team chat."
                action={
                  <Button size="sm" onClick={onOpenMemberModal}>
                    <UserPlus />
                    Add team member
                  </Button>
                }
              />
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog
        open={Boolean(removeTarget)}
        onOpenChange={(open) => {
          if (!open && !removingMember) setRemoveTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removeTarget?.name}?</DialogTitle>
            <DialogDescription>
              They lose access to this project, and their task assignments in it are cleared.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={removingMember}
              onClick={() => setRemoveTarget(null)}
            >
              Cancel
            </Button>
            <Button variant="destructive" disabled={removingMember} onClick={handleRemoveMember}>
              {removingMember ? 'Removing…' : 'Remove from project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Task Thread Drawer */}
      <TaskThreadDrawer
        task={selectedTask}
        project={project}
        open={taskDrawerOpen}
        onOpenChange={(open) => {
          if (!open) goBack({ taskId: '' });
        }}
        onTaskUpdated={loadProjectTasks}
        siblings={filteredTasks}
        onSelectTask={openTask}
        onOpenSourceQuery={() => setActiveTab('queries')}
        currentActor="founder"
        isFounder={true}
        projectMembers={project.members || []}
      />

      {/* Workflow Template Selector Modal */}
      <WorkflowTemplateModal
        open={templateModalOpen}
        onOpenChange={setTemplateModalOpen}
        projectId={project.id}
        projectStartDate={project.startDate}
        clientAssigned={isClientAssigned}
        projectMembers={project.members || []}
        onApplied={() => {
          if (onProjectUpdated) onProjectUpdated();
          loadProjectTasks();
        }}
      />

      {/* Add task Modal */}
      <Dialog
        open={createTaskOpen}
        onOpenChange={(open) => {
          setCreateTaskOpen(open);
          if (!open) {
            setNewTaskTitle('');
            setNewTaskDesc('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add task</DialogTitle>
            <DialogDescription>
              Add a deliverable or checklist item for your project team.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateTaskSubmit} className="space-y-4">
            <label className="grid gap-2 text-xs font-semibold">
              Task title
              <Input
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="e.g. Prepare structural layout drawings"
                required
              />
            </label>

            <label className="grid gap-2 text-xs font-semibold">
              Description
              <Textarea
                value={newTaskDesc}
                onChange={(e) => setNewTaskDesc(e.target.value)}
                placeholder="Details, deliverable requirements, or instructions…"
                rows={3}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-2 text-xs font-semibold">
                Project stage
                <NativeSelect
                  value={newTaskStageId}
                  onChange={(e) => setNewTaskStageId(e.target.value)}
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
                  value={newTaskAssigneeId}
                  onChange={(e) => setNewTaskAssigneeId(e.target.value)}
                  className="w-full"
                >
                  <option value="founder">Founder</option>
                  {(project.members || []).map((m) => (
                    <option key={m.id || m.employeeId} value={m.employeeId || m.id}>
                      {m.name} ({m.role || 'Member'})
                    </option>
                  ))}
                </NativeSelect>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-2 text-xs font-semibold">
                Deadline
                <Input
                  type="date"
                  value={newTaskDeadline}
                  onChange={(e) => setNewTaskDeadline(e.target.value)}
                />
              </label>

              <label className="grid gap-2 text-xs font-semibold">
                Initial status
                <NativeSelect
                  value={newTaskStatus}
                  onChange={(e) => setNewTaskStatus(e.target.value)}
                  className="w-full"
                >
                  <option value="Open">Open</option>
                  <option value="In progress">In progress</option>
                  <option value="Blocked">Blocked</option>
                </NativeSelect>
              </label>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCreateTaskOpen(false);
                  setNewTaskTitle('');
                  setNewTaskDesc('');
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creatingTask}>
                {creatingTask ? <Loader2 className="size-3.5 mr-2 animate-spin" /> : null}
                Add task
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign Client Modal (Phase 2) */}
      <Dialog open={assignClientModalOpen} onOpenChange={setAssignClientModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign client to project</DialogTitle>
            <DialogDescription>
              A client must be assigned before starting the workflow pipeline.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAssignClientSubmit} className="space-y-4">
            <label className="grid gap-2 text-xs font-semibold">
              Client full name
              <Input
                value={clientNameInput}
                onChange={(e) => setClientNameInput(e.target.value)}
                placeholder="e.g. Maya Sharma"
                required
                disabled={hasWorkflowStarted && project.workflowId !== 'CUSTOM-V1'}
              />
            </label>

            <label className="grid gap-2 text-xs font-semibold">
              Client Telegram user ID (optional)
              <Input
                value={clientTelegramIdInput}
                onChange={(e) => setClientTelegramIdInput(e.target.value)}
                placeholder="e.g. 123456789"
                disabled={hasWorkflowStarted && project.workflowId !== 'CUSTOM-V1'}
              />
              <span className="text-xs text-muted-foreground leading-copy">
                Required for automatic Telegram intake to link questions sent directly in the group.
                Identity may also be resolved from the approved Telegram group roster.
              </span>
            </label>

            {hasWorkflowStarted && project.workflowId !== 'CUSTOM-V1' && (
              <p className="text-xs text-warning bg-warning-bg card-box border-warning-border">
                🔒 Client assignment is locked because the project workflow has already started.
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAssignClientModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  assigningClient || (hasWorkflowStarted && project.workflowId !== 'CUSTOM-V1')
                }
              >
                {assigningClient ? <Loader2 className="size-3.5 mr-2 animate-spin" /> : null}
                Save client
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Drive Link Modal */}
      <Dialog open={addDriveLinkOpen} onOpenChange={setAddDriveLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add project Drive link</DialogTitle>
            <DialogDescription>Add a link to a file or folder in Google Drive.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddDriveLink} className="space-y-4">
            <label className="grid gap-2 text-xs font-semibold">
              Name
              <Input
                value={newLinkName}
                onChange={(e) => setNewLinkName(e.target.value)}
                placeholder="e.g. Electrical CAD plan freeze"
                required
              />
            </label>
            <label className="grid gap-2 text-xs font-semibold">
              Category
              <NativeSelect
                value={newLinkCategory}
                onChange={(e) => setNewLinkCategory(e.target.value)}
              >
                <option value="Drawings">Drawings</option>
                <option value="Renders">Renders</option>
                <option value="Documents">Documents</option>
                <option value="Site photos">Site photos</option>
                <option value="General">General</option>
              </NativeSelect>
            </label>
            <label className="grid gap-2 text-xs font-semibold">
              URL
              <Input
                type="url"
                value={newLinkUrl}
                onChange={(e) => setNewLinkUrl(e.target.value)}
                placeholder="https://drive.google.com/..."
                required
              />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddDriveLinkOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Add link</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
