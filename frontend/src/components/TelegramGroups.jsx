import React, { useEffect, useState } from "react";
import { Check, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

async function api(url, method = "GET", data) {
  const response = await fetch(url, { method, credentials: "same-origin", headers: { "content-type": "application/json" }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Request failed.");
  return result;
}

const suggestedRoles = ["Founder", "Client", "Supervisor", "Designer", "Painter", "Carpenter", "Electrician", "Contractor"];

export function TelegramGroups({ projects, onProjectsChanged }) {
  const [groups, setGroups] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [drafts, setDrafts] = useState({});
  const [projectName, setProjectName] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = async () => {
    try { const data = await api("/api/founder/telegram-groups"); setGroups(data.groups || []); setError(""); }
    catch (failure) { setError(failure.message); }
  };
  useEffect(() => {
    load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") load(); }, 10000);
    return () => clearInterval(timer);
  }, []);
  const group = groups.find((item) => item.groupChatId === selectedId) || groups[0];
  const activeMembers = group?.members.filter((member) => member.membershipStatus === "Active") || [];
  const pendingCount = activeMembers.filter((member) => !member.assignedRole).length;
  const linkedProject = projects.find((project) => project.telegramGroupChatId === group?.groupChatId);
  const needsSetup = !linkedProject || linkedProject.telegramSetupPending;
  const run = async (work, message) => {
    setBusy(true); setError(""); setNotice("");
    try { await work(); await load(); setNotice(message); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const saveMember = (member) => {
    const draft = drafts[`${group.groupChatId}:${member.telegramUserId}`] || {};
    return run(() => api(`/api/founder/telegram-groups/${group.groupChatId}/members/${member.telegramUserId}`, "POST", { name: (draft.name ?? member.assignedName ?? member.telegramName).trim(), role: (draft.role ?? member.assignedRole ?? "").trim() }), "Role saved and announced in Telegram.");
  };
  const createProject = () => run(async () => {
    await api(`/api/founder/telegram-groups/${group.groupChatId}/create-project`, "POST", { projectName: projectName.trim() || group.title, startDate });
    await onProjectsChanged();
  }, "Project created and linked to this Telegram group.");

  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Telegram onboarding</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Group setup</h1><p className="mt-1 text-sm text-muted-foreground">Groups appear here after the group bot is added. Assign each person a project name and role.</p></div><Button variant="outline" size="sm" onClick={load}><RefreshCw />Refresh</Button></div>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
    {groups.length ? <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]"><aside className="overflow-hidden rounded-xl border bg-card" aria-label="Telegram groups">{groups.map((item) => { const active = item.members.filter((member) => member.membershipStatus === "Active"); return <button type="button" key={item.groupChatId} onClick={() => { setSelectedId(item.groupChatId); setProjectName(item.title); }} className={`w-full border-b px-4 py-3 text-left hover:bg-muted/70 ${group?.groupChatId === item.groupChatId ? "bg-accent/70" : ""}`}><span className="block truncate text-sm font-semibold">{item.title}</span><span className="mt-1 block text-xs text-muted-foreground">{active.length} people · {active.filter((member) => !member.assignedRole).length} roles pending</span></button>; })}</aside>
      <section className="min-w-0 space-y-4 rounded-xl border bg-card p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold">{group.title}</h2><p className="text-xs text-muted-foreground">Telegram group ID {group.groupChatId} · {activeMembers.length} people observed</p></div><span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">{needsSetup ? "Project needs setup" : `Linked to ${linkedProject.name}`}</span></div>
        {pendingCount > 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{pendingCount} person{pendingCount === 1 ? "" : "s"} need a name or role. Ask each person to send /join in Telegram if someone is missing.</p>}
        <div className="space-y-3">{activeMembers.length ? activeMembers.map((member) => { const key = `${group.groupChatId}:${member.telegramUserId}`; const draft = drafts[key] || {}; return <div key={member.telegramUserId} className="rounded-xl border p-3"><div className="mb-3 flex items-center gap-2"><span className="grid size-8 place-items-center rounded-full bg-secondary text-xs font-semibold"><Users className="size-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{member.telegramName}</p><p className="text-xs text-muted-foreground">Telegram ID {member.telegramUserId}</p></div>{member.assignedRole && <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><Check className="size-3" />{member.assignedRole}</span>}</div><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"><label className="space-y-1 text-xs font-medium">Name in project<Input value={draft.name ?? member.assignedName ?? member.telegramName} onChange={(event) => setDrafts((current) => ({ ...current, [key]: { ...current[key], name: event.target.value } }))} /></label><label className="space-y-1 text-xs font-medium">Role<Input list="project-role-suggestions" value={draft.role ?? member.assignedRole ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [key]: { ...current[key], role: event.target.value } }))} placeholder="Client, designer…" /></label><Button className="self-end" size="sm" onClick={() => saveMember(member)} disabled={busy || !(draft.role ?? member.assignedRole)}>Save role</Button></div></div>; }) : <p className="py-8 text-center text-sm text-muted-foreground">No people observed yet. Add members after the bot, or ask them to send /join.</p>}</div>
        <datalist id="project-role-suggestions">{suggestedRoles.map((role) => <option key={role} value={role} />)}</datalist>
        {needsSetup && <div className="space-y-3 border-t pt-4"><div><h3 className="text-sm font-semibold">Finish project setup</h3><p className="text-xs text-muted-foreground">Assign a Client first, then connect this visible web project to the bot's workflow.</p></div><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px_auto]"><label className="space-y-1 text-xs font-medium">Project name<Input value={projectName || group.title} onChange={(event) => setProjectName(event.target.value)} /></label><label className="space-y-1 text-xs font-medium">Start date<Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><Button className="self-end" onClick={createProject} disabled={busy || !activeMembers.some((member) => /\bclient\b/i.test(member.assignedRole))}>Finish setup</Button></div></div>}
      </section></div> : <div className="rounded-xl border bg-card px-6 py-14 text-center"><Users className="mx-auto mb-3 size-9 text-muted-foreground" /><h2 className="text-sm font-semibold">No Telegram groups yet</h2><p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">Create a group in Telegram, add the project bot as an admin, then add your team. The group will appear here automatically.</p></div>}
  </div>;
}
