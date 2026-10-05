// frontend/src/components/ProjectDirectoryView.jsx
import React, { useState } from "react";
import {
  AlertCircle, AlertTriangle, ArrowRight, Building2, CheckCircle2,
  Clock, FolderKanban, Plus, Search, Users, Sparkles
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { getProjectWorkflow } from "@/lib/projectWorkflowStore";

const statusBadgeStyles = {
  "On track": "border-emerald-200 bg-emerald-50 text-emerald-800",
  "At risk": "border-amber-200 bg-amber-50 text-amber-800",
  "On hold": "border-slate-200 bg-slate-100 text-slate-700",
  "Completed": "border-blue-200 bg-blue-50 text-blue-800",
  "Setup": "border-purple-200 bg-purple-50 text-purple-800"
};

export function ProjectDirectoryView({
  projects = [],
  decisionRequests = [],
  onSelectProject,
  onCreateProject,
  onOpenGroups
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // 'all' | 'ongoing' | 'needs_setup' | 'at_risk' | 'completed'

  const ongoingCount = projects.filter((p) => p.status !== "Completed").length;
  const needsSetupCount = projects.filter((p) => p.telegramSetupPending || !p.clientName || p.clientName === "Unassigned Client").length;
  const atRiskCount = projects.filter((p) => p.status === "At risk").length;
  const completedCount = projects.filter((p) => p.status === "Completed").length;

  const filtered = projects.filter((project) => {
    if (filter === "ongoing" && project.status === "Completed") return false;
    if (filter === "completed" && project.status !== "Completed") return false;
    if (filter === "at_risk" && project.status !== "At risk") return false;
    if (filter === "needs_setup" && !project.telegramSetupPending && project.clientName && project.clientName !== "Unassigned Client") return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        project.name?.toLowerCase().includes(q) ||
        (project.clientName || "").toLowerCase().includes(q) ||
        (project.location || "").toLowerCase().includes(q) ||
        (project.phase || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Directory Title & Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Workspace Overview
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl text-foreground">
            All Projects Directory
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Select a project to manage its tasks, internal chat, schedule, and client queries.
          </p>
        </div>

        <Button onClick={onCreateProject}>
          <Plus className="size-4 mr-1.5" />
          Create New Project
        </Button>
      </div>

      {/* Filter Tabs & Search Bar (Actionable 21) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 bg-muted/60 p-1 rounded-xl text-xs">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded-lg px-3 py-1.5 font-medium transition-all ${filter === "all" ? "bg-card text-foreground shadow-2xs font-semibold" : "text-muted-foreground hover:text-foreground"}`}
          >
            All ({projects.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("ongoing")}
            className={`rounded-lg px-3 py-1.5 font-medium transition-all ${filter === "ongoing" ? "bg-card text-foreground shadow-2xs font-semibold" : "text-muted-foreground hover:text-foreground"}`}
          >
            Ongoing ({ongoingCount})
          </button>
          {needsSetupCount > 0 && (
            <button
              type="button"
              onClick={() => setFilter("needs_setup")}
              className={`rounded-lg px-3 py-1.5 font-medium transition-all flex items-center gap-1 ${filter === "needs_setup" ? "bg-amber-100 text-amber-900 font-semibold" : "text-amber-800 hover:text-amber-900"}`}
            >
              <AlertCircle className="size-3" />
              Needs Setup ({needsSetupCount})
            </button>
          )}
          {atRiskCount > 0 && (
            <button
              type="button"
              onClick={() => setFilter("at_risk")}
              className={`rounded-lg px-3 py-1.5 font-medium transition-all ${filter === "at_risk" ? "bg-red-100 text-red-900 font-semibold" : "text-red-700 hover:text-red-900"}`}
            >
              At Risk ({atRiskCount})
            </button>
          )}
          <button
            type="button"
            onClick={() => setFilter("completed")}
            className={`rounded-lg px-3 py-1.5 font-medium transition-all ${filter === "completed" ? "bg-card text-foreground shadow-2xs font-semibold" : "text-muted-foreground hover:text-foreground"}`}
          >
            Completed ({completedCount})
          </button>
        </div>

        <div className="relative min-w-56 max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects by name, client, location…"
            className="pl-8 text-xs h-9"
          />
        </div>
      </div>

      {/* Projects Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.length ? (
          filtered.map((project) => {
            const wf = getProjectWorkflow(project.id, project);
            const projectTasks = wf?.tasks || [];
            const doneTasks = projectTasks.filter((t) => t.status === "completed").length;
            const progress = projectTasks.length ? Math.round((doneTasks / projectTasks.length) * 100) : 0;
            const pendingQueries = decisionRequests.filter((q) => q.projectId === project.id && q.status !== "Done").length;
            const isMissingClient = !project.clientName || project.clientName === "Unassigned Client" || project.telegramSetupPending;

            return (
              <Card
                key={project.id}
                onClick={() => onSelectProject(project.id)}
                className={`group cursor-pointer overflow-hidden transition-all duration-200 hover:border-primary/50 hover:shadow-md ${isMissingClient ? "border-amber-300/80 bg-amber-50/20" : ""}`}
              >
                <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
                  {/* Top card metadata */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <Badge variant="outline" className={statusBadgeStyles[project.status] || "border-muted"}>
                        <span className="size-1.5 rounded-full bg-current mr-1.5" />
                        {project.status || "Setup"}
                      </Badge>

                      {pendingQueries > 0 && (
                        <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700 text-[10px]">
                          {pendingQueries} client {pendingQueries === 1 ? "query" : "queries"}
                        </Badge>
                      )}
                    </div>

                    <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors tracking-tight line-clamp-1">
                      {project.name}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      Client: <span className="font-semibold text-foreground/90">{project.clientName || "Unassigned"}</span>
                    </p>
                    {project.location && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        📍 {project.location}
                      </p>
                    )}
                  </div>

                  {/* Client Gate Warning */}
                  {isMissingClient && (
                    <div className="rounded-lg bg-amber-100/70 border border-amber-200 p-2 text-[11px] text-amber-900 flex items-center gap-1.5">
                      <AlertCircle className="size-3.5 shrink-0 text-amber-700" />
                      <span>Setup needed: Client role must be assigned to start.</span>
                    </div>
                  )}

                  {/* Task progress bar */}
                  {projectTasks.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>Tasks: {doneTasks}/{projectTasks.length}</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Bottom Footer info */}
                  <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
                    <span className="truncate max-w-[150px]">
                      {project.phase || "Phase: Setup"}
                    </span>
                    <span className="font-medium text-primary flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                      Open Project <ArrowRight className="size-3" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <div className="col-span-full py-16 text-center text-muted-foreground">
            <FolderKanban className="mx-auto size-10 text-muted-foreground/40 mb-3" />
            <h3 className="text-base font-semibold text-foreground">No projects match your filter</h3>
            <p className="text-xs mt-1">Try changing the status filter or search query.</p>
          </div>
        )}
      </div>
    </div>
  );
}
