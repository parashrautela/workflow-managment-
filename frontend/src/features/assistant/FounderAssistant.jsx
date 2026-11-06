import { useEffect, useRef, useState } from 'react';
import { ThinkingOrb } from 'thinking-orbs';
import { AlertCircle, ArrowUp, Flag, FolderOpen, ListChecks, Sparkles, Users } from 'lucide-react';
import './assistant.css';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Button } from '@/components/ui/button';
import { StatusChip } from '@/components/ui/status-chip';
import { Textarea } from '@/components/ui/textarea';
import { Time } from '@/components/ui/time';
import { parseAnswer, statusTone } from '@/features/assistant/lib/answer';

const suggestions = [
  { text: 'Summarize all ongoing projects', icon: ListChecks },
  { text: 'Which projects have blockers?', icon: AlertCircle },
  { text: 'What milestones are next?', icon: Flag },
  { text: 'Who is working on each project?', icon: Users },
];

function AnswerItem({ item }) {
  if (item.kind === 'field')
    return (
      <div className="assistant-field">
        <span className="assistant-field-label">{item.label}</span>
        <span className={item.empty ? 'text-muted-foreground' : undefined}>{item.value}</span>
      </div>
    );
  if (item.kind === 'pair')
    return (
      <div className="assistant-pair">
        <span>{item.primary}</span>
        <span className="text-muted-foreground">{item.secondary}</span>
      </div>
    );
  if (item.kind === 'bullet')
    return (
      <p className={item.empty ? 'assistant-row text-muted-foreground' : 'assistant-row'}>
        {item.text}
      </p>
    );
  return (
    <p className="assistant-row">
      {item.lines.map((line, index) => (
        <span key={index} className={index ? 'block text-muted-foreground' : 'block'}>
          {line}
        </span>
      ))}
    </p>
  );
}

// A project heading with its folder colour, the same mark the Actions list uses.
function GroupTitle({ index, name, count }) {
  return (
    <h3 className="assistant-group-title">
      <span className={`assistant-group-icon iksha-stage color-${index % 8}`} aria-hidden="true">
        <FolderOpen />
      </span>
      <span className="min-w-0 truncate">{name}</span>
      {count != null && <span className="assistant-group-count">{count}</span>}
    </h3>
  );
}

// Answers read as a short report: a title and one line of context, then one card per project.
function Answer({ answer }) {
  const { title, intro, sections, tasks } = parseAnswer(answer);
  const projects = new Map();
  for (const task of tasks)
    projects.set(task.project, [...(projects.get(task.project) || []), task]);
  const overdue = tasks.filter((task) => statusTone(task.status) === 'overdue').length;
  const waiting = tasks.filter((task) => /approval/i.test(task.status)).length;
  return (
    <div className="assistant-report">
      {(title || tasks.length > 0) && (
        <header className="assistant-report-head">
          <h2 className="type-heading-20">
            {title ||
              `${tasks.length} pending ${tasks.length === 1 ? 'task' : 'tasks'} across ${projects.size} ${projects.size === 1 ? 'project' : 'projects'}`}
          </h2>
          {tasks.length > 0 && (overdue > 0 || waiting > 0) && (
            <p className="text-sm text-muted-foreground">
              {[overdue && `${overdue} overdue`, waiting && `${waiting} awaiting approval`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          {intro.map((item, index) =>
            item.kind === 'text' ? (
              <p key={index} className="text-sm text-muted-foreground">
                {item.lines.join(' ')}
              </p>
            ) : null,
          )}
        </header>
      )}
      {!title &&
        !tasks.length &&
        intro.map((item, index) => <AnswerItem key={index} item={item} />)}
      {title && intro.some((item) => item.kind !== 'text') && (
        <div className="assistant-card">
          {intro
            .filter((item) => item.kind !== 'text')
            .map((item, index) => (
              <AnswerItem key={index} item={item} />
            ))}
        </div>
      )}
      {[...projects].map(([project, rows], index) => (
        <section key={project} className="assistant-group">
          <GroupTitle index={index} name={project} count={rows.length} />
          <div className="assistant-card">
            {rows.map((task, row) => (
              <div key={row} className="assistant-task">
                <div className="min-w-0">
                  <p className="assistant-task-title">{task.title}</p>
                  <p className="assistant-task-meta">{task.stage || 'General'}</p>
                </div>
                <StatusChip tone={statusTone(task.status)}>{task.status}</StatusChip>
              </div>
            ))}
          </div>
        </section>
      ))}
      {sections.map((section, index) => (
        <section key={index} className="assistant-group">
          <GroupTitle index={index} name={section.heading} />
          {section.items.length > 0 && (
            <div className="assistant-card">
              {section.items.map((item, row) => (
                <AnswerItem key={row} item={item} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

// One centred column inside the page sheet. Before the first question the page is the question box;
// after it, the conversation reads top to bottom with the box docked underneath.
export function FounderAssistant() {
  const [messages, setMessages] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    fetch('/api/founder/assistant', { credentials: 'same-origin' })
      .then((response) => response.json())
      .then((data) => setMessages(data.messages || []))
      .catch(() => setError('Could not load earlier questions.'))
      // Nothing shows until history arrives, so the empty screen never flashes before it.
      .finally(() => setLoaded(true));
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

  const composer = (
    <form onSubmit={ask} className="assistant-composer">
      <Textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        // Enter asks; Shift+Enter starts a new line.
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing)
            ask(event);
        }}
        rows={1}
        maxLength={1000}
        placeholder="Ask about your projects…"
        aria-label="Ask the founder assistant"
      />
      <Button
        type="submit"
        size="icon-sm"
        disabled={!draft.trim() || busy}
        aria-label="Send question"
      >
        <ArrowUp />
      </Button>
    </form>
  );
  const errorLine = error && (
    <p role="alert" className="text-xs text-destructive">
      {error}
    </p>
  );

  return (
    <div className="assistant">
      <header className="assistant-header">
        <h1>Assistant</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ask about your projects. Answers come from saved project facts, and only founders can see
          them.
        </p>
      </header>

      {!loaded ? null : !messages.length ? (
        <section className="assistant-start" aria-label="Ask the assistant">
          <ThinkingOrb
            state="breathing"
            size={32}
            speed={0.3}
            theme="light"
            color="#2b2a36"
            aria-hidden="true"
          />
          <h2 className="type-heading-24">What do you want to know?</h2>
          <p className="text-sm text-muted-foreground">
            Progress, blockers, milestones, team assignments or recent client questions.
          </p>
          {composer}
          {errorLine}
          <div className="assistant-suggestions">
            {suggestions.map(({ text, icon: Icon }) => (
              <button
                key={text}
                type="button"
                className="assistant-suggestion"
                disabled={busy}
                onClick={(event) => ask(event, text)}
              >
                <Icon aria-hidden="true" />
                <span>{text}</span>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <>
          <div
            ref={scrollRef}
            className="assistant-thread chat-scroll"
            aria-label="Founder assistant conversation"
            aria-live="polite"
          >
            <div className="assistant-column assistant-turns">
              {messages.map((item) => (
                <article key={item.id} className="assistant-turn">
                  <Bubble variant="secondary" align="end">
                    <BubbleContent className="type-copy-14">{item.question}</BubbleContent>
                  </Bubble>
                  {item.answer && (
                    <div className="assistant-answer">
                      <p className="assistant-answer-label">
                        <Sparkles aria-hidden="true" />
                        Studio Iksha
                        {item.at && <Time value={item.at} />}
                      </p>
                      <Answer answer={item.answer} />
                    </div>
                  )}
                </article>
              ))}
              {busy && (
                <p role="status" className="assistant-working">
                  <ThinkingOrb
                    state="working"
                    size={20}
                    speed={0.65}
                    theme="light"
                    color="#2b2a36"
                    aria-hidden="true"
                  />
                  Reading your project records…
                </p>
              )}
            </div>
          </div>
          <div className="assistant-dock safe-bottom">
            <div className="assistant-column">
              <div className="assistant-chips no-scrollbar">
                {suggestions.map(({ text }) => (
                  <Button
                    key={text}
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    disabled={busy}
                    onClick={(event) => ask(event, text)}
                  >
                    {text}
                  </Button>
                ))}
              </div>
              {composer}
              {errorLine}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
