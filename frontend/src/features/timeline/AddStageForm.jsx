import { rolesOf } from '@/features/people/lib/roles';
// The one pop-up for a new stage: a name, where it starts, and how many days each of the six fixed tasks takes.
// The bot works out every date; this form only shows what its preview returns.
import { AlertTriangle, CalendarDays, Loader2, Octagon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  STAGE_TASKS,
  EXECUTION_ROLES,
  DURATION_OPTIONS,
  durationLabel,
  defaultStageTasks,
} from '@/features/timeline/lib/stageTemplate';

const today = () => new Date().toISOString().slice(0, 10);
const label = (value) =>
  value
    ? new Date(`${value}T00:00:00Z`).toLocaleDateString([], {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      })
    : 'no date';

export function emptyStage({
  stages = [],
  tailStageName = '',
  placement,
  started = false,
  custom = true,
} = {}) {
  const tail = tailStageName || stages.at(-1)?.name || '';
  return {
    name: '',
    placement:
      placement ||
      (tail ? { type: 'after', stageName: tail } : { type: 'date', startDate: today() }),
    started,
    doneCount: 0,
    custom,
    spaces: [],
    structure: 'studio',
    tasks: custom
      ? defaultStageTasks().map((task, index) => ({
          ...task,
          title: STAGE_TASKS[index].title,
          role: task.role || STAGE_TASKS[index].role,
        }))
      : defaultStageTasks(),
  };
}

// What the server expects: Skip rows stay in (as 0 days), unknown UI fields are dropped.
export function stageSpec(value) {
  const placement = value.started
    ? { type: 'date', startDate: value.placement.startDate || today() }
    : value.placement.type === 'date'
      ? { type: 'date', startDate: value.placement.startDate || today() }
      : { type: value.placement.type, stageName: value.placement.stageName };
  return {
    name: value.spaces?.length
      ? `${value.name.trim()} · ${value.spaces.join(' + ')}`
      : value.name.trim(),
    spaces: value.spaces || [],
    ...(value.custom ? { custom: true } : {}),
    placement,
    doneCount: value.started ? Number(value.doneCount) || 0 : 0,
    tasks: value.tasks
      .filter((task) => !value.custom || Number(task.durationDays) > 0)
      .map((task) => ({
        key: task.key,
        ...(value.custom ? { title: task.title?.trim() } : {}),
        durationDays: Number(task.durationDays) || 0,
        ...(task.role ? { role: task.role } : {}),
        ...(task.assigneeId ? { assigneeId: task.assigneeId } : {}),
      })),
  };
}

export function stageNameProblem(value, stages = []) {
  const name = value.name.trim();
  if (!name) return 'Enter a stage name.';
  if (name.length > 60) return 'Keep the stage name under 60 characters.';
  if (name.includes('—')) return 'Stage names cannot contain "—".';
  if (value.custom) {
    if (!value.tasks.length || value.tasks.length > 60) return 'Add between 1 and 60 tasks.';
    if (
      value.tasks
        .filter((task) => Number(task.durationDays) > 0)
        .some(
          (task) =>
            !task.title?.trim() || task.title.trim().length > 80 || task.title.includes('—'),
        )
    )
      return 'Give each task a name of up to 80 characters without —.';
    if (
      value.tasks.some(
        (task) =>
          !Number.isInteger(Number(task.durationDays)) ||
          Number(task.durationDays) < 0 ||
          Number(task.durationDays) > 365,
      )
    )
      return 'Give each task a duration from 0 (skip) to 365 days.';
    if (!value.tasks.some((task) => Number(task.durationDays) > 0))
      return 'Keep at least one task with a duration.';
    if (
      value.tasks.filter((task) => Number(task.durationDays) > 0).some((task) => !task.role?.trim())
    )
      return 'Give each task a role.';
  }
  const fullName = value.spaces?.length ? `${name} · ${value.spaces.join(' + ')}` : name;
  if (fullName.length > 60) return 'Keep the combined stage and space names under 61 characters.';
  const clash = stages.find((stage) => stage.name.trim().toLowerCase() === fullName.toLowerCase());
  return clash ? `A stage called "${clash.name}" already exists.` : '';
}

export function AddStageForm({
  value,
  onChange,
  stages = [],
  members = [],
  spaces = [],
  defaultPlan = [],
  telegramLinked = true,
  preview,
  previewing,
  previewError,
}) {
  const set = (changes) => onChange({ ...value, ...changes });
  const setTask = (key, changes) =>
    set({
      tasks: value.tasks
        .filter((task) => !value.custom || Number(task.durationDays) > 0)
        .map((task) => (task.key === key ? { ...task, ...changes } : task)),
    });
  const nameProblem = value.name ? stageNameProblem(value, stages) : '';
  const clash = nameProblem.startsWith('A stage called');
  const created = value.tasks.filter((task) => Number(task.durationDays) > 0).length;
  const peopleFor = (role) => {
    const matching = members.filter(
      (member) =>
        member.employeeId &&
        String(member.role || member.designation || '').toLowerCase() ===
          String(role || '').toLowerCase(),
    );
    const others = members.filter((member) => member.employeeId && !matching.includes(member));
    return [...matching, ...others];
  };
  const stage = preview?.stages?.[0];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="space-y-1.5">
          <span className="text-xs font-medium">Stage name</span>
          <Input
            autoFocus
            value={value.name}
            maxLength={60}
            placeholder="e.g. Flooring"
            aria-invalid={Boolean(
              nameProblem &&
              (nameProblem.startsWith('Enter a stage name') ||
                nameProblem.startsWith('Keep the stage') ||
                nameProblem.startsWith('A stage called') ||
                nameProblem.startsWith('Stage names')),
            )}
            onChange={(event) => set({ name: event.target.value })}
          />
        </label>
      </div>
      {nameProblem && (
        <p className="text-xs text-destructive" role="alert">
          {nameProblem}{' '}
          {clash && (
            <button
              type="button"
              className="underline"
              onClick={() => set({ name: `${value.name.trim()} (2)` })}
            >
              Use "{value.name.trim()} (2)"
            </button>
          )}
        </p>
      )}

      {spaces.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium">
            Spaces (optional; none means whole project)
          </legend>
          <div className="flex flex-wrap gap-3">
            {spaces.map((space) => (
              <label key={space} className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={value.spaces?.includes(space) || false}
                  onChange={(event) =>
                    set({
                      spaces: event.target.checked
                        ? [...(value.spaces || []), space]
                        : (value.spaces || []).filter((name) => name !== space),
                    })
                  }
                />
                {space}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset className="space-y-2">
        <legend className="text-xs font-medium">When does it start?</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.started}
            onChange={(event) =>
              set({
                started: event.target.checked,
                placement: event.target.checked
                  ? { type: 'date', startDate: value.placement.startDate || today() }
                  : value.placement,
              })
            }
          />
          This stage has already started
        </label>
        {value.started ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs text-muted-foreground">Real start date</span>
              <Input
                type="date"
                value={value.placement.startDate || ''}
                onChange={(event) =>
                  set({ placement: { type: 'date', startDate: event.target.value } })
                }
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs text-muted-foreground">Tasks already finished</span>
              <NativeSelect
                value={String(value.doneCount)}
                onChange={(event) => set({ doneCount: Number(event.target.value) })}
                className="w-full"
              >
                {Array.from({ length: created + 1 }, (_, count) => (
                  <NativeSelectOption key={count} value={String(count)}>
                    {count === 0 ? 'None yet' : `First ${count}`}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-[auto_1fr]">
            <NativeSelect
              value={value.placement.type}
              onChange={(event) =>
                set({
                  placement:
                    event.target.value === 'date'
                      ? { type: 'date', startDate: today() }
                      : {
                          type: event.target.value,
                          stageName: value.placement.stageName || stages.at(-1)?.name || '',
                        },
                })
              }
              className="w-full sm:w-56"
            >
              {stages.length > 0 && (
                <NativeSelectOption value="after">After another stage</NativeSelectOption>
              )}
              {stages.length > 0 && (
                <NativeSelectOption value="parallel">At the same time as</NativeSelectOption>
              )}
              <NativeSelectOption value="date">On a date</NativeSelectOption>
            </NativeSelect>
            {value.placement.type === 'date' ? (
              <Input
                type="date"
                value={value.placement.startDate || ''}
                onChange={(event) =>
                  set({ placement: { type: 'date', startDate: event.target.value } })
                }
              />
            ) : (
              <NativeSelect
                value={value.placement.stageName || ''}
                onChange={(event) =>
                  set({ placement: { ...value.placement, stageName: event.target.value } })
                }
                className="w-full"
              >
                {stages.map((item) => (
                  <NativeSelectOption key={item.id} value={item.name}>
                    {item.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </div>
        )}
      </fieldset>

      <datalist id="project-task-roles">
        {[
          ...new Set(
            members.flatMap((member) => rolesOf(member.roles || member.role || member.designation)),
          ),
        ].map((role) => (
          <option key={role} value={role} />
        ))}
      </datalist>
      <div className="space-y-2">
        <p className="text-xs font-medium">
          Tasks{' '}
          <span className="font-normal text-muted-foreground">
            · always in this order, one after another
          </span>
        </p>
        {value.custom ? (
          <div className="space-y-3">
            {value.tasks.map((task, index) => (
              <fieldset key={task.key} className="space-y-2 rounded-xl border p-3">
                <legend className="px-1 text-xs font-medium">Task {index + 1}</legend>
                <label className="block space-y-1">
                  <span className="text-xs">Task name</span>
                  <Input
                    value={task.title}
                    maxLength={80}
                    placeholder="e.g. Obtain building permit"
                    onChange={(event) => setTask(task.key, { title: event.target.value })}
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-xs">Role</span>
                    <Input
                      list="project-task-roles"
                      value={task.role}
                      maxLength={80}
                      onChange={(event) => setTask(task.key, { role: event.target.value })}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs">Days (0 = skip)</span>
                    <Input
                      type="number"
                      min={0}
                      max={365}
                      step={1}
                      value={task.durationDays}
                      onChange={(event) =>
                        setTask(task.key, {
                          durationDays: event.target.value === '' ? '' : Number(event.target.value),
                        })
                      }
                    />
                  </label>
                </div>
                <label className="block space-y-1">
                  <span className="text-xs">Assignee</span>
                  <NativeSelect
                    className="w-full"
                    value={task.assigneeId || ''}
                    onChange={(event) => setTask(task.key, { assigneeId: event.target.value })}
                  >
                    <NativeSelectOption value="">
                      {telegramLinked ? 'By role' : 'Unassigned'}
                    </NativeSelectOption>
                    <NativeSelectOption value="founder">Founder</NativeSelectOption>
                    {members
                      .filter((member) => member.employeeId)
                      .map((member) => (
                        <NativeSelectOption key={member.employeeId} value={member.employeeId}>
                          {member.name}
                        </NativeSelectOption>
                      ))}
                  </NativeSelect>
                </label>
                {value.tasks.length > 1 && (
                  <button
                    type="button"
                    className="text-xs text-destructive underline"
                    onClick={() =>
                      set({ tasks: value.tasks.filter((item) => item.key !== task.key) })
                    }
                  >
                    Remove task {index + 1}
                  </button>
                )}
              </fieldset>
            ))}
            <button
              type="button"
              disabled={value.tasks.length >= 60}
              className="text-sm font-medium underline disabled:opacity-50"
              onClick={() =>
                set({
                  tasks: [
                    ...value.tasks,
                    {
                      key: crypto.randomUUID(),
                      title: '',
                      role: 'Team',
                      durationDays: 1,
                      assigneeId: '',
                    },
                  ],
                })
              }
            >
              + Add task
            </button>
          </div>
        ) : (
          <ol className="divide-y rounded-xl border">
            {STAGE_TASKS.map((template, index) => {
              const task = value.tasks.find((item) => item.key === template.key);
              const skipped = !Number(task.durationDays);
              const role = task.role || template.role;
              return (
                <li
                  key={template.key}
                  className={`grid grid-cols-[1fr_7rem] gap-2 p-2.5 sm:grid-cols-[1.4fr_1fr_1fr_7.5rem] sm:items-center ${skipped ? 'opacity-60' : ''}`}
                >
                  <div className="col-span-2 min-w-0 sm:col-span-1">
                    <p className="truncate text-sm font-medium">
                      <span className="mr-1.5 text-xs text-muted-foreground">{index + 1}</span>
                      {template.title}
                    </p>
                    {!template.roleEditable && (
                      <p className="text-[11px] text-muted-foreground">{template.role}</p>
                    )}
                  </div>
                  {template.roleEditable ? (
                    <>
                      <Input
                        list="iksha-execution-roles"
                        aria-label="Who does the site work"
                        value={role}
                        maxLength={80}
                        onChange={(event) => setTask(template.key, { role: event.target.value })}
                        className="col-span-2 h-8 text-xs sm:col-span-1"
                      />
                      <datalist id="iksha-execution-roles">
                        {EXECUTION_ROLES.map((item) => (
                          <option key={item} value={item} />
                        ))}
                      </datalist>
                    </>
                  ) : (
                    <span className="hidden sm:block" />
                  )}
                  <NativeSelect
                    size="sm"
                    aria-label={`Person for ${template.title}`}
                    value={task.assigneeId || ''}
                    onChange={(event) => setTask(template.key, { assigneeId: event.target.value })}
                    className="w-full text-xs"
                  >
                    <NativeSelectOption value="">
                      {template.role === 'Client' ? 'The client' : 'By role'}
                    </NativeSelectOption>
                    {peopleFor(role).map((member) => (
                      <NativeSelectOption key={member.employeeId} value={member.employeeId}>
                        {member.name}
                        {member.role ? ` · ${member.role}` : ''}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <NativeSelect
                    size="sm"
                    aria-label={`Days for ${template.title}`}
                    value={String(task.durationDays)}
                    onChange={(event) =>
                      setTask(template.key, { durationDays: Number(event.target.value) })
                    }
                    className="w-full text-xs"
                  >
                    {DURATION_OPTIONS.map((days) => (
                      <NativeSelectOption key={days} value={String(days)}>
                        {durationLabel(days)}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className="min-h-10 rounded-xl bg-muted/50 px-3 py-2 text-xs" aria-live="polite">
        {previewing ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Working out the dates…
          </span>
        ) : previewError ? (
          <span className="flex items-start gap-1.5 text-destructive">
            <Octagon className="mt-0.5 size-3.5 shrink-0" />
            {previewError}
          </span>
        ) : stage ? (
          <div className="space-y-1">
            <p className="flex items-center gap-1.5 font-medium">
              <CalendarDays className="size-3.5" />
              {stage.startDate
                ? `${label(stage.startDate)} – ${label(stage.endDate)}`
                : 'No dates yet'}{' '}
              · {created} task{created === 1 ? '' : 's'}
              {preview.finish ? ` · project finish ${label(preview.finish)}` : ''}
            </p>
            {(preview.warnings || []).map((warning, index) => (
              <p key={index} className="flex items-start gap-1.5 text-amber-700">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {warning.reason}
              </p>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground">
            Dates appear here once the stage has a name.
          </span>
        )}
      </div>
    </div>
  );
}
