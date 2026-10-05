// frontend/src/components/DecisionInbox.jsx
import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, Check, ExternalLink, MessageSquare, RefreshCw, Search, Send,
  Settings2, AlertTriangle, AlertCircle, CheckCircle2, Plus, XCircle, FileText
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  generateIdempotencyKey, getAttachmentUrl, approveDecisionRequest,
  rejectDecisionRequest, convertDecisionRequest
} from "@/lib/api";

async function api(url, method = "GET", data) {
  const response = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    ...(data === undefined ? {} : { body: JSON.stringify(data) })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Request failed.");
  return result;
}

const when = (value) => value ? new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
const initials = (name = "") => name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "?";
const preview = (item) => item.originalMessage || item.context || (item.attachments?.length ? "Attachment" : "Request");

export function DecisionInbox({ projects, onProjectsChanged }) {
  const [requests, setRequests] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [mobileThread, setMobileThread] = useState(false);
  const [filter, setFilter] = useState("Open");
  const [projectFilter, setProjectFilter] = useState("All projects");
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState("internal");
  const [drafts, setDrafts] = useState({});
  const [notes, setNotes] = useState({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsProjectId, setSettingsProjectId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  // Conversion & rejection modals
  const [convertModalOpen, setConvertModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [convertTitle, setConvertTitle] = useState("");
  const [convertDesc, setConvertDesc] = useState("");
  const [convertDeadline, setConvertDeadline] = useState("");

  const scrollRef = useRef(null);

  const load = async () => {
    try {
      const data = await api("/api/founder/decision-requests");
      setRequests(data.requests || []);
      setError("");
    } catch (failure) {
      setError(failure.message);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") load(); }, 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const project = projects.find((item) => item.id === settingsProjectId) || projects[0];
    if (project) {
      setSettingsProjectId(project.id);
      setGroupId(project.telegramGroupChatId || "");
    }
  }, [projects, settingsProjectId]);

  const visible = requests.filter((item) => {
    if (filter === "Open" && item.status === "Done") return false;
    if (filter === "Done" && item.status !== "Done") return false;
    if (projectFilter !== "All projects" && item.projectId !== projectFilter) return false;
    const project = projects.find((candidate) => candidate.id === item.projectId);
    return `${project?.name || ""} ${item.originalSenderName} ${item.originalMessage} ${item.context}`.toLowerCase().includes(search.toLowerCase());
  });

  const selected = visible.find((item) => item.id === selectedId) || visible[0];
  const selectedProject = projects.find((item) => item.id === selected?.projectId);
  const openCount = requests.filter((item) => item.status !== "Done").length;
  const text = selected ? (mode === "internal" ? notes[selected.id] || "" : drafts[selected.id] || "") : "";

  const followUps = selected ? [
    ...(selected.comments || []).map((comment) => ({ type: "comment", at: comment.at, value: comment })),
    ...(selected.response ? [{ type: "response", at: selected.publishedAt, value: selected.response }] : []),
  ].sort((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime()) : [];

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [selected?.id, selected?.comments?.length, selected?.status]);

  useEffect(() => {
    if (selected?.status !== "Pending" && selected?.deliveryStatus !== "Failed") {
      setMode("internal");
    }
  }, [selected?.id, selected?.status, selected?.deliveryStatus]);

  useEffect(() => {
    if (!visible.length) setMobileThread(false);
  }, [visible.length]);

  const run = async (action, success) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      await load();
      setNotice(success);
      return true;
    } catch (failure) {
      setError(failure.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveGroup = () => run(async () => {
    await api(`/api/founder/projects/${settingsProjectId}`, "PATCH", { telegramGroupChatId: groupId.trim() });
    await onProjectsChanged();
  }, "Telegram group linked to this project.");

  const send = async (event) => {
    event.preventDefault();
    if (!selected || !text.trim() || busy) return;

    if (mode === "publish" && selected.deliveryStatus === "Unknown") {
      setError("Cannot retry automatically while delivery status is Unknown. Check the Telegram group manually.");
      return;
    }

    const kind = mode === "internal" ? "comment" : "publish";
    const body = kind === "comment"
      ? { text: text.trim() }
      : { response: text.trim(), idempotencyKey: generateIdempotencyKey(`pub-${selected.id}`) };

    const sent = await run(
      () => api(`/api/founder/decision-requests/${encodeURIComponent(selected.id)}/${kind}`, "POST", body),
      kind === "comment" ? "Private note saved." : "Reply published to Telegram."
    );

    if (sent) {
      if (kind === "comment") setNotes((current) => ({ ...current, [selected.id]: "" }));
      else {
        setDrafts((current) => ({ ...current, [selected.id]: "" }));
        setMode("internal");
      }
    }
  };

  const handleApprove = () => {
    if (!selected) return;
    run(() => approveDecisionRequest(selected.id), "Request approved.");
  };

  const handleRejectSubmit = (e) => {
    e.preventDefault();
    if (!selected || !rejectReason.trim()) return;
    run(() => rejectDecisionRequest(selected.id, rejectReason.trim()), "Request rejected.");
    setRejectModalOpen(false);
    setRejectReason("");
  };

  const handleConvertSubmit = (e) => {
    e.preventDefault();
    if (!selected || !convertTitle.trim()) return;
    run(() => convertDecisionRequest(selected.id, {
      title: convertTitle.trim(),
      description: convertDesc.trim(),
      deadline: convertDeadline || undefined,
      status: "Open"
    }), "Task created from client request.");
    setConvertModalOpen(false);
  };

  const markDone = () => selected && run(() => api(`/api/founder/decision-requests/${encodeURIComponent(selected.id)}/resolve`, "POST", {}), "Request marked done.");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Telegram workspace</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Decision inbox</h1>
          <p className="mt-1 text-sm text-muted-foreground">{openCount} conversation{openCount === 1 ? "" : "s"} need attention.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}><RefreshCw />Refresh</Button>
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen((current) => !current)} aria-expanded={settingsOpen}><Settings2 />Group links</Button>
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}

      {settingsOpen && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
          <label className="min-w-44 flex-1 space-y-1 text-xs font-medium">
            Web project
            <NativeSelect value={settingsProjectId} onChange={(event) => setSettingsProjectId(event.target.value)} className="w-full">
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </NativeSelect>
          </label>
          <label className="min-w-44 flex-1 space-y-1 text-xs font-medium">
            Telegram group chat ID
            <Input value={groupId} onChange={(event) => setGroupId(event.target.value)} placeholder="-1001234567890" />
          </label>
          <Button onClick={saveGroup} disabled={!settingsProjectId || busy}>Save link</Button>
          <p className="w-full text-xs text-muted-foreground">Use the group ID in the bot’s /start message. Each group links to one project.</p>
        </div>
      )}

      <div className="grid min-h-[min(70dvh,740px)] grid-cols-[minmax(0,1fr)] overflow-hidden rounded-2xl border bg-card shadow-sm lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Left conversations list */}
        <aside className={`${mobileThread ? "hidden lg:flex" : "flex"} min-h-0 min-w-0 flex-col border-r`} aria-label="Decision conversations">
          <div className="space-y-3 border-b p-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations" className="pl-9" aria-label="Search decision conversations" />
            </label>
            <div className="flex gap-2">
              <NativeSelect value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter by status" className="w-24">
                <option>Open</option>
                <option>Done</option>
                <option>All</option>
              </NativeSelect>
              <NativeSelect value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} aria-label="Filter by project" className="min-w-0 flex-1">
                <option>All projects</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </NativeSelect>
            </div>
          </div>

          <div className="chat-scroll min-h-0 flex-1 overflow-y-auto">
            {visible.length ? visible.map((item) => {
              const project = projects.find((candidate) => candidate.id === item.projectId);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { setSelectedId(item.id); setMobileThread(true); setMode("internal"); }}
                  className={`w-full overflow-hidden border-b px-4 py-3 text-left transition-colors hover:bg-muted/70 ${selected?.id === item.id ? "bg-accent/70" : ""}`}
                  aria-current={selected?.id === item.id ? "true" : undefined}
                >
                  <span className="flex items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                      {initials(item.originalSenderName)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <strong className="min-w-0 flex-1 truncate text-sm">{item.originalSenderName}</strong>
                        <time className="shrink-0 text-[10px] text-muted-foreground">{when(item.createdAt)}</time>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{project?.name || "Project"} · {item.requestType}</span>
                      <span className="mt-1 block truncate text-xs">{preview(item)}</span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className={`text-[10px] font-medium ${item.status === "Pending" ? "text-amber-700" : item.status === "Published" ? "text-primary" : "text-emerald-700"}`}>
                          {item.status}
                        </span>
                        {item.taskId && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 border-indigo-200 bg-indigo-50 text-indigo-700">
                            Task
                          </Badge>
                        )}
                        {item.deliveryStatus === "Unknown" && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-300 bg-amber-50 text-amber-900">
                            Unknown
                          </Badge>
                        )}
                      </span>
                    </span>
                  </span>
                </button>
              );
            }) : <div className="p-8 text-center text-sm text-muted-foreground">No conversations match this view.</div>}
          </div>
        </aside>

        {/* Right conversation view */}
        <section className={`${mobileThread ? "flex" : "hidden lg:flex"} min-w-0 flex-col`} aria-label="Selected decision conversation">
          {selected ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileThread(false)} aria-label="Back to conversations">
                    <ArrowLeft className="size-4" />
                  </Button>
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold">
                    {initials(selected.originalSenderName)}
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold">{selected.originalSenderName}</h2>
                    <p className="truncate text-xs text-muted-foreground">
                      {selectedProject?.name || "Project"} · {selected.requestType} · {selected.status}
                      {selected.decisionStatus && ` (${selected.decisionStatus})`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {!selected.taskId && selected.status !== "Done" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setConvertTitle(selected.originalMessage || "Client query follow-up");
                        setConvertDesc(`Client message: "${selected.originalMessage || ""}"`);
                        setConvertModalOpen(true);
                      }}
                      disabled={busy}
                    >
                      <Plus className="size-3.5 mr-1" />
                      Convert to Task
                    </Button>
                  )}

                  {!["Approved", "Rejected", "Done"].includes(selected.status) && (
                    <>
                      <Button variant="outline" size="sm" onClick={handleApprove} disabled={busy}>
                        <Check className="size-3.5 mr-1" /> Approve
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setRejectModalOpen(true)} disabled={busy} className="text-destructive">
                        Reject
                      </Button>
                    </>
                  )}

                  {selected.status !== "Done" && (
                    <Button variant="outline" size="sm" disabled={busy} onClick={markDone}>
                      Done
                    </Button>
                  )}
                </div>
              </div>

              <div ref={scrollRef} className="chat-scroll min-h-[300px] flex-1 space-y-5 overflow-y-auto bg-muted/30 px-4 py-6 sm:px-6">
                <p className="text-center text-[11px] text-muted-foreground">Request received {when(selected.createdAt)}</p>

                {/* Delivery Status Warning */}
                {selected.deliveryStatus === "Unknown" && (
                  <div className="mx-auto max-w-[85%] rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 flex items-start gap-2">
                    <AlertTriangle className="size-4 shrink-0 text-amber-700 mt-0.5" />
                    <div>
                      <strong>Delivery Status Unknown:</strong> A previous send attempt timed out or interrupted.
                      Check the Telegram group manually before sending again. Do not retry automatically.
                    </div>
                  </div>
                )}

                {selected.deliveryStatus === "Failed" && (
                  <div className="mx-auto max-w-[85%] rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
                    <XCircle className="size-4 shrink-0 text-destructive mt-0.5" />
                    <div>
                      <strong>Delivery Failed:</strong> {selected.deliveryError || "Telegram rejected the message. You may retry publishing."}
                    </div>
                  </div>
                )}

                {/* Main Client Message */}
                <div className="flex items-end gap-2">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-semibold">
                    {initials(selected.originalSenderName)}
                  </span>
                  <div className="max-w-[85%] space-y-1">
                    <p className="text-[11px] text-muted-foreground">{selected.originalSenderName} · Telegram</p>
                    <div className="rounded-2xl rounded-bl-sm border bg-card px-4 py-3 text-sm shadow-sm space-y-2">
                      <p className="whitespace-pre-wrap">{selected.originalMessage || "Shared an attachment"}</p>

                      {/* Photo / Attachment previews */}
                      {selected.attachments?.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {selected.attachments.map((attachment, index) => {
                            const isPhoto = attachment.type === "Photo" || /\.(png|jpe?g|webp|gif)$/i.test(attachment.fileName || "");
                            const mediaUrl = getAttachmentUrl(selected.id, index, "founder");

                            return (
                              <div key={index} className="space-y-1">
                                {isPhoto ? (
                                  <div className="overflow-hidden rounded-xl border bg-muted/20">
                                    <img
                                      src={mediaUrl}
                                      alt={attachment.fileName || `Photo ${index + 1}`}
                                      className="max-h-56 max-w-full rounded-xl object-contain"
                                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                                    />
                                    <a
                                      className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline px-2 py-1"
                                      href={mediaUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      <FileText className="size-3" />
                                      {attachment.fileName || "View full image"}
                                      <ExternalLink className="size-2.5" />
                                    </a>
                                  </div>
                                ) : (
                                  <a
                                    key={index}
                                    className="inline-flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1.5 text-xs text-primary hover:underline"
                                    href={mediaUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    <FileText className="size-3" />
                                    {attachment.fileName || attachment.type || "Document"}
                                    <ExternalLink className="size-3" />
                                  </a>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {selected.context && (
                  <div className="mx-auto max-w-[85%] rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
                    <strong>{selected.requestedByName} added:</strong> {selected.context}
                  </div>
                )}

                {selected.reviewNote && (
                  <div className="mx-auto max-w-[85%] rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-2 text-xs text-destructive">
                    <strong>Rejection reason:</strong> {selected.reviewNote}
                  </div>
                )}

                {followUps.map((event, idx) =>
                  event.type === "comment" ? (
                    <div key={event.value.id || idx} className="flex justify-end">
                      <div className="max-w-[85%] space-y-1">
                        <p className="text-right text-[11px] text-muted-foreground">{event.value.author} · private note · {when(event.at)}</p>
                        <p className="whitespace-pre-wrap rounded-2xl rounded-br-sm border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                          {event.value.text}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div key="published" className="flex justify-end">
                      <div className="max-w-[85%] space-y-1">
                        <p className="text-right text-[11px] text-muted-foreground">Published to Telegram · {when(event.at)}</p>
                        <p className="whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-4 py-3 text-sm text-primary-foreground">
                          {event.value}
                        </p>
                      </div>
                    </div>
                  )
                )}

                {selected.status === "Done" && (
                  <p className="text-center text-xs text-emerald-700">Marked done {when(selected.resolvedAt)}</p>
                )}
              </div>

              {selected.status !== "Done" && (
                <form onSubmit={send} className="space-y-2 border-t p-3 sm:p-4">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setMode("internal")}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium ${mode === "internal" ? "bg-amber-100 text-amber-900" : "text-muted-foreground hover:bg-muted"}`}
                    >
                      Private note
                    </button>
                    {(selected.status === "Pending" || selected.deliveryStatus === "Failed") && (
                      <button
                        type="button"
                        onClick={() => setMode("publish")}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium ${mode === "publish" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
                      >
                        Reply to Telegram
                      </button>
                    )}
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {mode === "internal" ? "Stays in web app" : "The group will see this"}
                    </span>
                  </div>

                  <div className="flex items-end gap-2">
                    <Textarea
                      value={text}
                      onChange={(event) => mode === "internal" ? setNotes((current) => ({ ...current, [selected.id]: event.target.value })) : setDrafts((current) => ({ ...current, [selected.id]: event.target.value }))}
                      rows={2}
                      maxLength={mode === "internal" ? 2000 : 3000}
                      placeholder={mode === "internal" ? "Discuss or record an internal decision…" : "Write the final answer for the Telegram group…"}
                      aria-label={mode === "internal" ? "Private note" : "Telegram reply"}
                      className="max-h-32 flex-1 resize-y text-xs"
                    />
                    <Button
                      type="submit"
                      disabled={busy || !text.trim() || (mode === "publish" && selected.deliveryStatus === "Unknown")}
                      aria-label={mode === "internal" ? "Save private note" : "Publish reply to Telegram"}
                    >
                      <Send className="size-4 mr-1" />
                      <span className="hidden sm:inline">{mode === "internal" ? "Save" : "Publish"}</span>
                    </Button>
                  </div>
                </form>
              )}
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
              <MessageSquare className="size-9 opacity-50" />
              <p className="text-sm font-medium">Select a conversation</p>
              <p className="text-xs">Telegram requests and founder decisions appear here.</p>
            </div>
          )}
        </section>
      </div>

      {/* Convert to Task Modal */}
      <Dialog open={convertModalOpen} onOpenChange={setConvertModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert Query to Task</DialogTitle>
            <DialogDescription>Create an internal task in this project from the client's inquiry.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleConvertSubmit} className="space-y-4">
            <label className="grid gap-1.5 text-xs font-semibold">
              Task Title
              <Input value={convertTitle} onChange={(e) => setConvertTitle(e.target.value)} required />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold">
              Description
              <Textarea value={convertDesc} onChange={(e) => setConvertDesc(e.target.value)} rows={3} />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold">
              Deadline
              <Input type="date" value={convertDeadline} onChange={(e) => setConvertDeadline(e.target.value)} />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setConvertModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>Create Task</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reject Modal */}
      <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Client Request</DialogTitle>
            <DialogDescription>Specify an internal reason for rejecting this request.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRejectSubmit} className="space-y-4">
            <label className="grid gap-1.5 text-xs font-semibold">
              Reason
              <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="e.g. Scope limitation" required />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setRejectModalOpen(false)}>Cancel</Button>
              <Button type="submit" variant="destructive" disabled={busy}>Confirm Rejection</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
