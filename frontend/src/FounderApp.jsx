import React, { useEffect, useState } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowRight, Building2, Check, CheckCircle2, Clock3, Copy, Eye, EyeOff, FolderKanban,
  History, KeyRound, LogOut, Menu, MessageSquare, Plus, RefreshCw,
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
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
};
const post = (url, data = {}) => api(url, { method: "POST", body: JSON.stringify(data) });
const patch = (url, data = {}) => api(url, { method: "PATCH", body: JSON.stringify(data) });
const initials = (name = "") => name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "P";
const niceDate = (value) => value ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
const phaseOptions = ["Design", "Planning", "Procurement", "Site execution", "Finishing", "Handover"];
const statusOptions = ["Setup", "On track", "At risk", "On hold", "Completed"];

function Brand({ compact = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-xs">i</div>
      {!compact && (
        <div className="leading-tight">
          <strong className="block text-sm tracking-tight">studio iksha</strong>
          <span className="text-[10px] text-muted-foreground">Project operations</span>
        </div>
      )}
    </div>
  );
}

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
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [trashedProjects, setTrashedProjects] = useState([]);
  const [decisionRequests, setDecisionRequests] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [viewMode, setViewMode] = useState("directory"); // 'directory' | 'detail'
  const [activities, setActivities] = useState([]);
  const [currentTab, setCurrentTab] = useState("projects");
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);
  const [factsOpen, setFactsOpen] = useState(false);
  const [trashConfirmOpen, setTrashConfirmOpen] = useState(false);
  const [shareLink, setShareLink] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;
  const filteredProjects = projects.filter((project) => `${project.name} ${project.clientName} ${project.location || ""}`.toLowerCase().includes(searchQuery.toLowerCase()));

  // Unread badge counts (Actionable 9)
  const pendingDecisionsCount = decisionRequests.filter((r) => r.status !== "Done").length;
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
    } catch {
      setAuthState("signed-out");
    }
  };

  const loadDecisionRequests = async () => {
    try {
      const data = await api("/api/founder/decision-requests");
      setDecisionRequests(data.requests || []);
    } catch {
      setDecisionRequests([]);
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
    if (themeColor) themeColor.content = isLogin ? "#101010" : "#f6f5f4";
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

  const handleLogin = async (event) => {
    event.preventDefault();
    setIsLoggingIn(true);
    setLoginError("");
    try {
      await post("/api/founder/login", { password });
      await Promise.all([loadProjects(), loadDecisionRequests()]);
    } catch (error) {
      setLoginError(error.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await post("/api/founder/logout");
    setAuthState("signed-out");
    setPassword("");
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
    if (!selectedProject) return;
    try {
      await post(`/api/founder/projects/${selectedProject.id}/complete`);
      await loadProjects();
      showNotice("Project marked complete.");
    } catch (error) {
      showNotice(error.message, true);
    }
  };

  const moveToTrash = async () => {
    if (!selectedProject) return;
    try {
      await post(`/api/founder/projects/${selectedProject.id}/trash`);
      setTrashConfirmOpen(false);
      setViewMode("directory");
      setSelectedProjectId(null);
      await loadProjects();
      showNotice("Project moved to Trash. You can restore it later.");
    } catch (error) {
      showNotice(error.message, true);
    }
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
    return (
      <main className="grid min-h-dvh place-items-center bg-black md:p-6">
        <section className="relative isolate flex min-h-dvh w-full flex-col overflow-hidden bg-black text-white md:min-h-[min(855px,calc(100dvh-3rem))] md:max-w-[394px] md:shadow-2xl" aria-label="Studio Iksha founder access">
          <img
            src="/assets/studio-iksha-access.png"
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute top-[-11%] left-[-33%] h-[111%] w-[160.5%] max-w-none object-cover"
          />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,transparent_42%,rgba(0,0,0,.16)_58%,rgba(0,0,0,.72)_78%,rgba(0,0,0,.9)_100%)]" />

          <div className="relative z-10 mt-auto flex flex-col px-6 pb-[max(12px,env(safe-area-inset-bottom))]">
            <div className="mb-5 space-y-0.5">
              <p className="text-sm font-medium tracking-tight">Project Operations</p>
              <h1 className="text-[28px] leading-tight font-bold tracking-[-0.5px]">Welcome to Studio Iksha</h1>
            </div>

            <div className="mb-3 text-[11px] leading-[1.4] text-[#a3a3a3]">
              <p>Studio Iksha uses encrypted tokens and single-claim client links for zero-login client privacy.</p>
              <span className="font-semibold text-[#157de0]">Read our Terms and Privacy Policy</span>
            </div>

            <form onSubmit={handleLogin} className="space-y-2.5">
              <label className="sr-only" htmlFor="founder-key">Founder key</label>
              <div className="relative">
                <KeyRound aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-[#797979]" />
                <Input
                  id="founder-key"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter founder key"
                  autoComplete="current-password"
                  required
                  className="h-[49px] rounded-full border-[#373636] bg-[#1f1f1f] pr-12 pl-[43px] text-base text-white shadow-none placeholder:text-[#797979] focus-visible:border-white/60 focus-visible:ring-white/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Hide founder key" : "Show founder key"}
                  className="absolute top-1/2 right-3 grid size-10 -translate-y-1/2 place-items-center rounded-full text-[#797979] focus-visible:outline-2 focus-visible:outline-white"
                >
                  {showPassword ? <EyeOff className="size-[15px]" /> : <Eye className="size-[15px]" />}
                </button>
              </div>
              {loginError && <p role="alert" className="text-xs text-red-300">{loginError}</p>}
              <Button type="submit" disabled={isLoggingIn} className="h-12 w-full rounded-full bg-[#f8f8f8] text-base font-semibold text-black shadow-none hover:bg-white">
                {isLoggingIn ? "Opening…" : "Continue"}
              </Button>
            </form>
          </div>
        </section>
      </main>
    );
  }

  // Actionable 2: "messages" (Client messages) has been REMOVED from navigation!
  const navItems = [
    ["projects", FolderKanban, "All Projects", projects.length],
    ["decisions", CheckCircle2, "Needs attention", pendingDecisionsCount],
    ["groups", Users, "Telegram groups", pendingGroupsCount],
    ["assistant", Sparkles, "Founder assistant", null],
    ["employees", Users, "Employees", employees.length],
    ["activity", Clock3, "Activity log", null],
    ["trash", Trash2, "Trash", trashedProjects.length]
  ];

  const navigation = (
    <div className="flex h-full flex-col gap-5">
      <Brand />
      <nav className="grid gap-1" aria-label="Workspace">
        {navItems.map(([id, Icon, label, badgeCount]) => (
          <Button
            key={id}
            variant={currentTab === id && (id !== "projects" || viewMode === "directory") ? "secondary" : "ghost"}
            className={`h-10 justify-start gap-3 ${currentTab === id ? "text-primary font-semibold" : "text-muted-foreground"}`}
            onClick={() => openTab(id)}
          >
            <Icon className="size-4" />
            <span className="flex-1 text-left">{label}</span>
            {badgeCount > 0 && (
              <Badge
                variant="outline"
                className={`ml-auto text-[10px] ${id === "decisions" || id === "groups" ? "bg-amber-100 text-amber-900 border-amber-300" : ""}`}
              >
                {badgeCount}
              </Badge>
            )}
          </Button>
        ))}
      </nav>

      <Separator />

      {/* Ongoing Projects Sidebar List (Actionable 21) */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Quick Projects
        </span>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Create project"
          onClick={() => {
            setCreateOpen(true);
            setSidebarOpen(false);
          }}
        >
          <Plus />
        </Button>
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
          <p className="text-xs text-muted-foreground">Workspace owner</p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Sign out" onClick={handleLogout}>
          <LogOut />
        </Button>
      </div>
    </div>
  );

  if (currentTab === "assistant") return <FounderAssistant onBack={() => openTab("projects")} />;

  return (
    <div className="app-glow min-h-dvh bg-background pb-28 md:pb-0 overflow-x-hidden">
      {/* Desktop Sidebar Navigation */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-card p-5 md:block">
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
                  groups: "Telegram groups",
                  decisions: "Needs attention",
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
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={() => setCreateOpen(true)}
            >
              <Plus /> New project
            </Button>
            <InitialAvatar name="Project Founder" />
          </div>
        </header>

        {/* Main Content Area */}
        <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 sm:px-7 sm:py-8">
          {currentTab === "groups" ? (
            <TelegramGroups projects={projects} onProjectsChanged={loadProjects} />
          ) : currentTab === "decisions" ? (
            <DecisionInbox projects={projects} onProjectsChanged={loadProjects} />
          ) : currentTab === "employees" ? (
            <EmployeeManager employees={employees} projects={projects} onAdd={() => setMemberOpen(true)} onUpdated={loadEmployees} />
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
              onCreateProject={() => setCreateOpen(true)}
              onOpenGroups={() => openTab("groups")}
            />
          ) : currentTab === "projects" && viewMode === "detail" && selectedProject ? (
            /* Actionables 1, 3, 4, 5, 6, 7, 8, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20: Detailed Project Workspace */
            <ProjectDetailView
              project={selectedProject}
              allProjects={projects}
              employees={employees}
              decisionRequests={decisionRequests}
              onBackToDirectory={() => setViewMode("directory")}
              onProjectUpdated={loadProjects}
              onOpenInviteModal={handleInvite}
              onOpenTrashModal={() => setTrashConfirmOpen(true)}
              onOpenFactsModal={() => setFactsOpen(true)}
              onOpenMemberModal={() => setMemberOpen(true)}
            />
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
                <FolderKanban className="size-10 text-primary" />
                <h1 className="text-xl font-semibold">Start your first project</h1>
                <p className="text-sm text-muted-foreground">Create a workspace to manage tasks, team chat, and client inquiries.</p>
                <Button onClick={() => setCreateOpen(true)}><Plus /> Create project</Button>
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
          ["groups", Users, "Groups"]
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
          onCreateProject={() => setCreateOpen(true)}
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

      {/* Move to Trash Modal */}
      <Dialog open={trashConfirmOpen} onOpenChange={setTrashConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move {selectedProject?.name} to Trash?</DialogTitle>
            <DialogDescription>The project will leave active workspaces and team chat. You can restore it from Trash later.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setTrashConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={moveToTrash}>Move to Trash</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Update Project Facts Modal */}
      <Dialog open={factsOpen} onOpenChange={setFactsOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Update project facts</DialogTitle>
            <DialogDescription>Save updates to milestones, blockers, phase, and status.</DialogDescription>
          </DialogHeader>
          {selectedProject && (
            <form
              key={selectedProject.id}
              onSubmit={(e) => saveForm(e, `/api/founder/projects/${selectedProject.id}`, "PATCH", () => setFactsOpen(false), "Project facts updated.")}
              className="space-y-4"
            >
              <Field label="Client Name">
                <Input name="clientName" defaultValue={selectedProject.clientName} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Phase">
                  <NativeSelect name="phase" defaultValue={selectedProject.phase} className="w-full">
                    {phaseOptions.map((option) => <option key={option}>{option}</option>)}
                  </NativeSelect>
                </Field>
                <Field label="Status">
                  <NativeSelect name="status" defaultValue={selectedProject.status} className="w-full">
                    {statusOptions.map((option) => <option key={option}>{option}</option>)}
                  </NativeSelect>
                </Field>
              </div>
              <Field label="Recent task">
                <Input name="recentTask" defaultValue={selectedProject.recentTask} />
              </Field>
              <Field label="Next milestone">
                <Input name="nextMilestone" defaultValue={selectedProject.nextMilestone} />
              </Field>
              <Field label="Blocker">
                <Input name="blocker" defaultValue={selectedProject.blocker} placeholder="None" />
              </Field>
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
