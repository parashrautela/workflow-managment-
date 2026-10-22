import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {request} from '@/lib/api';
export function ProjectSpaces({project,onUpdated}) {
 const [names,setNames]=useState((project.spaces || []).join('\n')),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 useEffect(()=>{setNames((project.spaces || []).join('\n'));},[project.id,JSON.stringify(project.spaces)]);
 const save=async()=>{setBusy(true);setError('');try{await request(`/api/founder/projects/${project.id}/spaces`,{method:'POST',body:{spaces:names.split('\n').map(name=>name.trim()).filter(Boolean)}});setNotice('Spaces saved. Select them when adding a stage.');onUpdated?.();}catch(problem){setError(problem.message);}finally{setBusy(false);}};
 return <details className="rounded-xl border bg-card p-4"><summary className="cursor-pointer text-sm font-semibold">Project spaces · {project.spaces?.length || 0}</summary><div className="mt-3 space-y-3"><label className="grid gap-1 text-xs">One space per line<textarea className="min-h-28 rounded-md border bg-background p-3 text-sm" value={names} onChange={event=>setNames(event.target.value)} placeholder={'Living room\nKitchen\nBedroom 1'}/></label><p className="text-xs text-muted-foreground">Stage space selection is optional. No selection means the whole project. Spaces in use must be removed from their stages before deletion.</p><Button disabled={busy || ['Completed','Abandoned'].includes(project.status)} onClick={save}>Save spaces</Button>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}{notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}</div></details>;
}
