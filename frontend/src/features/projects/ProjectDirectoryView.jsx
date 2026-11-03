import { needsQueryAttention } from '@/features/queries/lib/queryStatus';
// frontend/src/components/ProjectDirectoryView.jsx
import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  FolderKanban,
  MapPin,
  Plus,
  Search,
  Users,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { StatusChip } from '@/components/ui/status-chip';
import { PROJECT_STATUS_TONES } from '@/lib/taskStatus';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Empty } from '@/components/ui/empty';

export function ProjectDirectoryView({
  projects = [],
  decisionRequests = [],
  onSelectProject,
  onCreateProject,
  onOpenGroups,
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'ongoing' | 'needs_setup' | 'at_risk' | 'completed'

  const needsSetup = (p) =>
    !['Completed', 'Abandoned'].includes(p.status) &&
    !p.workflowStartedAt &&
    (p.telegramSetupPending ||
      !p.clientName ||
      ['Unassigned Client', 'Client pending'].includes(p.clientName));
  const ongoingCount = projects.filter(
    (p) => !['Completed', 'Abandoned'].includes(p.status),
  ).length;
  const needsSetupCount = projects.filter(needsSetup).length;
  const atRiskCount = projects.filter((p) => p.status === 'At risk').length;
  const completedCount = projects.filter((p) => p.status === 'Completed').length;

  const filtered = projects.filter((project) => {
    if (filter === 'ongoing' && ['Completed', 'Abandoned'].includes(project.status)) return false;
    if (filter === 'completed' && project.status !== 'Completed') return false;
    if (filter === 'at_risk' && project.status !== 'At risk') return false;
    if (filter === 'needs_setup' && !needsSetup(project)) return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        project.name?.toLowerCase().includes(q) ||
        (project.clientName || '').toLowerCase().includes(q) ||
        (project.location || '').toLowerCase().includes(q) ||
        (project.phase || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Directory Title & Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-foreground">Projects</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Select a project to manage its tasks, internal chat, schedule, and client queries.
          </p>
        </div>

        <Button onClick={onCreateProject}>
          <Plus className="size-4 mr-2" />
          Create project
        </Button>
      </div>

      {/* Filter Tabs & Search Bar (Actionable 21) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <SegmentedControl
          label="Filter projects by status"
          value={filter}
          onValueChange={setFilter}
          options={[
            { value: 'all', label: `All (${projects.length})` },
            { value: 'ongoing', label: `Ongoing (${ongoingCount})` },
            ...(needsSetupCount > 0
              ? [{ value: 'needs_setup', label: `Needs setup (${needsSetupCount})` }]
              : []),
            ...(atRiskCount > 0 ? [{ value: 'at_risk', label: `At risk (${atRiskCount})` }] : []),
            { value: 'completed', label: `Completed (${completedCount})` },
          ]}
        />

        <div className="relative min-w-56 max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects by name, client, location…"
            className="pl-8"
          />
        </div>
      </div>

      {/* Projects Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.length ? (
          filtered.map((project) => {
            const taskCount = project.taskCount || 0;
            const progress = project.progress || 0;
            const pendingQueries = decisionRequests.filter(
              (q) => q.projectId === project.id && needsQueryAttention(q),
            ).length;
            const isMissingClient = needsSetup(project);

            return (
              <Card
                key={project.id}
                onClick={() => onSelectProject(project.id)}
                className={`group cursor-pointer overflow-hidden transition-all duration-200 hover:border-primary/50 hover:shadow-md ${isMissingClient ? 'border-warning-border/80 bg-warning-bg/20' : ''}`}
              >
                <CardContent className="flex h-full flex-col gap-3 p-0">
                  {/* Top card metadata */}
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <StatusChip tone={PROJECT_STATUS_TONES[project.status]}>
                        {project.status || 'Setup'}
                      </StatusChip>

                      {pendingQueries > 0 && (
                        <Badge
                          variant="outline"
                          className="border-overdue-border bg-overdue-bg text-overdue text-xs"
                        >
                          {pendingQueries} client {pendingQueries === 1 ? 'query' : 'queries'}
                        </Badge>
                      )}
                    </div>

                    <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors tracking-tight line-clamp-1">
                      {project.name}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                      Client:{' '}
                      <span className="font-semibold text-foreground/90">
                        {project.clientName || 'Unassigned'}
                      </span>
                    </p>
                    {project.location && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">{project.location}</span>
                      </p>
                    )}
                  </div>

                  {/* Client Gate Warning */}
                  {isMissingClient && (
                    <div className="card-box bg-warning-bg/70 border-warning-border text-xs text-warning flex items-center gap-2">
                      <AlertCircle className="size-3.5 shrink-0 text-warning" />
                      <span>Setup needed: Client role must be assigned to start.</span>
                    </div>
                  )}

                  {/* Task progress bar */}
                  {taskCount > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Tasks: {taskCount}</span>
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
                      {project.phase || 'Phase: Setup'}
                    </span>
                    <span className="font-medium text-primary flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                      Open project <ArrowRight className="size-3" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Empty
            className="col-span-full"
            kind={projects.length ? 'no-results' : 'first-use'}
            icon={FolderKanban}
            title={projects.length ? 'No projects match your filter' : 'No projects yet'}
            description={
              projects.length
                ? 'Try another status, or search by a different name, client or location.'
                : 'Create your first project to manage its tasks, team chat and client queries.'
            }
            action={
              projects.length ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFilter('all');
                    setSearch('');
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button size="sm" onClick={onCreateProject}>
                  <Plus />
                  Create project
                </Button>
              )
            }
          />
        )}
      </div>
    </div>
  );
}
