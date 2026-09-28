import { useEffect, useRef, useState } from "react";
import { ArrowUp, MessageSquare } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Message, MessageAvatar, MessageContent, MessageHeader } from "@/components/ui/message";
import { Textarea } from "@/components/ui/textarea";

export function TeamChat({ endpoint, currentActor }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    let active = true;
    setMessages([]);
    const refresh = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const response = await fetch(endpoint, { credentials: "same-origin" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load team chat.");
        if (active) { setMessages(data.messages || []); setError(""); }
      } catch (problem) { if (active) setError(problem.message); }
    };
    refresh();
    const timer = setInterval(refresh, 6000);
    return () => { active = false; clearInterval(timer); };
  }, [endpoint]);

  useEffect(() => {
    const container = scrollRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages.length]);

  const send = async (event) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || sending) return;
    setSending(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ message }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not send message.");
      setMessages((current) => current.some((item) => item.id === data.message.id) ? current : [...current, data.message]);
      setDraft("");
    } catch (problem) { setError(problem.message); }
    finally { setSending(false); }
  };

  return <Card className="flex min-h-[420px] gap-0 overflow-hidden p-0">
    <div className="flex items-center gap-3 border-b px-4 py-3"><span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary"><MessageSquare className="size-4" /></span><div><h2 className="text-sm font-semibold">Project team chat</h2><p className="text-xs text-muted-foreground">Founder and assigned employees</p></div></div>
    <div ref={scrollRef} className="chat-scroll min-h-64 max-h-[50dvh] flex-1 space-y-4 overflow-y-auto px-4 py-5" aria-label="Project team messages" aria-live="polite">
      {messages.length ? messages.map((item) => {
        const own = item.senderId === currentActor;
        return <Message key={item.id} align={own ? "end" : "start"}>
          <MessageAvatar><Avatar><AvatarFallback className="bg-secondary text-xs font-semibold text-secondary-foreground">{item.senderName?.slice(0, 2).toUpperCase() || "TM"}</AvatarFallback></Avatar></MessageAvatar>
          <MessageContent className="max-w-[88%] sm:max-w-[75%]"><MessageHeader className={own ? "justify-end" : ""}>{own ? "You" : item.senderName} · {new Date(item.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</MessageHeader><Bubble align={own ? "end" : "start"} variant={own ? undefined : "secondary"}><BubbleContent className="whitespace-pre-wrap">{item.text}</BubbleContent></Bubble></MessageContent>
        </Message>;
      }) : <div className="flex h-56 flex-col items-center justify-center text-center"><MessageSquare className="mb-3 size-8 text-muted-foreground/50" /><p className="text-sm font-medium">Start the team conversation</p><p className="mt-1 max-w-xs text-xs text-muted-foreground">Updates and questions shared here stay with this project team.</p></div>}
    </div>
    <form onSubmit={send} className="flex items-end gap-2 border-t p-3"><Textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={1} maxLength={2000} placeholder="Message your team…" aria-label="Message your team" className="max-h-28 min-h-11 flex-1 resize-none" /><Button type="submit" size="icon-lg" aria-label="Send team message" disabled={!draft.trim() || sending} className="size-11"><ArrowUp className="size-5" /></Button></form>
    {error && <p role="alert" className="px-4 pb-3 text-xs text-destructive">{error}</p>}
  </Card>;
}
