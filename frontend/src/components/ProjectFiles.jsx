import {useEffect,useState} from 'react';
import {FileText,RefreshCw,ExternalLink} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {request} from '@/lib/api';
export function ProjectFiles({projectId,namespace='founder'}) {
  const [files,setFiles]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const load=async()=>{try{const data=await request(`/api/${namespace}/projects/${projectId}/files`);setFiles(data.files||[]);setError('');}catch(e){setError(e.message);}finally{setLoading(false);}};
  useEffect(()=>{let active=true;const refresh=()=>{if(active&&document.visibilityState==='visible')load();};refresh();const timer=setInterval(refresh,10000);return()=>{active=false;clearInterval(timer);};},[projectId,namespace]);
  return <section className="space-y-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Project documents & photos</h2><p className="mt-1 text-sm text-muted-foreground">Share files in the Telegram group. They are logged and saved automatically to this project's Google Drive folder. No approval is needed to save them.</p></div><Button variant="outline" onClick={load}><RefreshCw className="size-4"/>Refresh files</Button></div>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    {loading?<p>Loading files…</p>:files.length?files.map(file=><article key={file.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4"><div className="min-w-0 flex-1"><p className="break-words font-medium"><FileText className="mr-2 inline size-4"/>{file.name}</p><p className="mt-1 text-xs text-muted-foreground">{file.submittedBy} · {file.status==='Stored'?'Saved to Google Drive':'Waiting for Google Drive save'}</p>{file.error&&<p className="mt-1 text-xs text-amber-800">{file.error}</p>}</div>{file.status==='Stored'&&<a className="text-sm font-medium text-primary" href={`/api/${namespace}/projects/${projectId}/files/${encodeURIComponent(file.id)}`} target="_blank" rel="noreferrer">Open saved file <ExternalLink className="inline size-3"/></a>}</article>):<p className="rounded-xl border p-6 text-sm text-muted-foreground">No files shared yet. Ask the team or client to send photos and documents in the Telegram group.</p>}
  </section>;
}
