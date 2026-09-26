import React, { useState, useEffect } from "react";
import { 
  FolderKanban, 
  Clock, 
  Plus, 
  LogOut, 
  Search, 
  Share2, 
  AlertTriangle, 
  UserPlus, 
  Edit3, 
  Check, 
  Copy, 
  RefreshCw, 
  Lock, 
  ArrowRight,
  Eye,
  EyeOff,
  Sparkles,
  Layers,
  Calendar,
  Users,
  History,
  ShieldCheck,
  Zap,
  Building2,
  KeyRound
} from "lucide-react";
import { Button } from "./components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./components/ui/card";
import { Badge } from "./components/ui/badge";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "./components/ui/dialog";
import { Input } from "./components/ui/input";
import { Avatar } from "./components/ui/avatar";

const api = async (url, options = {}) => {
  const response = await fetch(url, { credentials: "same-origin", ...options, headers: { "content-type": "application/json", ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
};

const post = (url, data = {}) => api(url, { method: "POST", body: JSON.stringify(data) });
const patch = (url, data = {}) => api(url, { method: "PATCH", body: JSON.stringify(data) });

const initials = (name = "") => name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "P";

function formatTime(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  const diffMins = Math.floor((Date.now() - date) / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function FounderApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isQuickFilled, setIsQuickFilled] = useState(false);

  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [activities, setActivities] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [projectHistory, setProjectHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [currentTab, setCurrentTab] = useState("projects");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Modals
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isEditFactsOpen, setIsEditFactsOpen] = useState(false);
  const [shareLinkData, setShareLinkData] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg, type = "info") => {
    setToastMessage({ text: msg, type });
    setTimeout(() => setToastMessage(null), 3200);
  };

  const loadProjects = async () => {
    try {
      const data = await api("/api/founder/projects");
      setProjects(data.projects || []);
      if (!selectedProjectId && data.projects?.length) {
        setSelectedProjectId(data.projects[0].id);
      }
      setIsAuthenticated(true);
    } catch {
      setIsAuthenticated(false);
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

  const loadConversations = async (projectId) => {
    if (!projectId) return;
    try {
      const data = await api(`/api/founder/projects/${projectId}/conversation`);
      setConversations(data.messages || []);
    } catch {
      setConversations([]);
    }
  };

  const loadProjectHistory = async (projectId) => {
    if (!projectId) return;
    setIsLoadingHistory(true);
    try {
      const data = await api(`/api/founder/projects/${projectId}/history`);
      setProjectHistory(data.history || []);
    } catch {
      // Graceful fallback for history if empty or uninitialized
      setProjectHistory([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      loadConversations(selectedProjectId);
      loadProjectHistory(selectedProjectId);
    }
  }, [selectedProjectId]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError("");
    try {
      await post("/api/founder/login", { password });
      await loadProjects();
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleQuickFill = () => {
    setPassword("replace-with-a-long-random-password");
    setIsQuickFilled(true);
    showToast("Sample founder password loaded!", "success");
    setTimeout(() => setIsQuickFilled(false), 2500);
  };

  const handleLogout = async () => {
    await post("/api/founder/logout");
    setIsAuthenticated(false);
    setPassword("");
  };

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || projects[0];

  const filteredProjects = projects.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.clientName.toLowerCase().includes(q) || (p.location && p.location.toLowerCase().includes(q));
  });

  const handleCreateInvite = async () => {
    if (!selectedProject) return;
    try {
      const { link } = await post(`/api/founder/projects/${selectedProject.id}/invite`);
      setShareLinkData(link);
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  if (!isAuthenticated) {
    return (
      <main className="min-h-[100dvh] flex flex-col justify-between bg-[#f8f7f5] relative overflow-x-hidden text-[#161615]">
        {/* Ambient Subtle Architectural Accent */}
        <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-gradient-to-bl from-[#e9e6e1]/70 to-transparent rounded-full blur-3xl pointer-events-none -z-0" />
        <div className="absolute top-1/3 left-0 w-[240px] h-[240px] bg-gradient-to-tr from-[#ebe8e3]/60 to-transparent rounded-full blur-3xl pointer-events-none -z-0" />

        {/* Top Header / Brand Bar */}
        <header className="w-full px-5 sm:px-8 pt-[max(1.25rem,env(safe-area-inset-top))] pb-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-2.5">
            <div className="grid place-items-center w-8 h-8 rounded-xl bg-black text-white font-bold text-sm shadow-xs">
              i
            </div>
            <div className="leading-tight">
              <span className="font-bold tracking-tight text-sm text-[#161615] block">studio iksha</span>
              <span className="text-[10px] text-[#8a8580] tracking-wider uppercase font-medium">Operations</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/80 border border-[#e5e3df] text-[11px] font-medium text-[#55514c] backdrop-blur-md shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Online</span>
          </div>
        </header>

        {/* Hero Presentation Section */}
        <section className="flex-1 flex flex-col justify-center px-5 sm:px-8 max-w-lg mx-auto w-full py-6 sm:py-10 z-10 space-y-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#edeae5] text-[#55514d] text-xs font-semibold tracking-wide uppercase-tracking">
              <Sparkles className="h-3.5 w-3.5 text-[#0075de]" /> Founder Workspace
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#161615] leading-[1.12]">
              Good work starts<br />with a clear picture.
            </h1>
            <p className="text-sm sm:text-base text-[#6b6762] leading-relaxed font-normal">
              A unified control space for interior and architecture projects. Record site facts, manage team rosters, and share frictionless client portals.
            </p>
          </div>

          {/* Interactive Feature Value Props */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <div className="p-3 bg-white/70 border border-[#eae8e5] rounded-2xl backdrop-blur-xs space-y-1">
              <div className="w-6 h-6 rounded-lg bg-blue-50 text-[#0075de] flex items-center justify-center text-xs font-bold">
                ⚡
              </div>
              <strong className="text-xs font-semibold text-[#1e1d1c] block">Live Facts</strong>
              <span className="text-[11px] text-[#7d7873] leading-tight block">Zero guesswork site updates</span>
            </div>

            <div className="p-3 bg-white/70 border border-[#eae8e5] rounded-2xl backdrop-blur-xs space-y-1">
              <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center text-xs font-bold">
                🔒
              </div>
              <strong className="text-xs font-semibold text-[#1e1d1c] block">Single-Claim</strong>
              <span className="text-[11px] text-[#7d7873] leading-tight block">Passwordless client access</span>
            </div>
          </div>
        </section>

        {/* Apple-style Bottom Sheet Login Dock */}
        <section className="w-full max-w-lg mx-auto px-4 sm:px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] z-10">
          <Card className="p-5 sm:p-7 rounded-[28px] sm:rounded-3xl shadow-xl shadow-black/[0.04] border-[#e6e4e0] bg-white space-y-4">
            {/* Grab Bar Indicator on Mobile */}
            <div className="w-10 h-1 bg-[#d8d5cf] rounded-full mx-auto -mt-1 sm:hidden" />

            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[#161615]">Founder Sign In</h2>
                <p className="text-xs text-[#807b75]">Enter password to access studio operations</p>
              </div>

              {/* Sample Credentials Quick-Fill Chip */}
              <button
                type="button"
                onClick={handleQuickFill}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-all active:scale-95 ${
                  isQuickFilled 
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-300" 
                    : "bg-[#f1efe9] hover:bg-[#eae7e0] text-[#55514d] border border-[#dedbd4]"
                }`}
                title="Fill demo credentials"
              >
                {isQuickFilled ? <Check className="h-3 w-3 text-emerald-700" /> : <Zap className="h-3 w-3 text-amber-600" />}
                <span>{isQuickFilled ? "Filled!" : "Quick fill"}</span>
              </button>
            </div>

            <form onSubmit={handleLogin} className="space-y-3.5">
              <div className="space-y-1.5 text-left">
                <div className="relative flex items-center">
                  <KeyRound className="absolute left-3.5 h-4 w-4 text-[#9c9791] pointer-events-none" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter founder password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoFocus
                    className="h-12 min-h-[48px] rounded-xl text-sm pl-10 pr-12 bg-[#faf9f8] border-[#dedbd5] focus:bg-white focus:ring-2 focus:ring-[#0075de]/25 focus:border-[#78b6e6]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-0 top-0 bottom-0 w-12 h-12 flex items-center justify-center text-gray-400 hover:text-gray-600 focus:outline-none transition-colors active:scale-90"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={isLoggingIn}
                className="w-full h-12 min-h-[48px] rounded-xl text-sm font-semibold shadow-xs hover:shadow active:scale-[0.98] transition-all gap-2"
              >
                {isLoggingIn ? "Authenticating…" : <><span>Open Studio Workspace</span> <ArrowRight className="h-4 w-4" /></>}
              </Button>
            </form>

            {loginError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-medium text-red-700 animate-in fade-in">
                {loginError}
              </div>
            )}

            <div className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-[#9a9590]">
              <ShieldCheck className="h-3.5 w-3.5 text-[#8a8580]" />
              <span>Encrypted Session · HttpOnly Token Security</span>
            </div>
          </Card>
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen flex bg-[#f6f5f4] pb-[72px] md:pb-0">
      {/* Sidebar */}
      <aside className={`fixed md:sticky top-0 z-40 h-screen w-[270px] bg-[#f1f0ee] border-r border-[#e8e6e2] p-4 flex flex-col transition-transform duration-200 ${isSidebarOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full md:translate-x-0"}`}>
        <div className="flex items-center justify-between pb-6 px-2">
          <div className="flex items-center gap-2.5 font-bold text-base">
            <span className="grid place-items-center w-8 h-8 rounded-lg bg-black text-white font-bold text-sm">i</span>
            <span>studio iksha</span>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-1.5 text-gray-500 hover:bg-gray-200 rounded-lg">✕</button>
        </div>

        <div className="text-[10px] font-bold tracking-widest text-[#9a9590] px-2 mb-2">WORKSPACE</div>
        <nav className="space-y-1">
          <button
            onClick={() => { setCurrentTab("projects"); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${currentTab === "projects" ? "bg-[#e5e3df] text-[#171716] font-semibold" : "text-[#625e59] hover:bg-[#e9e8e5]"}`}
          >
            <FolderKanban className="h-4 w-4 text-[#77716b]" />
            <span className="flex-1 text-left">Projects</span>
            <span className="text-[11px] font-bold bg-[#e0ded9] px-2 py-0.5 rounded-full">{projects.length}</span>
          </button>
          <button
            onClick={() => { setCurrentTab("activity"); loadActivities(); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${currentTab === "activity" ? "bg-[#e5e3df] text-[#171716] font-semibold" : "text-[#625e59] hover:bg-[#e9e8e5]"}`}
          >
            <Clock className="h-4 w-4 text-[#77716b]" />
            <span className="flex-1 text-left">Activity Log</span>
          </button>
        </nav>

        <div className="flex items-center justify-between px-2 pt-6 pb-2">
          <span className="text-[10px] font-bold tracking-wider text-[#9a9590]">PROJECTS</span>
          <button onClick={() => setIsCreateProjectOpen(true)} className="p-1 text-[#333] hover:bg-[#e0ded9] rounded-md font-bold">
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="relative mb-2 px-1">
          <Search className="absolute left-3.5 top-2.5 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search projects…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8 pl-8 pr-3 text-xs bg-white border border-[#dedbd6] rounded-md outline-none focus:ring-2 focus:ring-[#0075de]/20 focus:border-[#78b6e6]"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 px-1">
          {filteredProjects.map((p) => (
            <button
              key={p.id}
              onClick={() => { setSelectedProjectId(p.id); setCurrentTab("projects"); setIsSidebarOpen(false); }}
              className={`w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-colors ${p.id === selectedProject?.id && currentTab === "projects" ? "bg-[#e2e0dc] text-black font-semibold" : "text-[#55514d] hover:bg-[#e9e8e5]"}`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${p.status === "At risk" ? "bg-amber-500" : p.status === "On hold" ? "bg-gray-400" : "bg-emerald-500"}`} />
              <div className="flex-1 truncate">
                <div className="truncate font-medium">{p.name}</div>
                <div className="text-[10px] text-gray-400 truncate">{p.clientName}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="pt-4 border-t border-[#e3e1dd] flex items-center gap-2.5 px-1">
          <Avatar className="h-8 w-8">P</Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold truncate">Project Founder</div>
            <div className="text-[10px] text-gray-500 truncate">Workspace Owner</div>
          </div>
          <button onClick={handleLogout} className="p-1.5 text-gray-500 hover:text-red-600 rounded-lg hover:bg-gray-200">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Sticky Glass Topbar */}
        <header className="sticky top-0 z-20 h-14 bg-[#f6f5f4]/85 backdrop-blur-md border-b border-[#eae8e5] px-4 sm:px-8 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs sm:text-sm text-[#8a8580]">
            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-1.5 -ml-1.5 text-gray-700 hover:bg-gray-200 rounded-lg">
              ☰
            </button>
            <span>Workspace</span>
            <span className="text-gray-300">/</span>
            <strong className="text-[#34322f] truncate max-w-[160px] sm:max-w-xs">
              {currentTab === "projects" ? (selectedProject ? selectedProject.name : "Projects") : "Activity Log"}
            </strong>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-[#8a8580]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Private Session
            </span>
            <Avatar className="h-7 w-7 text-xs">P</Avatar>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-8 space-y-6">
          {currentTab === "activity" ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold tracking-wider text-[#96918c] uppercase">AUDIT & OPERATIONS</span>
                  <h1 className="text-2xl font-bold tracking-tight text-[#161615]">Activity Log</h1>
                </div>
                <Button variant="subtle" size="sm" onClick={loadActivities} className="gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh
                </Button>
              </div>

              <Card className="p-4 sm:p-6 divide-y divide-[#f0efed]">
                {activities.length ? activities.map((act) => {
                  const proj = projects.find((p) => p.id === act.projectId);
                  return (
                    <div key={act.id || act.at} className="py-3.5 flex items-start gap-3.5 first:pt-0 last:pb-0">
                      <div className="p-2 rounded-lg bg-[#f2f1ef] text-sm shrink-0">
                        {act.action === "project_created" ? "✦" : act.action === "member_added" ? "👤" : act.action === "client_link_claimed" ? "✓" : "⚡"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <strong className="text-xs sm:text-sm font-semibold">{act.action.replace(/_/g, " ")}</strong>
                          {proj && <Badge variant="secondary" className="text-[10px]">{proj.name}</Badge>}
                          <span className="text-xs text-gray-400 ml-auto">{formatTime(act.at)}</span>
                        </div>
                        <p className="text-xs text-[#716c66]">{act.details?.name || act.details?.clientName || proj?.name || "Workspace update"}</p>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="py-12 text-center text-sm text-gray-400">No activity events recorded yet.</div>
                )}
              </Card>
            </div>
          ) : selectedProject ? (
            <div className="space-y-6">
              {/* Heading */}
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <span className="text-[10px] font-bold tracking-wider text-[#96918c] uppercase">PROJECT WORKSPACE</span>
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#161615] mt-1">{selectedProject.name}</h1>
                  <div className="flex items-center gap-2 text-xs sm:text-sm text-[#89847f] mt-1 flex-wrap">
                    <span>📍 {selectedProject.location || "Location not specified"}</span>
                    <span>·</span>
                    <span>Client: <strong className="text-gray-700">{selectedProject.clientName}</strong></span>
                    <span>·</span>
                    <span>Created {new Date(selectedProject.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
                  <Button variant="subtle" onClick={() => setIsEditFactsOpen(true)} className="gap-1.5">
                    <Edit3 className="h-4 w-4" /> Edit Facts
                  </Button>
                  <Button onClick={handleCreateInvite} className="gap-1.5">
                    <Share2 className="h-4 w-4" /> Share Link
                  </Button>
                </div>
              </div>

              {/* Blocker Alert Banner */}
              {selectedProject.blocker && (
                <div className="flex items-center gap-3 p-4 bg-[#fdf3ec] border border-[#f6cfb0] rounded-xl text-amber-900 shadow-sm">
                  <AlertTriangle className="h-5 w-5 text-[#dd5b00] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <strong className="block text-xs font-bold text-[#8a3600]">Active Blocker (Client Visible)</strong>
                    <p className="text-xs sm:text-sm text-[#523410] truncate">{selectedProject.blocker}</p>
                  </div>
                  <Button size="sm" variant="subtle" onClick={() => setIsEditFactsOpen(true)}>Update</Button>
                </div>
              )}

              {/* Ribbon */}
              <Card className="p-4 sm:p-6 grid grid-cols-2 sm:grid-cols-4 gap-4 sm:divide-x divide-[#efeeec]">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold tracking-wider text-[#96918c] uppercase">STATUS</span>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${selectedProject.status === "At risk" ? "bg-amber-500" : "bg-emerald-500"}`} />
                    <strong className="text-xs sm:text-sm font-semibold">{selectedProject.status || "On track"}</strong>
                  </div>
                </div>
                <div className="space-y-1 sm:pl-4">
                  <span className="text-[10px] font-bold tracking-wider text-[#96918c] uppercase">CURRENT PHASE</span>
                  <div className="text-xs sm:text-sm font-semibold truncate">{selectedProject.phase || "Design"}</div>
                </div>
                <div className="space-y-1 sm:pl-4">
                  <span className="text-[10px] font-bold tracking-wider text-[#96918c] uppercase">NEXT MILESTONE</span>
                  <div className="text-xs sm:text-sm font-semibold truncate">{selectedProject.nextMilestone || "Not scheduled"}</div>
                </div>
                <div className="space-y-1 sm:pl-4">
                  <span className="text-[10px] font-bold tracking-wider text-[#96918c] uppercase">TEAM</span>
                  <div className="text-xs sm:text-sm font-semibold">{selectedProject.members?.length || 0} Members</div>
                </div>
              </Card>

              {/* Grid Cards */}
              <div className="grid sm:grid-cols-2 gap-4">
                {/* Progress Card */}
                <Card className="p-5 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-bold tracking-wider text-[#96918c] uppercase">RECENT IN PROGRESS</span>
                    <h3 className="text-sm sm:text-base font-semibold mt-1 mb-3">{selectedProject.recentTask || "No recent task recorded"}</h3>
                  </div>
                  <div className="pt-4 border-t border-[#efeeec] flex items-center gap-2 text-xs">
                    <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">◎</span>
                    <div className="truncate">
                      <span className="text-[10px] uppercase text-gray-400 block font-bold">UP NEXT</span>
                      <strong className="truncate font-semibold">{selectedProject.nextMilestone || "Milestone not recorded"}</strong>
                    </div>
                  </div>
                </Card>

                {/* Team Card */}
                <Card className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <span className="text-[10px] font-bold tracking-wider text-[#96918c] uppercase">TEAM ROSTER</span>
                      <h3 className="text-sm sm:text-base font-semibold">Project Team ({selectedProject.members?.length || 0})</h3>
                    </div>
                    <Button size="sm" variant="subtle" onClick={() => setIsAddMemberOpen(true)} className="gap-1">
                      <UserPlus className="h-3.5 w-3.5" /> Add
                    </Button>
                  </div>
                  <div className="space-y-2.5 max-h-48 overflow-y-auto">
                    {selectedProject.members?.length ? selectedProject.members.map((m, i) => (
                      <div key={m.id || i} className="flex items-center gap-3 py-1.5 border-b border-[#f0efed] last:border-0">
                        <Avatar className="h-7 w-7 text-xs">{initials(m.name)}</Avatar>
                        <div className="flex-1 truncate">
                          <strong className="text-xs font-semibold block truncate">{m.name}</strong>
                          <span className="text-[10px] text-gray-400 block truncate">{m.designation}</span>
                        </div>
                        <Badge variant={m.role.toLowerCase().includes("admin") ? "admin" : m.role.toLowerCase().includes("designer") ? "designer" : "secondary"} className="text-[9px]">
                          {m.role}
                        </Badge>
                      </div>
                    )) : (
                      <div className="py-4 text-center text-xs text-gray-400">No members assigned yet.</div>
                    )}
                  </div>
                </Card>
              </div>

              {/* Client Assistant Link Card */}
              <Card className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="p-2.5 rounded-xl bg-blue-50 text-[#0075de]">
                    <Sparkles className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold">Single-Claim Client Link</h4>
                    <p className="text-xs text-gray-500">The first browser to open claims access. No passwords or app installation required.</p>
                  </div>
                </div>
                <Button onClick={handleCreateInvite} variant="secondary" className="w-full sm:w-auto shrink-0">
                  Generate Link →
                </Button>
              </Card>

              {/* Project Update History Timeline Card */}
              <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <span className="text-[10px] font-bold tracking-wider text-[#96918c] uppercase">UPDATE HISTORY</span>
                    <h4 className="text-sm sm:text-base font-semibold flex items-center gap-2 mt-0.5">
                      <History className="h-4 w-4 text-[#0075de]" /> Project Update Timeline
                    </h4>
                    <p className="text-xs text-gray-500">Record of field changes, milestones, and phase transitions over time.</p>
                  </div>
                  <Button size="sm" variant="subtle" onClick={() => loadProjectHistory(selectedProject.id)} disabled={isLoadingHistory} className="gap-1">
                    <RefreshCw className={`h-3.5 w-3.5 ${isLoadingHistory ? 'animate-spin' : ''}`} /> Refresh
                  </Button>
                </div>

                {projectHistory.length > 0 ? (
                  <div className="relative pl-6 space-y-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-[#eae8e5]">
                    {projectHistory.map((item, idx) => (
                      <div key={item.id || idx} className="relative group">
                        {/* Timeline Node */}
                        <div className="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-white border-2 border-[#0075de] flex items-center justify-center shadow-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#0075de]" />
                        </div>

                        <div className="bg-gray-50/80 hover:bg-gray-50 border border-gray-200/80 rounded-xl p-3.5 transition-colors space-y-2.5">
                          <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-800">
                                {item.changedFields?.length ? `${item.changedFields.length} field${item.changedFields.length > 1 ? "s" : ""} updated` : "Project update recorded"}
                              </span>
                              {item.status && (
                                <Badge variant={item.status === "At risk" ? "destructive" : item.status === "On hold" ? "outline" : "success"} className="text-[10px]">
                                  {item.status}
                                </Badge>
                              )}
                            </div>
                            <span className="text-[11px] text-gray-400 flex items-center gap-1 font-mono">
                              <Clock className="h-3 w-3" />
                              {formatTime(item.timestamp || item.at)} · {new Date(item.timestamp || item.at || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>

                          {/* Changed Fields Diff List */}
                          {item.changedFields && item.changedFields.length > 0 && (
                            <div className="space-y-1.5 pt-1">
                              {item.changedFields.map((change, cIdx) => (
                                <div key={cIdx} className="text-xs bg-white rounded-lg p-2 border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                                  <span className="font-medium text-gray-500 text-[11px]">{change.label || change.field}</span>
                                  <div className="flex items-center gap-2 flex-wrap text-xs">
                                    {change.oldValue ? (
                                      <>
                                        <span className="line-through text-gray-400 truncate max-w-[150px]">{change.oldValue}</span>
                                        <ArrowRight className="h-3 w-3 text-gray-400 shrink-0" />
                                      </>
                                    ) : null}
                                    <span className="font-medium text-gray-900 bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-md border border-emerald-100">
                                      {change.newValue || change.value || "Cleared"}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl space-y-1">
                    <History className="h-6 w-6 text-gray-300 mx-auto mb-1" />
                    <p className="font-medium text-gray-600">No update history recorded yet for this project.</p>
                    <p className="text-[11px] text-gray-400">Updates saved in 'Edit Facts' will appear in this timeline.</p>
                  </div>
                )}
              </Card>

              {/* Transcript Card */}
              <Card className="p-5">
                <div className="mb-4">
                  <span className="text-[10px] font-bold tracking-wider text-[#96918c] uppercase">CLIENT TRANSCRIPT</span>
                  <h4 className="text-sm sm:text-base font-semibold">Shared Conversation History</h4>
                  <p className="text-xs text-gray-500">Questions and assistant responses asked through the client link.</p>
                </div>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {conversations.length ? conversations.map((item, idx) => (
                    <div key={idx} className="p-3.5 bg-gray-50 rounded-xl space-y-2 border border-gray-100">
                      <div className="flex items-center justify-between text-[11px] text-gray-400">
                        <Badge variant="outline" className="text-[9px]">Client Question</Badge>
                        <span>{new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      <p className="text-xs font-semibold text-gray-800">{item.question}</p>
                      <div className="p-2.5 bg-white rounded-lg border border-gray-200 text-xs text-gray-600 leading-relaxed">
                        <span className="text-[9px] font-bold text-gray-400 block uppercase mb-1">ASSISTANT</span>
                        {item.answer}
                      </div>
                    </div>
                  )) : (
                    <div className="py-8 text-center text-xs text-gray-400">No client questions recorded yet.</div>
                  )}
                </div>
              </Card>
            </div>
          ) : (
            <div className="py-16 text-center space-y-4">
              <h2 className="text-xl font-bold">No Projects Found</h2>
              <Button onClick={() => setIsCreateProjectOpen(true)}>Create Your First Project</Button>
            </div>
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white/90 backdrop-blur-lg border-t border-gray-200 flex items-center justify-around z-30 px-2 pb-[env(safe-area-inset-bottom)]">
        <button
          onClick={() => setCurrentTab("projects")}
          className={`flex flex-col items-center gap-1 text-[10px] font-medium ${currentTab === "projects" ? "text-[#0075de] font-semibold" : "text-gray-500"}`}
        >
          <FolderKanban className="h-5 w-5" />
          <span>Projects</span>
        </button>
        <button
          onClick={() => setIsCreateProjectOpen(true)}
          className="w-11 h-11 rounded-full bg-[#0075de] text-white grid place-items-center shadow-lg -mt-4 active:scale-95"
        >
          <Plus className="h-6 w-6" />
        </button>
        <button
          onClick={() => { setCurrentTab("activity"); loadActivities(); }}
          className={`flex flex-col items-center gap-1 text-[10px] font-medium ${currentTab === "activity" ? "text-[#0075de] font-semibold" : "text-gray-500"}`}
        >
          <Clock className="h-5 w-5" />
          <span>Activity</span>
        </button>
      </nav>

      {/* MODAL 1: Create Project */}
      <Dialog open={isCreateProjectOpen} onOpenChange={setIsCreateProjectOpen}>
        <DialogHeader>
          <span className="text-[10px] font-bold tracking-widest text-[#96918c] uppercase">NEW WORKSPACE</span>
          <DialogTitle>Start a Project Space</DialogTitle>
          <DialogDescription>Set up the basics. You can assign the team and share a client link next.</DialogDescription>
        </DialogHeader>
        <form onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          try {
            const res = await post("/api/founder/projects", Object.fromEntries(form));
            await loadProjects();
            setSelectedProjectId(res.project.id);
            setIsCreateProjectOpen(false);
            showToast("Project created successfully!", "success");
          } catch (err) {
            showToast(err.message, "error");
          }
        }} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold">Project Name</label>
            <Input name="name" placeholder="e.g. Kumar Residence" required autoFocus />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold">Client Name</label>
            <Input name="clientName" placeholder="e.g. Asha Kumar" required />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold">Location</label>
            <Input name="location" placeholder="e.g. Pune, Maharashtra" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold">Phase</label>
              <select name="phase" className="w-full h-12 px-3 border border-gray-300 rounded-lg text-sm bg-white outline-none">
                <option>Design</option>
                <option>Planning</option>
                <option>Procurement</option>
                <option>Site execution</option>
                <option>Finishing</option>
                <option>Handover</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold">Status</label>
              <select name="status" className="w-full h-12 px-3 border border-gray-300 rounded-lg text-sm bg-white outline-none">
                <option>Setup</option>
                <option>On track</option>
                <option>At risk</option>
                <option>On hold</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold">Recent Task</label>
            <Input name="recentTask" placeholder="e.g. 3D Moodboards completed" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold">Next Milestone</label>
            <Input name="nextMilestone" placeholder="e.g. Material selection review" />
          </div>
          <Button type="submit" className="w-full">Create Project Space</Button>
        </form>
      </Dialog>

      {/* MODAL 2: Add Member */}
      <Dialog open={isAddMemberOpen} onOpenChange={setIsAddMemberOpen}>
        <DialogHeader>
          <span className="text-[10px] font-bold tracking-widest text-[#96918c] uppercase">PROJECT TEAM</span>
          <DialogTitle>Add Team Member</DialogTitle>
          <DialogDescription>Assign a team member to {selectedProject?.name}.</DialogDescription>
        </DialogHeader>
        <form onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          try {
            await post(`/api/founder/projects/${selectedProject.id}/members`, Object.fromEntries(form));
            await loadProjects();
            setIsAddMemberOpen(false);
            showToast("Member added!", "success");
          } catch (err) {
            showToast(err.message, "error");
          }
        }} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold">Full Name</label>
            <Input name="name" placeholder="e.g. Rohan Mehta" required autoFocus />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold">Designation</label>
            <Input name="designation" placeholder="e.g. Lead Interior Designer" required />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold">Role</label>
            <select name="role" className="w-full h-12 px-3 border border-gray-300 rounded-lg text-sm bg-white outline-none">
              <option>Project admin</option>
              <option>Designer</option>
              <option>Site supervisor</option>
              <option>Site team</option>
              <option>Contractor</option>
              <option>Trade worker</option>
              <option>Client</option>
              <option>Other</option>
            </select>
          </div>
          <Button type="submit" className="w-full">Add to Team</Button>
        </form>
      </Dialog>

      {/* MODAL 3: Edit Facts */}
      <Dialog open={isEditFactsOpen} onOpenChange={setIsEditFactsOpen}>
        <DialogHeader>
          <span className="text-[10px] font-bold tracking-widest text-[#96918c] uppercase">FACTS UPDATE</span>
          <DialogTitle>Update Project Facts</DialogTitle>
          <DialogDescription>The client assistant responds using these exact recorded facts.</DialogDescription>
        </DialogHeader>
        {selectedProject && (
          <form onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            try {
              await patch(`/api/founder/projects/${selectedProject.id}`, Object.fromEntries(form));
              await loadProjects();
              await loadProjectHistory(selectedProject.id);
              setIsEditFactsOpen(false);
              showToast("Project facts updated.", "success");
            } catch (err) {
              showToast(err.message, "error");
            }
          }} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold">Phase</label>
                <select name="phase" defaultValue={selectedProject.phase} className="w-full h-12 px-3 border border-gray-300 rounded-lg text-sm bg-white outline-none">
                  <option>Design</option>
                  <option>Planning</option>
                  <option>Procurement</option>
                  <option>Site execution</option>
                  <option>Finishing</option>
                  <option>Handover</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">Status</label>
                <select name="status" defaultValue={selectedProject.status} className="w-full h-12 px-3 border border-gray-300 rounded-lg text-sm bg-white outline-none">
                  <option>Setup</option>
                  <option>On track</option>
                  <option>At risk</option>
                  <option>On hold</option>
                  <option>Completed</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold">Recent Task</label>
              <Input name="recentTask" defaultValue={selectedProject.recentTask} placeholder="e.g. Framing completed on 2nd floor" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold">Next Milestone</label>
              <Input name="nextMilestone" defaultValue={selectedProject.nextMilestone} placeholder="e.g. Tile deliveries" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold">Blocker (Client Visible)</label>
              <Input name="blocker" defaultValue={selectedProject.blocker} placeholder="e.g. Awaiting client tile selection" />
            </div>
            <Button type="submit" className="w-full">Save Project Facts</Button>
          </form>
        )}
      </Dialog>

      {/* MODAL 4: Share Link */}
      <Dialog open={!!shareLinkData} onOpenChange={() => setShareLinkData(null)}>
        <DialogHeader>
          <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center mb-2 text-lg">✓</div>
          <span className="text-[10px] font-bold tracking-widest text-[#96918c] uppercase">CLIENT ACCESS</span>
          <DialogTitle>Private Link Ready</DialogTitle>
          <DialogDescription>Send this to {selectedProject?.clientName}. The first browser to open it claims access.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2 p-2 bg-gray-50 border border-gray-200 rounded-xl">
            <input readOnly value={shareLinkData || ""} className="flex-1 bg-transparent text-xs sm:text-sm font-mono px-2 outline-none" />
            <Button size="sm" onClick={() => {
              navigator.clipboard.writeText(shareLinkData);
              showToast("Link copied to clipboard!", "success");
            }} className="gap-1">
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
          </div>
          <p className="text-xs text-gray-500">🔒 Single-claim bearer link · No password required</p>
          <Button variant="secondary" className="w-full" onClick={() => setShareLinkData(null)}>Done</Button>
        </div>
      </Dialog>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 bg-gray-900/95 backdrop-blur text-white text-xs font-medium rounded-full shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <span>{toastMessage.type === "success" ? "✓" : "ℹ"}</span>
          <span>{toastMessage.text}</span>
        </div>
      )}
    </div>
  );
}
