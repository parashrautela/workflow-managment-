import { useEffect, useRef, useState } from 'react';
import { useNavigation, navigate } from '@/lib/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { TeamChat } from '@/features/collaboration/TeamChat';
import { Empty } from '@/components/ui/empty';
import { ArrowUpRight, Check, ChevronDown, MessageSquare, Search } from 'lucide-react';

const isActiveChatProject = (project) =>
  !['Completed', 'Abandoned', 'Setup', 'Needs setup'].includes(project.status) &&
  !project.telegramSetupPending;

export function ProjectConversations({
  projects = [],
  namespace = 'founder',
  actor = 'founder',
  embedded = false,
}) {
  const Heading = embedded ? 'h2' : 'h1';
  const selected = useNavigation().conversationId;
  const [search, setSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef(null);
  const searchInputRef = useRef(null);

  const activeProjects = projects.filter(isActiveChatProject);
  const project = activeProjects.find((row) => row.id === selected) || activeProjects[0] || null;
  const visible = activeProjects.filter((row) =>
    `${row.name} ${row.location || ''}`.toLowerCase().includes(search.trim().toLowerCase()),
  );

  useEffect(() => {
    if (!pickerOpen) return;
    requestAnimationFrame(() => searchInputRef.current?.focus());
    const onPointerDown = (event) => {
      if (!pickerRef.current?.contains(event.target)) {
        setPickerOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setPickerOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [pickerOpen]);

  if (!project) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center p-6">
        <Empty
          kind="first-use"
          icon={MessageSquare}
          title="No active project chats"
          description="Ongoing projects get an internal team chat once setup is complete."
        />
      </div>
    );
  }

  const projectSwitcher = (
    <div ref={pickerRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setPickerOpen((open) => !open)}
        aria-expanded={pickerOpen}
        aria-haspopup="listbox"
        className="group flex max-w-full items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <span className="size-2 shrink-0 rounded-full bg-success-fill" aria-hidden="true" />
        <span className="min-w-0 truncate type-heading-16">{project.name}</span>
        {project.location && (
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">
            · {project.location}
          </span>
        )}
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform duration-150 ${pickerOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {pickerOpen && (
        <div className="absolute top-full left-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border bg-card shadow-lg">
          <div className="border-b p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                aria-label="Search active project chats"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Switch project chat…"
                className="h-9 pl-8 text-sm"
              />
            </div>
          </div>
          <ul
            role="listbox"
            aria-label="Active project chats"
            className="max-h-[min(18rem,45dvh)] overflow-y-auto overscroll-contain p-1.5"
          >
            {visible.length ? (
              visible.map((row) => {
                const isSelected = row.id === project.id;
                const memberCount = (row.members || []).length;
                return (
                  <li key={row.id} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      onClick={() => {
                        navigate({ conversationId: row.id });
                        setPickerOpen(false);
                        setSearch('');
                      }}
                      className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                        isSelected
                          ? 'bg-accent font-medium text-foreground'
                          : 'text-foreground hover:bg-muted'
                      }`}
                    >
                      <span className="size-2 shrink-0 rounded-full bg-success-fill" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <span className="block truncate">{row.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[
                            row.location,
                            memberCount
                              ? `${memberCount} ${memberCount === 1 ? 'member' : 'members'}`
                              : 'Founder only',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </div>
                      {isSelected && <Check className="size-4 shrink-0 text-primary" />}
                    </button>
                  </li>
                );
              })
            ) : (
              <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                No matching active projects.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );

  const openProjectAction = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
      onClick={() => navigate({ section: 'projects', projectId: project.id })}
    >
      <span className="hidden sm:inline">Open project</span>
      <ArrowUpRight className="size-3.5" />
    </Button>
  );

  return (
    <section
      className={embedded ? 'space-y-3' : 'flex h-full min-h-0 flex-col'}
    >
      <div className={embedded ? '' : 'max-lg:sr-only shrink-0 border-b px-4 pt-1 pb-4 sm:px-8'}>
        <Heading>Project chats</Heading>
        <p className="text-xs text-muted-foreground">
          Internal conversations with the founders and project team. Task-specific references stay
          in their task threads.
        </p>
      </div>
      <div className={embedded ? '' : 'min-h-0 flex-1'}>
        <TeamChat
          key={project.id}
          endpoint={`/api/${namespace}/projects/${project.id}/team-chat`}
          currentActor={actor}
          members={project.members}
          fullHeight={!embedded}
          headerTitle={projectSwitcher}
          headerActions={openProjectAction}
        />
      </div>
    </section>
  );
}
