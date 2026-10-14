import { ArrowUpRight, CalendarDays, CheckCircle2, Clock3, FileText, MessageSquare, Users } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ProjectFiles } from '@/components/ProjectFiles';
import { calendarDay, stageSummary } from '@/lib/timeline';

export const timelineOwner = (task, members) => members.find(member => (member.employeeId || member.id) === task.assigneeId)?.name || (task.assigneeId === 'founder' ? 'Founder' : task.assigneeName || 'Unassigned');
export const timelineDate = value => value === null ? 'Not scheduled' : new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export function TimelineStageDetails({ stage, items, members, projectId, namespace, onClose, onOpenTask }) {
  const summary = stage ? stageSummary(items, stage) : null;
  const owners = summary ? [...new Set(summary.items.map(item => timelineOwner(item.task, members)))] : [];
  return <Sheet open={Boolean(stage)} onOpenChange={open => { if (!open) onClose(); }}>
    <SheetContent className="iksha-stage-details" side="right">
      {stage && <><SheetHeader><p className="iksha-eyebrow">STAGE WORKSPACE</p><SheetTitle>{stage.name}</SheetTitle><SheetDescription>Everything in this stage: work items, ownership, dates, and project references.</SheetDescription></SheetHeader>
        <div className="iksha-stage-detail-scroll">
          <div className="iksha-stage-metrics"><article><CheckCircle2 size={16}/><strong>{summary.progress}%</strong><span>{summary.complete} of {summary.items.length} complete</span></article><article><Users size={16}/><strong>{owners.filter(owner => owner !== 'Unassigned').length}</strong><span>Assigned people</span></article></div>
          <div className="iksha-stage-dates"><CalendarDays size={16}/><div><span>Scheduled window</span><strong>{timelineDate(summary.start)} → {timelineDate(summary.end === null ? null : summary.end-calendarDay)}</strong></div></div>
          {stage.description && <p className="iksha-stage-description">{stage.description}</p>}
          <Tabs key={stage.id} defaultValue="work"><TabsList className="iksha-detail-tabs"><TabsTrigger value="work"><MessageSquare size={14}/>Work & discussions</TabsTrigger><TabsTrigger value="references"><FileText size={14}/>Resources</TabsTrigger></TabsList>
            <TabsContent value="work"><div className="iksha-stage-work-list">{summary.items.map(item => <article className="iksha-stage-work-card" key={item.task.id}>
              <header><span className={`iksha-work-status ${['Completed','completed'].includes(item.task.status) ? 'complete' : item.task.status === 'Blocked' ? 'blocked' : ''}`}>{item.task.status}</span>{item.task.sourceGateType && <span className="iksha-gate-label">{item.task.sourceGateType}</span>}</header>
              <h3>{item.task.title}</h3><p>{item.task.description || 'Open this work item to see its discussion and record the next step.'}</p>
              <dl><div><dt>Accountable owner</dt><dd>{timelineOwner(item.task,members)}</dd></div><div><dt>Schedule</dt><dd>{item.start === null || item.end === null ? 'No saved dates' : `${timelineDate(item.start)} → ${timelineDate(item.end-calendarDay)}`}</dd></div></dl>
              {item.task.sourceBlockedReason && <p className="iksha-work-blocker">Blocked: {item.task.sourceBlockedReason}</p>}
              {item.task.sourceApprovalStatus && <p className="iksha-work-approval">Approval: {item.task.sourceApprovalStatus}</p>}
              <Button variant="outline" onClick={() => onOpenTask(item.task)}>Open work item & discussion <ArrowUpRight size={14}/></Button>
            </article>)}{!summary.items.length && <p className="iksha-stage-description">No work items recorded for this stage yet.</p>}</div></TabsContent>
            <TabsContent value="references"><p className="iksha-stage-reference-note">Shared project documents and photos are shown here. Links specific to a work item are available in its discussion.</p>{projectId ? <ProjectFiles projectId={projectId} namespace={namespace}/> : <p>No project references are available.</p>}</TabsContent>
          </Tabs>
          <div className="iksha-stage-footer"><Clock3 size={13}/>Completion and approval states reflect the saved project records.</div>
        </div>
      </>}
    </SheetContent>
  </Sheet>;
}
