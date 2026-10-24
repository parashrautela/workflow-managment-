import {CalendarDays} from 'lucide-react';
import {MeetingsView} from '@/components/Meetings';
import {ProjectConversations} from '@/components/ProjectConversations';
import {needsQueryAttention} from '@/lib/queryStatus';
import { WorkQueue } from '@/components/WorkQueue';
import React, { useEffect, useState } from "react";
import { IkshaBrand, WorkspaceAccess } from "@/components/WorkspaceAccess";
import {
  AlertTriangle, ArrowLeft, ArrowRight, Building2, Check, CheckCircle2, Clock3, Copy, FolderKanban,
  History, LogOut, Menu, MessageSquare, Plus, RefreshCw,
  Search, Send, Share2, ShieldCheck, Sparkles, Trash2, Users, UserPlus, X,
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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { GooeyNewButton } from "@/components/GooeyNewButton";
import { EmployeeDialog, EmployeeManager } from "@/components/EmployeeManager";
import { FounderAssistant } from "@/components/FounderAssistant";
import { DecisionInbox } from "@/components/DecisionInbox";
import { TelegramGroups } from "@/components/TelegramGroups";
import { ProjectDetailView } from "@/components/ProjectDetailView";
import { ProjectDirectoryView } from "@/components/ProjectDirectoryView";

const api = async (url, options = {}) => {
  const response = await fetch(url, { credentials: "same-origin", ...options, headers: { "content-type": "application/json", ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Request failed.");
    error.status = response.status;
    if (response.status === 401 && !url.endsWith("/login")) {
      window.dispatchEvent(new CustomEvent("studio-iksha:unauthorized", { detail: { url } }));
    }
    throw error;
  }
  return data;
};
const post = (url, data = {}) => api(url, { method: "POST", body: JSON.stringify(data) });
const patch = (url, data = {}) => api(url, { method: "PATCH", body: JSON.stringify(data) });
const initials = (name = "") => name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "P";
const niceDate = (value) => value ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
const phaseOptions = ["Design", "Planning", "Procurement", "Site execution", "Finishing", "Handover"];
const statusOptions = ["Setup", "On track", "At risk", "On hold", "Completed"];

function Brand({ compact = false }) { return <IkshaBrand compact={compact} />; }

function InitialAvatar({ name, className = "" }) {
  return (
    <Avatar className={className}>
      <AvatarFallback className="bg-accent font-semibold text-accent-foreground">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

function Field({ label, children }) {
  return <label className="grid gap-1.5 text-sm font-medium">{label}{children}</label>;
}

export default function FounderApp() {
  const [authState, setAuthState] = useState("checking");
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [trashedProjects, setTrashedProjects] = useState([]);
  const [decisionRequests, setDecisionRequests] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [viewMode, setViewMode] = useState("directory"); // 'directory' | 'detail'
  const [activities, setActivities] = useState([]);
  const [currentTab, setCurrentTab] = useState("actions");
  const [workPerson,setWorkPerson] = useState("founder");
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);
  const [factsOpen, setFactsOpen] = useState(false);
  const [trashConfirmOpen, setTrashConfirmOpen] = useState(false);
  const [completeConfirmOpen, setCompleteConfirmOpen] = useState(false);
  const [shareLink, setShareLink] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;
  const filteredProjects = projects.filter((project) => `${project.name} ${project.clientName} ${project.location || ""}`.toLowerCase().includes(searchQuery.toLowerCase()));

  // Unread badge counts (Actionable 9)
  const pendingDecisionsCount = decisionRequests.filter(needsQueryAttention).length;
  const pendingGroupsCount = projects.filter((p) => p.telegramSetupPending).length;

  const showNotice = (message, error = false) => {
    setNotice({ message, error });
    setTimeout(() => setNotice(null), 3500);
  };

  const loadProjects = async () => {
    try {
      const data = await api("/api/founder/projects");
      setProjects(data.projects || []);
      setAuthState("signed-in");
    } catch (error) {
      if (error.status === 401) setAuthState("signed-out");
      else {
        setLoginError("Could not connect to the workspace. Please retry.");
        setAuthState((current) => current === "checking" ? "signed-out" : current);
        showNotice("Could not refresh projects. Please retry.", true);
      }
    }
  };

  const loadDecisionRequests = async () => {
    try {
      const data = await api("/api/founder/decision-requests");
      setDecisionRequests(data.requests || []);
    } catch {
      // Preserve the last loaded queries during temporary connection failures.
    }
  };

  const loadActivities = async () => {
    try {
      const data = await api("/api/founder/activity");
      setActivities(data.activity || []);
    } catch {
      setActivities([]);
    }
  };

  const loadEmployees = async () => {
    try {
      const data = await api("/api/founder/employees");
      setEmployees(data.employees || []);
    } catch {
      setEmployees([]);
    }
  };

  const loadTrash = async () => {
    try {
      const data = await api("/api/founder/trash");
      setTrashedProjects(data.projects || []);
    } catch {
      setTrashedProjects([]);
    }
  };

  useEffect(() => {
    loadProjects();
    loadDecisionRequests();

    const handleUnauthorized = () => {
      setAuthState("signed-out");
      showNotice("Session expired. Please sign in again.", true);
    };
    window.addEventListener("studio-iksha:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("studio-iksha:unauthorized", handleUnauthorized);
  }, []);

  useEffect(() => {
    if (authState !== "signed-in") return;
    const timer = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const [projData, decData] = await Promise.allSettled([
          api("/api/founder/projects"),
          api("/api/founder/decision-requests")
        ]);
        if (projData.status === "fulfilled") setProjects(projData.value.projects || []);
        if (decData.status === "fulfilled") setDecisionRequests(decData.value.requests || []);
      } catch {
        /* Preserve current screen during momentary network refresh failure */
      }
    }, 8000);
    return () => clearInterval(timer);
  }, [authState]);

  useEffect(() => {
    const isLogin = authState === "signed-out";
    document.documentElement.classList.toggle("founder-login", isLogin);
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = "#fafbf7";
    return () => document.documentElement.classList.remove("founder-login");
  }, [authState]);

  const openTab = (tab) => {
    setCurrentTab(tab);
    setSidebarOpen(false);
    if (tab === "projects") {
      // Default to directory when clicking Projects in main nav
      setViewMode("directory");
    }
    if (tab === "activity") loadActivities();
    if (tab === "employees") loadEmployees();
    if (tab === "trash") loadTrash();
    if (tab === "decisions") loadDecisionRequests();
  };

  const handleSelectProjectFromDir = (projectId) => {
    setSelectedProjectId(projectId);
    setViewMode("detail");
    setCurrentTab("projects");
  };

  const handleLogout = async () => {
    await post("/api/founder/logout");
    setAuthState("signed-out");
  };

  const handleInvite = async () => {
    if (!selectedProject) return;
    try {
      const data = await post(`/api/founder/projects/${selectedProject.id}/invite`);
      setShareLink(data.link);
    } catch (error) {
      showNotice(error.message, true);
    }
  };

  const completeProject = async () => {
    if (!selectedProject || busy) return;
    setBusy(true);
    try {
      const result = await post(`/api/founder/projects/${selectedProject.id}/complete`);
      setCompleteConfirmOpen(false);
      await loadProjects();
      showNotice(result.announcementStatus === "Failed" ? "Project completed, but its Telegram group could not be found. No group message was sent." : result.announcementStatus === "Unknown" ? "Project completed. Telegram delivery is unconfirmed; check the group." : "Project marked complete.");
    } catch (error) {
      showNotice(error.message, true);
    } finally { setBusy(false); }
  };

  const moveToTrash = async () => {
    if (!selectedProject || busy) return;
    setBusy(true);
    try {
      const result = await post(`/api/founder/projects/${selectedProject.id}/trash`);
      setTrashConfirmOpen(false);
      setViewMode("directory");
      setSelectedProjectId(null);
      await loadProjects();
      showNotice(result.announcementStatus === "Failed" ? "Project moved to Trash, but its Telegram group could not be found. No group message was sent." : result.announcementStatus === "Unknown" ? "Project moved to Trash. Telegram delivery is unconfirmed; check the group." : "Project moved to Trash. You can restore it later.");
    } catch (error) {
      showNotice(error.message, true);
    } finally { setBusy(false); }
  };

  const restoreProject = async (id) => {
    try {
      await post(`/api/founder/trash/${id}/restore`);
      await Promise.all([loadProjects(), loadTrash()]);
      showNotice("Project restored.");
    } catch (error) {
      showNotice(error.message, true);
    }
  };

  const saveForm = async (event, url, method, after, success) => {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await (method === "PATCH" ? patch : post)(url, Object.fromEntries(new FormData(event.currentTarget)));
      await loadProjects();
      if (data.project?.id) {
        setSelectedProjectId(data.project.id);
        setViewMode("detail");
      }
      after();
      showNotice(success);
    } catch (error) {
      showNotice(error.message, true);
    } finally {
      setBusy(false);
    }
  };

  if (authState === "checking") {
    return (
      <main className="grid min-h-dvh place-items-center p-6">
        <div className="w-full max-w-sm space-y-5">
          <Brand />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </main>
    );
  }

  if (authState === "signed-out") {
    return <WorkspaceAccess />;
  }

  // Actionable 2: "messages" (Client messages) has been REMOVED from navigation!
  const navItems = [
    ["projects", FolderKanban, "All Projects", projects.length],
    ["actions", CheckCircle2, "Actions needed", null],
    ["decisions", MessageSquare, "Client queries", pendingDecisionsCount],
    ["meetings", CalendarDays, "Meetings", null],
    ["chats", MessageSquare, "Project chats", null],
    ["assistant", Sparkles, "Founder assistant", null],
    ["employees", Users, "Employees", employees.length],
    ["activity", Clock3, "Activity log", null],
    ["trash", Trash2, "Trash", trashedProjects.length]
  ];

  const navigation = (
    <div className="flex h-full flex-col gap-5">
      <Brand />
      <nav aria-label="Workspace">
        <label className="grid gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Workspace
          <NativeSelect
            aria-label="Workspace section"
            value={currentTab}
            onChange={(event) => openTab(event.target.value)}
            className="h-11 font-medium normal-case tracking-normal text-foreground"
          >
            {navItems.map(([id, , label, badgeCount]) => (
              <option key={id} value={id}>{label}{badgeCount > 0 ? ` (${badgeCount})` : ''}</option>
            ))}
          </NativeSelect>
        </label>
      </nav>

      <Separator />

      {/* Ongoing Projects Sidebar List (Actionable 21) */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Quick Projects
        </span>

      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter projects…"
          className="pl-8 text-xs h-8"
        />
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        <div className="space-y-1">
          <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Ongoing Projects ({filteredProjects.filter((p) => p.status !== "Completed").length})
          </p>
          {filteredProjects.filter((p) => p.status !== "Completed").map((project) => {
            const isSelected = project.id === selectedProjectId && currentTab === "projects" && viewMode === "detail";
            return (
              <Button
                key={project.id}
                variant={isSelected ? "outline" : "ghost"}
                className={`h-auto w-full justify-start px-3 py-2 text-left ${isSelected ? "border-primary/40 bg-accent/60" : ""}`}
                onClick={() => {
                  setSelectedProjectId(project.id);
                  setViewMode("detail");
                  setCurrentTab("projects");
                  setSidebarOpen(false);
                }}
              >
                <span className={`size-2 shrink-0 rounded-full mr-2.5 ${project.status === "At risk" || project.telegramSetupPending ? "bg-amber-500" : "bg-emerald-500"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold">{project.name}</span>
                  <span className="block truncate text-[11px] font-normal text-muted-foreground">{project.clientName}</span>
                </span>
              </Button>
            );
          })}
        </div>
      </div>

      <Separator />

      <div className="flex items-center gap-2">
        <InitialAvatar name="Project Founder" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">Project Founder</p>
          <p className="text-xs text-muted-foreground">Workspace founder</p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Sign out" onClick={handleLogout}>
          <LogOut />
        </Button>
      </div>
    </div>
  );

  if (currentTab === "assistant") return <FounderAssistant onBack={() => openTab("projects")} />;

  return (
    <div className="iksha-workspace app-glow min-h-dvh bg-background pb-20 md:pb-0">
      {/* Desktop Sidebar Navigation */}
      <aside className="iksha-sidebar fixed inset-y-0 left-0 hidden w-64 border-r p-5 md:block">
        {navigation}
      </aside>

      {/* Mobile Drawer Navigation */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-[min(88vw,19rem)] gap-0 p-5">
          <SheetHeader className="sr-only">
            <SheetTitle>Workspace navigation</SheetTitle>
            <SheetDescription>Choose a project or section</SheetDescription>
          </SheetHeader>
          {navigation}
        </SheetContent>
      </Sheet>

      <div className="md:pl-64">
        {/* Sticky App Header */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-card/95 px-4 backdrop-blur sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Open navigation"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu />
            </Button>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                Workspace / {{
                  projects: viewMode === "directory" ? "All Projects" : selectedProject?.name || "Project Detail",
                  actions: "Actions needed",
                  groups: "Telegram setup",
                  decisions: "Client queries",
                  meetings: "Meetings", chats: "Project chats",
                  assistant: "Assistant",
                  employees: "Employees",
                  activity: "Activity",
                  trash: "Trash"
                }[currentTab]}
              </p>
              <strong className="block truncate text-sm">
                {currentTab === "projects" && viewMode === "detail"
                  ? selectedProject?.name || "Project Workspace"
                  : "Studio Iksha"}
              </strong>
            </div>
          </div>

          <div className="flex items-center gap-2">

            <InitialAvatar name="Project Founder" />
          </div>
        </header>

        {/* Main Content Area */}
        <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 sm:px-7 sm:py-8">
          {currentTab === "meetings" ? <MeetingsView/> : currentTab === "chats" ? <ProjectConversations projects={projects}/> : currentTab === "actions" ? (<WorkQueue projects={projects} initialPersonId={workPerson} onChanged={()=>{loadProjects();loadEmployees();}} />) : currentTab === "groups" ? (
            <TelegramGroups projects={projects} onProjectsChanged={loadProjects} />
          ) : currentTab === "decisions" ? (
            <DecisionInbox projects={projects} onProjectsChanged={()=>{loadProjects();loadDecisionRequests();}} />
          ) : currentTab === "employees" ? (
            <EmployeeManager onViewWork={employee=>{setWorkPerson(employee.id);openTab("actions");}} employees={employees} projects={projects} onAdd={() => setMemberOpen(true)} onUpdated={loadEmployees} />
          ) : currentTab === "trash" ? (
            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Recoverable projects</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Trash</h1>
                <p className="mt-1 text-sm text-muted-foreground">Projects here are hidden from employees. Restore them whenever you need to.</p>
              </div>
              {trashedProjects.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {trashedProjects.map((proj) => (
                    <Card key={proj.id}>
                      <CardContent className="flex items-center gap-3 p-4">
                        <FolderKanban className="size-5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{proj.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{proj.clientName}</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => restoreProject(proj.id)}>
                          Restore
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    Trash is empty.
                  </CardContent>
                </Card>
              )}
            </div>
          ) : currentTab === "activity" ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">Workspace log</p>
                  <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Activity</h1>
                  <p className="mt-1 text-sm text-muted-foreground">Recent updates across your projects.</p>
                </div>
                <Button variant="outline" size="sm" onClick={loadActivities}>
                  <RefreshCw /> Refresh
                </Button>
              </div>
              <Card>
                <CardContent className="divide-y pt-5">
                  {activities.length ? activities.map((item, index) => (
                    <div key={item.id || index} className="flex gap-3 py-4 first:pt-0">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
                        <History className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-sm capitalize">{item.action?.replace(/_/g, " ")}</strong>
                          <Badge variant="secondary">{projects.find((p) => p.id === item.projectId)?.name || "Workspace"}</Badge>
                          <span className="ml-auto text-xs text-muted-foreground">{niceDate(item.at)}</span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{item.details?.name || item.details?.clientName || "Project updated"}</p>
                      </div>
                    </div>
                  )) : (
                    <p className="py-10 text-center text-sm text-muted-foreground">No activity recorded yet.</p>
                  )}
                </CardContent>
              </Card>
            </>
          ) : currentTab === "projects" && viewMode === "directory" ? (
            /* Actionable 21: Obvious All Projects Directory Screen */
            <ProjectDirectoryView
              projects={projects}
              decisionRequests={decisionRequests}
              onSelectProject={handleSelectProjectFromDir}
                  onOpenGroups={() => openTab("groups")}
            />
          ) : currentTab === "projects" && viewMode === "detail" && selectedProject ? (
            /* Actionables 1, 3, 4, 5, 6, 7, 8, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20: Detailed Project Workspace */
            <ProjectDetailView
              key={selectedProject.id}
              project={selectedProject}
              allProjects={projects}
              employees={employees}
              decisionRequests={decisionRequests}
              onBackToDirectory={() => setViewMode("directory")}
              onProjectUpdated={loadProjects}
              onQueriesUpdated={loadDecisionRequests}
              onOpenInviteModal={handleInvite}
              onOpenTrashModal={() => setTrashConfirmOpen(true)}
              onOpenCompleteModal={() => setCompleteConfirmOpen(true)}
              onOpenFactsModal={() => setFactsOpen(true)}
              onOpenMemberModal={() => setMemberOpen(true)}
            />
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
                <FolderKanban className="size-10 text-primary" />
                <h1 className="text-xl font-semibold">Start your first project</h1>
                <p className="text-sm text-muted-foreground">Create a workspace to manage tasks, team chat, and client inquiries.</p>
                <Button onClick={() => openTab("groups")}><Plus /> Create project</Button>
              </CardContent>
            </Card>
          )}
        </main>
      </div>

      {/* Mobile Sticky Navigation Footer (Actionable 22: Responsive mobile usability) */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 items-center overflow-visible border-t bg-card/95 px-2 pt-3 backdrop-blur md:hidden" aria-label="Mobile navigation">
        {[
          ["projects", FolderKanban, "Projects"],
          ["decisions", CheckCircle2, "Decisions"],
          ["actions", CheckCircle2, "My work"]
        ].map(([id, Icon, label]) => (
          <Button
            key={id}
            variant="ghost"
            className={`h-12 flex-col gap-0.5 text-[10px] ${currentTab === id ? "text-primary font-semibold" : "text-muted-foreground"}`}
            onClick={() => openTab(id)}
          >
            <Icon className="size-4" />
            {label}
            {id === "decisions" && pendingDecisionsCount > 0 && (
              <span className="size-1.5 rounded-full bg-amber-500 absolute top-2 right-6" />
            )}
          </Button>
        ))}
        <GooeyNewButton
          hasProject={!!selectedProject}
          onAddMember={() => setMemberOpen(true)}
          onShareClientLink={handleInvite}
        />
      </nav>

      {/* Create Project Modal (Phase 2) */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create project</DialogTitle>
            <DialogDescription>Set up the basics. New projects start in Setup. You can assign the client and select a workflow next.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => saveForm(e, "/api/founder/projects", "POST", () => setCreateOpen(false), "Project created in Setup.")} className="space-y-4">
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
              <Input name="startDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
            </Field>
            <div className="rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground leading-relaxed">
              New projects begin in <strong>Setup</strong> status. You can assign an identified client and select a workflow template to generate sequential stages and tasks.
            </div>
            <Button type="submit" className="h-11 w-full" disabled={busy}>
              {busy ? "Creating project…" : "Create project"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Employee Modal */}
      <EmployeeDialog
        open={memberOpen}
        onOpenChange={setMemberOpen}
        projects={projects}
        defaultProjectId={selectedProject?.id}
        onUpdated={() => Promise.all([loadProjects(), loadEmployees()])}
      />

      <Dialog open={completeConfirmOpen} onOpenChange={(open) => { if (!busy) setCompleteConfirmOpen(open); }}>
        <DialogContent><DialogHeader><DialogTitle>Complete {selectedProject?.name}?</DialogTitle><DialogDescription>The project will be marked completed and unfinished work will be closed. {selectedProject?.telegramGroupChatId ? "Its Telegram group will receive: This project is now completed." : "No Telegram group is linked."} History stays available.</DialogDescription></DialogHeader>
          <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setCompleteConfirmOpen(false)}>Cancel</Button><Button disabled={busy} onClick={completeProject}>{busy ? "Completing…" : "Complete project"}</Button></div>
        </DialogContent>
      </Dialog>
      {/* Move to Trash Modal */}
      <Dialog open={trashConfirmOpen} onOpenChange={(open) => { if (!busy) setTrashConfirmOpen(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedProject?.status === "Completed" ? "Move to trash" : "Abandon project"}: {selectedProject?.name}?</DialogTitle>
            <DialogDescription>{selectedProject?.status === "Completed" ? "The completed project will move to recoverable trash." : "The project will be marked abandoned, its unfinished work will be closed, and its linked Telegram group will be notified."} You can restore its history from Trash later.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setTrashConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={busy} onClick={moveToTrash}>{busy ? "Closing…" : selectedProject?.status === "Completed" ? "Move to trash" : "Abandon & move to trash"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Update Project Facts Modal */}
      <Dialog open={factsOpen} onOpenChange={setFactsOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Project details</DialogTitle>
            <DialogDescription>Set the client, location and spaces for this project.</DialogDescription>
          </DialogHeader>
          {selectedProject && (
            <form
              key={selectedProject.id}
              onSubmit={(e) => saveForm(e, `/api/founder/projects/${selectedProject.id}`, "PATCH", () => setFactsOpen(false), "Project details updated.")}
              className="space-y-4"
            >
              <Field label="Client Name">
                <Input name="clientName" defaultValue={selectedProject.clientName} />
              </Field>
              <Field label="Location / city"><datalist id="iksha-cities">{[...new Set(['Bangalore','Nellore','Coimbatore',...projects.map(project=>project.location).filter(Boolean)])].map(city=><option key={city} value={city}/>)}</datalist><Input list="iksha-cities" name="location" maxLength={200} defaultValue={selectedProject.location} placeholder="Bangalore, Nellore, Coimbatore…"/></Field>
              <Field label="Spaces — one per line"><textarea name="spacesText" maxLength={6100} defaultValue={(selectedProject.spaces || []).join('\n')} className="min-h-28 w-full rounded-md border bg-background p-3 text-sm" placeholder={'Living room\nKitchen\nBedroom 1'}/></Field>
              <div className="flex justify-between items-center pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    setFactsOpen(false);
                    setTrashConfirmOpen(true);
                  }}
                >
                  <Trash2 className="size-3.5 mr-1" /> Move to Trash
                </Button>
                <Button type="submit" disabled={busy}>Save changes</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Share Client Link Modal */}
      <Dialog open={!!shareLink} onOpenChange={() => setShareLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Client link ready</DialogTitle>
            <DialogDescription>Send this link to {selectedProject?.clientName}. The first browser to open it claims access.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input value={shareLink || ""} readOnly aria-label="Client link" className="min-w-0 font-mono text-xs" />
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(shareLink);
                    showNotice("Link copied.");
                  } catch {
                    showNotice("Could not copy link.", true);
                  }
                }}
              >
                <Copy /> Copy
              </Button>
            </div>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-4" /> Private single-claim access
            </p>
            <Button className="w-full" onClick={() => setShareLink(null)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Toast Notice */}
      {notice && (
        <div role="status" className="fixed right-4 bottom-24 z-[60] max-w-sm rounded-lg border bg-card px-4 py-3 text-sm shadow-lg md:bottom-4">
          {notice.error ? <X className="mr-2 inline size-4 text-destructive" /> : <Check className="mr-2 inline size-4 text-emerald-600" />}
          {notice.message}
        </div>
      )}
    </div>
  );
}
