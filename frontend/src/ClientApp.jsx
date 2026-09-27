import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowUp, CheckCircle2, LockKeyhole, MessageSquare, Sparkles } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Message, MessageAvatar, MessageContent, MessageFooter, MessageHeader } from "@/components/ui/message";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

const api = async (url, options = {}) => {
  const response = await fetch(url, { credentials: "same-origin", ...options, headers: { "content-type": "application/json", ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
};
const post = (url, data = {}) => api(url, { method: "POST", body: JSON.stringify(data) });
const time = (value) => value ? new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";

function AssistantAvatar() {
  return <Avatar><AvatarFallback className="bg-primary/10 text-primary"><Sparkles className="size-4" /></AvatarFallback></Avatar>;
}
function ClientAvatar({ name }) {
  return <Avatar><AvatarFallback className="bg-secondary font-semibold text-secondary-foreground">{name?.slice(0, 2).toUpperCase() || "CL"}</AvatarFallback></Avatar>;
}

export default function ClientApp() {
  const token = decodeURIComponent(location.pathname.split("/")[2] || "");
  const [project, setProject] = useState(null);
  const [error, setError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const claim = await post("/api/client/claim", { token });
        if (!active) return;
        setProject(claim.project);
        try { const history = await api("/api/client/conversation"); if (active) setMessages(history.messages || []); }
        catch { /* The chat can still start when history is empty. */ }
      } catch (problem) { if (active) setError(problem.message); }
    })();
    return () => { active = false; };
  }, [token]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, isAsking]);

  const ask = async (suggestion) => {
    const text = (suggestion || question).trim();
    if (!text || isAsking) return;
    const pendingId = `${Date.now()}-${Math.random()}`;
    setMessages((previous) => [...previous, { question: text, answer: null, at: new Date().toISOString(), pendingId }]);
    setQuestion(""); setIsAsking(true);
    try {
      const reply = await post("/api/client/chat", { question: text });
      setMessages((previous) => previous.map((item) => item.pendingId === pendingId ? { ...item, answer: reply.answer } : item));
    } catch (problem) {
      setMessages((previous) => previous.map((item) => item.pendingId === pendingId ? { ...item, answer: `I couldn’t get an answer just now: ${problem.message}` } : item));
    } finally { setIsAsking(false); }
  };

  if (error) return <main className="app-glow grid min-h-dvh place-items-center p-4"><Card className="w-full max-w-md p-6 sm:p-8"><div className="mb-5 grid size-12 place-items-center rounded-xl bg-destructive/10 text-destructive"><AlertCircle /></div><h1 className="text-xl font-semibold">Unable to open this link</h1><p className="mt-2 text-sm leading-relaxed text-muted-foreground">A private client link can be claimed by one browser. Ask your project founder for a new link if you opened it elsewhere.</p><Alert variant="destructive" className="my-5"><AlertCircle /><AlertTitle>Access notice</AlertTitle><AlertDescription>{error}</AlertDescription></Alert><Button variant="outline" className="w-full" onClick={() => location.reload()}>Retry connection</Button></Card></main>;
  if (!project) return <main className="grid min-h-dvh place-items-center p-6"><div className="w-full max-w-sm space-y-4"><Skeleton className="h-10 w-36" /><Skeleton className="h-16 w-full" /><Skeleton className="h-64 w-full" /><p className="text-center text-sm text-muted-foreground">Opening your private project space…</p></div></main>;

  const firstName = project.clientName?.trim().split(/\s+/)[0] || "there";
  return <div className="app-glow flex h-dvh min-h-[480px] flex-col bg-background md:px-5 md:py-5">
    <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col overflow-hidden border-x bg-card md:rounded-2xl md:border md:shadow-xl md:shadow-slate-900/5">
      <header className="flex items-center gap-3 border-b px-4 py-3 sm:px-6"><div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">i</div><div className="min-w-0 flex-1"><strong className="block truncate text-sm">studio iksha</strong><p className="text-xs text-muted-foreground">Private project space</p></div><Badge variant="outline" className="gap-1.5 text-muted-foreground"><LockKeyhole className="size-3" />Private</Badge></header>
      <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-4 sm:px-6"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wider text-primary">Your project</p><h1 className="mt-1 truncate text-xl font-semibold tracking-tight sm:text-2xl">{project.name}</h1></div><Badge variant="secondary" className="max-w-[40%] truncate">{project.status || "On track"}</Badge></div>
      <div className="flex min-h-0 flex-1 flex-col"><div className="flex items-center gap-3 border-b px-4 py-3 sm:px-6"><AssistantAvatar /><div className="flex-1"><p className="text-sm font-semibold">Project Assistant</p><p className="text-xs text-muted-foreground">Ask about progress, plans, and milestones</p></div><span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="size-2 rounded-full bg-emerald-500" />Online</span></div>
        <div className="chat-scroll min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6" aria-label="Project conversation" aria-live="polite">
          <Message align="start"><MessageAvatar><AssistantAvatar /></MessageAvatar><MessageContent className="max-w-[88%] sm:max-w-[75%]"><MessageHeader>Project Assistant</MessageHeader><Bubble variant="secondary"><BubbleContent>Hi {firstName}! I can share the latest updates for <strong>{project.name}</strong>. What would you like to know?</BubbleContent></Bubble></MessageContent></Message>
          {messages.map((item, index) => <React.Fragment key={item.pendingId || item.at || index}><Message align="end"><MessageAvatar><ClientAvatar name={firstName} /></MessageAvatar><MessageContent className="max-w-[88%] sm:max-w-[75%]"><MessageHeader className="justify-end">{time(item.at)} · You</MessageHeader><Bubble align="end"><BubbleContent>{item.question}</BubbleContent></Bubble><MessageFooter>Sent</MessageFooter></MessageContent></Message>{item.answer && <Message align="start"><MessageAvatar><AssistantAvatar /></MessageAvatar><MessageContent className="max-w-[88%] sm:max-w-[75%]"><MessageHeader>Project Assistant</MessageHeader><Bubble variant="secondary"><BubbleContent>{item.answer}</BubbleContent></Bubble></MessageContent></Message>}</React.Fragment>)}
          {isAsking && <Message align="start" role="status" aria-label="Project Assistant is responding"><MessageAvatar><AssistantAvatar /></MessageAvatar><MessageContent><MessageHeader>Project Assistant</MessageHeader><Bubble variant="secondary"><BubbleContent><span className="flex gap-1 py-1"><span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" /><span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" /><span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" /></span></BubbleContent></Bubble></MessageContent></Message>}
          <div ref={endRef} />
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto border-t px-4 py-3 sm:px-6">{["How is the project going?", "What phase are we in?", "What comes next?"].map((suggestion) => <Button key={suggestion} variant="outline" size="sm" className="shrink-0 rounded-full" onClick={() => ask(suggestion)} disabled={isAsking}>{suggestion}</Button>)}</div>
        <form onSubmit={(event) => { event.preventDefault(); ask(); }} className="safe-bottom flex items-end gap-2 border-t bg-card px-3 pt-3 sm:px-6"><Textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); ask(); } }} rows={1} aria-label="Ask a project question" placeholder="Ask a project question…" className="max-h-32 min-h-11 flex-1 resize-none" /><Button type="submit" size="icon-lg" aria-label="Send question" disabled={!question.trim() || isAsking} className="size-11"><ArrowUp className="size-5" /></Button></form>
      </div>
    </div>
    <p className="hidden items-center justify-center gap-1.5 pt-3 text-xs text-muted-foreground md:flex"><CheckCircle2 className="size-3.5" />Answers reflect facts recorded by your project team.</p>
  </div>;
}
