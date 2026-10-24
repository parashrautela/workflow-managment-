import { useState } from "react";
import { Input } from "@/components/ui/input";
import { TeamChat } from "@/components/TeamChat";
export function ProjectConversations({
  projects = [],
  namespace = "founder",
  actor = "founder",
}) {
  const [selected, setSelected] = useState(""),
    [search, setSearch] = useState("");
  const visible = projects.filter((project) =>
    `${project.name} ${project.location || ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const project = projects.find((row) => row.id === selected) || visible[0];
  return (
    <section className="space-y-4">
      <div>
        <p className="iksha-eyebrow">Studio conversations</p>
        <h2 className="text-2xl font-semibold">Project chats</h2>
        <p className="text-xs text-muted-foreground">
          Internal conversations with the founders and project team.
          Task-specific references stay in their task threads.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="space-y-2">
          <Input
            aria-label="Search project conversations"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a project or city…"
          />
          {visible.map((row) => (
            <button
              key={row.id}
              onClick={() => setSelected(row.id)}
              className={`w-full rounded-xl border p-3 text-left text-sm ${row.id === project?.id ? "border-primary bg-primary/5" : ""}`}
            >
              <strong className="block">{row.name}</strong>
              <small>{row.location || "Location not set"}</small>
            </button>
          ))}
        </aside>
        {project ? (
          <div className="min-w-0">
            <h3 className="mb-2 font-semibold">{project.name}</h3>
            <TeamChat
              key={project.id}
              endpoint={`/api/${namespace}/projects/${project.id}/team-chat`}
              currentActor={actor}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No matching project conversations.
          </p>
        )}
      </div>
    </section>
  );
}
