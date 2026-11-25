import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUp, MessageSquare } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Message, MessageAvatar, MessageContent, MessageHeader } from '@/components/ui/message';
import { Textarea } from '@/components/ui/textarea';
import {
  insertMention,
  mentionAt,
  mentionCandidates,
  projectChatMembers,
  mentionsUser,
  formatMessageMentions,
} from '@/features/collaboration/lib/chatMentions';
import { Time } from '@/components/ui/time';
import { Empty } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';

export function TeamChat({
  endpoint,
  currentActor,
  members = [],
  fullHeight = false,
  headerTitle = null,
  headerActions = null,
}) {
  const [messages, setMessages] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();
  const [mention, setMention] = useState(null);
  const [activeOption, setActiveOption] = useState(0);
  const team = projectChatMembers(members);
  const memberNames = team.map((m) => m.name);
  const currentMember = team.find((m) => m.employeeId === currentActor);
  const currentUserName = currentMember ? currentMember.name : currentActor === 'founder' ? 'Founder' : '';
  const candidates = mention ? mentionCandidates(team, mention.query) : [];
  const optionIndex = Math.min(activeOption, Math.max(0, candidates.length - 1));

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [optionIndex, mention?.query]);

  const updateMention = (input) => {
    setMention(
      input.selectionStart === input.selectionEnd
        ? mentionAt(input.value, input.selectionStart)
        : null,
    );
    setActiveOption(0);
  };
  const chooseMention = (member) => {
    const next = insertMention(draft, mention, member.name.trim());
    if (next.text.length > 2000) {
      setError('This mention would exceed the 2,000 character limit.');
      return;
    }
    setDraft(next.text);
    setMention(null);
    setError('');
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(next.cursor, next.cursor);
    });
  };
  const handleKeyDown = (event) => {
    if (event.nativeEvent.isComposing) return;
    if (!mention) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (draft.trim() && !sending) send(event);
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setMention(null);
    } else if (candidates.length && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      setActiveOption(
        (optionIndex + (event.key === 'ArrowDown' ? 1 : -1) + candidates.length) %
          candidates.length,
      );
    } else if (candidates.length && ['Enter', 'Tab'].includes(event.key)) {
      event.preventDefault();
      chooseMention(candidates[optionIndex]);
    }
  };

  useEffect(() => {
    let active = true;
    setLoaded(false);
    const refresh = async () => {
      try {
        const response = await fetch(endpoint, { credentials: 'same-origin' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load team chat.');
        if (active) {
          setMessages(data.messages || []);
          setLoaded(true);
          setError('');
        }
      } catch (problem) {
        if (active) setError(problem.message);
      }
    };
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 6000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [endpoint]);

  useEffect(() => {
    const container = scrollRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages.length]);

  const send = async (event) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || sending) return;
    setSending(true);
    setError('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not send message.');
      setMessages((current) =>
        current.some((item) => item.id === data.message.id) ? current : [...current, data.message],
      );
      setDraft('');
      setMention(null);
    } catch (problem) {
      setError(problem.message);
    } finally {
      setSending(false);
    }
  };

  const Wrapper = fullHeight ? 'div' : Card;
  const wrapperClass = fullHeight
    ? 'flex h-full min-h-0 flex-col bg-card lg:rounded-b-xl'
    : 'flex min-h-[420px] gap-0 overflow-hidden p-0';

  return (
    <Wrapper className={wrapperClass}>
      <div
        className={`flex shrink-0 items-center justify-between gap-3 border-b ${
          fullHeight ? 'px-4 py-3 sm:px-8' : 'px-4 py-3'
        }`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {!headerTitle && (
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <MessageSquare className="size-4" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            {headerTitle ? (
              <div className="-ml-2 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                {headerTitle}
                <span className="px-2 text-xs text-muted-foreground sm:px-0">
                  Founder ·{' '}
                  {team.length
                    ? `${team.length} ${team.length === 1 ? 'member' : 'members'}`
                    : 'No employees assigned yet'}
                </span>
              </div>
            ) : (
              <>
                <h2 className="type-label-14-strong">Project team chat</h2>
                <p className="text-xs text-muted-foreground">
                  Founder ·{' '}
                  {team.length
                    ? `${team.length} assigned ${team.length === 1 ? 'employee' : 'employees'}`
                    : 'No employees assigned yet'}
                </p>
              </>
            )}
            {team.length > 0 && (
              <ul
                aria-label="Assigned project employees"
                className="no-scrollbar mt-1.5 flex flex-nowrap gap-1.5 overflow-x-auto sm:flex-wrap sm:overflow-visible"
              >
                {team.map((member) => (
                  <li
                    key={member.employeeId}
                    className="max-w-full shrink-0 whitespace-nowrap rounded-lg bg-secondary px-2 py-0.5 text-xs sm:shrink sm:whitespace-normal sm:break-words"
                  >
                    <span className="font-medium">{member.name}</span>
                    <span className="text-muted-foreground">
                      {' '}
                      · {member.role || member.designation || 'Team member'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {headerActions}
      </div>
      <div
        ref={scrollRef}
        className={`chat-scroll min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] ${
          fullHeight ? 'px-4 py-4 sm:px-8 sm:py-6' : 'min-h-64 max-h-[50dvh] px-4 py-4'
        }`}
        aria-label="Project team messages"
        aria-live="polite"
      >
        {!loaded ? (
          <div className="space-y-4 py-2" aria-label="Loading messages">
            <div className="flex items-start gap-3">
              <Skeleton className="size-8 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-10 w-48 rounded-xl" />
              </div>
            </div>
            <div className="flex flex-row-reverse items-start gap-3">
              <Skeleton className="size-8 rounded-full" />
              <div className="flex flex-col items-end space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-12 w-56 rounded-xl" />
              </div>
            </div>
          </div>
        ) : messages.length ? (
          messages.map((item) => {
            const own = item.senderId === currentActor;
            const mentioned = !own && mentionsUser(item.text, currentUserName);
            const tokens = formatMessageMentions(item.text, memberNames);
            return (
              <Message key={item.id} align={own ? 'end' : 'start'}>
                <MessageAvatar>
                  <Avatar>
                    <AvatarFallback className="bg-secondary text-xs font-semibold text-secondary-foreground">
                      {item.senderName?.slice(0, 2).toUpperCase() || 'TM'}
                    </AvatarFallback>
                  </Avatar>
                </MessageAvatar>
                <MessageContent className="max-w-[88%] sm:max-w-[75%]">
                  <MessageHeader className={own ? 'justify-end' : 'flex flex-wrap items-center gap-1.5'}>
                    <span>
                      {own ? 'You' : item.senderName} · <Time value={item.at} />
                    </span>
                    {mentioned && (
                      <Badge
                        variant="outline"
                        className="border-primary/40 bg-primary/10 px-1.5 py-0 text-[10px] font-medium text-primary"
                      >
                        Mentioned you
                      </Badge>
                    )}
                  </MessageHeader>
                  <Bubble
                    align={own ? 'end' : 'start'}
                    variant={own ? undefined : 'secondary'}
                    className={mentioned ? 'ring-2 ring-primary/40' : undefined}
                  >
                    <BubbleContent className="whitespace-pre-wrap">
                      {tokens.map((token, index) =>
                        token.isMention ? (
                          <span
                            key={index}
                            className="rounded bg-primary/15 px-1 py-0.5 font-medium text-primary"
                          >
                            {token.text}
                          </span>
                        ) : (
                          token.text
                        ),
                      )}
                    </BubbleContent>
                  </Bubble>
                </MessageContent>
              </Message>
            );
          })
        ) : (
          <div className={fullHeight ? 'flex h-full min-h-[240px] items-center justify-center' : ''}>
            <Empty
              className="border-0"
              icon={MessageSquare}
              title="Start the team conversation"
              description="Updates and questions shared here stay with this project team."
            />
          </div>
        )}
      </div>
      <form
        onSubmit={send}
        className={`flex shrink-0 items-end gap-2 border-t bg-card ${
          fullHeight ? 'px-4 py-3 sm:px-8 sm:py-4' : 'p-3'
        }`}
      >
        <div className="relative min-w-0 flex-1">
          {mention && (
            <div className="absolute bottom-full z-20 mb-2 w-full rounded-xl border bg-popover p-1 text-popover-foreground shadow-md">
              <p className="px-2 py-1 text-xs text-muted-foreground">
                Mention a project team member
              </p>
              <ul
                ref={listRef}
                id={listId}
                role="listbox"
                aria-label="Project team members"
                className="max-h-48 overflow-y-auto"
              >
                {candidates.map((member, index) => (
                  <li key={member.employeeId} role="presentation">
                    <button
                      id={`${listId}-${index}`}
                      type="button"
                      role="option"
                      aria-selected={index === optionIndex}
                      tabIndex={-1}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => chooseMention(member)}
                      className={`w-full break-words rounded-lg px-2 py-2 text-left text-sm ${index === optionIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent'}`}
                    >
                      <span className="block font-medium">{member.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {member.role || member.designation || 'Team member'} · {member.employeeId}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {!candidates.length && (
                <p role="status" className="px-2 py-3 text-xs text-muted-foreground">
                  {team.length
                    ? 'No matching project team members.'
                    : 'No employees assigned to this project yet.'}
                </p>
              )}
            </div>
          )}
          <Textarea
            ref={inputRef}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              updateMention(event.target);
            }}
            onClick={(event) => updateMention(event.target)}
            onKeyUp={(event) => {
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
                updateMention(event.target);
            }}
            onKeyDown={handleKeyDown}
            onBlur={() => setMention(null)}
            rows={1}
            maxLength={2000}
            enterKeyHint="send"
            placeholder="Message your team… Type @ to mention"
            aria-label="Message your team"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={Boolean(mention)}
            aria-controls={mention ? listId : undefined}
            aria-activedescendant={
              mention && candidates.length ? `${listId}-${optionIndex}` : undefined
            }
            className="max-h-28 min-h-11 resize-none"
          />
        </div>
        <Button
          type="submit"
          size="icon"
          aria-label="Send team message"
          disabled={!draft.trim() || sending}
        >
          <ArrowUp className="size-5" />
        </Button>
      </form>
      {error && (
        <p role="alert" className={`pb-3 text-xs text-destructive ${fullHeight ? 'px-4 sm:px-8' : 'px-4'}`}>
          {error}
        </p>
      )}
    </Wrapper>
  );
}
