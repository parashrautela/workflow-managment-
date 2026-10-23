import { rolesOf, hasRole, isStaff } from '@/lib/roles';
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

export function TelegramGroups({ projects = [], onProjectsChanged, project, embedded = false }) {
  const [groups, setGroups] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [drafts, setDrafts] = useState({});
  const [projectName, setProjectName] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [memberId, setMemberId] = useState("");
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
  const group = project ? groups.find((item)=>item.groupChatId===project.telegramGroupChatId) : (groups.find((item) => item.groupChatId === selectedId) || groups[0]);
  const activeMembers = group?.members.filter((member) => member.membershipStatus === "Active") || [];
  const pendingCount = activeMembers.filter((member) => (!member.assignedName || !member.assignedRole)).length;
  const linkedProject = project || projects.find((project) => project.telegramGroupChatId === group?.groupChatId);
  const needsSetup = !linkedProject || linkedProject.telegramSetupPending;
  const run = async (work, message) => {
    setBusy(true); setError(""); setNotice("");
    try { await work(); await load(); if(onProjectsChanged)await onProjectsChanged(); setNotice(message); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const saveMember = (member) => {
    const draft = drafts[`${group.groupChatId}:${member.telegramUserId}`] || {};
    return run(() => api(`/api/founder/telegram-groups/${group.groupChatId}/members/${member.telegramUserId}`, "POST", { name: (draft.name ?? member.assignedName ?? member.telegramName).trim(), role: (draft.role ?? member.assignedRole ?? "").trim() }), "Role saved and announced in Telegram. Team members need their Google email added in Employees for web access.");
  };
  const createProject = () => run(async () => {
    return api(`/api/founder/telegram-groups/${group.groupChatId}/create-project`, "POST", { projectName: projectName.trim() || group.title, startDate });
  }, "Members saved. Choose the project type next.");

  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Telegram onboarding</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{embedded ? "Add members first" : "Group setup"}</h1><p className="mt-1 text-sm text-muted-foreground">Set the names and roles of the client and team members discovered in this project’s Telegram group before choosing a project type.</p></div><Button variant="outline" size="sm" disabled={busy} onClick={()=>run(()=>api("/api/founder/telegram-groups/refresh","POST",{groupChatId:group?.groupChatId}),"Recorded Telegram members refreshed. If someone is missing, ask them to send /join in the group.")}><RefreshCw />Refresh</Button></div>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
    {group ? <div className={embedded ? "space-y-4" : "grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]"}>{!embedded && <aside className="overflow-hidden rounded-xl border bg-card" aria-label="Telegram groups">{groups.map((item) => { const active = item.members.filter((member) => member.membershipStatus === "Active"); return <button type="button" key={item.groupChatId} onClick={() => { setSelectedId(item.groupChatId); setProjectName(item.title); }} className={`w-full border-b px-4 py-3 text-left hover:bg-muted/70 ${group?.groupChatId === item.groupChatId ? "bg-accent/70" : ""}`}><span className="block truncate text-sm font-semibold">{item.title}</span><span className="mt-1 block text-xs text-muted-foreground">{active.length} people · {active.filter((member) => !member.assignedRole).length} roles pending</span></button>; })}</aside>}
      <section className="min-w-0 space-y-4 rounded-xl border bg-card p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold">{group.title}</h2><p className="text-xs text-muted-foreground">Telegram group ID {group.groupChatId} · {activeMembers.length} people recorded{group.telegramMemberCount ? ` · ${group.telegramMemberCount} Telegram accounts including bots` : ""}</p></div><span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">{needsSetup ? "Project needs setup" : `Linked to ${linkedProject.name}`}</span></div>
        <p className="rounded-lg border bg-secondary/40 p-3 text-sm text-muted-foreground">Missing someone? Telegram does not let bots fetch the full existing member list. Ask each missing person to send <code>/join{group.botUsername ? `@${group.botUsername}` : ""}</code> in this Telegram group, then refresh. If there are multiple bots, use <code>/join@YourBotUsername</code> with this project bot’s username. Make the bot a group admin to receive future membership updates.</p>
        {group.discoveryWarning && <p role="status" className="text-sm text-amber-800">{group.discoveryWarning}</p>}
        <form className="flex flex-wrap items-end gap-2" onSubmit={event=>{event.preventDefault();run(()=>api("/api/founder/telegram-groups/refresh","POST",{groupChatId:group.groupChatId,telegramUserId:memberId}),"Member verified in Telegram and added to the roster.").then(()=>setMemberId(""));}}><label className="space-y-1 text-xs font-medium">Recover a missing member by Telegram ID<Input value={memberId} onChange={event=>setMemberId(event.target.value)} inputMode="numeric" pattern="[0-9]+" required placeholder="Telegram user ID" /></label><Button variant="outline" disabled={busy || !/^\d+$/.test(memberId)}>Verify and add</Button></form>
        {pendingCount > 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{pendingCount} person{pendingCount === 1 ? "" : "s"} need a name or role. Ask each person to send /join in Telegram if someone is missing.</p>}
        <div className="space-y-3">{activeMembers.length ? activeMembers.map((member) => { const key = `${group.groupChatId}:${member.telegramUserId}`; const draft = drafts[key] || {}; return <div key={member.telegramUserId} className="rounded-xl border p-3"><div className="mb-3 flex items-center gap-2"><span className="grid size-8 place-items-center rounded-full bg-secondary text-xs font-semibold"><Users className="size-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{member.telegramName}</p><p className="text-xs text-muted-foreground">Telegram ID {member.telegramUserId}</p></div>{member.assignedRole && <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><Check className="size-3" />{member.assignedRole}</span>}</div><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"><label className="space-y-1 text-xs font-medium">Name in project<Input value={draft.name ?? member.assignedName ?? member.telegramName} onChange={(event) => setDrafts((current) => ({ ...current, [key]: { ...current[key], name: event.target.value } }))} /></label><label className="space-y-1 text-xs font-medium">Roles (choose one or more)<Input list="project-role-suggestions" value={draft.role ?? member.assignedRole ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [key]: { ...current[key], role: event.target.value } }))} placeholder="Founder, Designer" /></label><div className="col-span-full flex flex-wrap gap-3">{suggestedRoles.map(role=><label key={role} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={hasRole(draft.role ?? member.assignedRole,role)} onChange={event=>{const current=rolesOf(draft.role ?? member.assignedRole);setDrafts(values=>({...values,[key]:{...values[key],role:(event.target.checked?[...current,role]:current.filter(item=>item!==role)).join(', ')}}));}} />{role}</label>)}</div><Button className="self-end" size="sm" onClick={() => saveMember(member)} disabled={busy || !(draft.role ?? member.assignedRole)}>Save role</Button></div></div>; }) : <p className="py-8 text-center text-sm text-muted-foreground">No people observed yet. Add members after the bot, or ask them to send /join.</p>}</div>
        <datalist id="project-role-suggestions">{suggestedRoles.map((role) => <option key={role} value={role} />)}</datalist>
        {needsSetup && <div className="space-y-3 border-t pt-4"><div><h3 className="text-sm font-semibold">Finish project setup</h3><p className="text-xs text-muted-foreground">Assign at least one client and one team member. Finish setup here, then choose the project type in this project.</p></div><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px_auto]"><label className="space-y-1 text-xs font-medium">Project name<Input value={projectName || group.title} onChange={(event) => setProjectName(event.target.value)} /></label><label className="space-y-1 text-xs font-medium">Start date<Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><Button className="self-end" onClick={createProject} disabled={busy || pendingCount>0 || !activeMembers.some(member=>hasRole(member.assignedRole,'Client')) || !activeMembers.some(member=>isStaff(member.assignedRole))}>Finish setup</Button></div></div>}
      </section></div> : <div className="rounded-xl border bg-card px-6 py-14 text-center"><Users className="mx-auto mb-3 size-9 text-muted-foreground" /><h2 className="text-sm font-semibold">No Telegram groups yet</h2><p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">Create a group in Telegram, add the project bot as an admin, then add your team. The group will appear here automatically.</p></div>}
  </div>;
}
