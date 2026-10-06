import {ProjectFiles} from "@/components/ProjectFiles";
// frontend/src/EmployeeApp.jsx
import { useEffect, useState, useCallback } from "react";
import {
  Building2, CheckCircle2, Eye, EyeOff, FolderKanban, LogOut, MessageSquare,
  Check, Calendar, User, AlertCircle, RefreshCw, Loader2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TeamChat } from "@/components/TeamChat";
import { TaskThreadDrawer } from "@/components/TaskThreadDrawer";
import { ClientQueryCard } from "@/components/ClientQueryCard";
import {
  request, fetchTasks, fetchProjectWorkspace, updateTask,
  fetchDecisionRequests
} from "@/lib/api";

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

export default function EmployeeApp() {
  const [auth, setAuth] = useState("checking");
  const [employeeId, setEmployeeId] = useState(new URLSearchParams(location.search).get("id") || "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [employee, setEmployee] = useState(null);
  const [projects, setProjects] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [decisionRequests, setDecisionRequests] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const data = await request("/api/employee/me");
      setEmployee(data.employee);
      setProjects(data.projects || []);
      setSelectedId((current) => (data.projects || []).some((project) => project.id === current) ? current : data.projects?.[0]?.id || null);
      setAuth("signed-in");
    } catch (problem) {
      if (problem.status === 401) setAuth("signed-out");
      else {
        setError("Could not connect to the workspace. Please retry.");
        setAuth((current) => current === "checking" ? "signed-out" : current);
      }
    }
  };

  useEffect(() => {
    load();
    const expired = () => setAuth("signed-out");
    window.addEventListener("studio-iksha:unauthorized", expired);
    return () => window.removeEventListener("studio-iksha:unauthorized", expired);
  }, []);

  const selected = projects.find((project) => project.id === selectedId);

  // Load project workspace tasks and queries
  const loadWorkspaceData = useCallback(async () => {
    if (!selected?.id) return;
    setLoadingWorkspace(true);
    setError("");
    try {
      // 1. Load tasks (via workspace or tasks endpoint)
      const wsData = await fetchProjectWorkspace(selected.id, "employee").catch(() => null);
      if (wsData && Array.isArray(wsData.tasks)) {
        setTasks(wsData.tasks);
      } else {
        const tData = await fetchTasks(selected.id, "employee");
        setTasks(tData.tasks || []);
      }

      // 2. Load decision requests for assigned projects
      const decData = await fetchDecisionRequests("employee");
      setDecisionRequests(decData.requests || []);
    } catch (problem) {
      setError(problem.message || "Could not refresh the workspace. Please retry.");
    } finally {
      setLoadingWorkspace(false);
    }
  }, [selected?.id]);

  useEffect(() => {
    if (selected?.id) {
      loadWorkspaceData();
    }
  }, [selected?.id, loadWorkspaceData]);

  const login = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request("/api/employee/login", { method: "POST", body: { employeeId: employeeId.trim(), password } });
      await load();
      setPassword("");
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await request("/api/employee/logout", { method: "POST" });
    setAuth("signed-out");
    setEmployee(null);
    setProjects([]);
    setTasks([]);
    setDecisionRequests([]);
  };

  // Toggle quick status
  const handleToggleTaskStatus = async (taskItem) => {
    const isDone = taskItem.status === "Completed" || taskItem.status === "completed";
    const nextStatus = isDone ? "Open" : "Completed";
    try {
      await updateTask(taskItem.id, { status: nextStatus }, "employee");
      setTasks((prev) => prev.map((t) => t.id === taskItem.id ? { ...t, status: nextStatus } : t));
    } catch (err) {
      alert(err.message || "Could not update task.");
    }
  };

  if (auth === "checking") {
    return (
      <main className="grid min-h-dvh place-items-center bg-background p-6">
        <div className="w-full max-w-md space-y-4">
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-52 w-full" />
        </div>
      </main>
    );
  }

  if (auth === "signed-out") {
    return (
      <main className="flex min-h-dvh flex-col bg-[#101419] text-white [color-scheme:dark]">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-end px-6 pb-[max(32px,env(safe-area-inset-bottom))] pt-20">
          <div className="mb-auto">
            <div className="grid size-12 place-items-center rounded-2xl bg-primary text-2xl font-bold">i</div>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[.2em] text-blue-300">Studio Iksha · Team access</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">Welcome to your workspace</h1>
            <p className="mt-3 text-sm leading-relaxed text-white/60">Sign in to see the projects you work on, collaborate on tasks, and coordinate with the team.</p>
          </div>
          <form onSubmit={login} className="mt-12 space-y-4 rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 backdrop-blur-sm">
            <label className="grid gap-2 text-xs font-medium text-white/70">
              Employee ID
              <Input
                value={employeeId}
                onChange={(event) => setEmployeeId(event.target.value)}
                autoCapitalize="characters"
                autoComplete="username"
                required
                placeholder="EMP-XXXXXXXXXX"
                className="h-12 border-white/15 bg-white/10 text-base text-white placeholder:text-white/35"
              />
            </label>
            <label className="grid gap-2 text-xs font-medium text-white/70">
              Password
              <div className="relative">
                <Input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="Enter your password"
                  className="h-12 border-white/15 bg-white/10 pr-12 text-base text-white placeholder:text-white/35"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute inset-y-0 right-0 grid w-12 place-items-center text-white/60"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </label>
            {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
            <Button type="submit" disabled={busy} className="h-12 w-full text-sm font-semibold">
              {busy ? "Signing in…" : "Continue"}
            </Button>
          </form>
          <p className="mt-5 text-center text-xs text-white/40">Your founder provides your employee ID and password.</p>
        </div>
      </main>
    );
  }

  // Filter queries for selected project
  const projectQueries = decisionRequests.filter((r) => r.projectId === selected?.id);
  const pendingQueriesCount = projectQueries.filter((r) => !["Done", "Rejected", "Published"].includes(r.status)).length;

  return (
    <div className="app-glow min-h-dvh bg-background pb-[max(24px,env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-20 border-b bg-card/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <div className="grid size-9 place-items-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">i</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">Studio Iksha</p>
            <p className="truncate text-xs text-muted-foreground">{employee?.name} · Team workspace</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Sign out" onClick={logout}>
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
        {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">My workspace</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Your projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">You are assigned to {projects.length} {projects.length === 1 ? "project" : "projects"}.</p>
        </div>

        {projects.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => setSelectedId(project.id)}
                className={`rounded-2xl border bg-card p-4 text-left shadow-xs transition-colors duration-200 hover:border-primary/40 ${selectedId === project.id ? "border-primary ring-2 ring-primary/10" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <FolderKanban className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-sm">{project.name}</strong>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{project.location || project.clientName}</p>
                  </div>
                  <Badge variant="secondary">{project.status || "Setup"}</Badge>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <FolderKanban className="mx-auto size-9 text-muted-foreground/50" />
              <p className="mt-3 text-sm font-semibold">No projects assigned yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Ask your founder to add your employee ID to a project.</p>
            </CardContent>
          </Card>
        )}

        {selected && (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Selected project</p>
                <h2 className="mt-1 text-xl font-semibold">{selected.name}</h2>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadWorkspaceData}
                  disabled={loadingWorkspace}
                >
                  <RefreshCw className={`size-3.5 mr-1 ${loadingWorkspace ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <Badge variant="outline">{selected.status}</Badge>
              </div>
            </div>

            <Tabs defaultValue="tasks" className="gap-4">
              <TabsList className="flex flex-wrap w-full justify-start h-auto gap-1 bg-muted/60 p-1 rounded-xl">
                <TabsTrigger value="tasks" className="font-semibold text-xs px-3 py-2">
                  <CheckCircle2 className="size-4 mr-1.5" />
                  Tasks ({tasks.length})
                </TabsTrigger>
                <TabsTrigger value="queries" className="font-semibold text-xs px-3 py-2">
                  <AlertCircle className="size-4 mr-1.5 text-amber-600" />
                  Client Queries ({projectQueries.length})
                  {pendingQueriesCount > 0 && (
                    <Badge variant="secondary" className="ml-1.5 size-4 p-0 text-[10px] justify-center bg-amber-200 text-amber-900">
                      {pendingQueriesCount}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="chat" className="font-semibold text-xs px-3 py-2">
                  <MessageSquare className="size-4 mr-1.5 text-blue-600" />
                  Team Chat
                </TabsTrigger>
                <TabsTrigger value="files" className="font-semibold text-xs px-3 py-2">Files</TabsTrigger>
                <TabsTrigger value="overview" className="font-semibold text-xs px-3 py-2">Overview</TabsTrigger>
              </TabsList>

              {/* Tasks Tab */}
              <TabsContent value="tasks" className="space-y-3">
                {tasks.length ? (
                  tasks.map((t) => {
                    const isCompleted = t.status === "Completed" || t.status === "completed";
                    return (
                      <div
                        key={t.id}
                        className="flex flex-col items-stretch justify-between gap-3 rounded-xl border bg-card p-3.5 sm:flex-row sm:items-center shadow-2xs hover:border-primary/40 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <button
                            type="button"
                            aria-label={`Toggle completion for ${t.title}`}
                            onClick={() => handleToggleTaskStatus(t)}
                            className={`grid size-5 shrink-0 place-items-center rounded-md border transition-colors ${
                              isCompleted ? "bg-emerald-600 border-emerald-600 text-white" : "border-muted-foreground/30 hover:border-primary"
                            }`}
                          >
                            {isCompleted && <Check className="size-3.5" />}
                          </button>
                          <div className="min-w-0 flex-1">
                            <p
                              className={`break-words text-sm font-semibold cursor-pointer hover:text-primary transition-colors ${
                                isCompleted ? "line-through text-muted-foreground" : "text-foreground"
                              }`}
                              onClick={() => {
                                setSelectedTask(t);
                                setTaskDrawerOpen(true);
                              }}
                            >
                              {t.title}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {selected.stages?.find((stage) => stage.id === t.stageId)?.name || t.stageName || "General"}
                              {t.deadline && ` · Due: ${t.deadline}`}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-[10px] ${taskStatusColors[t.status] || "bg-muted"}`}>
                            {t.status}
                          </Badge>
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
                            <span>Discussion</span>
                          </Button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <Card>
                    <CardContent className="py-10 text-center text-xs text-muted-foreground">
                      No active tasks in this project yet.
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Client Queries Tab (Phase 4) */}
              <TabsContent value="queries" className="space-y-3">
                <div className="rounded-xl border bg-muted/20 p-3 text-xs">
                  <p className="font-semibold text-foreground">Assigned Project Telegram Queries</p>
                  <p className="text-muted-foreground mt-0.5">
                    View questions and photos received from the client. Contribute internal team notes to discuss resolutions.
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
                          setSelectedTask(found);
                          setTaskDrawerOpen(true);
                        }
                      }}
                    />
                  ))
                ) : (
                  <Card>
                    <CardContent className="py-10 text-center text-xs text-muted-foreground">
                      <CheckCircle2 className="mx-auto size-8 text-emerald-600 mb-2" />
                      <p className="font-semibold text-sm text-foreground">No queries requiring attention</p>
                      <p className="mt-1">When the client sends inquiries in Telegram, they will appear here for team review.</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Chat Tab */}
              <TabsContent value="chat">
                <TeamChat
                  key={selected.id}
                  endpoint={`/api/employee/projects/${selected.id}/team-chat`}
                  currentActor={employee.id}
                />
              </TabsContent>

              {/* Overview Tab */}
              <TabsContent value="files"><ProjectFiles projectId={selected.id} namespace="employee"/></TabsContent>
              <TabsContent value="overview" className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs text-muted-foreground">Current phase</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm font-semibold">{selected.phase || "Not set"}</CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs text-muted-foreground">Team members</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm font-semibold">{selected.members?.length || 0}</CardContent>
                  </Card>
                </div>
                <Card>
                  <CardContent className="space-y-4 p-5">
                    <div className="flex items-center gap-2 text-primary">
                      <Building2 className="size-4" />
                      <h3 className="text-sm font-semibold">Current work</h3>
                    </div>
                    <p className="text-sm">{selected.recentTask || "No recent work recorded yet."}</p>
                    <div className="border-t pt-4">
                      <p className="text-xs text-muted-foreground">Next milestone</p>
                      <p className="mt-1 text-sm font-medium">{selected.nextMilestone || "Not scheduled"}</p>
                    </div>
                    {selected.blocker && (
                      <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
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
              onOpenChange={setTaskDrawerOpen}
              onTaskUpdated={loadWorkspaceData}
              currentActor={employee.name || "Team Member"}
              isFounder={false}
              projectMembers={selected.members || []}
            />
          </section>
        )}
      </main>
    </div>
  );
}
