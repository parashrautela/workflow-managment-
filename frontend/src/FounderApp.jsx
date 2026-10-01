import React, { useEffect, useState } from "react";
import {
  AlertTriangle, ArrowRight, Building2, Check, CheckCircle2, Clock3, Copy, Eye, EyeOff, FolderKanban,
  History, KeyRound, LogOut, Menu, MessageSquare, Plus, RefreshCw,
  Search, Send, Share2, ShieldCheck, Sparkles, Trash2, Users, UserPlus, X,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Message, MessageAvatar, MessageContent, MessageHeader } from "@/components/ui/message";
import { NativeSelect } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GooeyNewButton } from "@/components/GooeyNewButton";
import { EmployeeDialog, EmployeeManager } from "@/components/EmployeeManager";
import { FounderAssistant } from "@/components/FounderAssistant";
import { TeamChat } from "@/components/TeamChat";
import { DecisionInbox } from "@/components/DecisionInbox";
import { TelegramGroups } from "@/components/TelegramGroups";

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
const niceTime = (value) => value ? new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
const phaseOptions = ["Design", "Planning", "Procurement", "Site execution", "Finishing", "Handover"];
const statusOptions = ["Setup", "On track", "At risk", "On hold", "Completed"];

function Brand({ compact = false }) {
  return <div className="flex items-center gap-2.5">
    <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-sm">i</div>
    {!compact && <div className="leading-tight"><strong className="block text-sm tracking-tight">studio iksha</strong><span className="text-[10px] text-muted-foreground">Project operations</span></div>}
  </div>;
}

function StatusBadge({ status }) {
  const tone = status === "At risk" ? "border-amber-200 bg-amber-50 text-amber-800" : status === "On hold" ? "border-slate-200 bg-slate-100 text-slate-700" : "border-emerald-200 bg-emerald-50 text-emerald-800";
  return <Badge variant="outline" className={tone}><span className="size-1.5 rounded-full bg-current" />{status || "On track"}</Badge>;
}

function InitialAvatar({ name, className = "" }) {
  return <Avatar className={className}><AvatarFallback className="bg-accent font-semibold text-accent-foreground">{initials(name)}</AvatarFallback></Avatar>;
}

function ConversationThread({ conversations, project, large = false }) {
  if (!conversations.length) return <div className="flex min-h-72 flex-col items-center justify-center px-5 py-12 text-center">
    <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-accent text-primary"><MessageSquare className="size-6" /></div>
    <h3 className="font-semibold">Your conversation starts here</h3>
    <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">Share the private client link. Questions and the assistant’s replies will appear here.</p>
  </div>;
  return <div className={`chat-scroll space-y-6 overflow-y-auto p-4 sm:p-6 ${large ? "min-h-0 flex-1" : "max-h-96"}`} aria-label="Client conversation" aria-live="polite">
    {conversations.map((item, index) => <div key={item.at || index} className="space-y-4">
      <Message align="end">
        <MessageAvatar><InitialAvatar name={project?.clientName || "Client"} /></MessageAvatar>
        <MessageContent className="max-w-[88%] sm:max-w-[75%]">
          <MessageHeader className="justify-end gap-2">{niceTime(item.at)} · {project?.clientName || "Client"}</MessageHeader>
          <Bubble align="end"><BubbleContent>{item.question}</BubbleContent></Bubble>
        </MessageContent>
      </Message>
      <Message align="start">
        <MessageAvatar><Avatar><AvatarFallback className="bg-primary/10 text-primary"><Sparkles className="size-4" /></AvatarFallback></Avatar></MessageAvatar>
        <MessageContent className="max-w-[88%] sm:max-w-[75%]">
          <MessageHeader>Project Assistant</MessageHeader>
          <Bubble variant="secondary"><BubbleContent>{item.answer}</BubbleContent></Bubble>
        </MessageContent>
      </Message>
    </div>)}
  </div>;
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
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [activities, setActivities] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [projectHistory, setProjectHistory] = useState([]);
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

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || projects[0];
  const filteredProjects = projects.filter((project) => `${project.name} ${project.clientName} ${project.location || ""}`.toLowerCase().includes(searchQuery.toLowerCase()));
  const showNotice = (message, error = false) => {
    setNotice({ message, error });
    setTimeout(() => setNotice(null), 3500);
  };
  const loadProjects = async () => {
    try {
      const data = await api("/api/founder/projects");
      setProjects(data.projects || []);
      setSelectedProjectId((current) => (data.projects || []).some((p) => p.id === current) ? current : data.projects?.[0]?.id || null);
      setAuthState("signed-in");
    } catch { setAuthState("signed-out"); }
  };
  const loadActivities = async () => {
    try { const data = await api("/api/founder/activity"); setActivities(data.activity || []); }
    catch { setActivities([]); }
  };
  const loadEmployees = async () => { try { const data = await api("/api/founder/employees"); setEmployees(data.employees || []); } catch { setEmployees([]); } };
  const loadTrash = async () => { try { const data = await api("/api/founder/trash"); setTrashedProjects(data.projects || []); } catch { setTrashedProjects([]); } };
  const loadProjectDetails = async (id) => {
    if (!id) { setConversations([]); setProjectHistory([]); return; }
    const [conversation, history] = await Promise.allSettled([
      api(`/api/founder/projects/${id}/conversation`),
      api(`/api/founder/projects/${id}/updates`),
    ]);
    setConversations(conversation.status === "fulfilled" ? conversation.value.messages || [] : []);
    setProjectHistory(history.status === "fulfilled" ? history.value.updates || [] : []);
  };
  useEffect(() => { loadProjects(); }, []);
  useEffect(() => {
    if (authState !== "signed-in") return;
    const timer = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const data = await api("/api/founder/projects");
        setProjects(data.projects || []);
        setSelectedProjectId((current) => (data.projects || []).some((project) => project.id === current) ? current : data.projects?.[0]?.id || null);
      } catch { /* Keep the current screen during a temporary refresh failure. */ }
    }, 10000);
    return () => clearInterval(timer);
  }, [authState]);
  useEffect(() => { loadProjectDetails(selectedProjectId); }, [selectedProjectId]);
  useEffect(() => {
    const isLogin = authState === "signed-out";
    document.documentElement.classList.toggle("founder-login", isLogin);
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = isLogin ? "#101010" : "#f6f5f4";
    return () => document.documentElement.classList.remove("founder-login");
  }, [authState]);
  const openTab = (tab) => { setCurrentTab(tab); setSidebarOpen(false); if (tab === "activity") loadActivities(); if (tab === "employees") loadEmployees(); if (tab === "trash") loadTrash(); };
  const handleLogin = async (event) => {
    event.preventDefault(); setIsLoggingIn(true); setLoginError("");
    try { await post("/api/founder/login", { password }); await loadProjects(); }
    catch (error) { setLoginError(error.message); }
    finally { setIsLoggingIn(false); }
  };
  const handleLogout = async () => { await post("/api/founder/logout"); setAuthState("signed-out"); setPassword(""); };
  const handleInvite = async () => {
    if (!selectedProject) return;
    try { const data = await post(`/api/founder/projects/${selectedProject.id}/invite`); setShareLink(data.link); }
    catch (error) { showNotice(error.message, true); }
  };
  const completeProject = async () => {
    if (!selectedProject) return;
    try { await post(`/api/founder/projects/${selectedProject.id}/complete`); await loadProjects(); showNotice("Project marked complete."); }
    catch (error) { showNotice(error.message, true); }
  };
  const moveToTrash = async () => {
    if (!selectedProject) return;
    try { await post(`/api/founder/projects/${selectedProject.id}/trash`); setTrashConfirmOpen(false); await loadProjects(); showNotice("Project moved to Trash. You can restore it later."); }
    catch (error) { showNotice(error.message, true); }
  };
  const restoreProject = async (id) => {
    try { await post(`/api/founder/trash/${id}/restore`); await Promise.all([loadProjects(), loadTrash()]); showNotice("Project restored."); }
    catch (error) { showNotice(error.message, true); }
  };
  const saveForm = async (event, url, method, after, success) => {
    event.preventDefault(); setBusy(true);
    try {
      const data = await (method === "PATCH" ? patch : post)(url, Object.fromEntries(new FormData(event.currentTarget)));
      await loadProjects();
      if (data.project?.id) setSelectedProjectId(data.project.id);
      if (selectedProjectId) await loadProjectDetails(selectedProjectId);
      after(); showNotice(success);
    } catch (error) { showNotice(error.message, true); }
    finally { setBusy(false); }
  };

  if (authState === "checking") return <main className="grid min-h-dvh place-items-center p-6"><div className="w-full max-w-sm space-y-5"><Brand /><Skeleton className="h-24 w-full" /><Skeleton className="h-12 w-full" /></div></main>;
  if (authState === "signed-out") return (
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

  const navigation = <div className="flex h-full flex-col gap-5">
    <Brand />
    <nav className="grid gap-1" aria-label="Workspace">
      {[["projects", FolderKanban, "Projects"], ["groups", Users, "Telegram groups"], ["decisions", CheckCircle2, "Needs attention"], ["assistant", Sparkles, "Founder assistant"], ["messages", MessageSquare, "Client messages"], ["employees", Users, "Employees"], ["activity", Clock3, "Activity log"], ["trash", Trash2, "Trash"]].map(([id, Icon, label]) => <Button key={id} variant={currentTab === id ? "secondary" : "ghost"} className={`h-10 justify-start gap-3 ${currentTab === id ? "text-primary" : "text-muted-foreground"}`} onClick={() => openTab(id)}><Icon className="size-4" />{label}{id === "messages" && conversations.length > 0 && <Badge variant="outline" className="ml-auto">{conversations.length}</Badge>}</Button>)}
    </nav>
    <Separator />
    <div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Projects</span><Button size="icon-sm" variant="ghost" aria-label="Create project" onClick={() => { setCreateOpen(true); setSidebarOpen(false); }}><Plus /></Button></div>
    <div className="relative"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Find project" className="pl-9" /></div>
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
      <div className="space-y-1"><p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ongoing</p>{filteredProjects.filter((project) => project.status !== "Completed").map((project) => <Button key={project.id} variant={project.id === selectedProject?.id && currentTab === "projects" ? "outline" : "ghost"} className="h-auto w-full justify-start px-3 py-2.5 text-left" onClick={() => { setSelectedProjectId(project.id); openTab("projects"); }}><span className={`size-2 shrink-0 rounded-full ${project.status === "At risk" || project.telegramSetupPending ? "bg-amber-500" : "bg-emerald-500"}`} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{project.name}</span><span className="block truncate text-xs font-normal text-muted-foreground">{project.clientName}</span></span></Button>)}{!filteredProjects.some((project) => project.status !== "Completed") && <p className="px-2 text-xs text-muted-foreground">No ongoing projects</p>}</div>
      {filteredProjects.some((project) => project.status === "Completed") && <div className="space-y-1"><p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Completed</p>{filteredProjects.filter((project) => project.status === "Completed").map((project) => <Button key={project.id} variant={project.id === selectedProject?.id && currentTab === "projects" ? "outline" : "ghost"} className="h-auto w-full justify-start px-3 py-2.5 text-left" onClick={() => { setSelectedProjectId(project.id); openTab("projects"); }}><CheckCircle2 className="size-4 shrink-0 text-emerald-600" /><span className="min-w-0 flex-1 truncate text-sm">{project.name}</span></Button>)}</div>}
    </div>
    <Separator /><div className="flex items-center gap-2"><InitialAvatar name="Project Founder" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">Project Founder</p><p className="text-xs text-muted-foreground">Workspace owner</p></div><Button variant="ghost" size="icon-sm" aria-label="Sign out" onClick={handleLogout}><LogOut /></Button></div>
  </div>;

  if (currentTab === "assistant") return <FounderAssistant onBack={() => openTab("projects")} />;

  return <div className="app-glow min-h-dvh bg-background pb-20 md:pb-0">
    <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-card p-5 md:block">{navigation}</aside>
    <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}><SheetContent side="left" className="w-[min(88vw,19rem)] gap-0 p-5"><SheetHeader className="sr-only"><SheetTitle>Workspace navigation</SheetTitle><SheetDescription>Choose a project or section</SheetDescription></SheetHeader>{navigation}</SheetContent></Sheet>
    <div className="md:pl-64">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-card/95 px-4 backdrop-blur sm:px-7"><div className="flex min-w-0 items-center gap-3"><Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu /></Button><div className="min-w-0"><p className="text-xs text-muted-foreground">Workspace / {{ projects: "Projects", groups: "Telegram groups", decisions: "Needs attention", assistant: "Assistant", messages: "Client messages", employees: "Employees", activity: "Activity", trash: "Trash" }[currentTab]}</p><strong className="block truncate text-sm">{selectedProject?.name || "Studio Iksha"}</strong></div></div><div className="flex items-center gap-2"><Button variant="outline" size="sm" className="hidden sm:inline-flex" onClick={() => setCreateOpen(true)}><Plus />New project</Button><InitialAvatar name="Project Founder" /></div></header>
      <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 sm:px-7 sm:py-8">
        {currentTab === "projects" && projects.some((project) => project.telegramSetupPending) && <Alert className="border-amber-200 bg-amber-50 text-amber-900"><Users /><AlertTitle>New project from Telegram</AlertTitle><AlertDescription className="flex flex-wrap items-center justify-between gap-3"><span>{projects.filter((project) => project.telegramSetupPending).map((project) => project.name).join(", ")} {projects.filter((project) => project.telegramSetupPending).length === 1 ? "is" : "are"} waiting for names, roles, and a Client.</span><Button size="sm" onClick={() => openTab("groups")}>Set up project<ArrowRight /></Button></AlertDescription></Alert>}
        {currentTab === "groups" ? <TelegramGroups projects={projects} onProjectsChanged={loadProjects} /> : currentTab === "decisions" ? <DecisionInbox projects={projects} onProjectsChanged={loadProjects} /> : currentTab === "employees" ? <EmployeeManager employees={employees} projects={projects} onAdd={() => setMemberOpen(true)} /> : currentTab === "trash" ? <div className="space-y-5"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Recoverable projects</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Trash</h1><p className="mt-1 text-sm text-muted-foreground">Projects here are hidden from employees and clients. Restore them whenever you need to.</p></div>{trashedProjects.length ? <div className="grid gap-3 sm:grid-cols-2">{trashedProjects.map((project) => <Card key={project.id}><CardContent className="flex items-center gap-3 p-4"><FolderKanban className="size-5 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{project.name}</p><p className="truncate text-xs text-muted-foreground">{project.clientName}</p></div><Button variant="outline" size="sm" onClick={() => restoreProject(project.id)}>Restore</Button></CardContent></Card>)}</div> : <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Trash is empty.</CardContent></Card>}</div> : currentTab === "messages" ? <>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Client conversation</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Messages</h1><p className="mt-1 text-sm text-muted-foreground">{selectedProject?.name || "Select a project"} · client questions and project assistant replies</p></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => loadProjectDetails(selectedProject?.id)} disabled={!selectedProject}><RefreshCw />Refresh</Button><Button size="sm" onClick={handleInvite} disabled={!selectedProject}><Share2 />Share client link</Button></div></div>
          <Card className="flex min-h-[min(72dvh,720px)] flex-col overflow-hidden"><div className="flex items-center gap-3 border-b px-4 py-3 sm:px-6"><Avatar><AvatarFallback className="bg-primary/10 text-primary"><Sparkles className="size-4" /></AvatarFallback></Avatar><div className="flex-1"><p className="text-sm font-semibold">Project Assistant</p><p className="text-xs text-muted-foreground">Private client Q&amp;A</p></div><Badge variant="secondary">{conversations.length} exchanges</Badge></div><ConversationThread conversations={conversations} project={selectedProject} large /><div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-4 py-3 text-xs text-muted-foreground sm:px-6"><span>Replies use the facts recorded for this project.</span><Button variant="outline" size="sm" onClick={handleInvite} disabled={!selectedProject}><Share2 />Invite</Button></div></Card>
        </> : currentTab === "activity" ? <>
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Workspace log</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Activity</h1><p className="mt-1 text-sm text-muted-foreground">Recent updates across your projects.</p></div><Button variant="outline" size="sm" onClick={loadActivities}><RefreshCw />Refresh</Button></div>
          <Card><CardContent className="divide-y pt-5">{activities.length ? activities.map((item, index) => <div key={item.id || index} className="flex gap-3 py-4 first:pt-0"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary"><History className="size-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm capitalize">{item.action?.replace(/_/g, " ")}</strong><Badge variant="secondary">{projects.find((p) => p.id === item.projectId)?.name || "Workspace"}</Badge><span className="ml-auto text-xs text-muted-foreground">{niceDate(item.at)}</span></div><p className="mt-1 text-sm text-muted-foreground">{item.details?.name || item.details?.clientName || "Project updated"}</p></div></div>) : <p className="py-10 text-center text-sm text-muted-foreground">No activity recorded yet.</p>}</CardContent></Card>
        </> : selectedProject ? <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Project workspace</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{selectedProject.name}</h1><p className="mt-1 text-sm text-muted-foreground">{selectedProject.location || "Location not set"} · {selectedProject.clientName} · Created {niceDate(selectedProject.createdAt)}</p></div><div className="grid grid-cols-2 gap-2 sm:flex"><Button variant="outline" onClick={() => openTab("messages")}><MessageSquare />Messages</Button><Button variant="outline" onClick={() => setFactsOpen(true)}>Edit facts</Button><Button className="col-span-2" onClick={handleInvite}><Share2 />Share client link</Button></div></div>
          {selectedProject.telegramSetupPending && <Alert className="border-amber-200 bg-amber-50 text-amber-900"><Users /><AlertTitle>New Telegram project needs setup</AlertTitle><AlertDescription className="flex flex-wrap items-center justify-between gap-3"><span>This group has been discovered. Assign the people and a Client role to finish connecting its workflow.</span><Button size="sm" onClick={() => openTab("groups")}>Set up group<ArrowRight /></Button></AlertDescription></Alert>}
          {selectedProject.blocker && <Alert className="border-amber-200 bg-amber-50 text-amber-900"><AlertTriangle /><AlertTitle>Active blocker</AlertTitle><AlertDescription>{selectedProject.blocker}</AlertDescription></Alert>}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[["Status", <StatusBadge status={selectedProject.status} />], ["Current phase", selectedProject.phase || "Design"], ["Next milestone", selectedProject.nextMilestone || "Not scheduled"], ["Team", selectedProject.telegramMembers?.length ? `${selectedProject.telegramMembers.length} in Telegram` : `${selectedProject.members?.length || 0} members`]].map(([label, value]) => <Card key={label}><CardContent className="space-y-3 p-4 sm:p-5"><p className="text-xs text-muted-foreground">{label}</p><div className="line-clamp-2 text-sm font-semibold sm:text-base">{value}</div></CardContent></Card>)}</div>
          <Tabs defaultValue="overview" className="gap-4"><TabsList className="w-full sm:w-fit"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="team">Team chat</TabsTrigger><TabsTrigger value="history">History</TabsTrigger></TabsList>
            <TabsContent value="overview" className="space-y-4"><div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="size-4 text-primary" />Current work</CardTitle><CardDescription>Recent progress and what comes next</CardDescription></CardHeader><CardContent><p className="text-sm font-medium">{selectedProject.recentTask || "No recent task recorded"}</p><Separator className="my-4" /><p className="text-xs text-muted-foreground">Next milestone</p><p className="mt-1 text-sm font-medium">{selectedProject.nextMilestone || "No milestone recorded"}</p></CardContent></Card><Card><CardHeader className="flex flex-row items-center justify-between"><div><CardTitle className="flex items-center gap-2"><Users className="size-4 text-primary" />Web app team</CardTitle><CardDescription>{selectedProject.members?.length || 0} members assigned</CardDescription></div><Button variant="outline" size="sm" onClick={() => setMemberOpen(true)}><UserPlus />Add</Button></CardHeader><CardContent className="space-y-3">{selectedProject.members?.length ? selectedProject.members.map((member, index) => <div key={member.id || index} className="flex items-center gap-3"><InitialAvatar name={member.name} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{member.name}</p><p className="truncate text-xs text-muted-foreground">{member.designation}</p></div><Badge variant="secondary">{member.role}</Badge></div>) : <p className="py-4 text-sm text-muted-foreground">No members assigned yet.</p>}</CardContent></Card></div><Card className="border-primary/20 bg-accent/30"><CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><MessageSquare className="size-5" /></span><div><h2 className="font-semibold">Client conversation</h2><p className="mt-1 text-sm text-muted-foreground">Review questions and share a private access link.</p></div></div><Button onClick={() => openTab("messages")}>Open messages<ArrowRight /></Button></CardContent></Card></TabsContent>
            <TabsContent value="team"><TeamChat key={selectedProject.id} endpoint={`/api/founder/projects/${selectedProject.id}/team-chat`} currentActor="founder" /></TabsContent>
            <TabsContent value="history"><Card><CardHeader className="flex flex-row items-start justify-between"><div><CardTitle>Project update history</CardTitle><CardDescription>Saved changes to project facts</CardDescription></div><Button variant="outline" size="sm" onClick={() => loadProjectDetails(selectedProject.id)}><RefreshCw />Refresh</Button></CardHeader><CardContent className="space-y-3">{projectHistory.length ? projectHistory.map((item, index) => <div key={item.id || index} className="rounded-lg border bg-muted/30 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{Object.keys(item.changes || {}).length} fields updated</strong><span className="text-xs text-muted-foreground">{niceDate(item.at)}</span></div>{Object.entries(item.changes || {}).map(([field, change]) => <div key={field} className="mt-2 flex flex-wrap items-center gap-2 text-xs"><span className="capitalize text-muted-foreground">{field.replace(/([A-Z])/g, " $1")}</span><ArrowRight className="size-3" /><span className="font-medium">{String(change.new || "Cleared")}</span></div>)}</div>) : <p className="py-8 text-center text-sm text-muted-foreground">No updates recorded yet.</p>}</CardContent></Card></TabsContent>
          </Tabs>
          {selectedProject.telegramGroupChatId && <Card><CardHeader><CardTitle className="flex items-center gap-2"><Users className="size-4 text-primary" />Telegram group team</CardTitle><CardDescription>{selectedProject.telegramMembers?.length || 0} people observed in the linked group</CardDescription></CardHeader><CardContent className="space-y-3">{selectedProject.telegramMembers?.length ? selectedProject.telegramMembers.map((member) => <div key={member.telegramUserId} className="flex items-center gap-3"><InitialAvatar name={member.assignedName || member.telegramName} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{member.assignedName || member.telegramName}</p><p className="truncate text-xs text-muted-foreground">{member.telegramName}</p></div><Badge variant="secondary">{member.assignedRole || "Role pending"}</Badge></div>) : <p className="text-sm text-muted-foreground">Members will appear when the bot observes them in Telegram.</p>}</CardContent></Card>}
          <Card><CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-semibold">Project controls</h2><p className="mt-1 text-xs text-muted-foreground">Complete finished work or move a project to recoverable Trash.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={completeProject} disabled={selectedProject.status === "Completed"}><CheckCircle2 />{selectedProject.status === "Completed" ? "Completed" : "Mark complete"}</Button><Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setTrashConfirmOpen(true)}><Trash2 />Move to Trash</Button></div></CardContent></Card>
        </> : <Card><CardContent className="flex flex-col items-center gap-4 py-16 text-center"><FolderKanban className="size-10 text-primary" /><h1 className="text-xl font-semibold">Start your first project</h1><p className="text-sm text-muted-foreground">Create a workspace to manage updates and client questions.</p><Button onClick={() => setCreateOpen(true)}><Plus />Create project</Button></CardContent></Card>}
      </main>
    </div>
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 items-center overflow-visible border-t bg-card/95 px-2 pt-3 backdrop-blur md:hidden" aria-label="Mobile navigation">{[["projects", FolderKanban, "Projects"], ["groups", Users, "Groups"], ["decisions", CheckCircle2, "Decisions"]].map(([id, Icon, label]) => <Button key={id} variant="ghost" className={`h-12 flex-col gap-0.5 text-[10px] ${currentTab === id ? "text-primary" : "text-muted-foreground"}`} onClick={() => openTab(id)}><Icon className="size-4" />{label}</Button>)}<GooeyNewButton hasProject={!!selectedProject} onCreateProject={() => setCreateOpen(true)} onAddMember={() => setMemberOpen(true)} onShareClientLink={handleInvite} /></nav>

    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Create project</DialogTitle><DialogDescription>Set up the basics. You can add team members and invite the client next.</DialogDescription></DialogHeader><form onSubmit={(e) => saveForm(e, "/api/founder/projects", "POST", () => setCreateOpen(false), "Project created.")} className="space-y-4"><Field label="Project name"><Input name="name" placeholder="Kumar Residence" required /></Field><Field label="Client name"><Input name="clientName" placeholder="Asha Kumar" required /></Field><Field label="Location"><Input name="location" placeholder="Pune, Maharashtra" /></Field><div className="grid grid-cols-2 gap-3"><Field label="Phase"><NativeSelect name="phase" className="w-full">{phaseOptions.map((option) => <option key={option}>{option}</option>)}</NativeSelect></Field><Field label="Status"><NativeSelect name="status" className="w-full">{statusOptions.slice(0, 4).map((option) => <option key={option}>{option}</option>)}</NativeSelect></Field></div><Field label="Recent task"><Input name="recentTask" placeholder="3D moodboards completed" /></Field><Field label="Next milestone"><Input name="nextMilestone" placeholder="Material selection review" /></Field><Button type="submit" className="h-11 w-full" disabled={busy}>Create project</Button></form></DialogContent></Dialog>
    <EmployeeDialog open={memberOpen} onOpenChange={setMemberOpen} projects={projects} defaultProjectId={selectedProject?.id} onUpdated={() => Promise.all([loadProjects(), loadEmployees()])} />
    <Dialog open={trashConfirmOpen} onOpenChange={setTrashConfirmOpen}><DialogContent><DialogHeader><DialogTitle>Move {selectedProject?.name} to Trash?</DialogTitle><DialogDescription>The project will leave active workspaces and team chat. You can restore it from Trash later.</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setTrashConfirmOpen(false)}>Cancel</Button><Button variant="destructive" onClick={moveToTrash}>Move to Trash</Button></div></DialogContent></Dialog>
    <Dialog open={factsOpen} onOpenChange={setFactsOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Update project facts</DialogTitle><DialogDescription>The project assistant uses these facts when answering client questions.</DialogDescription></DialogHeader>{selectedProject && <form key={selectedProject.id} onSubmit={(e) => saveForm(e, `/api/founder/projects/${selectedProject.id}`, "PATCH", () => setFactsOpen(false), "Project facts updated.")} className="space-y-4"><div className="grid grid-cols-2 gap-3"><Field label="Phase"><NativeSelect name="phase" defaultValue={selectedProject.phase} className="w-full">{phaseOptions.map((option) => <option key={option}>{option}</option>)}</NativeSelect></Field><Field label="Status"><NativeSelect name="status" defaultValue={selectedProject.status} className="w-full">{statusOptions.map((option) => <option key={option}>{option}</option>)}</NativeSelect></Field></div><Field label="Recent task"><Input name="recentTask" defaultValue={selectedProject.recentTask} /></Field><Field label="Next milestone"><Input name="nextMilestone" defaultValue={selectedProject.nextMilestone} /></Field><Field label="Blocker visible to client"><Input name="blocker" defaultValue={selectedProject.blocker} placeholder="None" /></Field><Button type="submit" className="h-11 w-full" disabled={busy}>Save changes</Button></form>}</DialogContent></Dialog>
    <Dialog open={!!shareLink} onOpenChange={() => setShareLink(null)}><DialogContent><DialogHeader><DialogTitle>Client link ready</DialogTitle><DialogDescription>Send this link to {selectedProject?.clientName}. The first browser to open it claims access.</DialogDescription></DialogHeader><div className="space-y-4"><div className="flex gap-2"><Input value={shareLink || ""} readOnly aria-label="Client link" className="min-w-0 font-mono text-xs" /><Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(shareLink); showNotice("Link copied."); } catch { showNotice("Could not copy link.", true); } }}><Copy />Copy</Button></div><p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4" />Private single-claim access</p><Button className="w-full" onClick={() => setShareLink(null)}>Done</Button></div></DialogContent></Dialog>
    {notice && <div role="status" className="fixed right-4 bottom-24 z-[60] max-w-sm rounded-lg border bg-card px-4 py-3 text-sm shadow-lg md:bottom-4">{notice.error ? <X className="mr-2 inline size-4 text-destructive" /> : <Check className="mr-2 inline size-4 text-emerald-600" />}{notice.message}</div>}
  </div>;
}
