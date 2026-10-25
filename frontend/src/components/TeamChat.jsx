import { useEffect, useId, useRef, useState } from "react";
import { ArrowUp, MessageSquare } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Message, MessageAvatar, MessageContent, MessageHeader } from "@/components/ui/message";
import { Textarea } from "@/components/ui/textarea";
import { insertMention, mentionAt, mentionCandidates, projectChatMembers } from "@/lib/chatMentions";

export function TeamChat({ endpoint, currentActor, members = [] }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();
  const [mention, setMention] = useState(null);
  const [activeOption, setActiveOption] = useState(0);
  const team = projectChatMembers(members);
  const candidates = mention ? mentionCandidates(team, mention.query) : [];
  const optionIndex = Math.min(activeOption, Math.max(0, candidates.length - 1));

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [optionIndex, mention?.query]);

  const updateMention = (input) => {
    setMention(input.selectionStart === input.selectionEnd ? mentionAt(input.value, input.selectionStart) : null);
    setActiveOption(0);
  };
  const chooseMention = (member) => {
    const next = insertMention(draft, mention, member.name.trim());
    if (next.text.length > 2000) { setError("This mention would exceed the 2,000 character limit."); return; }
    setDraft(next.text); setMention(null); setError("");
    requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(next.cursor, next.cursor); });
  };
  const handleKeyDown = (event) => {
    if (!mention || event.nativeEvent.isComposing) return;
    if (event.key === "Escape") { event.preventDefault(); setMention(null); }
    else if (candidates.length && ["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      setActiveOption((optionIndex + (event.key === "ArrowDown" ? 1 : -1) + candidates.length) % candidates.length);
    } else if (candidates.length && ["Enter", "Tab"].includes(event.key)) {
      event.preventDefault(); chooseMention(candidates[optionIndex]);
    }
  };

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
      setMention(null);
    } catch (problem) { setError(problem.message); }
    finally { setSending(false); }
  };

  return <Card className="flex min-h-[420px] gap-0 overflow-hidden p-0">
    <div className="flex items-start gap-3 border-b px-4 py-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><MessageSquare className="size-4" /></span><div className="min-w-0"><h2 className="text-sm font-semibold">Project team chat</h2><p className="text-xs text-muted-foreground">Founder · {team.length ? `${team.length} assigned ${team.length === 1 ? "employee" : "employees"}` : "No employees assigned yet"}</p>
      {team.length > 0 && <ul aria-label="Assigned project employees" className="mt-2 flex flex-wrap gap-2">{team.map((member) => <li key={member.employeeId} className="max-w-full break-words rounded-lg bg-secondary px-2 py-1 text-xs"><span className="font-medium">{member.name}</span><span className="text-muted-foreground"> · {member.role || member.designation || "Team member"}</span></li>)}</ul>}
    </div></div>
    <div ref={scrollRef} className="chat-scroll min-h-64 max-h-[50dvh] flex-1 space-y-4 overflow-y-auto px-4 py-5" aria-label="Project team messages" aria-live="polite">
      {messages.length ? messages.map((item) => {
        const own = item.senderId === currentActor;
        return <Message key={item.id} align={own ? "end" : "start"}>
          <MessageAvatar><Avatar><AvatarFallback className="bg-secondary text-xs font-semibold text-secondary-foreground">{item.senderName?.slice(0, 2).toUpperCase() || "TM"}</AvatarFallback></Avatar></MessageAvatar>
          <MessageContent className="max-w-[88%] sm:max-w-[75%]"><MessageHeader className={own ? "justify-end" : ""}>{own ? "You" : item.senderName} · {new Date(item.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</MessageHeader><Bubble align={own ? "end" : "start"} variant={own ? undefined : "secondary"}><BubbleContent className="whitespace-pre-wrap">{item.text}</BubbleContent></Bubble></MessageContent>
        </Message>;
      }) : <div className="flex h-56 flex-col items-center justify-center text-center"><MessageSquare className="mb-3 size-8 text-muted-foreground/50" /><p className="text-sm font-medium">Start the team conversation</p><p className="mt-1 max-w-xs text-xs text-muted-foreground">Updates and questions shared here stay with this project team.</p></div>}
    </div>
    <form onSubmit={send} className="flex items-end gap-2 border-t p-3"><div className="relative min-w-0 flex-1">
      {mention && <div className="absolute bottom-full z-20 mb-2 w-full rounded-xl border bg-popover p-1 text-popover-foreground shadow-md"><p className="px-2 py-1 text-xs text-muted-foreground">Mention a project team member</p><ul ref={listRef} id={listId} role="listbox" aria-label="Project team members" className="max-h-48 overflow-y-auto">{candidates.map((member, index) => <li key={member.employeeId} role="presentation"><button id={`${listId}-${index}`} type="button" role="option" aria-selected={index === optionIndex} tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseMention(member)} className={`w-full break-words rounded-lg px-2 py-2 text-left text-sm ${index === optionIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent"}`}><span className="block font-medium">{member.name}</span><span className="block text-xs text-muted-foreground">{member.role || member.designation || "Team member"} · {member.employeeId}</span></button></li>)}</ul>{!candidates.length && <p role="status" className="px-2 py-3 text-xs text-muted-foreground">{team.length ? "No matching project team members." : "No employees assigned to this project yet."}</p>}</div>}
      <Textarea ref={inputRef} value={draft} onChange={(event) => { setDraft(event.target.value); updateMention(event.target); }} onClick={(event) => updateMention(event.target)} onKeyUp={(event) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) updateMention(event.target); }} onKeyDown={handleKeyDown} onBlur={() => setMention(null)} rows={1} maxLength={2000} placeholder="Message your team… Type @ to mention" aria-label="Message your team" role="combobox" aria-autocomplete="list" aria-expanded={Boolean(mention)} aria-controls={mention ? listId : undefined} aria-activedescendant={mention && candidates.length ? `${listId}-${optionIndex}` : undefined} className="max-h-28 min-h-11 resize-none" />
    </div><Button type="submit" size="icon-lg" aria-label="Send team message" disabled={!draft.trim() || sending} className="size-11"><ArrowUp className="size-5" /></Button></form>
    {error && <p role="alert" className="px-4 pb-3 text-xs text-destructive">{error}</p>}
  </Card>;
}
