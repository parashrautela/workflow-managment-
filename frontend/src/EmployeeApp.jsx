import { useEffect, useState } from "react";
import { Building2, CheckCircle2, Eye, EyeOff, FolderKanban, LogOut, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TeamChat } from "@/components/TeamChat";

const request = async (url, options = {}) => {
  const response = await fetch(url, { credentials: "same-origin", ...options, headers: { "content-type": "application/json", ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
};

export default function EmployeeApp() {
  const [auth, setAuth] = useState("checking");
  const [employeeId, setEmployeeId] = useState(new URLSearchParams(location.search).get("id") || "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [employee, setEmployee] = useState(null);
  const [projects, setProjects] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const data = await request("/api/employee/me");
      setEmployee(data.employee); setProjects(data.projects || []);
      setSelectedId((current) => (data.projects || []).some((project) => project.id === current) ? current : data.projects?.[0]?.id || null);
      setAuth("signed-in");
    } catch { setAuth("signed-out"); }
  };
  useEffect(() => { load(); }, []);
  const selected = projects.find((project) => project.id === selectedId);

  const login = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    try { await request("/api/employee/login", { method: "POST", body: JSON.stringify({ employeeId, password }) }); await load(); setPassword(""); }
    catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  };
  const logout = async () => { await request("/api/employee/logout", { method: "POST" }); setAuth("signed-out"); setEmployee(null); setProjects([]); };

  if (auth === "checking") return <main className="grid min-h-dvh place-items-center bg-background p-6"><div className="w-full max-w-md space-y-4"><Skeleton className="h-12 w-48" /><Skeleton className="h-52 w-full" /></div></main>;
  if (auth === "signed-out") return <main className="flex min-h-dvh flex-col bg-[#101419] text-white [color-scheme:dark]">
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-end px-6 pb-[max(32px,env(safe-area-inset-bottom))] pt-20">
      <div className="mb-auto"><div className="grid size-12 place-items-center rounded-2xl bg-primary text-2xl font-bold">i</div><p className="mt-5 text-xs font-semibold uppercase tracking-[.2em] text-blue-300">Studio Iksha · Team access</p><h1 className="mt-3 text-4xl font-semibold tracking-tight">Welcome to your workspace</h1><p className="mt-3 text-sm leading-relaxed text-white/60">Sign in to see the projects you work on and talk with your project team.</p></div>
      <form onSubmit={login} className="mt-12 space-y-4 rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 backdrop-blur-sm">
        <label className="grid gap-2 text-xs font-medium text-white/70">Employee ID<Input value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} autoCapitalize="characters" autoComplete="username" required placeholder="EMP-XXXXXXXXXX" className="h-12 border-white/15 bg-white/10 text-base text-white placeholder:text-white/35" /></label>
        <label className="grid gap-2 text-xs font-medium text-white/70">Password<div className="relative"><Input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} autoComplete="current-password" required placeholder="Enter your password" className="h-12 border-white/15 bg-white/10 pr-12 text-base text-white placeholder:text-white/35" /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-0 grid w-12 place-items-center text-white/60">{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></label>
        {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
        <Button type="submit" disabled={busy} className="h-12 w-full text-sm font-semibold">{busy ? "Signing in…" : "Continue"}</Button>
      </form><p className="mt-5 text-center text-xs text-white/40">Your founder provides your employee ID and password.</p>
    </div>
  </main>;

  return <div className="app-glow min-h-dvh bg-background pb-[max(24px,env(safe-area-inset-bottom))]">
    <header className="sticky top-0 z-20 border-b bg-card/95 px-4 py-4 backdrop-blur"><div className="mx-auto flex max-w-5xl items-center gap-3"><div className="grid size-9 place-items-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">i</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">Studio Iksha</p><p className="truncate text-xs text-muted-foreground">{employee?.name} · Team workspace</p></div><Button variant="ghost" size="icon" aria-label="Sign out" onClick={logout}><LogOut className="size-4" /></Button></div></header>
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-primary">My workspace</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Your projects</h1><p className="mt-1 text-sm text-muted-foreground">You are assigned to {projects.length} {projects.length === 1 ? "project" : "projects"}.</p></div>
      {projects.length ? <div className="grid gap-3 sm:grid-cols-2">{projects.map((project) => <button key={project.id} type="button" onClick={() => setSelectedId(project.id)} className={`rounded-2xl border bg-card p-4 text-left shadow-sm transition-colors duration-200 hover:border-primary/40 ${selectedId === project.id ? "border-primary ring-2 ring-primary/10" : ""}`}><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><FolderKanban className="size-5" /></span><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{project.name}</strong><p className="mt-1 truncate text-xs text-muted-foreground">{project.location || project.clientName}</p></div><Badge variant="secondary">{project.status || "Setup"}</Badge></div></button>)}</div> : <Card><CardContent className="py-12 text-center"><FolderKanban className="mx-auto size-9 text-muted-foreground/50" /><p className="mt-3 text-sm font-semibold">No projects assigned yet</p><p className="mt-1 text-xs text-muted-foreground">Ask your founder to add your employee ID to a project.</p></CardContent></Card>}
      {selected && <section className="space-y-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Selected project</p><h2 className="mt-1 text-xl font-semibold">{selected.name}</h2></div><Badge variant="outline">{selected.status}</Badge></div>
        <Tabs defaultValue="overview" className="gap-4"><TabsList className="w-full sm:w-fit"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="chat"><MessageSquare className="size-4" />Team chat</TabsTrigger></TabsList>
          <TabsContent value="overview" className="space-y-3"><div className="grid grid-cols-2 gap-3"><Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Current phase</CardTitle></CardHeader><CardContent className="text-sm font-semibold">{selected.phase || "Not set"}</CardContent></Card><Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Team members</CardTitle></CardHeader><CardContent className="text-sm font-semibold">{selected.members?.length || 0}</CardContent></Card></div><Card><CardContent className="space-y-4 p-5"><div className="flex items-center gap-2 text-primary"><Building2 className="size-4" /><h3 className="text-sm font-semibold">Current work</h3></div><p className="text-sm">{selected.recentTask || "No recent work recorded yet."}</p><div className="border-t pt-4"><p className="text-xs text-muted-foreground">Next milestone</p><p className="mt-1 text-sm font-medium">{selected.nextMilestone || "Not scheduled"}</p></div>{selected.blocker && <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Blocker: {selected.blocker}</div>}</CardContent></Card><p className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="size-4" />Project facts are managed by the founder.</p></TabsContent>
          <TabsContent value="chat"><TeamChat key={selected.id} endpoint={`/api/employee/projects/${selected.id}/team-chat`} currentActor={employee.id} /></TabsContent>
        </Tabs>
      </section>}
    </main>
  </div>;
}
