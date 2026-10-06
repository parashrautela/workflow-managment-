import React,{useEffect,useState} from 'react';
import {get,post} from '@/lib/api';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
export function StageTaskActions({task,projectId,namespace,onUpdated}){
 const [context,setContext]=useState(null),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{get(`/api/${namespace}/tasks/${task.id}/stage-context`).then(setContext).catch(e=>setError(e.message));},[task.id,namespace]);
 const act=async action=>{setBusy(true);setError('');try{const result=await post(`/api/${namespace}/tasks/${task.id}/stage-action`,{action,reason});onUpdated(result.task);}catch(e){setError(e.message);}finally{setBusy(false);}};
 const approval=['internal','client'].includes(task.stepKey),active=['Open','In progress'].includes(task.status);
 return <section className="rounded-xl border p-4 space-y-3">
  <p className="font-semibold">Step {task.stepOrder}/6 · {task.assigneeName}</p>
  <p className="text-sm">{task.status}{task.holdReason?` — ${task.holdReason}`:''}</p>
  {task.blockedReason&&<p className="text-sm">Schedule paused: {task.blockedReason}</p>}
  {task.status==='Waiting'&&<p className="text-sm text-muted-foreground">Waiting for the previous step to finish.</p>}
  {task.notificationStatus==='Unknown'||task.notificationStatus==='Sending'?<p role="alert" className="text-sm">Telegram notification is unconfirmed. Check the group before retrying.</p>:null}
  <Input aria-label="Hold or revision reason" placeholder="Reason for hold or requested changes" value={reason} onChange={e=>setReason(e.target.value)}/>
  <div className="flex flex-wrap gap-2">
   {active&&<><Button disabled={busy} onClick={()=>act(approval?'approve':'done')}>{approval?'Approve drawing':'Complete step'}</Button><Button variant="outline" disabled={busy||!reason.trim()} onClick={()=>act('hold')}>Hold</Button>{approval&&<Button variant="outline" disabled={busy||!reason.trim()} onClick={()=>act('changes')}>Request changes</Button>}</>}
   {task.status==='On hold'&&<Button disabled={busy} onClick={()=>act('resume')}>Resume</Button>}
  </div>
  {error&&<p role="alert" className="text-destructive text-sm">{error}</p>}
  {context&&<div className="space-y-2"><p className="text-sm font-medium">Current and previous step’s updates</p>{context.updates.map(update=><p key={update.UpdateID} className="text-sm">{update.Text||'Attachment submitted'}</p>)}{context.files.map(file=><p key={file.SubmissionID} className="text-sm">{file.FileName} · {file.DriveStatus||'Pending'} {file.DriveStatus==='Stored'&&<a className="underline" href={`/api/${namespace}/projects/${projectId}/files/${encodeURIComponent(file.SubmissionID)}`} target="_blank" rel="noreferrer">Open file</a>}</p>)}{!context.updates.length&&!context.files.length&&<p className="text-xs text-muted-foreground">No task-specific documents or updates yet.</p>}</div>}
 </section>;
}
