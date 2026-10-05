// frontend/src/components/WorkflowTemplateModal.jsx
import React, { useEffect, useState } from "react";
import { AlertCircle, Check, Clock, Layers, Sparkles, User, Calendar, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { fetchWorkflows, startWorkflow } from "@/lib/api";

export function WorkflowTemplateModal({
  open,
  onOpenChange,
  projectId,
  projectStartDate,
  telegramLinked = false,
  clientAssigned = true,
  projectMembers = [],
  onApplied
}) {
  const [workflows, setWorkflows] = useState([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [startDate, setStartDate] = useState(projectStartDate || new Date().toLocaleDateString("en-CA"));
  const [assigneeId, setAssigneeId] = useState("founder");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setError("");
      setLoading(true);
      fetchWorkflows("founder", projectId)
        .then((list) => {
          setWorkflows(list || []);
          if (list && list.length > 0 && !selectedWorkflowId) {
            setSelectedWorkflowId(list[0].id);
          }
        })
        .catch((err) => {
          setError(err.message || "Failed to load workflow templates.");
        })
        .finally(() => setLoading(false));
    }
  }, [open]);

  useEffect(() => {
    if (projectStartDate) {
      setStartDate(projectStartDate);
    }
  }, [projectStartDate]);

  const selectedTemplate = workflows.find((t) => t.id === selectedWorkflowId) || workflows[0] || null;

  const handleStartWorkflow = async () => {
    if (!projectId || !selectedTemplate) return;
    if (!clientAssigned) {
      setError("You must assign a client to this project before starting a workflow.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const res = await startWorkflow(projectId, {
        workflowId: selectedTemplate.id,
        startDate: startDate || undefined,
        assigneeId: assigneeId || undefined
      });
      onOpenChange(false);
      if (onApplied) onApplied(res.project);
    } catch (err) {
      setError(err.message || "Failed to start workflow.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl sm:rounded-2xl">
        <div className="shrink-0 border-b bg-card px-6 py-4 pr-12">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <Layers className="size-5" />
            </span>
            <div>
              <DialogTitle className="text-lg font-semibold tracking-tight">Choose project type</DialogTitle>
              <DialogDescription className="text-xs">
                Choose the project type to generate stages and tasks. Telegram projects start the same plan in the group.
              </DialogDescription>
            </div>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-3 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!clientAssigned && (
          <div className="mx-6 mt-3 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
            <AlertCircle className="size-4 shrink-0 text-amber-700" />
            <span>Client assignment required: Assign a client to unlock starting this workflow.</span>
          </div>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[270px_1fr] md:overflow-hidden">
          {/* Left: Template Selector List */}
          <div className="chat-scroll min-w-0 md:overflow-y-auto border-r bg-muted/20 p-3 space-y-2">
            <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Available Templates ({workflows.length})
            </p>
            {loading ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-5 animate-spin text-primary" />
                <span>Loading templates…</span>
              </div>
            ) : workflows.map((tmpl) => {
              const active = tmpl.id === selectedWorkflowId;
              const totalDays = tmpl.stages?.reduce((acc, s) => acc + (s.durationDays || 0), 0) || tmpl.estimatedDays || 0;
              return (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => setSelectedWorkflowId(tmpl.id)}
                  className={`w-full rounded-xl p-3 text-left transition-all ${
                    active
                      ? "bg-card border-primary/50 shadow-xs ring-1 ring-primary/20 border"
                      : "hover:bg-card/70 border border-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-foreground truncate">{tmpl.name}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0 font-mono">
                      {tmpl.id}
                    </Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Clock className="size-3" />
                    <span>{tmpl.parallel || !totalDays ? "Dates need confirmation" : `~${totalDays} days`}</span>
                    <span>·</span>
                    <span>{tmpl.stages?.length || 0} stages</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right: Selected Template Details & Configuration */}
          <div className="chat-scroll min-w-0 md:overflow-y-auto p-5 space-y-5">
            {selectedTemplate ? (
              <>
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold">{selectedTemplate.name}</h3>
                    <Badge variant="secondary" className="text-xs">
                      {selectedTemplate.category || "Standard"} Workflow
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    {selectedTemplate.description || `Structured pilot workflow pipeline generating sequential project stages and starter tasks.`}
                  </p>
                </div>

                {/* Configuration: Start date & Initial Assignee */}
                <div className="rounded-xl border bg-muted/30 p-3.5 space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Workflow Configuration
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="grid gap-1.5 text-xs font-medium">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Calendar className="size-3.5 text-primary" /> Start Date
                      </span>
                      <Input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="h-9 text-xs"
                      />
                    </label>

                    <label className="grid gap-1.5 text-xs font-medium">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <User className="size-3.5 text-primary" /> Starter Tasks Assignee
                      </span>
                      <NativeSelect
                        value={assigneeId}
                        onChange={(e) => setAssigneeId(e.target.value)}
                        className="h-9 text-xs"
                      >
                        <option value="founder">Founder (Default)</option>
                        {projectMembers.map((member) => (
                          <option key={member.id || member.employeeId} value={member.employeeId || member.id}>
                            {member.name} ({member.role || member.designation || "Member"})
                          </option>
                        ))}
                      </NativeSelect>
                    </label>
                  </div>
                </div>

                {/* Stages Overview */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Pipeline Stages ({selectedTemplate.stages?.length || 0})
                  </h4>
                  <div className="space-y-2">
                    {(selectedTemplate.stages || []).map((stage, idx) => (
                      <div
                        key={stage.id || idx}
                        className="rounded-xl border bg-card p-3 text-xs shadow-2xs space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 font-semibold">
                            <span className="grid size-5 place-items-center rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                              {idx + 1}
                            </span>
                            <span>{stage.name}</span>
                          </div>
                          <span className="text-muted-foreground font-mono">{stage.durationDays} day{stage.durationDays === 1 ? "" : "s"}</span>
                        </div>

                        {stage.tasks && stage.tasks.length > 0 && (
                          <div className="pl-7 space-y-1">
                            {stage.tasks.map((taskTitle, tIdx) => (
                              <div key={tIdx} className="flex items-center gap-2 text-muted-foreground text-[11px]">
                                <Check className="size-3 text-emerald-600 shrink-0" />
                                <span>{taskTitle}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="py-12 text-center text-xs text-muted-foreground">
                No template selected.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 flex-col items-stretch justify-between gap-3 border-t bg-muted/20 px-6 py-3 sm:flex-row sm:items-center">
          <p className="text-xs text-muted-foreground">
            Starting a workflow locks the template and creates active stages and tasks.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={handleStartWorkflow}
              disabled={submitting || !clientAssigned || !selectedTemplate}
            >
              {submitting ? (
                <>
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                  Starting Workflow…
                </>
              ) : (
                <>
                  <Sparkles className="size-3.5 mr-1.5" />
                  Start {selectedTemplate?.name || "Workflow"}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
