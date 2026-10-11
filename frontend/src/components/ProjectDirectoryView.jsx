import React, { useState } from "react";
import { ArrowRight, ArrowUpRight, FolderKanban, Plus, Search, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

const needsSetup = (project) => project.telegramSetupPending || !project.clientName || ["Unassigned Client", "Client pending"].includes(project.clientName);
const unresolved = (request) => !["Done", "Rejected", "Published"].includes(request.status);

export function ProjectDirectoryView({ projects = [], decisionRequests = [], onSelectProject, onCreateProject, onOpenAttention }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ongoing");
  const pending = decisionRequests.filter(unresolved);
  const counts = {
    ongoing: projects.filter((p) => p.status !== "Completed").length,
    needs_setup: projects.filter(needsSetup).length,
    completed: projects.filter((p) => p.status === "Completed").length,
    all: projects.length,
  };
  const filtered = projects.filter((project) => {
    if (filter === "ongoing" && project.status === "Completed") return false;
    if (filter === "completed" && project.status !== "Completed") return false;
    if (filter === "needs_setup" && !needsSetup(project)) return false;
    return `${project.name || ""} ${project.clientName || ""} ${project.location || ""} ${project.phase || ""}`.toLowerCase().includes(search.trim().toLowerCase());
  });

  return (
    <div className="project-directory">
      <div className="directory-heading">
        <div>
          <p className="directory-eyebrow">YOUR WORKSPACE</p>
          <h1>Projects, at a glance.</h1>
          <p className="directory-description">{counts.ongoing} ongoing {counts.ongoing === 1 ? "project" : "projects"}. One place to pick up where you left off.</p>
        </div>
        <Button className="directory-create" onClick={onCreateProject}><Plus className="size-4" /> New project</Button>
      </div>

      {pending.length > 0 && (
        <button type="button" className="directory-attention" onClick={onOpenAttention}>
          <span className="attention-icon"><MessageSquare size={19} /></span>
          <span className="attention-copy"><strong>{pending.length} {pending.length === 1 ? "question needs" : "questions need"} your attention</strong><span>Pick up the conversation and keep work moving.</span></span>
          <span className="attention-action">Review <ArrowRight size={16} /></span>
        </button>
      )}

      <section className="directory-projects" aria-label="Projects">
        <div className="directory-toolbar">
          <div className="directory-filters" role="group" aria-label="Filter projects">
            {[["ongoing", "Ongoing"], ["needs_setup", "Needs setup"], ["completed", "Completed"], ["all", "All"]].map(([id, label]) => (
              <button key={id} type="button" aria-pressed={filter === id} className={filter === id ? "selected" : ""} onClick={() => setFilter(id)}>{label}<span>{counts[id]}</span></button>
            ))}
          </div>
          <label className="directory-search"><Search size={16} /><input aria-label="Search projects" placeholder="Find a project…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        </div>
        <div className="directory-column-head" aria-hidden="true"><span>PROJECT</span><span>UP NEXT</span><span>PROGRESS</span><span /></div>
        <div className="directory-list">
          {filtered.map((project) => {
            const queries = pending.filter((q) => q.projectId === project.id).length;
            const setup = needsSetup(project);
            const progress = Math.max(0, Math.min(100, Number(project.progress) || 0));
            const next = setup ? "Assign a client to get started" : project.blocker || (queries ? `${queries} ${queries === 1 ? "question waiting" : "questions waiting"} for a reply` : project.nextMilestone || project.recentTask || "Open project to plan the next step");
            return (
              <button type="button" key={project.id} className="directory-project-row" onClick={() => onSelectProject(project.id)} aria-label={`Open ${project.name}`}>
                <span className="directory-project-identity"><span className={`project-monogram ${setup ? "is-setup" : ""}`}>{(project.name || "P").trim().slice(0, 1).toUpperCase()}</span><span className="project-name"><strong>{project.name}</strong><span>{setup ? "Client pending" : project.clientName || "Client unassigned"}{project.location && ` · ${project.location}`}</span></span></span>
                <span className="project-next"><span className={`project-phase ${setup ? "is-setup" : ""}`}><i />{setup ? "Needs setup" : project.status === "Completed" ? "Completed" : project.phase || project.status || "Planning"}</span><span className={project.blocker || queries ? "project-next-action needs-reply" : "project-next-action"}>{next}</span></span>
                <span className="project-progress"><span>{project.taskCount ? `${progress}%` : "Not started"}</span>{!!project.taskCount && <span className="project-progress-track"><span style={{ width: `${progress}%` }} /></span>}</span>
                <ArrowUpRight className="project-open-icon" size={18} />
              </button>
            );
          })}
          {!filtered.length && <div className="directory-empty"><FolderKanban size={28} /><strong>{projects.length ? "No matching projects" : "Your first project starts here"}</strong><p>{projects.length ? "Try another filter or search." : "Create a project to bring its people and work together."}</p>{!projects.length && <Button onClick={onCreateProject}><Plus size={16} /> New project</Button>}</div>}
        </div>
        <p className="directory-footer">{filtered.length} {filtered.length === 1 ? "project" : "projects"}{search.trim() ? " matching your search" : " in this view"}</p>
      </section>
    </div>
  );
}
