import React, { useState, useEffect, useRef } from "react";
import { Sparkles, Send, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "./components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "./components/ui/card";
import { Badge } from "./components/ui/badge";
import { Input } from "./components/ui/input";

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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isAsking]);

  useEffect(() => {
    const claimLink = async () => {
      try {
        const res = await post("/api/client/claim", { token });
        setProject(res.project);
        loadHistory();
      } catch (err) {
        setError(err.message);
      }
    };
    claimLink();
  }, [token]);

  const loadHistory = async () => {
    try {
      const data = await api("/api/client/conversation");
      if (data.messages) {
        setMessages(data.messages);
      }
    } catch {
      // Graceful fallback
    }
  };

  const handleAsk = async (questionText) => {
    const q = questionText || inputQuestion;
    if (!q.trim() || isAsking) return;

    const newMsg = { question: q, answer: null, at: new Date().toISOString() };
    setMessages((prev) => [...prev, newMsg]);
    setInputQuestion("");
    setIsAsking(true);

    try {
      const res = await post("/api/client/chat", { question: q });
      setMessages((prev) => 
        prev.map((m, idx) => idx === prev.length - 1 ? { ...m, answer: res.answer } : m)
      );
    } catch (err) {
      setMessages((prev) => 
        prev.map((m, idx) => idx === prev.length - 1 ? { ...m, answer: `Error: ${err.message}` } : m)
      );
    } finally {
      setIsAsking(false);
    }
  };

  if (error) {
    return (
      <main className="min-h-screen grid place-items-center bg-[#f6f5f4] p-4">
        <Card className="w-full max-w-md p-6 sm:p-8 rounded-2xl shadow-xl text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 grid place-items-center mx-auto text-xl font-bold">
            <AlertCircle className="h-6 w-6" />
          </div>
          <span className="text-[10px] font-bold tracking-widest text-[#96918c] uppercase">LINK CLAIM NOTICE</span>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Unable to Open Link</h1>
          <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">
            For privacy, each private client link can be claimed by one browser only. If you opened this link on another device or need a replacement, please contact your project founder.
          </p>
          <div className="p-3 bg-red-50 text-red-700 rounded-lg text-xs font-medium">
            {error}
          </div>
          <Button variant="secondary" className="w-full" onClick={() => location.reload()}>
            Retry Connection
          </Button>
        </Card>
      </main>
    );
  }

  if (!project) {
    return (
      <main className="min-h-screen grid place-items-center bg-[#f6f5f4]">
        <div className="text-center space-y-3">
          <div className="w-7 h-7 border-2 border-gray-300 border-t-[#0075de] rounded-full animate-spin mx-auto" />
          <p className="text-sm font-medium text-gray-500">Opening your private project space…</p>
        </div>
      </main>
    );
  }

  const firstName = project.clientName?.trim().split(/\s+/)[0] || "there";

  return (
    <div className="min-h-screen flex flex-col bg-[#f6f5f4] max-w-2xl mx-auto px-4 sm:px-6">
      <header className="h-16 flex items-center justify-between border-b border-[#e8e6e3] shrink-0">
        <div className="flex items-center gap-2.5 font-bold text-base">
          <span className="grid place-items-center w-7 h-7 rounded-lg bg-black text-white font-bold text-xs">i</span>
          <span>studio iksha</span>
        </div>
        <span className="text-[10px] font-bold text-gray-500 tracking-wider flex items-center gap-1.5 uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Private Portal
        </span>
      </header>

      <main className="flex-1 py-6 space-y-5">
        <div>
          <span className="text-[10px] font-bold tracking-widest text-[#96918c] uppercase">PROJECT SPACE</span>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#161615] mt-0.5">Hello, {firstName}.</h1>
          <p className="text-xs sm:text-sm text-[#797570]">Stay up to date with real-time facts for <strong>{project.name}</strong>.</p>
        </div>

        {/* Project Snapshot */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-wider text-[#96918c] uppercase">PROJECT SNAPSHOT</span>
            <Badge variant={project.status === "At risk" ? "trade" : "success"} className="gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {project.status || "On track"}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-3 border-t border-[#efeeec]">
            <div>
              <span className="text-[10px] font-bold tracking-wider text-[#96918c] uppercase block">CURRENT PHASE</span>
              <strong className="text-sm font-semibold block mt-0.5">{project.phase || "Design"}</strong>
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-wider text-[#96918c] uppercase block">RECENT TASK</span>
              <strong className="text-sm font-semibold block mt-0.5">{project.recentTask || "Work in progress"}</strong>
            </div>
          </div>

          {project.nextMilestone && (
            <div className="pt-3 border-t border-[#efeeec]">
              <span className="text-[10px] font-bold tracking-wider text-[#96918c] uppercase block">NEXT MILESTONE</span>
              <strong className="text-sm font-semibold text-gray-800 block mt-0.5">{project.nextMilestone}</strong>
            </div>
          )}

          {project.blocker && (
            <div className="p-3 bg-[#fdf3ec] border border-[#f6cfb0] rounded-lg">
              <span className="text-[10px] font-bold tracking-wider text-[#dd5b00] uppercase block">CURRENT BLOCKER</span>
              <strong className="text-xs font-semibold text-[#8a3600] block mt-0.5">{project.blocker}</strong>
            </div>
          )}
        </Card>

        {/* Chat Assistant */}
        <Card className="overflow-hidden flex flex-col">
          <div className="p-4 border-b border-[#efeeec] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#0075de] grid place-items-center">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <strong className="text-xs sm:text-sm font-semibold block">Project Assistant</strong>
                <span className="text-[10px] text-gray-400">Ask anything about milestones, status, or phase</span>
              </div>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-500" title="Online" />
          </div>

          {/* Messages Feed */}
          <div className="p-4 space-y-3.5 h-64 overflow-y-auto">
            <div className="flex items-start gap-2 max-w-[88%]">
              <div className="w-6 h-6 rounded-md bg-blue-50 text-[#0075de] grid place-items-center text-xs shrink-0 mt-0.5">✳</div>
              <div className="p-3 bg-[#f2f1ee] rounded-2xl rounded-tl-sm text-xs sm:text-sm leading-relaxed text-gray-800">
                Hi {firstName}! I can share live project updates for <strong>{project.name}</strong>. What would you like to know today?
              </div>
            </div>

            {messages.map((m, idx) => (
              <React.Fragment key={idx}>
                <div className="flex justify-end">
                  <div className="p-3 bg-[#0075de] text-white rounded-2xl rounded-tr-sm text-xs sm:text-sm max-w-[88%] leading-relaxed shadow-sm">
                    {m.question}
                  </div>
                </div>
                {m.answer && (
                  <div className="flex items-start gap-2 max-w-[88%]">
                    <div className="w-6 h-6 rounded-md bg-blue-50 text-[#0075de] grid place-items-center text-xs shrink-0 mt-0.5">✳</div>
                    <div className="p-3 bg-[#f2f1ee] rounded-2xl rounded-tl-sm text-xs sm:text-sm leading-relaxed text-gray-800">
                      {m.answer}
                    </div>
                  </div>
                )}
              </React.Fragment>
            ))}

            {isAsking && (
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-md bg-blue-50 text-[#0075de] grid place-items-center text-xs shrink-0">✳</div>
                <div className="p-3 bg-[#f2f1ee] rounded-2xl text-xs flex gap-1.5 items-center">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Prompt Chips */}
          <div className="px-4 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
            <button
              onClick={() => handleAsk("How is the project going?")}
              className="px-3 py-1.5 rounded-full bg-white border border-gray-200 text-xs text-gray-600 whitespace-nowrap hover:border-[#0075de] hover:text-[#0075de] transition-colors"
            >
              How is the project going?
            </button>
            <button
              onClick={() => handleAsk("What phase are we currently in?")}
              className="px-3 py-1.5 rounded-full bg-white border border-gray-200 text-xs text-gray-600 whitespace-nowrap hover:border-[#0075de] hover:text-[#0075de] transition-colors"
            >
              What phase are we in?
            </button>
            <button
              onClick={() => handleAsk("What was the recent task?")}
              className="px-3 py-1.5 rounded-full bg-white border border-gray-200 text-xs text-gray-600 whitespace-nowrap hover:border-[#0075de] hover:text-[#0075de] transition-colors"
            >
              Recent task?
            </button>
          </div>

          {/* Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAsk();
            }}
            className="p-3 border-t border-[#efeeec] flex items-center gap-2 bg-white"
          >
            <Input
              value={inputQuestion}
              onChange={(e) => setInputQuestion(e.target.value)}
              placeholder="Ask about progress, status, or milestones…"
              className="h-10 text-xs sm:text-sm rounded-full bg-transparent"
            />
            <Button type="submit" size="icon" disabled={!inputQuestion.trim() || isAsking} className="rounded-full shrink-0">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </Card>

        <p className="text-[10px] text-center text-gray-400">
          Updates reflect facts recorded by your project team. The founder can review this transcript.
        </p>
      </main>
    </div>
  );
}
