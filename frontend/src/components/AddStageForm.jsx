// The one pop-up for a new stage: a name, where it starts, and how many days each of the six fixed tasks takes.
// The bot works out every date; this form only shows what its preview returns.
import { AlertTriangle, CalendarDays, Loader2, Octagon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { STAGE_TASKS, EXECUTION_ROLES, DURATION_OPTIONS, durationLabel, defaultStageTasks } from "@/lib/stageTemplate";

const today = () => new Date().toISOString().slice(0, 10);
const label = (value) => (value ? new Date(`${value}T00:00:00Z`).toLocaleDateString([], { day: "numeric", month: "short", timeZone: "UTC" }) : "no date");

export function emptyStage({ stages = [], tailStageName = "", placement, started = false } = {}) {
  const tail = tailStageName || stages.at(-1)?.name || "";
  return {
    name: "",
    placement: placement || (tail ? { type: "after", stageName: tail } : { type: "date", startDate: today() }),
    started,
    doneCount: 0,
    tasks: defaultStageTasks(),
  };
}

// What the server expects: Skip rows stay in (as 0 days), unknown UI fields are dropped.
export function stageSpec(value) {
  const placement = value.started
    ? { type: "date", startDate: value.placement.startDate || today() }
    : value.placement.type === "date" ? { type: "date", startDate: value.placement.startDate || today() } : { type: value.placement.type, stageName: value.placement.stageName };
  return {
    name: value.name.trim(),
    placement,
    doneCount: value.started ? Number(value.doneCount) || 0 : 0,
    tasks: value.tasks.map((task) => ({ key: task.key, durationDays: Number(task.durationDays) || 0, ...(task.role ? { role: task.role } : {}), ...(task.assigneeId ? { assigneeId: task.assigneeId } : {}) })),
  };
}

export function stageNameProblem(value, stages = []) {
  const name = value.name.trim();
  if (!name) return "Enter a stage name.";
  if (name.length > 60) return "Keep the stage name under 60 characters.";
  if (name.includes("—")) return "Stage names cannot contain \"—\".";
  const clash = stages.find((stage) => stage.name.trim().toLowerCase() === name.toLowerCase());
  return clash ? `A stage called "${clash.name}" already exists.` : "";
}

export function AddStageForm({ value, onChange, stages = [], members = [], defaultPlan = [], preview, previewing, previewError }) {
  const set = (changes) => onChange({ ...value, ...changes });
  const setTask = (key, changes) => set({ tasks: value.tasks.map((task) => (task.key === key ? { ...task, ...changes } : task)) });
  const nameProblem = value.name ? stageNameProblem(value, stages) : "";
  const clash = nameProblem.startsWith("A stage called");
  const created = value.tasks.filter((task) => Number(task.durationDays) > 0).length;
  const peopleFor = (role) => {
    const matching = members.filter((member) => member.employeeId && String(member.role || member.designation || "").toLowerCase() === String(role || "").toLowerCase());
    const others = members.filter((member) => member.employeeId && !matching.includes(member));
    return [...matching, ...others];
  };
  const fillFromPlan = (name) => {
    const source = defaultPlan.find((stage) => stage.name === name);
    if (!source) return;
    set({
      name: value.name || source.name,
      tasks: value.tasks.map((task) => {
        const from = source.tasks.find((item) => item.key === task.key);
        return { ...task, durationDays: from?.durationDays ?? task.durationDays, ...(from?.role ? { role: from.role } : {}) };
      }),
    });
  };
  const stage = preview?.stages?.[0];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="space-y-1.5">
          <span className="text-xs font-medium">Stage name</span>
          <Input autoFocus value={value.name} maxLength={60} placeholder="e.g. Flooring" aria-invalid={Boolean(nameProblem)} onChange={(event) => set({ name: event.target.value })} />
        </label>
        {defaultPlan.length > 0 && (
          <label className="space-y-1.5">
            <span className="text-xs font-medium">Fill from default plan</span>
            <NativeSelect value="" onChange={(event) => fillFromPlan(event.target.value)} className="w-full sm:w-52">
              <NativeSelectOption value="">Choose a stage…</NativeSelectOption>
              {defaultPlan.map((item) => <NativeSelectOption key={item.name} value={item.name}>{item.name}</NativeSelectOption>)}
            </NativeSelect>
          </label>
        )}
      </div>
      {nameProblem && (
        <p className="text-xs text-destructive" role="alert">
          {nameProblem}{" "}
          {clash && <button type="button" className="underline" onClick={() => set({ name: `${value.name.trim()} (2)` })}>Use "{value.name.trim()} (2)"</button>}
        </p>
      )}

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium">When does it start?</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={value.started} onChange={(event) => set({ started: event.target.checked, placement: event.target.checked ? { type: "date", startDate: value.placement.startDate || today() } : value.placement })} />
          This stage has already started
        </label>
        {value.started ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5"><span className="text-xs text-muted-foreground">Real start date</span><Input type="date" value={value.placement.startDate || ""} onChange={(event) => set({ placement: { type: "date", startDate: event.target.value } })} /></label>
            <label className="space-y-1.5">
              <span className="text-xs text-muted-foreground">Tasks already finished</span>
              <NativeSelect value={String(value.doneCount)} onChange={(event) => set({ doneCount: Number(event.target.value) })} className="w-full">
                {Array.from({ length: created + 1 }, (_, count) => <NativeSelectOption key={count} value={String(count)}>{count === 0 ? "None yet" : `First ${count}`}</NativeSelectOption>)}
              </NativeSelect>
            </label>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-[auto_1fr]">
            <NativeSelect value={value.placement.type} onChange={(event) => set({ placement: event.target.value === "date" ? { type: "date", startDate: today() } : { type: event.target.value, stageName: value.placement.stageName || stages.at(-1)?.name || "" } })} className="w-full sm:w-56">
              {stages.length > 0 && <NativeSelectOption value="after">After another stage</NativeSelectOption>}
              {stages.length > 0 && <NativeSelectOption value="parallel">At the same time as</NativeSelectOption>}
              <NativeSelectOption value="date">On a date</NativeSelectOption>
            </NativeSelect>
            {value.placement.type === "date"
              ? <Input type="date" value={value.placement.startDate || ""} onChange={(event) => set({ placement: { type: "date", startDate: event.target.value } })} />
              : <NativeSelect value={value.placement.stageName || ""} onChange={(event) => set({ placement: { ...value.placement, stageName: event.target.value } })} className="w-full">
                  {stages.map((item) => <NativeSelectOption key={item.id} value={item.name}>{item.name}</NativeSelectOption>)}
                </NativeSelect>}
          </div>
        )}
      </fieldset>

      <div className="space-y-2">
        <p className="text-xs font-medium">Tasks <span className="font-normal text-muted-foreground">· always in this order, one after another</span></p>
        <ol className="divide-y rounded-xl border">
          {STAGE_TASKS.map((template, index) => {
            const task = value.tasks.find((item) => item.key === template.key);
            const skipped = !Number(task.durationDays);
            const role = task.role || template.role;
            return (
              <li key={template.key} className={`grid grid-cols-[1fr_7rem] gap-2 p-2.5 sm:grid-cols-[1.4fr_1fr_1fr_7.5rem] sm:items-center ${skipped ? "opacity-60" : ""}`}>
                <div className="col-span-2 min-w-0 sm:col-span-1">
                  <p className="truncate text-sm font-medium"><span className="mr-1.5 text-xs text-muted-foreground">{index + 1}</span>{template.title}</p>
                  {!template.roleEditable && <p className="text-[11px] text-muted-foreground">{template.role}</p>}
                </div>
                {template.roleEditable ? (
                  <>
                    <Input list="iksha-execution-roles" aria-label="Who does the site work" value={role} maxLength={80} onChange={(event) => setTask(template.key, { role: event.target.value })} className="col-span-2 h-8 text-xs sm:col-span-1" />
                    <datalist id="iksha-execution-roles">{EXECUTION_ROLES.map((item) => <option key={item} value={item} />)}</datalist>
                  </>
                ) : <span className="hidden sm:block" />}
                <NativeSelect size="sm" aria-label={`Person for ${template.title}`} value={task.assigneeId || ""} onChange={(event) => setTask(template.key, { assigneeId: event.target.value })} className="w-full text-xs">
                  <NativeSelectOption value="">{template.role === "Client" ? "The client" : "By role"}</NativeSelectOption>
                  {peopleFor(role).map((member) => <NativeSelectOption key={member.employeeId} value={member.employeeId}>{member.name}{member.role ? ` · ${member.role}` : ""}</NativeSelectOption>)}
                </NativeSelect>
                <NativeSelect size="sm" aria-label={`Days for ${template.title}`} value={String(task.durationDays)} onChange={(event) => setTask(template.key, { durationDays: Number(event.target.value) })} className="w-full text-xs">
                  {DURATION_OPTIONS.map((days) => <NativeSelectOption key={days} value={String(days)}>{durationLabel(days)}</NativeSelectOption>)}
                </NativeSelect>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="min-h-10 rounded-xl bg-muted/50 px-3 py-2 text-xs" aria-live="polite">
        {previewing ? <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />Working out the dates…</span>
          : previewError ? <span className="flex items-start gap-1.5 text-destructive"><Octagon className="mt-0.5 size-3.5 shrink-0" />{previewError}</span>
          : stage ? <div className="space-y-1">
              <p className="flex items-center gap-1.5 font-medium"><CalendarDays className="size-3.5" />{stage.startDate ? `${label(stage.startDate)} – ${label(stage.endDate)}` : "No dates yet"} · {created} task{created === 1 ? "" : "s"}{preview.finish ? ` · project finish ${label(preview.finish)}` : ""}</p>
              {(preview.warnings || []).map((warning, index) => <p key={index} className="flex items-start gap-1.5 text-amber-700"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{warning.reason}</p>)}
            </div>
          : <span className="text-muted-foreground">Dates appear here once the stage has a name.</span>}
      </div>
    </div>
  );
}
