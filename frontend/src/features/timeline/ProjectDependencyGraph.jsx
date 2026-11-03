// frontend/src/components/ProjectDependencyGraph.jsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Circle,
  HelpCircle,
  Layers,
  Maximize2,
  PauseCircle,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  User,
  X,
  XCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Hourglass,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { computeGraphLayout, NODE_WIDTH, NODE_HEIGHT } from '@/features/timeline/lib/graphLayout';
import { formatCalendar } from '@/lib/dates';

/**
 * Status icons with accessible, non-color-only distinction.
 */
const STATUS_ICONS = {
  done: CheckCircle2,
  cancelled: XCircle,
  waiting: Hourglass,
  blocked: AlertTriangle,
  hold: PauseCircle,
  overdue: AlertTriangle,
  active: Play,
  upcoming: Circle,
  open: Circle,
};
const STATUS_TEXT = {
  neutral: 'text-muted-foreground',
  info: 'text-info',
  warning: 'text-warning',
  success: 'text-success',
  overdue: 'text-overdue',
};

function StatusIcon({ status, className = 'size-3.5' }) {
  const Icon = STATUS_ICONS[status.key];
  return <Icon className={`${className} ${STATUS_TEXT[status.tone]}`} aria-hidden="true" />;
}

/**
 * Custom Task Graph Node component matching Studio Iksha styling.
 */
function TaskGraphNodeComponent({ data }) {
  const isCompleted = data.status.key === 'done';
  const showSourceStatus =
    data.sourceStatus &&
    data.sourceStatus !== data.task.status &&
    data.sourceStatus !== data.status.label &&
    data.sourceStatus !== 'Pending';

  return (
    <div
      className={`w-[280px] select-none rounded-xl border bg-card p-3 shadow-xs transition-all duration-150 text-left ${
        data.isSelected
          ? 'border-primary shadow-md'
          : data.isHighlighted
            ? 'border-primary/80'
            : 'border-border hover:border-primary/40'
      } ${data.isDimmed ? 'opacity-35 hover:opacity-90' : 'opacity-100'}`}
      onClick={() => data.onNodeClick?.(data.task)}
      onDoubleClick={() => data.onNodeOpen?.(data.task)}
      tabIndex={0}
      role="button"
      aria-label={`Task: ${data.title}, Status: ${data.status.text}, Assignee: ${data.assigneeName}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-muted-foreground/60 !border-2 !border-background"
      />

      <div className="flex items-start justify-between gap-2 mb-2">
        <span
          className="text-xs font-medium text-muted-foreground truncate max-w-[170px]"
          title={data.stageName}
        >
          {data.trade ? `${data.trade} · ` : ''}
          {data.stageName}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {data.gateType === 'approval' && (
            <Badge
              variant="outline"
              className="text-xs px-1 py-0 bg-info-bg text-info border-info-border flex items-center gap-1"
            >
              <ShieldCheck className="size-2.5" /> Gate
            </Badge>
          )}
          <span className="flex items-center gap-1 text-xs font-semibold">
            <StatusIcon status={data.status} />
            <span>{data.status.text}</span>
          </span>
        </div>
      </div>

      <p
        className={`text-xs font-semibold leading-label line-clamp-2 ${
          isCompleted ? 'line-through text-muted-foreground' : 'text-foreground'
        }`}
        title={data.title}
      >
        {data.title}
      </p>

      {showSourceStatus && (
        <p className="mt-1 text-xs text-warning font-medium">Source state: {data.sourceStatus}</p>
      )}

      <div className="mt-3 pt-2 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
        <span
          className="flex items-center gap-1 truncate max-w-[130px]"
          title={`Assignee: ${data.assigneeName}`}
        >
          <User className="size-3 shrink-0" />
          <span className="truncate">{data.assigneeName}</span>
        </span>
        <span
          className="flex items-center gap-1 shrink-0"
          title={data.deadline ? `Due ${formatCalendar(data.deadline)}` : 'No deadline recorded'}
        >
          <Calendar className="size-3 shrink-0" />
          <span>{formatCalendar(data.deadline) || 'No date'}</span>
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !bg-muted-foreground/60 !border-2 !border-background"
      />
    </div>
  );
}

/**
 * Custom edge rendering with FS / SS pill label and interactive tooltip.
 */
function DependencyEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });

  const isSS = data?.edgeType === 'SS';
  const label = isSS ? 'SS' : 'FS';

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
        >
          <span
            className={`px-1 rounded-md text-xs font-mono font-semibold tracking-tight border cursor-help shadow-2xs transition-colors ${
              data?.isHighlighted
                ? 'bg-primary text-primary-foreground border-primary'
                : isSS
                  ? 'bg-warning-bg text-warning border-warning-border'
                  : 'bg-card text-muted-foreground border-border'
            }`}
            title={data?.tooltip || (isSS ? 'Start-to-Start (SS)' : 'Finish-to-Start (FS)')}
          >
            {label}
          </span>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = { taskGraphNode: TaskGraphNodeComponent };
const edgeTypes = { default: DependencyEdgeComponent };

/**
 * Inner graph content using ReactFlow hooks.
 */
function DependencyGraphInner({
  tasks = [],
  employees = [],
  stages = [],
  onOpenTask,
  onSwitchToList,
  isFounder = true,
  staleDataNotice = false,
}) {
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showLegend, setShowLegend] = useState(false);
  const { fitView, getNodes, setViewport } = useReactFlow();
  const canvasRef = useRef(null);
  // Fit the whole graph when it is small, but never shrink below a readable zoom: a big plan starts at
  // the top-left (first stage) and the user pans, instead of seeing tiny slivers.
  const fitReadable = useCallback(
    (duration = 250) => {
      const list = getNodes();
      const box = canvasRef.current?.getBoundingClientRect();
      if (!list.length || !box || !box.width) {
        fitView({ padding: 0.12, minZoom: 0.75, maxZoom: 1, duration });
        return;
      }
      const minX = Math.min(...list.map((n) => n.position.x));
      const minY = Math.min(...list.map((n) => n.position.y));
      const maxX = Math.max(...list.map((n) => n.position.x + (n.measured?.width ?? NODE_WIDTH)));
      const maxY = Math.max(...list.map((n) => n.position.y + (n.measured?.height ?? NODE_HEIGHT)));
      const fit = Math.min((box.width - 48) / (maxX - minX), (box.height - 48) / (maxY - minY));
      const zoom = Math.min(1, Math.max(0.75, fit));
      setViewport({ x: 24 - minX * zoom, y: 24 - minY * zoom, zoom }, { duration });
    },
    [fitView, getNodes, setViewport],
  );

  // Track the signature of task IDs and dependency topology to avoid unnecessary re-layouts
  const prevStructureRef = useRef('');

  const structureKey = useMemo(() => {
    const active = tasks.filter((t) => !t.deletedAt);
    return active
      .map(
        (t) =>
          `${t.id}:${(t.dependencies || []).map((d) => `${d.predecessorTelegramTaskId}-${d.type}`).join(',')}`,
      )
      .sort()
      .join('|');
  }, [tasks]);

  const {
    nodes: computedNodes,
    edges: computedEdges,
    warnings,
  } = useMemo(() => {
    return computeGraphLayout({
      tasks,
      employees,
      stages,
      selectedTaskId,
      searchQuery,
    });
  }, [tasks, employees, stages, selectedTaskId, searchQuery]);

  const [nodes, setNodes, onNodesChange] = useNodesState(computedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(computedEdges);

  // Synchronize computed layout to state
  useEffect(() => {
    const structureChanged = prevStructureRef.current !== structureKey;
    prevStructureRef.current = structureKey;

    // Attach callbacks to node data
    const nodesWithCallbacks = computedNodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        onNodeClick: (task) => {
          setSelectedTaskId((prev) => (prev === task.id ? null : task.id));
        },
        onNodeOpen: (task) => {
          if (onOpenTask) onOpenTask(task);
        },
      },
    }));

    setNodes(nodesWithCallbacks);
    setEdges(computedEdges);

    // Only auto-fitView on initial load or topology change, preserving user pan/zoom during polling
    if (structureChanged) {
      setTimeout(() => fitReadable(250), 50);
    }
  }, [computedNodes, computedEdges, structureKey, fitReadable, onOpenTask, setNodes, setEdges]);

  const handleManualRelayout = useCallback(() => {
    const layout = computeGraphLayout({
      tasks,
      employees,
      stages,
      selectedTaskId,
      searchQuery,
    });
    setNodes(
      layout.nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          onNodeClick: (task) => setSelectedTaskId((prev) => (prev === task.id ? null : task.id)),
          onNodeOpen: (task) => onOpenTask && onOpenTask(task),
        },
      })),
    );
    setEdges(layout.edges);
    setTimeout(() => fitReadable(300), 50);
  }, [
    tasks,
    employees,
    stages,
    selectedTaskId,
    searchQuery,
    fitReadable,
    onOpenTask,
    setNodes,
    setEdges,
  ]);

  const selectedTask = useMemo(() => {
    return tasks.find((t) => t.id === selectedTaskId);
  }, [tasks, selectedTaskId]);

  const selectionDetails = useMemo(() => {
    if (!selectedTaskId) return null;
    const incomingEdges = computedEdges.filter((e) => e.target === selectedTaskId);
    const outgoingEdges = computedEdges.filter((e) => e.source === selectedTaskId);
    return {
      predecessorsCount: incomingEdges.length,
      dependentsCount: outgoingEdges.length,
    };
  }, [selectedTaskId, computedEdges]);

  return (
    <div className="relative w-full h-[620px] rounded-2xl border bg-background overflow-hidden flex flex-col">
      {/* Top Banner: Warnings for Cycles, Missing References, or Stale Data */}
      {staleDataNotice && (
        <div className="px-4 py-2 bg-warning-bg border-b border-warning-border text-warning text-xs flex items-center justify-between">
          <span className="flex items-center gap-2">
            <AlertTriangle className="size-3.5 shrink-0" />
            Live Telegram snapshot is currently unavailable; showing saved workspace graph.
          </span>
        </div>
      )}

      {warnings.length > 0 && (
        <Alert
          variant="destructive"
          className="m-3 mb-0 py-2 rounded-xl border-warning-border bg-warning-bg text-warning"
        >
          <AlertTriangle className="size-4 text-warning" />
          <AlertTitle className="text-xs font-semibold">Dependency notice</AlertTitle>
          <AlertDescription className="text-xs mt-1 space-y-1">
            <ul className="list-disc pl-4 space-y-1">
              {warnings.map((w, idx) => (
                <li key={idx}>{w.message}</li>
              ))}
            </ul>
            {onSwitchToList && (
              <Button variant="outline" size="sm" onClick={onSwitchToList} className="mt-1">
                Switch to task list
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Toolbar */}
      <div className="p-3 border-b bg-card/60 backdrop-blur-xs flex flex-wrap items-center justify-between gap-3 z-10">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-sm">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search tasks, assignees, or trades..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-8 h-8"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fitReadable(250)}

            title="Fit graph to view"
          >
            <Maximize2 className="size-3.5 mr-1" />
            Fit view
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRelayout}

            title="Recalculate layout"
          >
            <RefreshCw className="size-3.5 mr-1" />
            Re-layout
          </Button>

          <Button variant="outline" size="sm" onClick={() => setShowLegend((prev) => !prev)}>
            <HelpCircle className="size-3.5 mr-1" />
            Legend
            {showLegend ? (
              <ChevronUp className="size-3 ml-1" />
            ) : (
              <ChevronDown className="size-3 ml-1" />
            )}
          </Button>
        </div>
      </div>

      {/* Collapsible Legend Drawer */}
      {showLegend && (
        <div className="p-3 bg-muted/40 border-b text-xs flex flex-wrap items-center gap-y-2 gap-x-6 z-10">
          <div className="flex items-center gap-2">
            <span className="inline-block w-6 h-0.5 bg-foreground"></span>
            <span className="font-medium">FS (Finish-to-Start)</span>
            <span className="text-xs text-muted-foreground">— Predecessor must finish</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-6 h-0.5 border-t-2 border-dashed border-foreground"></span>
            <span className="font-medium">SS (Start-to-Start)</span>
            <span className="text-xs text-muted-foreground">— Predecessor must start</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="size-3 text-success" /> Done
            </span>
            <span className="flex items-center gap-1">
              <Play className="size-3 text-info" /> In progress
            </span>
            <span className="flex items-center gap-1">
              <AlertTriangle className="size-3 text-warning" /> Blocked
            </span>
            <span className="flex items-center gap-1">
              <Circle className="size-3 text-muted-foreground" /> Open
            </span>
            <span className="flex items-center gap-1">
              <PauseCircle className="size-3 text-muted-foreground" /> On hold
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            * Recorded dependencies only; does not enforce resource scheduling or live gates.
          </div>
        </div>
      )}

      {/* Main Flow Canvas */}
      <div ref={canvasRef} className="flex-1 w-full relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={true}
          minZoom={0.4}
          maxZoom={1.8}
          defaultViewport={{ x: 50, y: 50, zoom: 0.85 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="var(--border-strong)" gap={20} size={1} />
          <Controls position="bottom-right" showInteractive={false} />
        </ReactFlow>

        {/* Selected task Inspection Bar */}
        {selectedTask && (
          <div className="absolute bottom-3 left-3 right-3 sm:right-auto sm:max-w-md card-box bg-card/95 backdrop-blur-md shadow-lg flex flex-col gap-2 z-20 transition-all">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                  Selected task
                </span>
                <p className="text-xs font-semibold truncate" title={selectedTask.title}>
                  {selectedTask.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTaskId(null)}
                className="text-muted-foreground hover:text-foreground p-1"
                title="Clear selection"
              >
                <X className="size-3.5" />
              </button>
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{selectionDetails?.predecessorsCount || 0} Prerequisites</span>
              <span>•</span>
              <span>{selectionDetails?.dependentsCount || 0} Dependents</span>
              <span>•</span>
              <span className="capitalize font-medium text-foreground">{selectedTask.status}</span>
            </div>

            <div className="flex items-center gap-2 pt-1 border-t">
              <Button
                variant="default"
                size="sm"
                onClick={() => onOpenTask && onOpenTask(selectedTask)}
                className="w-full"
              >
                <ExternalLink className="size-3 mr-2" />
                Open task discussion
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Shared Project Dependency Graph component for founder and employee views.
 */
export function ProjectDependencyGraph(props) {
  return (
    <ReactFlowProvider>
      <DependencyGraphInner {...props} />
    </ReactFlowProvider>
  );
}
