// frontend/src/components/ProjectDetailView.jsx
import React, { useEffect, useState, useCallback } from "react";
import {
  AlertCircle, AlertTriangle, ArrowLeft, ArrowRight, ArrowUpRight,
  Building2, Calendar, Check, CheckCircle2, ChevronDown, ChevronUp,
  Clock, Copy, ExternalLink, FileText, Filter, FolderKanban, Layers,
  Link as LinkIcon, MessageSquare, MoreVertical, Plus, RefreshCw, Search,
  Share2, ShieldCheck, Sparkles, Trash2, User, UserPlus, Users, X,
  Lock, Loader2
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import { TeamChat } from "@/components/TeamChat";
import { TaskThreadDrawer } from "@/components/TaskThreadDrawer";
import { ClientQueryCard } from "@/components/ClientQueryCard";
import { WorkflowTemplateModal } from "@/components/WorkflowTemplateModal";
import {
  fetchProjectWorkspace, fetchTasks, createTask, updateTask,
  assignClient, removeProjectMember
} from "@/lib/api";
import {
  getProjectWorkflow, updateProjectWorkflow, updateDriveSettings,
  addDriveLink, setMemberDriveAccess, computeStageSchedule,
  updateStageDuration, reorderStage
} from "@/lib/projectWorkflowStore";

const statusBadgeStyles = {
  "On track": "border-emerald-200 bg-emerald-50 text-emerald-800",
  "Active": "border-emerald-200 bg-emerald-50 text-emerald-800",
  "At risk": "border-amber-200 bg-amber-50 text-amber-800",
  "On hold": "border-slate-200 bg-slate-100 text-slate-700",
  "Completed": "border-blue-200 bg-blue-50 text-blue-800",
  "Setup": "border-purple-200 bg-purple-50 text-purple-800"
};

const taskStatusColors = {
  "Open": "bg-slate-100 text-slate-800 border-slate-200",
  "In progress": "bg-blue-50 text-blue-700 border-blue-200",
  "Blocked": "bg-amber-50 text-amber-800 border-amber-200",
  "Completed": "bg-emerald-50 text-emerald-800 border-emerald-200",
  "Cancelled": "bg-red-50 text-red-700 border-red-200",
  // Backward compatibility
  "todo": "bg-slate-100 text-slate-800 border-slate-200",
  "in_progress": "bg-blue-50 text-blue-700 border-blue-200",
  "review": "bg-amber-50 text-amber-800 border-amber-200",
  "completed": "bg-emerald-50 text-emerald-800 border-emerald-200",
  "cancelled": "bg-red-50 text-red-700 border-red-200"
};

export function ProjectDetailView({
  project,
  allProjects = [],
  employees = [],
  decisionRequests = [],
  onBackToDirectory,
  onProjectUpdated,
  onOpenInviteModal,
  onOpenTrashModal,
  onOpenFactsModal,
  onOpenMemberModal
}) {
  const [localWorkflow, setLocalWorkflow] = useState(() => getProjectWorkflow(project?.id, project));
  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [activeTab, setActiveTab] = useState("tasks");
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [addDriveLinkOpen, setAddDriveLinkOpen] = useState(false);
  const [assignClientModalOpen, setAssignClientModalOpen] = useState(false);
  const [assigningClient, setAssigningClient] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);

  // Client form
  const [clientNameInput, setClientNameInput] = useState(project?.clientName || "");
  const [clientTelegramIdInput, setClientTelegramIdInput] = useState(project?.clientTelegramId || "");

  // Task filtering & search
  const [taskStatusFilter, setTaskStatusFilter] = useState("all");
  const [taskStageFilter, setTaskStageFilter] = useState("all");
  const [taskSearch, setTaskSearch] = useState("");

  // Drive edit state
  const [driveFolderInput, setDriveFolderInput] = useState(localWorkflow?.drive?.folderUrl || "");
  const [isEditingDriveFolder, setIsEditingDriveFolder] = useState(false);
  const [newLinkName, setNewLinkName] = useState("");
  const [newLinkCategory, setNewLinkCategory] = useState("Drawings");
  const [newLinkUrl, setNewLinkUrl] = useState("");

  // New task form state
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [newTaskStageId, setNewTaskStageId] = useState("");
  const [newTaskAssigneeId, setNewTaskAssigneeId] = useState("founder");
  const [newTaskDeadline, setNewTaskDeadline] = useState("");
  const [newTaskStatus, setNewTaskStatus] = useState("Open");

  // Stage editing & reordering state (Actionables 15, 16)
  const [editingStageId, setEditingStageId] = useState(null);
  const [editingStageDuration, setEditingStageDuration] = useState("");
  const [tldrExpanded, setTldrExpanded] = useState(true);

  const [notice, setNotice] = useState(null);

  const showNotice = (message, error = false) => {
    setNotice({ message, error });
    setTimeout(() => setNotice(null), 3500);
  };

  // Load project tasks from API or workspace
  const loadProjectTasks = useCallback(async () => {
    if (!project?.id) return;
    setLoadingTasks(true);
    try {
      // First try workspace endpoint
      const wsData = await fetchProjectWorkspace(project.id, "founder").catch(() => null);
      if (wsData && Array.isArray(wsData.tasks)) {
        setTasks(wsData.tasks);
        return;
      }
      // Or tasks endpoint
      const tData = await fetchTasks(project.id, "founder").catch(() => null);
      if (tData && Array.isArray(tData.tasks)) {
        setTasks(tData.tasks);
        return;
      }
      // Fallback to local workflow store
      const localData = getProjectWorkflow(project.id, project);
      setTasks(localData?.tasks || []);
    } catch {
      const localData = getProjectWorkflow(project.id, project);
      setTasks(localData?.tasks || []);
    } finally {
      setLoadingTasks(false);
    }
  }, [project?.id, project]);

  useEffect(() => {
    if (project?.id) {
      const localData = getProjectWorkflow(project.id, project);
      setLocalWorkflow(localData);
      setDriveFolderInput(localData?.drive?.folderUrl || "");
      setClientNameInput(project.clientName && project.clientName !== "Unassigned Client" ? project.clientName : "");
      setClientTelegramIdInput(project.clientTelegramId || "");
      loadProjectTasks();
    }
  }, [project?.id, project, loadProjectTasks]);

  if (!project) return null;

  // Stages from localWorkflow or project
  const stages = localWorkflow?.stages && localWorkflow.stages.length > 0 ? localWorkflow.stages : (project.stages || []);
  const schedule = computeStageSchedule(project.startDate || project.createdAt, stages);

  // Telegram client queries linked to this project
  const projectQueries = decisionRequests.filter((req) => req.projectId === project.id);
  const pendingQueriesCount = projectQueries.filter((q) => !["Done", "Rejected"].includes(q.status)).length;

  // TL;DR metrics
  const blockedTasks = tasks.filter((t) => t.status === "Blocked");
  const inProgressTasksCount = tasks.filter((t) => t.status === "In progress" || t.status === "in_progress").length;
  const currentStage = stages[0];
  const currentStageSchedule = schedule[0];
  const latestQuery = projectQueries[0];

  // Client assignment check: required for pilot workflow start
  const isClientAssigned = Boolean(
    project.clientName &&
    project.clientName.trim() !== "" &&
    project.clientName !== "Unassigned Client" &&
    !project.telegramSetupPending
  );

  // Workflow template check: started if workflowId or stages exist
  const hasWorkflowStarted = Boolean(project.workflowStartedAt || project.workflowId || (stages.length > 0 && project.status !== "Setup"));

  // Filtered tasks
  const filteredTasks = tasks.filter((t) => {
    if (taskStatusFilter === "open" && (t.status === "Completed" || t.status === "completed")) return false;
    if (taskStatusFilter !== "all" && taskStatusFilter !== "open" && t.status.toLowerCase() !== taskStatusFilter.toLowerCase()) return false;
    if (taskStageFilter !== "all" && t.stageId !== taskStageFilter) return false;
    if (taskSearch.trim()) {
      const query = taskSearch.toLowerCase();
      return (
        t.title.toLowerCase().includes(query) ||
        (t.description || "").toLowerCase().includes(query)
      );
    }
    return true;
  });

  const completedTasksCount = tasks.filter((t) => t.status === "Completed" || t.status === "completed").length;
  const progressPercent = tasks.length ? Math.round((completedTasksCount / tasks.length) * 100) : (project.progress || 0);

  // Assign Client submission
  const handleAssignClientSubmit = async (e) => {
    e.preventDefault();
    if (!clientNameInput.trim() || assigningClient) return;

    setAssigningClient(true);
    try {
      await assignClient(project.id, {
        clientName: clientNameInput.trim(),
        clientTelegramId: clientTelegramIdInput.trim()
      });
      updateProjectWorkflow(project.id, { clientAssigned: true });
      setAssignClientModalOpen(false);
      showNotice("Client assigned successfully.");
      if (onProjectUpdated) onProjectUpdated();
    } catch (err) {
      showNotice(err.message || "Failed to assign client.", true);
    } finally {
      setAssigningClient(false);
    }
  };

  // Create Task submission
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
        status: newTaskStatus || "Open"
      });

      setNewTaskTitle("");
      setNewTaskDesc("");
      setNewTaskDeadline("");
      setCreateTaskOpen(false);
      showNotice("Task created.");
      await loadProjectTasks();
      if (onProjectUpdated) onProjectUpdated();
    } catch (err) {
      showNotice(err.message || "Failed to create task.", true);
    } finally {
      setCreatingTask(false);
    }
  };

  // Toggle quick status
  const handleToggleTaskStatus = async (taskItem) => {
    const isDone = taskItem.status === "Completed" || taskItem.status === "completed";
    const nextStatus = isDone ? "Open" : "Completed";
    try {
      await updateTask(taskItem.id, { status: nextStatus }, "founder");
      setTasks((prev) => prev.map((t) => t.id === taskItem.id ? { ...t, status: nextStatus } : t));
      if (onProjectUpdated) onProjectUpdated();
    } catch (err) {
      showNotice(err.message || "Could not update task.", true);
    }
  };

  // Remove Project Member
  const handleRemoveMember = async (member) => {
    if (!confirm(`Remove ${member.name} from this project? Their task assignments in this project will be cleared.`)) {
      return;
    }
    try {
      await removeProjectMember(project.id, member.id || member.employeeId);
      showNotice(`Removed ${member.name} from project.`);
      if (onProjectUpdated) onProjectUpdated();
      await loadProjectTasks();
    } catch (err) {
      showNotice(err.message || "Could not remove member.", true);
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
    setNewLinkName("");
    setNewLinkUrl("");
    setAddDriveLinkOpen(false);
    setLocalWorkflow(getProjectWorkflow(project.id, project));
  };

  // Stage duration editing (Actionable 15)
  const handleSaveStageDuration = (stageId) => {
    const days = parseInt(editingStageDuration, 10);
    if (!days || days < 1) return;
    updateStageDuration(project.id, stageId, days);
    setEditingStageId(null);
    setLocalWorkflow(getProjectWorkflow(project.id, project));
    showNotice(`Updated stage duration to ${days} days.`);
  };

  // Stage reordering (Actionable 16)
  const handleReorderStage = (stageId, direction) => {
    reorderStage(project.id, stageId, direction);
    setLocalWorkflow(getProjectWorkflow(project.id, project));
    showNotice(`Stage moved ${direction}.`);
  };

  // Member Drive access control (Actionable 20)
  const handleDriveAccessChange = (memberId, level) => {
    setMemberDriveAccess(project.id, memberId, level);
    setLocalWorkflow(getProjectWorkflow(project.id, project));
    showNotice(`Updated Drive permission to ${level}.`);
  };

  const getAssigneeName = (assigneeId) => {
    if (!assigneeId) return "Unassigned";
    if (assigneeId === "founder") return "Founder";
    const found = (project.members || []).find((m) => m.employeeId === assigneeId || m.id === assigneeId);
    return found ? found.name : assigneeId;
  };

  return (
    <div className="space-y-6">
      {/* Toast Notice */}
      {notice && (
        <div role="status" className="fixed right-4 bottom-24 z-[60] max-w-sm rounded-lg border bg-card px-4 py-3 text-sm shadow-lg md:bottom-4">
          {notice.error ? <AlertCircle className="mr-2 inline size-4 text-destructive" /> : <Check className="mr-2 inline size-4 text-emerald-600" />}
          {notice.message}
        </div>
      )}

      {/* Navigation Header */}
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:p-5 shadow-xs">
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBackToDirectory}
            className="group -ml-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4 mr-1.5 transition-transform group-hover:-translate-x-1" />
            All Projects Directory
          </Button>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onOpenFactsModal}>
              Edit Facts
            </Button>
            <Button size="sm" onClick={onOpenInviteModal}>
              <Share2 className="size-3.5 mr-1" /> Share Client Link
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-3 pt-1">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl text-foreground">
                {project.name}
              </h1>
              <Badge variant="outline" className={statusBadgeStyles[project.status] || "border-muted"}>
                <span className="size-1.5 rounded-full bg-current mr-1.5" />
                {project.status || "Setup"}
              </Badge>
              {project.phase && (
                <Badge variant="secondary" className="text-xs">
                  {project.phase}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Client: <span className="font-semibold text-foreground">{project.clientName || "Unassigned"}</span>
              {project.clientTelegramId && <span className="font-mono ml-1 text-muted-foreground">(TG: {project.clientTelegramId})</span>}
              {" · "}{project.location || "Location not set"}
              {" · "}Started {project.startDate ? new Date(project.startDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : new Date(project.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-3 text-xs">
            <div className="rounded-xl border bg-muted/30 px-3 py-1.5 text-center">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Tasks</span>
              <strong className="text-sm font-semibold">{completedTasksCount}/{tasks.length}</strong>
            </div>
            {pendingQueriesCount > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-center text-amber-900">
                <span className="text-[10px] uppercase tracking-wider block font-medium">Queries</span>
                <strong className="text-sm font-bold">{pendingQueriesCount} Needs action</strong>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Client Assignment Gate Banner (shown when no client assigned) */}
      {!isClientAssigned && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-950 shadow-xs">
          <AlertCircle className="size-5 text-amber-600" />
          <AlertTitle className="text-sm font-bold text-amber-900">
            Client Assignment Required Before Workflow Start
          </AlertTitle>
          <AlertDescription className="mt-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-amber-800">
            <span>
              This project is in Setup. Assign a client name and optional Telegram user ID to unlock starting the workflow pipeline and receiving client queries.
            </span>
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
              onClick={() => {
                setClientNameInput(project.clientName && project.clientName !== "Unassigned Client" ? project.clientName : "");
                setClientTelegramIdInput(project.clientTelegramId || "");
                setAssignClientModalOpen(true);
              }}
            >
              <UserPlus className="size-3.5 mr-1" />
              Assign Client Now
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Workflow Start Prompt (Shown once client is assigned but workflow not started) */}
      {isClientAssigned && !hasWorkflowStarted && (
        <Card className="border-primary/30 bg-primary/5 shadow-xs">
          <CardContent className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5">
            <div className="flex items-start gap-3.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-xs">
                <Sparkles className="size-5" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  Client Assigned! Next Step: Select and Start Workflow Pipeline
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                  Choose a battle-tested Studio Iksha pilot template (Design pilot, Painting pilot) to generate sequential stages, deadlines, and starter tasks.
                </p>
              </div>
            </div>
            <Button
              className="shrink-0"
              onClick={() => setTemplateModalOpen(true)}
            >
              <Layers className="size-4 mr-1.5" />
              Select &amp; Start Workflow
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Actionable 10: Conversation TL;DR & Executive Briefing */}
      <Card className="border-border/60 bg-card/60 shadow-2xs overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-2.5 bg-muted/20">
          <div className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-md bg-primary/10 text-primary">
              <Sparkles className="size-3.5" />
            </span>
            <span className="text-xs font-bold tracking-tight">Project TL;DR &amp; Executive Briefing</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => setTldrExpanded(!tldrExpanded)}
          >
            {tldrExpanded ? "Hide Briefing" : "Show Briefing"}
            {tldrExpanded ? <ChevronUp className="size-3 ml-1" /> : <ChevronDown className="size-3 ml-1" />}
          </Button>
        </div>
        {tldrExpanded && (
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Telegram Query Status */}
              <div className="rounded-xl border bg-background/80 p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Client Queries</span>
                  {pendingQueriesCount > 0 ? (
                    <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900 text-[10px]">
                      {pendingQueriesCount} Pending
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800 text-[10px]">
                      Up to date
                    </Badge>
                  )}
                </div>
                <p className="text-xs font-medium text-foreground">
                  {pendingQueriesCount > 0
                    ? `${pendingQueriesCount} query awaiting team discussion or reply to Telegram.`
                    : "No unresolved client inquiries."}
                </p>
                {latestQuery && (
                  <p className="text-[11px] text-muted-foreground line-clamp-1 italic">
                    Latest: &ldquo;{latestQuery.originalMessage || latestQuery.context}&rdquo;
                  </p>
                )}
              </div>

              {/* Tasks & Blockers Status */}
              <div className="rounded-xl border bg-background/80 p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Tasks &amp; Blockers</span>
                  {blockedTasks.length > 0 ? (
                    <Badge variant="destructive" className="text-[10px]">
                      {blockedTasks.length} Blocked
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
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
                  <p className="text-[11px] text-destructive line-clamp-1">
                    Blocked: {blockedTasks[0].title}
                  </p>
                )}
              </div>

              {/* Active Stage & Next Milestone */}
              <div className="rounded-xl border bg-background/80 p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Stage &amp; Milestone</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {currentStage ? currentStage.name : "Setup"}
                  </Badge>
                </div>
                <p className="text-xs font-medium text-foreground">
                  {currentStage
                    ? `Current pipeline: ${currentStage.name}${currentStageSchedule?.endDate ? ` (Target: ${currentStageSchedule.endLabel})` : ""}`
                    : "Assign client to start workflow pipeline."}
                </p>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Clock className="size-3 text-primary" />
                  <span>{stages.length} workflow stages scheduled</span>
                </div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Tabs System */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex flex-wrap w-full justify-start h-auto gap-1 bg-muted/60 p-1 rounded-xl">
          <TabsTrigger value="tasks" className="font-semibold text-xs px-3.5 py-2">
            <CheckCircle2 className="size-3.5 mr-1.5 text-primary" />
            Tasks ({tasks.length})
          </TabsTrigger>
          <TabsTrigger value="chat" className="font-semibold text-xs px-3.5 py-2">
            <MessageSquare className="size-3.5 mr-1.5 text-blue-600" />
            Internal Project Chat
          </TabsTrigger>
          <TabsTrigger value="schedule" className="font-semibold text-xs px-3.5 py-2">
            <Calendar className="size-3.5 mr-1.5 text-amber-600" />
            Schedule &amp; Stages ({stages.length})
          </TabsTrigger>
          <TabsTrigger value="queries" className="font-semibold text-xs px-3.5 py-2">
            <AlertCircle className="size-3.5 mr-1.5 text-red-500" />
            Client Queries ({projectQueries.length})
            {pendingQueriesCount > 0 && (
              <Badge variant="secondary" className="ml-1.5 size-4 p-0 text-[10px] justify-center bg-amber-200 text-amber-900">
                {pendingQueriesCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="files" className="font-semibold text-xs px-3.5 py-2">
            <FolderKanban className="size-3.5 mr-1.5 text-emerald-600" />
            Files &amp; Drive
          </TabsTrigger>
          <TabsTrigger value="team" className="font-semibold text-xs px-3.5 py-2">
            <Users className="size-3.5 mr-1.5 text-indigo-600" />
            Team &amp; Access ({project.members?.length || 0})
          </TabsTrigger>
        </TabsList>

        {/* ----------------- TAB 1: TASKS ----------------- */}
        <TabsContent value="tasks" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative min-w-44 flex-1 max-w-sm">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={taskSearch}
                  onChange={(e) => setTaskSearch(e.target.value)}
                  placeholder="Search tasks, deliverables…"
                  className="pl-8 text-xs h-9"
                />
              </div>

              <NativeSelect
                value={taskStatusFilter}
                onChange={(e) => setTaskStatusFilter(e.target.value)}
                className="text-xs h-9 w-32"
              >
                <option value="all">All States</option>
                <option value="open">All Open</option>
                <option value="Open">Open</option>
                <option value="In progress">In Progress</option>
                <option value="Blocked">Blocked</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </NativeSelect>

              {stages.length > 0 && (
                <NativeSelect
                  value={taskStageFilter}
                  onChange={(e) => setTaskStageFilter(e.target.value)}
                  className="text-xs h-9 w-44"
                >
                  <option value="all">All Stages</option>
                  {stages.map((st) => (
                    <option key={st.id} value={st.id}>{st.name}</option>
                  ))}
                </NativeSelect>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadProjectTasks}
                disabled={loadingTasks}
              >
                <RefreshCw className={`size-3.5 mr-1.5 ${loadingTasks ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={() => setCreateTaskOpen(true)}
                disabled={!hasWorkflowStarted}
                title={!hasWorkflowStarted ? "Start a workflow before adding custom tasks." : undefined}
              >
                <Plus className="size-3.5 mr-1" /> Add Task
              </Button>
            </div>
          </div>

          {/* Task Progress Bar */}
          <div className="rounded-xl border bg-card p-3">
            <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
              <span>Task Completion Progress</span>
              <span>{completedTasksCount} of {tasks.length} completed ({progressPercent}%)</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Task List */}
          <div className="space-y-2.5">
            {filteredTasks.length ? (
              filteredTasks.map((t) => {
                const isCompleted = t.status === "Completed" || t.status === "completed";
                const stageName = stages.find((s) => s.id === t.stageId)?.name || t.stageName || "General";

                return (
                  <div
                    key={t.id}
                    className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border bg-card p-3.5 transition-all hover:border-primary/40 hover:shadow-2xs"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleTaskStatus(t)}
                          className={`grid size-5 place-items-center rounded-md border transition-colors ${
                            isCompleted ? "bg-emerald-600 border-emerald-600 text-white" : "border-muted-foreground/30 hover:border-primary"
                          }`}
                          aria-label="Toggle task completion"
                        >
                          {isCompleted && <Check className="size-3.5" />}
                        </button>

                        <Badge variant="outline" className={`text-[10px] ${taskStatusColors[t.status] || "bg-muted"}`}>
                          {t.status}
                        </Badge>

                        {t.sourceQueryId && (
                          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900 text-[10px]">
                            Telegram Query
                          </Badge>
                        )}

                        <span className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                          · {stageName}
                        </span>
                      </div>

                      <h4
                        className={`text-sm font-semibold tracking-tight transition-colors cursor-pointer hover:text-primary ${
                          isCompleted ? "line-through text-muted-foreground" : "text-foreground"
                        }`}
                        onClick={() => {
                          setSelectedTask(t);
                          setTaskDrawerOpen(true);
                        }}
                      >
                        {t.title}
                      </h4>

                      {t.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {t.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 text-xs">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span className="flex items-center gap-1 font-medium">
                          <User className="size-3" />
                          {getAssigneeName(t.assigneeId) || t.assigneeName || "Unassigned"}
                        </span>
                        {(t.deadline || t.dueDate) && (
                          <span className="flex items-center gap-1">
                            <Calendar className="size-3" />
                            {new Date(t.deadline || t.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </span>
                        )}
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs font-semibold gap-1.5"
                        onClick={() => {
                          setSelectedTask(t);
                          setTaskDrawerOpen(true);
                        }}
                      >
                        <MessageSquare className="size-3.5 text-primary" />
                        <span>Thread</span>
                      </Button>
                    </div>
                  </div>
                );
              })
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-xs text-muted-foreground">
                  <CheckCircle2 className="mx-auto size-8 text-muted-foreground/40 mb-2" />
                  <p className="font-semibold text-sm text-foreground">No tasks found</p>
                  <p className="mt-1">
                    {hasWorkflowStarted
                      ? "Add deliverables for this stage or create a new task."
                      : "Start a workflow to automatically generate starter tasks."}
                  </p>
                  {hasWorkflowStarted ? (
                    <Button size="sm" className="mt-4" onClick={() => setCreateTaskOpen(true)}>
                      <Plus className="size-3.5 mr-1" /> Create Task
                    </Button>
                  ) : isClientAssigned ? (
                    <Button size="sm" className="mt-4" onClick={() => setTemplateModalOpen(true)}>
                      <Layers className="size-3.5 mr-1" /> Start Workflow
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ----------------- TAB 2: INTERNAL TEAM CHAT ----------------- */}
        <TabsContent value="chat" className="space-y-4">
          <div className="rounded-xl border bg-muted/20 p-3.5 text-xs">
            <p className="font-semibold text-foreground">Project Internal Discussion Area</p>
            <p className="text-muted-foreground mt-0.5">
              Real-time collaboration between the founder and assigned project designers/supervisors. External clients do not see this conversation.
            </p>
          </div>
          <TeamChat
            key={project.id}
            endpoint={`/api/founder/projects/${project.id}/team-chat`}
            currentActor="founder"
          />
        </TabsContent>

        {/* ----------------- TAB 3: STAGES & SCHEDULE ----------------- */}
        <TabsContent value="schedule" className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">Workflow Stages &amp; Deadlines</h3>
              <p className="text-xs text-muted-foreground">
                Sequential pipeline stages and calculated deadlines generated by the pilot workflow.
              </p>
            </div>
            {!hasWorkflowStarted && isClientAssigned && (
              <Button size="sm" onClick={() => setTemplateModalOpen(true)}>
                <Layers className="size-3.5 mr-1" /> Choose Workflow
              </Button>
            )}
          </div>

          {stages.length > 0 ? (
            <div className="space-y-3">
              {stages.map((st, idx) => {
                const stSchedule = schedule[idx];
                return (
                <div key={st.id || idx} className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2">
                      <span className="grid size-6 place-items-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                        {idx + 1}
                      </span>
                      <h4 className="font-semibold text-sm">{st.name}</h4>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      {/* Actionable 15: Editable Stage Duration */}
                      {editingStageId === st.id ? (
                        <div className="flex items-center gap-1.5 rounded-lg border bg-muted/40 px-2 py-1">
                          <span className="text-[11px] text-muted-foreground font-medium">Days:</span>
                          <Input
                            type="number"
                            min="1"
                            max="365"
                            value={editingStageDuration}
                            onChange={(e) => setEditingStageDuration(e.target.value)}
                            className="h-6 w-14 text-xs text-center p-0.5"
                            autoFocus
                          />
                          <Button size="icon-sm" className="h-6 w-6" onClick={() => handleSaveStageDuration(st.id)}>
                            <Check className="size-3" />
                          </Button>
                          <Button size="icon-sm" variant="ghost" className="h-6 w-6" onClick={() => setEditingStageId(null)}>
                            <X className="size-3" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingStageId(st.id);
                            setEditingStageDuration(String(st.durationDays || 7));
                          }}
                          className="flex items-center gap-1 rounded-md border border-dashed px-2 py-1 text-xs font-medium text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
                          title="Click to adjust stage duration"
                        >
                          <span>{st.durationDays} day{st.durationDays === 1 ? "" : "s"}</span>
                          <span className="text-[10px] text-primary">✎</span>
                        </button>
                      )}

                      {/* Actionable 16: Stage Reordering */}
                      <div className="flex items-center rounded-md border bg-muted/20">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="h-6 w-6 rounded-none p-0 text-muted-foreground hover:text-foreground disabled:opacity-30"
                          disabled={idx === 0}
                          onClick={() => handleReorderStage(st.id, "up")}
                          title="Move stage earlier"
                        >
                          <ChevronUp className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="h-6 w-6 rounded-none p-0 text-muted-foreground hover:text-foreground disabled:opacity-30"
                          disabled={idx === stages.length - 1}
                          onClick={() => handleReorderStage(st.id, "down")}
                          title="Move stage later"
                        >
                          <ChevronDown className="size-3.5" />
                        </Button>
                      </div>

                      {/* Actionable 17: Scheduled Timeline */}
                      {stSchedule && (
                        <span className="font-mono text-xs bg-muted/60 px-2 py-1 rounded text-muted-foreground">
                          {stSchedule.startLabel} – {stSchedule.endLabel}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Tasks in this stage */}
                  <div className="pl-8 space-y-1">
                    {tasks.filter((t) => t.stageId === st.id).map((t) => (
                      <div key={t.id} className="flex items-center justify-between text-xs text-muted-foreground py-1">
                        <span className={t.status === "Completed" ? "line-through text-muted-foreground" : "text-foreground font-medium"}>
                          {t.title}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          {t.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-xs text-muted-foreground">
                <Calendar className="mx-auto size-8 text-muted-foreground/40 mb-2" />
                <p className="font-semibold text-sm text-foreground">No workflow stages generated yet</p>
                <p className="mt-1">Assign a client and start a workflow to generate stages and schedule.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ----------------- TAB 4: CLIENT QUERIES ----------------- */}
        <TabsContent value="queries" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">Telegram Client Queries</h3>
              <p className="text-xs text-muted-foreground">
                Real-time questions, approvals, and photos submitted by the client via Telegram.
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
                    if (onProjectUpdated) onProjectUpdated();
                    loadProjectTasks();
                  }}
                  onTaskCreated={(newTask) => {
                    loadProjectTasks();
                    setSelectedTask(newTask);
                    setTaskDrawerOpen(true);
                  }}
                  onOpenTask={(taskId) => {
                    const found = tasks.find((t) => t.id === taskId);
                    if (found) {
                      setSelectedTask(found);
                      setTaskDrawerOpen(true);
                    }
                  }}
                />
              ))
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-xs text-muted-foreground">
                  <CheckCircle2 className="mx-auto size-8 text-emerald-600 mb-2" />
                  <p className="font-semibold text-sm text-foreground">No pending client queries</p>
                  <p className="mt-1">When clients ask questions in your linked Telegram group, they will appear here as actionable cards.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ----------------- TAB 5: FILES & DRIVE ----------------- */}
        <TabsContent value="files" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">Project Google Drive &amp; Files</h3>
              <p className="text-xs text-muted-foreground">
                Direct integration with project Google Drive folders, architectural CAD drawings, and presentations.
              </p>
            </div>
            <Button size="sm" onClick={() => setAddDriveLinkOpen(true)}>
              <Plus className="size-3.5 mr-1" /> Add Drive File / Link
            </Button>
          </div>

          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
                    <FolderKanban className="size-5" />
                  </span>
                  <div>
                    <h4 className="text-sm font-bold text-foreground">Main Project Google Drive Folder</h4>
                    <p className="text-xs text-muted-foreground">
                      Shared folder containing design deliverables, vendor quotes, and CAD exports.
                    </p>
                    {localWorkflow?.drive?.folderUrl ? (
                      <a
                        href={localWorkflow.drive.folderUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                      >
                        Open Google Drive Folder <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      <p className="mt-1 text-xs text-amber-700">No Drive folder URL linked yet.</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isEditingDriveFolder ? (
                    <div className="flex gap-2 w-full sm:w-auto">
                      <Input
                        value={driveFolderInput}
                        onChange={(e) => setDriveFolderInput(e.target.value)}
                        placeholder="https://drive.google.com/drive/folders/..."
                        className="h-8 text-xs min-w-64"
                      />
                      <Button size="sm" onClick={handleSaveDriveFolder}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setIsEditingDriveFolder(false)}>Cancel</Button>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setIsEditingDriveFolder(true)}>
                      <LinkIcon className="size-3.5 mr-1" /> Edit Folder URL
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2">
            {(localWorkflow?.drive?.links || []).map((link) => (
              <Card key={link.id} className="overflow-hidden">
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Badge variant="outline" className="text-[10px]">{link.category}</Badge>
                    <p className="mt-1 text-xs font-semibold text-foreground truncate">{link.name}</p>
                    {link.url ? (
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline truncate max-w-full"
                      >
                        Open in Drive <ExternalLink className="size-2.5" />
                      </a>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">No link configured</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ----------------- TAB 6: TEAM & ACCESS ----------------- */}
        <TabsContent value="team" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">Project Team Members &amp; Access Controls</h3>
              <p className="text-xs text-muted-foreground">
                Assign designers and supervisors. Removing a member revokes project access and clears their assigned tasks.
              </p>
            </div>
            <Button size="sm" onClick={onOpenMemberModal}>
              <UserPlus className="size-3.5 mr-1" /> Add Team Member
            </Button>
          </div>

          <div className="space-y-2.5">
            {project.members && project.members.length > 0 ? (
              project.members.map((member, idx) => {
                const memberId = member.employeeId || member.id;
                const driveAccess = localWorkflow?.memberAccess?.[memberId]?.driveAccess || "viewer";
                const memberTasksCount = tasks.filter((t) => t.assigneeId === memberId).length;

                return (
                <Card key={memberId || idx}>
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-9">
                        <AvatarFallback className="bg-secondary text-xs font-semibold">
                          {member.name?.slice(0, 2).toUpperCase() || "TM"}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-xs font-semibold text-foreground">{member.name}</p>
                        <p className="text-[11px] text-muted-foreground">{member.designation || member.role || "Member"}</p>
                      </div>
                      <Badge variant="secondary" className="text-xs ml-1">
                        {member.role || "Designer"}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pt-2 sm:pt-0 border-t sm:border-t-0">
                      {/* Actionable 20: Display & Toggle Project & Drive Permissions */}
                      <div className="flex items-center gap-1.5">
                        <FolderKanban className="size-3.5 text-muted-foreground" />
                        <span className="text-[11px] font-medium text-muted-foreground">Drive:</span>
                        <NativeSelect
                          value={driveAccess}
                          onChange={(e) => handleDriveAccessChange(memberId, e.target.value)}
                          className="h-7 text-xs w-28"
                        >
                          <option value="viewer">Viewer</option>
                          <option value="editor">Editor</option>
                          <option value="none">No Access</option>
                        </NativeSelect>
                      </div>

                      <span className="text-xs text-muted-foreground">
                        {memberTasksCount} task{memberTasksCount === 1 ? "" : "s"}
                      </span>

                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 text-xs h-7"
                        onClick={() => handleRemoveMember(member)}
                      >
                        <Trash2 className="size-3.5 mr-1" /> Remove
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
            ) : (
              <Card>
                <CardContent className="py-10 text-center text-xs text-muted-foreground">
                  <Users className="mx-auto size-7 text-muted-foreground/40 mb-2" />
                  <p className="font-semibold text-foreground">No team members assigned yet</p>
                  <p className="mt-1">Add designers, supervisors, or trades to collaborate on tasks and team chat.</p>
                  <Button size="sm" className="mt-3" onClick={onOpenMemberModal}>
                    <UserPlus className="size-3.5 mr-1" /> Add Member
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Task Thread Drawer */}
      <TaskThreadDrawer
        task={selectedTask}
        project={project}
        open={taskDrawerOpen}
        onOpenChange={setTaskDrawerOpen}
        onTaskUpdated={loadProjectTasks}
        onOpenSourceQuery={() => setActiveTab("queries")}
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

      {/* Add Task Modal */}
      <Dialog open={createTaskOpen} onOpenChange={setCreateTaskOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Project Task</DialogTitle>
            <DialogDescription>
              Add a deliverable or checklist item for your project team.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateTaskSubmit} className="space-y-4">
            <label className="grid gap-1.5 text-xs font-semibold">
              Task Title
              <Input
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="e.g. Prepare structural layout drawings"
                required
              />
            </label>

            <label className="grid gap-1.5 text-xs font-semibold">
              Description
              <Textarea
                value={newTaskDesc}
                onChange={(e) => setNewTaskDesc(e.target.value)}
                placeholder="Details, deliverable requirements, or instructions…"
                rows={3}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1.5 text-xs font-semibold">
                Project Stage
                <NativeSelect
                  value={newTaskStageId}
                  onChange={(e) => setNewTaskStageId(e.target.value)}
                  className="w-full"
                >
                  {stages.map((st) => (
                    <option key={st.id} value={st.id}>{st.name}</option>
                  ))}
                  {!stages.length && <option value="">General</option>}
                </NativeSelect>
              </label>

              <label className="grid gap-1.5 text-xs font-semibold">
                Assignee
                <NativeSelect
                  value={newTaskAssigneeId}
                  onChange={(e) => setNewTaskAssigneeId(e.target.value)}
                  className="w-full"
                >
                  <option value="founder">Founder</option>
                  {(project.members || []).map((m) => (
                    <option key={m.id || m.employeeId} value={m.employeeId || m.id}>
                      {m.name} ({m.role || "Member"})
                    </option>
                  ))}
                </NativeSelect>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1.5 text-xs font-semibold">
                Deadline
                <Input
                  type="date"
                  value={newTaskDeadline}
                  onChange={(e) => setNewTaskDeadline(e.target.value)}
                />
              </label>

              <label className="grid gap-1.5 text-xs font-semibold">
                Initial Status
                <NativeSelect
                  value={newTaskStatus}
                  onChange={(e) => setNewTaskStatus(e.target.value)}
                  className="w-full"
                >
                  <option value="Open">Open</option>
                  <option value="In progress">In Progress</option>
                  <option value="Blocked">Blocked</option>
                </NativeSelect>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setCreateTaskOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creatingTask}>
                {creatingTask ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : null}
                Create Task
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign Client Modal (Phase 2) */}
      <Dialog open={assignClientModalOpen} onOpenChange={setAssignClientModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Client to Project</DialogTitle>
            <DialogDescription>
              A client must be assigned before starting the workflow pipeline.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAssignClientSubmit} className="space-y-4">
            <label className="grid gap-1.5 text-xs font-semibold">
              Client Full Name
              <Input
                value={clientNameInput}
                onChange={(e) => setClientNameInput(e.target.value)}
                placeholder="e.g. Maya Sharma"
                required
                disabled={hasWorkflowStarted}
              />
            </label>

            <label className="grid gap-1.5 text-xs font-semibold">
              Client Telegram User ID (Optional)
              <Input
                value={clientTelegramIdInput}
                onChange={(e) => setClientTelegramIdInput(e.target.value)}
                placeholder="e.g. 123456789"
                disabled={hasWorkflowStarted}
              />
              <span className="text-[11px] text-muted-foreground leading-relaxed">
                Required for automatic Telegram intake to link questions sent directly in the group.
                Identity may also be resolved from the approved Telegram group roster.
              </span>
            </label>

            {hasWorkflowStarted && (
              <p className="text-xs text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                🔒 Client assignment is locked because the project workflow has already started.
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setAssignClientModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={assigningClient || hasWorkflowStarted}>
                {assigningClient ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : null}
                Save Client Assignment
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Drive Link Modal */}
      <Dialog open={addDriveLinkOpen} onOpenChange={setAddDriveLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Project Drive Link</DialogTitle>
            <DialogDescription>Add a link to a file or folder in Google Drive.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddDriveLink} className="space-y-4">
            <label className="grid gap-1.5 text-xs font-semibold">
              Name
              <Input
                value={newLinkName}
                onChange={(e) => setNewLinkName(e.target.value)}
                placeholder="e.g. Electrical CAD plan freeze"
                required
              />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold">
              Category
              <NativeSelect value={newLinkCategory} onChange={(e) => setNewLinkCategory(e.target.value)}>
                <option value="Drawings">Drawings</option>
                <option value="Renders">Renders</option>
                <option value="Documents">Documents</option>
                <option value="Site Photos">Site Photos</option>
                <option value="General">General</option>
              </NativeSelect>
            </label>
            <label className="grid gap-1.5 text-xs font-semibold">
              URL
              <Input
                type="url"
                value={newLinkUrl}
                onChange={(e) => setNewLinkUrl(e.target.value)}
                placeholder="https://drive.google.com/..."
                required
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setAddDriveLinkOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Add Link</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
