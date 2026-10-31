import { useEffect, useMemo, useState } from 'react';
import { ReactFlow, Background, Controls, Handle, Position } from '@xyflow/react';
import { Button } from '@/components/ui/button';
import {
  connectionTasks,
  connectionFingerprint,
  stageLinksFor,
} from '@/features/timeline/lib/stageConnections';
import { request } from '@/lib/api';
function StageNode({ data }) {
  return (
    <div className="min-w-44 rounded-lg border bg-card p-3 text-xs shadow-sm">
      <Handle type="target" position={Position.Left} />
      <strong>{data.label}</strong>
      <p className="mt-1 text-muted-foreground">{data.count} tasks</p>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { stage: StageNode };
export function StageConnections({ projectId, stages = [], tasks = [], onChanged }) {
  const normalized = connectionTasks(tasks),
    fingerprint = connectionFingerprint(normalized),
    saved = stageLinksFor(normalized);
  const [expanded, setExpanded] = useState(false);
  const [links, setLinks] = useState(saved),
    [type, setType] = useState('FS'),
    [source, setSource] = useState(''),
    [target, setTarget] = useState(''),
    [preview, setPreview] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  useEffect(() => {
    setLinks(saved);
    setPreview(null);
  }, [fingerprint]);
  const change = (next) => {
    setLinks(next);
    setPreview(null);
    setNotice('');
  };
  const connect = (connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    const link = { source: connection.source, target: connection.target, type };
    if (
      !links.some(
        (edge) =>
          edge.source === link.source && edge.target === link.target && edge.type === link.type,
      )
    )
      change([...links, link]);
  };
  const nodes = useMemo(
    () =>
      stages
        .filter((stage) => normalized.some((task) => task.stageId === stage.id))
        .map((stage, index) => ({
          id: stage.id,
          type: 'stage',
          style: { width: 224 },
          position: { x: (index % 3) * 320, y: Math.floor(index / 3) * 150 },
          data: {
            label: stage.name,
            count: normalized.filter((task) => task.stageId === stage.id).length,
          },
        })),
    [JSON.stringify(stages), fingerprint],
  );
  const edges = links.map((link, index) => ({
    id: String(index),
    source: link.source,
    target: link.target,
    label: link.type === 'SS' ? 'Start together' : 'After finish',
    type: 'smoothstep',
    style: { strokeWidth: 2 },
  }));
  const run = async (apply) => {
    setBusy(true);
    setError('');
    try {
      const result = await request(
        `/api/founder/projects/${projectId}/stage-links/${apply ? 'apply' : 'preview'}`,
        {
          method: 'POST',
          body: {
            links,
            fingerprint,
            ...(apply ? { botFingerprint: preview.botFingerprint } : {}),
          },
        },
      );
      if (apply) {
        setNotice('Stage connections and schedule saved.');
        setPreview(null);
        onChanged?.(result);
      } else setPreview(result);
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  };
  const dirty =
    JSON.stringify(
      [...links].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    ) !==
    JSON.stringify([...saved].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
  return (
    <details
      className="my-3 rounded-xl border bg-card p-3"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary className="cursor-pointer text-sm font-semibold">
        Stage connections · {saved.length} links
      </summary>
      <p className="my-3 text-xs text-muted-foreground">
        Connect stage handles here, or use the selectors below. A stage with two incoming “After
        finish” wires waits for both. Click a wire to remove it, then preview and confirm.
      </p>
      <div className="h-80 rounded-lg border">
        <>
          {expanded && (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              nodesDraggable={false}
              onConnect={connect}
              onEdgeClick={(event, edge) =>
                change(links.filter((link, index) => String(index) !== edge.id))
              }
              fitView
              minZoom={0.2}
              maxZoom={1.5}
              attributionPosition="bottom-left"
            >
              <Background />
              <Controls />
            </ReactFlow>
          )}
        </>
      </div>
      <div className="my-3 grid gap-2 sm:grid-cols-4">
        <label className="grid gap-1 text-xs">
          Predecessor
          <select
            className="rounded border bg-background p-2"
            value={source}
            onChange={(event) => setSource(event.target.value)}
          >
            <option value="">From stage…</option>
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.data.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs">
          Relationship
          <select
            className="rounded border bg-background p-2"
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="FS">After finish</option>
            <option value="SS">Start together</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs">
          Successor
          <select
            className="rounded border bg-background p-2"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
          >
            <option value="">To stage…</option>
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.data.label}
              </option>
            ))}
          </select>
        </label>
        <Button
          className="self-end"
          variant="outline"
          disabled={!source || !target || source === target || busy}
          onClick={() => connect({ source, target })}
        >
          Add connection
        </Button>
      </div>
      <div className="space-y-1">
        {links.map((link, index) => (
          <div
            className="flex items-center justify-between gap-2 text-xs"
            key={`${link.source}:${link.target}:${link.type}`}
          >
            <span>
              {stages.find((stage) => stage.id === link.source)?.name} →{' '}
              {stages.find((stage) => stage.id === link.target)?.name} ·{' '}
              {link.type === 'SS' ? 'Start together' : 'After finish'}
            </span>
            <button
              className="underline"
              onClick={() => change(links.filter((item, i) => i !== index))}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <Button
        className="mt-3"
        variant="outline"
        disabled={!dirty || busy}
        onClick={() => run(false)}
      >
        Preview connection changes
      </Button>
      {preview && (
        <div className="mt-3 space-y-2 rounded-lg bg-muted p-3 text-xs">
          <p>
            {preview.affected?.length || 0} tasks change dates. Work already started cannot be
            moved.
          </p>
          {preview.affected?.map((task) => (
            <p key={task.taskId}>
              {task.taskName} · {task.previousStart} → {task.forecastStart}
            </p>
          ))}
          <Button disabled={busy} onClick={() => run(true)}>
            Confirm connections and schedule
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
