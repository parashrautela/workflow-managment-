import { useMemo, useState } from 'react';
import { ArrowUpRight, FileText, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ProjectFiles } from '@/components/ProjectFiles';
import { ProjectTimeline } from '@/components/ProjectTimeline';
import sheet from '@/data/sheet-workflows.json';
import { buildSheetPlan } from '@/lib/sheetPlan';

const localToday = () => { const date=new Date();return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0'); };

export function ProjectTimelineWorkspace({ tasks=[], stages=[], members=[], projectId, projectStartDate, namespace='founder', onOpenTask, onSchedulePreview, onScheduleApply }) {
  // Open on the project's real tasks. The sheet plan is a reference preview, shown first only when no tasks exist.
  // Tasks load after mount, so the default follows them until the founder picks a view.
  const [chosenMode,setMode]=useState(null);
  const mode=chosenMode ?? (tasks.length ? 'project' : 'sheet');
  const [planId,setPlanId]=useState(sheet.defaultPlanId);
  const [start,setStart]=useState(projectStartDate?.slice(0,10) || localToday());
  const [selected,setSelected]=useState(null);
  const plan=sheet.plans.find(item=>item.id===planId) || sheet.plans[0];
  const projection=useMemo(()=>buildSheetPlan(plan,start,tasks,stages),[plan,start,tasks,stages]);
  const sourceLink = task => sheet.sourceUrl + (task.sheetSourceTab==='WORKFLOWS'?'&range='+task.sheetSourceCell:'');
  return <section className="iksha-sheet-workspace">
    <div className="iksha-plan-modes" aria-label="Timeline source"><button aria-pressed={mode==='sheet'} className={mode==='sheet'?'active':''} onClick={()=>setMode('sheet')}>Full Google Sheet plan</button><button aria-pressed={mode==='project'} className={mode==='project'?'active':''} onClick={()=>setMode('project')}>Project tasks ({tasks.length})</button></div>
    {mode==='sheet'?<><div className="iksha-sheet-source"><div><span className="iksha-eyebrow">IMPORTED FROM GOOGLE SHEETS</span><strong>{plan.name} · {plan.stages.length} stages · {plan.taskCount} work items</strong><p>Every work item from the main and parallel columns, with the sheet’s original roles and durations.</p></div><a href={sheet.sourceUrl} target="_blank" rel="noreferrer">Open source sheet <ExternalLink size={13}/></a></div>
      <div className="iksha-sheet-settings"><label>Sheet workflow<select value={planId} onChange={event=>setPlanId(event.target.value)}>{sheet.plans.map(item=><option key={item.id} value={item.id}>{item.name} — {item.taskCount} work items{item.sheet==='Copy of WORKFLOWS'?' (copy tab)':''}</option>)}</select></label><label>Plan starts<input type="date" value={start} onChange={event=>{if(event.target.value)setStart(event.target.value);}}/></label><span>Calendar days · Imported {new Date(sheet.fetchedAt).toLocaleDateString([], {month:'short',day:'numeric'})}</span></div>
      <p className="iksha-sheet-plan-note">This is the full sheet plan. Dates are calculated from its order, durations, and parallel placement. Completion is shown only for uniquely linked project tasks; items without a duration stay unscheduled.</p>
      <ProjectTimeline key={planId+start} tasks={projection.tasks} stages={projection.stages} members={members} projectId={projectId} namespace={namespace} onOpenTask={setSelected}/>
    </>:<ProjectTimeline tasks={tasks} stages={stages} members={members} projectId={projectId} namespace={namespace} onOpenTask={onOpenTask} onSchedulePreview={onSchedulePreview} onScheduleApply={onScheduleApply}/>}
    <Dialog open={Boolean(selected)} onOpenChange={open=>{if(!open)setSelected(null);}}><DialogContent className="iksha-sheet-item-detail"><DialogHeader><span className="iksha-eyebrow">GOOGLE SHEET WORK ITEM</span><DialogTitle>{selected?.title}</DialogTitle><DialogDescription>{projection.stages.find(stage=>stage.id===selected?.stageId)?.name}</DialogDescription></DialogHeader>{selected&&<><dl className="iksha-sheet-item-facts"><div><dt>Responsible role</dt><dd>{selected.sheetRole || 'Not specified in the sheet'}</dd></div><div><dt>Duration</dt><dd>{selected.sheetDurationDays===null?'Missing in source sheet':selected.sheetDurationDays+' calendar days'}</dd></div><div><dt>Work order</dt><dd>{selected.sheetTaskOrder}</dd></div><div><dt>Source</dt><dd>{selected.sheetSourceTab} · {selected.sheetSourceCell}</dd></div><div><dt>Planned start</dt><dd>{selected.sourceCurrentStart || 'Awaiting duration'}</dd></div><div><dt>Planned finish</dt><dd>{selected.sourceCurrentEnd || 'Awaiting duration'}</dd></div></dl>{selected.missingDuration&&<p className="iksha-work-blocker">The sheet has no duration for this item. Set its duration in the plan before relying on a finish date.</p>}<a className="iksha-sheet-source-link" href={sourceLink(selected)} target="_blank" rel="noreferrer">View source work item <ExternalLink size={13}/></a>{selected.linkedTaskId?<Button onClick={()=>{const task=tasks.find(task=>task.id===selected.linkedTaskId);setSelected(null);if(task)onOpenTask(task);}}>Open linked project discussion <ArrowUpRight size={14}/></Button>:<p className="iksha-sheet-plan-note">This item is in the sheet plan. No unique project task is linked to it yet.</p>}<details className="iksha-task-resources"><summary><FileText size={14}/>Shared project resources</summary><ProjectFiles projectId={projectId} namespace={namespace}/></details></>}</DialogContent></Dialog>
  </section>;
}
