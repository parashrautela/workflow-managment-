import React, { useState, useEffect, useRef } from "react";
import { Sparkles, Send, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "./components/ui/button";
import { Card } from "./components/ui/card";
import { Badge } from "./components/ui/badge";
import { Avatar } from "./components/ui/avatar";
import { Bubble, BubbleContent } from "./components/ui/bubble";
import { Message, MessageAvatar, MessageContent, MessageFooter, MessageHeader } from "./components/ui/message";

const api = async (url, options = {}) => {
  const response = await fetch(url, { credentials: "same-origin", ...options, headers: { "content-type": "application/json", ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
};

const post = (url, data = {}) => api(url, { method: "POST", body: JSON.stringify(data) });

export default function ClientApp() {
  const token = decodeURIComponent(location.pathname.split("/")[2] || "");
  const [project, setProject] = useState(null);
  const [error, setError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputQuestion, setInputQuestion] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });

  const loadHistory = async () => {
    try {
      const data = await api("/api/client/conversation");
      if (data.messages) setMessages(data.messages);
    } catch {
      // The project chat remains usable if there is no saved history yet.
    }
  };

  useEffect(() => {
    const claimLink = async () => {
      try {
        const res = await post("/api/client/claim", { token });
        setProject(res.project);
        await loadHistory();
      } catch (err) {
        setError(err.message);
      }
    };
    claimLink();
  }, [token]);

  useEffect(() => { scrollToBottom(); }, [messages, isAsking]);

  const handleAsk = async (questionText) => {
    const question = (questionText || inputQuestion).trim();
    if (!question || isAsking) return;

    const sentAt = new Date().toISOString();
    setMessages((previous) => [...previous, { question, answer: null, at: sentAt }]);
    setInputQuestion("");
    setIsAsking(true);

    try {
      const res = await post("/api/client/chat", { question });
      setMessages((previous) => previous.map((message) => message.at === sentAt ? { ...message, answer: res.answer } : message));
    } catch (err) {
      setMessages((previous) => previous.map((message) => message.at === sentAt ? { ...message, answer: `I couldn’t get an answer just now: ${err.message}` } : message));
    } finally {
      setIsAsking(false);
    }
  };

  if (error) {
    return (
      <main className="min-h-[100dvh] grid place-items-center bg-[#f6f5f4] p-4">
        <Card className="w-full max-w-md space-y-4 rounded-2xl p-6 text-center shadow-xl sm:p-8">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-amber-600"><AlertCircle className="h-6 w-6" /></div>
          <span className="text-[10px] font-bold tracking-widest text-[#96918c] uppercase">LINK CLAIM NOTICE</span>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Unable to Open Link</h1>
          <p className="text-xs leading-relaxed text-gray-500 sm:text-sm">For privacy, each private client link can be claimed by one browser only. If you opened this link on another device or need a replacement, please contact your project founder.</p>
          <div className="rounded-lg bg-red-50 p-3 text-xs font-medium text-red-700">{error}</div>
          <Button variant="secondary" className="w-full" onClick={() => location.reload()}>Retry Connection</Button>
        </Card>
      </main>
    );
  }

  if (!project) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[#f6f5f4]">
        <div className="space-y-3 text-center"><div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-gray-300 border-t-[#0075de]" /><p className="text-sm font-medium text-gray-500">Opening your private project space…</p></div>
      </main>
    );
  }

  const firstName = project.clientName?.trim().split(/\s+/)[0] || "there";
  const askOnEnter = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleAsk();
    }
  };

  return (
    <div className="client-chat-shell mx-auto flex h-[100dvh] min-h-[520px] w-full max-w-4xl flex-col overflow-hidden bg-[#f6f5f4] px-3 sm:px-6">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#e8e6e3] sm:h-16">
        <div className="flex items-center gap-2.5 text-sm font-bold sm:text-base"><span className="grid h-8 w-8 place-items-center rounded-xl bg-[#243d2e] text-xs text-white">i</span><span>studio iksha</span></div>
        <span className="flex items-center gap-1.5 text-[9px] font-bold tracking-wider text-gray-500 uppercase sm:text-[10px]"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Private Portal</span>
      </header>

      <main className="flex min-h-0 flex-1 flex-col py-3 sm:py-5">
        <div className="mb-3 flex shrink-0 items-center justify-between gap-3 px-1 sm:mb-4">
          <div className="min-w-0"><span className="text-[9px] font-bold tracking-widest text-[#96918c] uppercase sm:text-[10px]">PROJECT SPACE</span><h1 className="mt-0.5 truncate text-xl font-bold tracking-tight text-[#161615] sm:text-2xl">{project.name}</h1></div>
          <Badge variant={project.status === "At risk" ? "trade" : "success"} className="shrink-0 gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-current" />{project.status || "On track"}</Badge>
        </div>

        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#e9e6e1] bg-white shadow-[0_12px_40px_-32px_rgba(32,39,33,0.35)]">
          <div className="flex shrink-0 items-center justify-between border-b border-[#efeeec] px-3 py-3 sm:px-5">
            <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#e9f1fb] text-[#0075de]"><Sparkles className="h-4 w-4" /></div>
              <div className="min-w-0"><strong className="block truncate text-xs font-semibold sm:text-sm">Project Assistant</strong><span className="mt-0.5 block truncate text-[9px] text-gray-400 sm:text-[10px]">Ask about milestones, status, or project plans</span></div>
            </div>
            <span className="ml-2 flex shrink-0 items-center gap-1.5 text-[9px] text-gray-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Online</span>
          </div>

          <div className="chat-transcript flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-4 sm:gap-5 sm:px-6 sm:py-6" aria-live="polite" aria-label="Project conversation">
            <Message align="start">
              <MessageAvatar><Avatar className="h-8 w-8 rounded-xl bg-[#e9f1fb] text-[#0075de]">✳</Avatar></MessageAvatar>
              <MessageContent className="max-w-[88%] sm:max-w-[80%]">
                <MessageHeader><span className="font-semibold text-[#343330]">Project Assistant</span><span>Welcome</span></MessageHeader>
                <Bubble variant="secondary"><BubbleContent className="text-xs sm:text-sm">Hi {firstName}! I can share live project updates for <strong>{project.name}</strong>. What would you like to know today?</BubbleContent></Bubble>
              </MessageContent>
            </Message>

            {messages.map((message, index) => (
              <React.Fragment key={message.at || index}>
                <Message align="end">
                  <MessageAvatar><Avatar className="h-8 w-8 rounded-full bg-[#eadfd2] text-[10px] font-semibold text-[#67513c]">{firstName.slice(0, 2).toUpperCase()}</Avatar></MessageAvatar>
                  <MessageContent className="max-w-[88%] sm:max-w-[80%]">
                    <MessageHeader className="justify-end"><span>{new Date(message.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span><span className="font-semibold text-[#343330]">You</span></MessageHeader>
                    <Bubble align="end"><BubbleContent className="text-xs sm:text-sm">{message.question}</BubbleContent></Bubble>
                    <MessageFooter className="text-right">Sent</MessageFooter>
                  </MessageContent>
                </Message>
                {message.answer && <Message align="start">
                  <MessageAvatar><Avatar className="h-8 w-8 rounded-xl bg-[#e9f1fb] text-[#0075de]">✳</Avatar></MessageAvatar>
                  <MessageContent className="max-w-[88%] sm:max-w-[80%]">
                    <MessageHeader><span className="font-semibold text-[#343330]">Project Assistant</span></MessageHeader>
                    <Bubble variant="secondary"><BubbleContent className="text-xs sm:text-sm">{message.answer}</BubbleContent></Bubble>
                  </MessageContent>
                </Message>}
              </React.Fragment>
            ))}

            {isAsking && <Message align="start" role="status" aria-label="Project Assistant is responding">
              <MessageAvatar><Avatar className="h-8 w-8 rounded-xl bg-[#e9f1fb] text-[#0075de]">✳</Avatar></MessageAvatar>
              <MessageContent><MessageHeader><span className="font-semibold text-[#343330]">Project Assistant</span></MessageHeader><Bubble variant="secondary"><BubbleContent><span className="flex items-center gap-1.5 py-1"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:0.15s]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:0.3s]" /></span></BubbleContent></Bubble></MessageContent>
            </Message>}
            <div ref={messagesEndRef} />
          </div>

          <div className="flex shrink-0 gap-2 overflow-x-auto border-t border-[#f0efed] px-3 py-2.5 no-scrollbar sm:px-5">
            {["How is the project going?", "What phase are we in?", "Recent task?"].map((question) => <button key={question} onClick={() => handleAsk(question)} disabled={isAsking} className="min-h-9 shrink-0 rounded-full border border-[#e8e5e0] bg-[#fcfbf9] px-3 text-[10px] text-[#65615c] transition hover:border-[#0075de] hover:text-[#0075de] disabled:opacity-50 sm:text-xs">{question}</button>)}
          </div>

          <form onSubmit={(event) => { event.preventDefault(); handleAsk(); }} className="flex shrink-0 items-end gap-2 border-t border-[#efeeec] bg-white px-2.5 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] sm:px-4 sm:py-3">
            <textarea value={inputQuestion} onChange={(event) => setInputQuestion(event.target.value)} onKeyDown={askOnEnter} rows={1} aria-label="Ask a project question" placeholder="Ask about progress, status, or milestones…" className="min-h-11 max-h-32 min-w-0 flex-1 resize-y rounded-xl border border-[#e7e4df] bg-[#fcfbfa] px-3.5 py-3 text-xs leading-relaxed outline-none transition focus:border-[#9bc6ed] focus:ring-4 focus:ring-[#e9f3fc] placeholder:text-gray-400 sm:text-sm" />
            <Button type="submit" size="icon" disabled={!inputQuestion.trim() || isAsking} aria-label="Send question" className="h-11 w-11 shrink-0 rounded-xl"><Send className="h-4 w-4" /></Button>
          </form>
        </Card>

        <div className="hidden shrink-0 items-center justify-center gap-1.5 pt-3 text-[10px] text-gray-400 sm:flex"><CheckCircle2 className="h-3.5 w-3.5" />Updates reflect facts recorded by your project team. Your founder can review this transcript.</div>
      </main>
    </div>
  );
}
