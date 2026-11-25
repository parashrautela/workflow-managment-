import { useState } from 'react';
import {
  Calendar,
  Check,
  CheckCircle2,
  Filter,
  MessageSquare,
  RefreshCw,
  Search,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { StatusChip } from '@/components/ui/status-chip';
import { Time } from '@/components/ui/time';
import { ProjectDependencyGraph } from '@/features/timeline/ProjectDependencyGraph';
import { isTaskClosed, matchesTaskStatus, TASK_STATUS_OPTIONS, taskStatus } from '@/lib/taskStatus';

// Filters live with the page, which also needs the filtered list (the task drawer steps through it).
export function useTaskFilters(tasks, stages) {
  const [status, setStatus] = useState('all');
  const [stage, setStage] = useState('all');
  const [search, setSearch] = useState('');
  const [person, setPerson] = useState('all');
  const [space, setSpace] = useState('all');
  const statusOf = (t) => taskStatus(t, { stage: stages.find((s) => s.id === t.stageId) });
  const filtered = tasks.filter((t) => {
    if (person !== 'all' && (t.assigneeId || 'unassigned') !== person) return false;
    if (space !== 'all' && !(stages.find((s) => s.id === t.stageId)?.spaces || []).includes(space))
      return false;
    if (status === 'unfinished' && isTaskClosed(t)) return false;
    if (!['all', 'unfinished'].includes(status) && !matchesTaskStatus(statusOf(t), status))
      return false;
    if (stage !== 'all' && t.stageId !== stage) return false;
    if (search.trim()) {
      const query = search.toLowerCase();
      return (
        t.title.toLowerCase().includes(query) || (t.description || '').toLowerCase().includes(query)
      );
    }
    return true;
  });
  return {
    status,
    setStatus,
    stage,
    setStage,
    search,
    setSearch,
    person,
    setPerson,
    space,
    setSpace,
    filtered,
    statusOf,
    activeCount: [person, space, status, stage].filter((value) => value !== 'all').length,
    clear: () => {
      setStatus('all');
      setStage('all');
      setPerson('all');
      setSpace('all');
      setSearch('');
    },
  };
}

// A project's Tasks tab, shared by the founder and employee apps. Founders pass onToggleTask and
// their actions (Add task); without them the same list is read-only.
export function ProjectTaskList({
  project,
  tasks,
  stages,
  employees,
  filters,
  onOpenTask,
  onToggleTask,
  onRefresh,
  refreshing = false,
  staleData = false,
  isFounder = false,
  actions = null,
  emptyDescription,
  emptyAction = null,
}) {
  const [viewMode, setViewMode] = useState('list');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const canToggle = Boolean(onToggleTask);
  const assigneeName = (assigneeId) => {
    if (!assigneeId) return 'Unassigned';
    if (assigneeId === 'founder') return 'Founder';
    const found = (project.members || []).find(
      (m) => m.employeeId === assigneeId || m.id === assigneeId,
    );
    return found ? found.name : assigneeId;
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-auto sm:min-w-44 sm:max-w-sm sm:flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => filters.setSearch(e.target.value)}
            placeholder="Search tasks"
            aria-label="Search tasks"
            className="pl-8"
          />
        </div>
        <Button
          variant="outline"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <Filter className="size-4" />
          Filters{filters.activeCount > 0 ? ` (${filters.activeCount})` : ''}
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <SegmentedControl
            label="Task view"
            value={viewMode}
            onValueChange={setViewMode}
            options={[
              { value: 'list', label: 'List' },
              { value: 'graph', label: 'Graph' },
            ]}
          />
          <Button
            variant="outline"
            size="icon"
            aria-label="Refresh tasks"
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={refreshing ? 'animate-spin' : ''} />
          </Button>
          {actions}
        </div>
      </div>
      {filtersOpen && (
        <div className="grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-xs">
            Person
            <select value={filters.person} onChange={(e) => filters.setPerson(e.target.value)}>
              <option value="all">All people</option>
              <option value="founder">Founder</option>
              <option value="unassigned">Role-based / unassigned</option>
              {(project.members || []).map((member) => (
                <option key={member.employeeId || member.id} value={member.employeeId || member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs">
            Space
            <select value={filters.space} onChange={(e) => filters.setSpace(e.target.value)}>
              <option value="all">All spaces</option>
              {(project.spaces || []).map((space) => (
                <option key={space}>{space}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs">
            Status
            <NativeSelect
              value={filters.status}
              onChange={(e) => filters.setStatus(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="unfinished">All unfinished</option>
              {TASK_STATUS_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </label>
          {stages.length > 0 && (
            <label className="grid gap-1 text-xs">
              Stage
              <NativeSelect
                value={filters.stage}
                onChange={(e) => filters.setStage(e.target.value)}
              >
                <option value="all">All stages</option>
                {stages.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </NativeSelect>
            </label>
          )}
        </div>
      )}

      {/* Task View Mode: Dependency Graph or List */}
      {viewMode === 'graph' ? (
        <ProjectDependencyGraph
          tasks={filters.filtered}
          employees={employees}
          stages={stages}
          onOpenTask={onOpenTask}
          onSwitchToList={() => setViewMode('list')}
          isFounder={isFounder}
          staleDataNotice={staleData}
        />
      ) : (
        <div className="space-y-3">
          {filters.filtered.length ? (
            filters.filtered.map((t) => {
              const isCompleted = t.status === 'Completed' || t.status === 'completed';
              const stageName =
                stages.find((s) => s.id === t.stageId)?.name || t.stageName || 'General';

              return (
                <div
                  key={t.id}
                  className={`group grid items-center gap-x-3 gap-y-2 card-box bg-card transition-all hover:border-primary/40 ${
                    canToggle
                      ? 'grid-cols-[44px_minmax(0,1fr)_auto] sm:grid-cols-[32px_minmax(0,1fr)_112px_136px_112px_auto]'
                      : 'grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_112px_136px_112px_auto]'
                  }`}
                >
                  {/* Only founders complete tasks, so the read-only list has no checkbox to suggest otherwise. */}
                  {canToggle && (
                    <button
                      type="button"
                      onClick={() => onToggleTask(t)}
                      className="grid size-11 -ml-1.5 place-items-center rounded-md sm:ml-0 sm:size-8"
                      aria-label="Toggle task completion"
                    >
                      <span
                        className={`grid size-8 place-items-center rounded-md border transition-colors ${
                          isCompleted
                            ? 'bg-success-fill border-success-fill text-white'
                            : 'border-muted-foreground/30 hover:border-primary'
                        }`}
                      >
                        {isCompleted && <Check className="size-4" />}
                      </span>
                    </button>
                  )}

                  <div className="min-w-0">
                    <h4
                      title={t.title}
                      className={`cursor-pointer truncate text-sm font-semibold transition-colors hover:text-primary ${
                        isCompleted ? 'line-through text-muted-foreground' : 'text-foreground'
                      }`}
                      onClick={() => onOpenTask(t)}
                    >
                      {t.title}
                    </h4>
                    <p className="truncate text-xs text-muted-foreground" title={stageName}>
                      {stageName}
                      {t.sourceQueryId && ' · Telegram query'}
                    </p>
                  </div>

                  <div className="justify-self-end sm:justify-self-start">
                    <StatusChip status={filters.statusOf(t)} />
                  </div>

                  <div
                    className={`${canToggle ? 'col-start-2' : 'col-start-1'} row-start-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 sm:contents`}
                  >
                    <span className="flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground">
                      <User className="size-3 shrink-0" />
                      <span className="truncate">
                        {assigneeName(t.assigneeId) || t.assigneeName || t.role || t.sourceRole || 'Unassigned'}
                      </span>
                    </span>

                    <span className="whitespace-nowrap flex items-center gap-1 text-xs text-muted-foreground">
                      {(t.deadline || t.dueDate) && (
                        <>
                          <Calendar className="size-3 shrink-0" />
                          <Time value={t.deadline || t.dueDate} format="calendar" />
                        </>
                      )}
                    </span>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className={`${canToggle ? 'col-start-3' : 'col-start-2'} row-start-2 sm:col-start-auto sm:row-start-auto`}
                    onClick={() => onOpenTask(t)}
                  >
                    <MessageSquare className="size-4 text-primary" />
                    <span>Thread</span>
                  </Button>
                </div>
              );
            })
          ) : (
            <Empty
              kind={tasks.length ? 'no-results' : 'first-use'}
              icon={CheckCircle2}
              title={tasks.length ? 'No tasks match these filters' : 'No tasks yet'}
              description={
                tasks.length
                  ? 'Try another status, person or stage, or clear the search.'
                  : emptyDescription
              }
              action={
                tasks.length ? (
                  <Button variant="outline" size="sm" onClick={filters.clear}>
                    Clear filters
                  </Button>
                ) : (
                  emptyAction
                )
              }
            />
          )}
        </div>
      )}
    </>
  );
}
