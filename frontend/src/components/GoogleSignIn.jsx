import {useEffect,useRef,useState} from 'react';
import {request} from '@/lib/api';
let sdk;
function loadGoogle() {
 if(window.google?.accounts?.id)return Promise.resolve(window.google.accounts.id);
 if(!sdk)sdk=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
  script.onload=()=>resolve(window.google.accounts.id);script.onerror=()=>{script.remove();sdk=null;reject(Error('Google sign-in could not load. Try again.'));};document.head.appendChild(script);
 });
 return sdk;
}
export function GoogleSignIn({mode='login',onComplete}) {
 const host=useRef(null),complete=useRef(onComplete),[enabled,setEnabled]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[busy,setBusy]=useState(false);
 complete.current=onComplete;
 useEffect(()=>{
  let cancelled=false;
  (async()=>{
   const config=await request('/api/auth/google/config');if(cancelled || !config.enabled)return;
   setEnabled(true);
   const [google,challenge]=await Promise.all([loadGoogle(),request('/api/auth/google/challenge',{method:'POST',body:{mode}})]);
   if(cancelled || !host.current)return;
   google.initialize({client_id:config.clientId,nonce:challenge.nonce,auto_select:false,ux_mode:'popup',callback:async response=>{
    if(cancelled)return;setBusy(true);setError('');
    try{
     const result=await request('/api/auth/google/sign-in',{method:'POST',body:{credential:response.credential,nonce:challenge.nonce}});
     if(result.redirect){window.location.assign(result.redirect);return;}
     setMessage(result.message || 'Google account connected.');complete.current?.(result);setAttempt(value=>value+1);
    }catch(problem){setError(problem.message);}finally{setBusy(false);}
   }});
   host.current.replaceChildren();google.renderButton(host.current,{type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'rectangular',width:Math.min(360,host.current.clientWidth || 300)});
  })().catch(problem=>{if(!cancelled)setError(problem.message);});
  return()=>{cancelled=true;};
 },[mode,attempt]);
 if(!enabled && !error)return null;
 return <div className="mt-5 space-y-3"><div className={busy?'pointer-events-none opacity-60':''} ref={host}/>{busy && <p className="text-sm text-muted-foreground">Checking your Google account…</p>}{message && <p role="status" className="rounded-lg border bg-secondary p-3 text-sm">{message}</p>}{error && <p role="alert" className="text-sm text-destructive">{error} <button className="underline" onClick={()=>{setError('');setAttempt(value=>value+1);}}>Try again</button></p>}{mode==='login' && enabled && <p className="text-xs text-muted-foreground">New team members need founder approval before seeing project work.</p>}</div>;
}
