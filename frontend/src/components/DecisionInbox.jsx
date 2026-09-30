import React, { useEffect, useState } from "react";
import { Check, ExternalLink, RefreshCw, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

async function requestApi(url, method = "GET", data) {
  const response = await fetch(url, { method, credentials: "same-origin", headers: { "content-type": "application/json" }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Request failed.");
  return result;
}

const when = (value) => value ? new Date(value).toLocaleString() : "";

export function DecisionInbox({ projects, onProjectsChanged }) {
  const [requests, setRequests] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [filter, setFilter] = useState("Open");
  const [drafts, setDrafts] = useState({});
  const [commentDrafts, setCommentDrafts] = useState({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const load = async () => {
    try { const data = await requestApi("/api/founder/decision-requests"); setRequests(data.requests || []); setError(""); }
    catch (failure) { setError(failure.message); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const project = projects.find((item) => item.id === selectedProjectId) || projects[0];
    if (project) { setSelectedProjectId(project.id); setGroupId(project.telegramGroupChatId || ""); }
  }, [projects, selectedProjectId]);

  const run = async (key, action, success) => {
    setBusy(key); setError(""); setNotice("");
    try { await action(); await load(); setNotice(success); return true; }
    catch (failure) { setError(failure.message); return false; }
    finally { setBusy(""); }
  };
  const saveGroup = async () => run("group", async () => {
    await requestApi(`/api/founder/projects/${selectedProjectId}`, "PATCH", { telegramGroupChatId: groupId.trim() });
    await onProjectsChanged();
  }, "Telegram group linked to this project.");
  const action = (item, kind, payload, success) => run(`${item.id}:${kind}`, () => requestApi(`/api/founder/decision-requests/${encodeURIComponent(item.id)}/${kind}`, "POST", payload), success);
  const visible = requests.filter((item) => filter === "All" || (filter === "Open" ? item.status !== "Done" : item.status === filter));
  const openCount = requests.filter((item) => item.status !== "Done").length;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Telegram decisions</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Needs attention</h1><p className="mt-1 text-sm text-muted-foreground">{openCount} open request{openCount === 1 ? "" : "s"} across your linked project groups.</p></div><Button variant="outline" size="sm" onClick={load}><RefreshCw />Refresh</Button></div>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
    <Card><CardContent className="flex flex-wrap items-end gap-3 p-4"><label className="min-w-40 flex-1 space-y-1 text-xs font-medium">Web project<NativeSelect value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)} className="w-full"><option value="" disabled>Select project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</NativeSelect></label><label className="min-w-44 flex-1 space-y-1 text-xs font-medium">Telegram group chat ID<Input value={groupId} onChange={(event) => setGroupId(event.target.value)} placeholder="-1001234567890" /></label><Button onClick={saveGroup} disabled={!selectedProjectId || !!busy}>Save group link</Button><p className="w-full text-xs text-muted-foreground">Get the group ID from the bot’s /start message in that project group. Each group can link to one web project.</p></CardContent></Card>
    <div className="flex gap-2"><NativeSelect value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter decision requests" className="w-44"><option>Open</option><option>Pending</option><option>Published</option><option>Done</option><option>All</option></NativeSelect></div>
    {visible.length ? visible.map((item) => {
      const project = projects.find((candidate) => candidate.id === item.projectId);
      return <Card key={item.id}><CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{project?.name || "Project"}</Badge><Badge variant="outline">{item.requestType}</Badge><Badge variant="outline">{item.status}</Badge><span className="ml-auto text-xs text-muted-foreground">{when(item.createdAt)}</span></div>
        <div><p className="text-xs text-muted-foreground">From {item.originalSenderName} · marked by {item.requestedByName}{item.requestedByRole ? ` (${item.requestedByRole})` : ""}</p><p className="mt-2 whitespace-pre-wrap text-sm font-medium">{item.originalMessage || "Attachment without a caption"}</p>{item.context && <p className="mt-2 text-sm text-muted-foreground">Context: {item.context}</p>}</div>
        {!!item.attachments?.length && <div className="flex flex-wrap gap-2">{item.attachments.map((attachment, index) => <a key={index} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs text-primary" href={`/api/founder/decision-requests/${encodeURIComponent(item.id)}/attachments/${index}`} target="_blank" rel="noreferrer">{attachment.fileName || attachment.type} <ExternalLink className="size-3" /></a>)}</div>}
        {item.comments?.length > 0 && <div className="space-y-2 border-l-2 pl-3">{item.comments.map((comment) => <p key={comment.id} className="text-xs"><strong>{comment.author}</strong> · {when(comment.at)}<br />{comment.text}</p>)}</div>}
        {item.status !== "Done" && <div className="space-y-2"><label className="block text-xs font-medium">Private note<Textarea value={commentDrafts[item.id] || ""} onChange={(event) => setCommentDrafts((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Discuss or record an internal decision" /></label><Button size="sm" variant="outline" disabled={!!busy || !commentDrafts[item.id]?.trim()} onClick={async () => { if (await action(item, "comment", { text: commentDrafts[item.id] }, "Private note saved.")) setCommentDrafts((current) => ({ ...current, [item.id]: "" })); }}>Save private note</Button></div>}
        {item.response && <p className="rounded-lg bg-muted p-3 text-sm"><strong>Published reply:</strong> {item.response}</p>}
        {item.status === "Pending" && <div className="space-y-2"><label className="block text-xs font-medium">Reply to Telegram<Textarea value={drafts[item.id] || ""} onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Write the final answer for the group" /></label><Button disabled={!!busy || !drafts[item.id]?.trim()} onClick={() => action(item, "publish", { response: drafts[item.id] }, "Reply published to Telegram.")}><Send />Publish reply</Button></div>}
        {item.status !== "Done" && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => action(item, "resolve", {}, "Request marked done.")}><Check />Mark done</Button>}
      </CardContent></Card>;
    }) : <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No requests in this view yet.</CardContent></Card>}
  </div>;
}
