import { useState } from 'react';
import { useNavigation, navigate } from '@/lib/navigation';
import { Input } from '@/components/ui/input';
import { TeamChat } from '@/features/collaboration/TeamChat';
import { Empty } from '@/components/ui/empty';
import { MessageSquare } from 'lucide-react';
export function ProjectConversations({
  projects = [],
  namespace = 'founder',
  actor = 'founder',
  embedded = false,
}) {
  const Heading = embedded ? 'h2' : 'h1';
  const selected = useNavigation().conversationId;
  const [search, setSearch] = useState('');
  const visible = projects.filter((project) =>
    `${project.name} ${project.location || ''}`.toLowerCase().includes(search.toLowerCase()),
  );
  const project = projects.find((row) => row.id === selected) || visible[0];
  return (
    <section className="space-y-4">
      <div>
        <Heading>Project chats</Heading>
        <p className="text-xs text-muted-foreground">
          Internal conversations with the founders and project team. Task-specific references stay
          in their task threads.
        </p>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-1">
          <Input
            aria-label="Search project conversations"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a project or city…"
          />
          {visible.map((row) => (
            <button
              key={row.id}
              onClick={() => navigate({ conversationId: row.id })}
              title={[row.name, row.location].filter(Boolean).join(' · ')}
              aria-current={row.id === project?.id ? 'true' : undefined}
              className={`block min-h-8 w-full truncate rounded-lg px-3 py-1 text-left text-sm hover:bg-muted ${row.id === project?.id ? 'bg-primary/10 font-medium text-primary' : ''}`}
            >
              {row.name}
            </button>
          ))}
        </aside>
        {project ? (
          <div className="min-w-0">
            <h3 className="mb-2 type-label-14-strong">{project.name}</h3>
            <TeamChat
              key={project.id}
              endpoint={`/api/${namespace}/projects/${project.id}/team-chat`}
              currentActor={actor}
              members={project.members}
            />
          </div>
        ) : (
          <Empty
            kind={projects.length ? 'no-results' : 'first-use'}
            icon={MessageSquare}
            title={projects.length ? 'No matching project chats' : 'No project chats yet'}
            description={
              projects.length
                ? 'Try another project name or city.'
                : 'Each project gets a team chat once it exists.'
            }
          />
        )}
      </div>
    </section>
  );
}
