import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { request, previewStages, applyStages } from "@/lib/api";
export function PlanTemplates({ projectId, spaces = [], onChanged }) {
  const [templates, setTemplates] = useState([]),
    [name, setName] = useState(""),
    [selected, setSelected] = useState(""),
    [draft, setDraft] = useState([]),
    [start, setStart] = useState(new Date().toLocaleDateString("en-CA")),
    [preview, setPreview] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const load = async () => {
    try {
      setTemplates((await request("/api/founder/plan-templates")).templates);
    } catch (problem) {
      setError(problem.message);
    }
  };
  const choose = (id) => {
    setSelected(id);
    setDraft(
      structuredClone(templates.find((row) => row.id === id)?.stages || []),
    );
    setPreview(null);
  };
  const change = (stageIndex, taskIndex, key, value) => {
    setDraft((current) =>
      current.map((stage, index) => {
        let next =
          index !== stageIndex
            ? stage
            : taskIndex === null
              ? { ...stage, [key]: value }
              : {
                  ...stage,
                  tasks: stage.tasks.map((task, index) =>
                    index === taskIndex ? { ...task, [key]: value } : task,
                  ),
                };
        if (taskIndex === null && key === "name" && next.placement) {
          const old = current[stageIndex].name;
          next = {
            ...next,
            placement: {
              ...next.placement,
              ...(next.placement.stageName === old ? { stageName: value } : {}),
              ...(next.placement.predecessors
                ? {
                    predecessors: next.placement.predecessors.map((edge) =>
                      edge.stageName === old
                        ? { ...edge, stageName: value }
                        : edge,
                    ),
                  }
                : {}),
            },
          };
        }
        return next;
      }),
    );
    setPreview(null);
  };
  const specs = () =>
    draft.map((stage) => ({
      ...stage,
      custom: true,
      spaces: (stage.spaces || []).filter((space) => spaces.includes(space)),
      placement: stage.placement || { type: "date", startDate: start },
      tasks: stage.tasks.map((task) => ({ ...task, key: crypto.randomUUID() })),
    }));
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await request("/api/founder/plan-templates", {
        method: "POST",
        body: { projectId, name },
      });
      setName("");
      await load();
      setNotice("Reusable template saved for the workspace.");
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  };
  const useTemplate = async (apply) => {
    setBusy(true);
    setError("");
    try {
      const stages = preview?.stagesInput || specs();
      const result = await (apply ? applyStages : previewStages)(projectId, {
        stages,
      });
      if (apply) {
        setPreview(null);
        setNotice("Template stages added to this project.");
        onChanged?.(result);
      } else setPreview({ ...result, stagesInput: stages });
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <details
      className="my-3 rounded-xl border bg-card p-3"
      onToggle={(event) => {
        if (event.currentTarget.open) load();
      }}
    >
      <summary className="cursor-pointer text-sm font-semibold">
        Reusable plan templates · includes Purchase
      </summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="grid gap-1 text-xs">
            Save this project's current plan
            <Input
              value={name}
              maxLength={80}
              placeholder="Template name"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <Button
            disabled={busy || !name.trim()}
            variant="outline"
            onClick={save}
          >
            Save as template
          </Button>
        </div>
        <div className="space-y-2">
          <label className="grid gap-1 text-xs">
            Add a plan
            <select
              value={selected}
              onChange={(event) => choose(event.target.value)}
            >
              <option value="">Choose a template…</option>
              {templates.map((template) => (
                <option value={template.id} key={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs">
            Start date for stages without predecessors
            <Input
              type="date"
              value={start}
              onChange={(event) => {
                setStart(event.target.value);
                setPreview(null);
              }}
            />
          </label>
        </div>
      </div>
      {draft.map((stage, index) => (
        <fieldset key={index} className="mt-3 space-y-2 rounded-lg border p-3">
          <legend className="text-xs font-semibold">Stage {index + 1}</legend>
          <label className="grid gap-1 text-xs">
            Stage name
            <Input
              value={stage.name}
              maxLength={80}
              onChange={(e) => change(index, null, "name", e.target.value)}
            />
          </label>
          {stage.tasks.map((task, taskIndex) => (
            <div
              key={taskIndex}
              className="grid gap-2 sm:grid-cols-[2fr_1fr_80px]"
            >
              <label className="grid gap-1 text-xs">
                Task
                <Input
                  maxLength={80}
                  value={task.title}
                  onChange={(e) =>
                    change(index, taskIndex, "title", e.target.value)
                  }
                />
              </label>
              <label className="grid gap-1 text-xs">
                Role
                <Input
                  maxLength={80}
                  value={task.role}
                  onChange={(e) =>
                    change(index, taskIndex, "role", e.target.value)
                  }
                />
              </label>
              <label className="grid gap-1 text-xs">
                Days
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={task.durationDays}
                  onChange={(e) =>
                    change(
                      index,
                      taskIndex,
                      "durationDays",
                      Number(e.target.value),
                    )
                  }
                />
              </label>
            </div>
          ))}
        </fieldset>
      ))}
      {selected && (
        <Button
          className="mt-3"
          disabled={busy}
          variant="outline"
          onClick={() => useTemplate(false)}
        >
          Preview edited template
        </Button>
      )}
      {preview && (
        <div className="mt-3 space-y-2 rounded bg-muted p-3 text-xs">
          <p>
            {preview.created?.length || preview.tasks?.length || 0} tasks across{" "}
            {preview.stages?.length || 0} stages will be added. Existing stages
            remain.
          </p>
          <Button disabled={busy} onClick={() => useTemplate(true)}>
            Confirm and add template
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-2 text-sm text-emerald-800">
          {notice}
        </p>
      )}
    </details>
  );
}
