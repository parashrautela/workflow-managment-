import { useEffect, useRef, useState } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { ArrowUp, LockKeyhole } from "lucide-react";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Message, MessageContent, MessageHeader } from "@/components/ui/message";
import { Textarea } from "@/components/ui/textarea";

const suggestions = [
  "Summarize all ongoing projects",
  "Which projects have blockers?",
  "What milestones are next?",
  "Who is working on each project?",
];

export function FounderAssistant() {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    fetch("/api/founder/assistant", { credentials: "same-origin" }).then((response) => response.json()).then((data) => setMessages(data.messages || [])).catch(() => setError("Could not load earlier questions."));
  }, []);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages.length, busy]);

  const ask = async (event, suggestion) => {
    event?.preventDefault();
    const question = (suggestion || draft).trim();
    if (!question || busy) return;
    setDraft(""); setBusy(true); setError("");
    const pending = { id: `pending-${Date.now()}`, question, answer: null, at: new Date().toISOString() };
    setMessages((current) => [...current, pending]);
    try {
      const response = await fetch("/api/founder/assistant", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not answer right now.");
      setMessages((current) => current.map((item) => item.id === pending.id ? data.message : item));
    } catch (problem) { setMessages((current) => current.filter((item) => item.id !== pending.id)); setDraft(question); setError(problem.message); }
    finally { setBusy(false); }
  };

  return <div className="space-y-5">
    <div className="flex items-center gap-4"><span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-primary/5"><ThinkingOrb state={busy ? "working" : "breathing"} size={64} speed={busy ? 0.65 : 0.35} theme="light" color="#2166d1" aria-label={busy ? "Assistant thinking" : "Founder assistant"} /></span><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Founder workspace</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Ask Studio Iksha</h1><p className="mt-1 text-sm text-muted-foreground">Explore facts across every ongoing project.</p></div></div>
    <Card className="flex min-h-[min(72dvh,680px)] flex-col gap-0 overflow-hidden p-0">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3"><p className="text-sm font-semibold">Project assistant</p><span className="flex items-center gap-1.5 text-xs text-muted-foreground"><LockKeyhole className="size-3.5" />Founder only</span></div>
      <div ref={scrollRef} className="chat-scroll min-h-72 max-h-[55dvh] flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6" aria-label="Founder assistant conversation" aria-live="polite">
        {!messages.length && <div className="mx-auto flex max-w-sm flex-col items-center py-10 text-center"><ThinkingOrb state="breathing" size={64} speed={0.3} theme="light" color="#2166d1" aria-hidden="true" /><h2 className="mt-5 text-sm font-semibold">Your projects, one question away</h2><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Ask about progress, blockers, milestones, team assignments, or recent client questions. Answers come from the facts in this workspace.</p></div>}
        {messages.map((item) => <div key={item.id} className="space-y-3"><Message align="end"><MessageContent className="max-w-[88%] sm:max-w-[75%]"><MessageHeader className="justify-end">You</MessageHeader><Bubble align="end"><BubbleContent>{item.question}</BubbleContent></Bubble></MessageContent></Message>{item.answer && <Message align="start"><MessageContent className="max-w-[92%] sm:max-w-[82%]"><MessageHeader>Studio Iksha</MessageHeader><Bubble variant="secondary"><BubbleContent className="whitespace-pre-wrap leading-relaxed">{item.answer}</BubbleContent></Bubble></MessageContent></Message>}</div>)}
        {busy && <div className="flex items-center gap-2 text-xs text-muted-foreground"><ThinkingOrb state="working" size={20} speed={0.65} theme="light" color="#2166d1" aria-hidden="true" />Reading your project records…</div>}
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto border-t px-4 py-3">{suggestions.map((suggestion) => <Button key={suggestion} variant="outline" size="sm" className="shrink-0 rounded-full" disabled={busy} onClick={(event) => ask(event, suggestion)}>{suggestion}</Button>)}</div>
      <form onSubmit={ask} className="flex items-end gap-2 border-t p-3 sm:px-5"><Textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={1} maxLength={1000} placeholder="Ask about your projects…" aria-label="Ask the founder assistant" className="max-h-32 min-h-11 flex-1 resize-none" /><Button type="submit" size="icon-lg" className="size-11" disabled={!draft.trim() || busy} aria-label="Send question"><ArrowUp className="size-5" /></Button></form>
      {error && <p role="alert" className="px-4 pb-3 text-xs text-destructive">{error}</p>}
    </Card>
  </div>;
}
