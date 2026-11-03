import { useEffect, useRef, useState } from 'react';
import { ThinkingOrb } from 'thinking-orbs';
import { ArrowUp, LockKeyhole } from 'lucide-react';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Button } from '@/components/ui/button';
import { Message, MessageContent, MessageHeader } from '@/components/ui/message';
import { Textarea } from '@/components/ui/textarea';

const suggestions = [
  'Summarize all ongoing projects',
  'Which projects have blockers?',
  'What milestones are next?',
  'Who is working on each project?',
];

function FormattedAnswer({ answer }) {
  const blocks = [];
  for (const rawLine of String(answer || '').split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('# ')) blocks.push({ type: 'title', text: line.slice(2) });
    else if (line.startsWith('## ')) blocks.push({ type: 'heading', text: line.slice(3) });
    else if (line.startsWith('- ')) {
      const previous = blocks.at(-1);
      if (previous?.type === 'list') previous.items.push(line.slice(2));
      else blocks.push({ type: 'list', items: [line.slice(2)] });
    } else blocks.push({ type: 'paragraph', text: line });
  }
  return (
    <div className="space-y-3">
      {blocks.map((block, index) =>
        block.type === 'title' ? (
          <h2 key={index} className="type-label-14-strong text-foreground">
            {block.text}
          </h2>
        ) : block.type === 'heading' ? (
          <h3
            key={index}
            className="border-t border-border/70 pt-2 text-sm font-semibold text-foreground first:border-0 first:pt-0"
          >
            {block.text}
          </h3>
        ) : block.type === 'list' ? (
          <ul key={index} className="space-y-2 pl-4 text-sm marker:text-primary">
            {block.items.map((item, itemIndex) => {
              const colon = item.indexOf(':');
              return (
                <li key={itemIndex} className="list-disc pl-1">
                  {colon > 0 && colon < 24 ? (
                    <>
                      <strong className="font-semibold">{item.slice(0, colon + 1)}</strong>
                      {item.slice(colon + 1)}
                    </>
                  ) : (
                    item
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p key={index} className="text-sm text-muted-foreground">
            {block.text}
          </p>
        ),
      )}
    </div>
  );
}

export function FounderAssistant() {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    fetch('/api/founder/assistant', { credentials: 'same-origin' })
      .then((response) => response.json())
      .then((data) => setMessages(data.messages || []))
      .catch(() => setError('Could not load earlier questions.'));
  }, []);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, busy]);

  const ask = async (event, suggestion) => {
    event?.preventDefault();
    const question = (suggestion || draft).trim();
    if (!question || busy) return;
    setDraft('');
    setBusy(true);
    setError('');
    const pending = {
      id: `pending-${Date.now()}`,
      question,
      answer: null,
      at: new Date().toISOString(),
    };
    setMessages((current) => [...current, pending]);
    try {
      const response = await fetch('/api/founder/assistant', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not answer right now.');
      setMessages((current) =>
        current.map((item) => (item.id === pending.id ? data.message : item)),
      );
    } catch (problem) {
      setMessages((current) => current.filter((item) => item.id !== pending.id));
      setDraft(question);
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header className="hidden shrink-0 border-b bg-card sm:block">
        <div className="mx-auto flex min-h-16 max-w-4xl items-center gap-3 px-3 py-2 sm:px-6">
          <div className="hidden shrink-0 sm:block">
            <ThinkingOrb
              state={busy ? 'working' : 'breathing'}
              size={32}
              speed={busy ? 0.6 : 0.3}
              theme="light"
              color="#315e4c"
              aria-hidden="true"
            />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate">Assistant</h1>
            <p className="truncate text-xs text-muted-foreground">
              Ask Studio Iksha about your projects
            </p>
          </div>
          <LockKeyhole className="size-4 text-muted-foreground" aria-label="Founder only" />
        </div>
      </header>
      <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col bg-card md:border-x">
        <div
          ref={scrollRef}
          className="chat-scroll min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4 sm:px-6"
          aria-label="Founder assistant conversation"
          aria-live="polite"
        >
          {!messages.length && (
            <div className="mx-auto flex max-w-sm flex-col items-center py-8 text-center">
              <ThinkingOrb
                state="breathing"
                size={64}
                speed={0.3}
                theme="light"
                color="#315e4c"
                aria-hidden="true"
              />
              <h2 className="mt-6 type-label-14-strong">Your projects, one question away</h2>
              <p className="mt-2 text-xs leading-copy text-muted-foreground">
                Ask about progress, blockers, milestones, team assignments, or recent client
                questions. Answers come from saved project facts.
              </p>
            </div>
          )}
          {messages.map((item) => (
            <div key={item.id} className="space-y-3">
              <Message align="end">
                <MessageContent className="max-w-[88%] sm:max-w-[75%]">
                  <MessageHeader className="justify-end">You</MessageHeader>
                  <Bubble align="end">
                    <BubbleContent>{item.question}</BubbleContent>
                  </Bubble>
                </MessageContent>
              </Message>
              {item.answer && (
                <Message align="start">
                  <MessageContent className="max-w-[92%] sm:max-w-[82%]">
                    <MessageHeader>Studio Iksha</MessageHeader>
                    <Bubble variant="secondary" className="max-w-full">
                      <BubbleContent className="w-full p-4">
                        <FormattedAnswer answer={item.answer} />
                      </BubbleContent>
                    </Bubble>
                  </MessageContent>
                </Message>
              )}
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ThinkingOrb
                state="working"
                size={20}
                speed={0.65}
                theme="light"
                color="#315e4c"
                aria-hidden="true"
              />
              Reading your project records…
            </div>
          )}
        </div>
        <div className="safe-bottom shrink-0 border-t bg-card">
          <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto px-4 py-3 sm:px-6">
            {suggestions.map((suggestion) => (
              <Button
                key={suggestion}
                variant="outline"
                size="sm"
                className="h-auto min-h-8 max-w-full whitespace-normal py-1 text-left"
                disabled={busy}
                onClick={(event) => ask(event, suggestion)}
              >
                {suggestion}
              </Button>
            ))}
          </div>
          <form onSubmit={ask} className="flex items-end gap-2 border-t px-3 pt-3 sm:px-4">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={1}
              maxLength={1000}
              placeholder="Ask about your projects…"
              aria-label="Ask the founder assistant"
              className="max-h-32 min-h-11 flex-1 resize-none"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!draft.trim() || busy}
              aria-label="Send question"
            >
              <ArrowUp className="size-5" />
            </Button>
          </form>
          {error && (
            <p role="alert" className="px-4 pt-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
