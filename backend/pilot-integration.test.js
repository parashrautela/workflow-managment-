import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, symlink, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(),'iksha-pilot-'));
  const source = path.dirname(fileURLToPath(import.meta.url));
  await cp(source,path.join(directory,'backend'),{recursive:true,filter:(p)=>!p.endsWith('.test.js') && !p.endsWith('data.json')});
  await cp(path.join(source,'../package.json'),path.join(directory,'package.json'));
  await symlink(path.join(source,'../node_modules'),path.join(directory,'node_modules'));
  const mock = path.join(directory,'mock.js');
  await writeFile(mock,`import { appendFile } from 'node:fs/promises';
const original = fetch;
globalThis.fetch = async (url,options) => {
  if (String(url).startsWith('https://api.telegram.org/')) {
    if (String(url).endsWith('/sendMessage')) {
      const input = JSON.parse(options.body);
      await appendFile(${JSON.stringify(path.join(directory,'sends.jsonl'))}, JSON.stringify(input)+'\\n');
      if (input.text === 'Unknown') throw new Error('timeout with secret URL');
      if (input.text === 'Fail') return Response.json({ok:false},{status:400});
      return Response.json({ok:true,result:{message_id:99}});
    }
    if (String(url).endsWith('/getFile')) return Response.json({ok:true,result:{file_path:'photos/sample.jpg',file_size:3}});
    return new Response(new Uint8Array([1,2,3]));
  }
  return original(url,options);
};`);
  const reserve = net.createServer();
  await new Promise((resolve,reject)=>{reserve.once('error',reject);reserve.listen(0,'127.0.0.1',resolve);});
  const port = reserve.address().port; await new Promise((resolve)=>reserve.close(resolve));
  let child;
  const base = `http://127.0.0.1:${port}`;
  const call = async (route,method='GET',input,cookie='',integration=false) => {
    const response = await fetch(base+route,{method,headers:{'content-type':'application/json',...(cookie?{cookie}:{}),...(integration?{authorization:'Bearer test-secret'}:{})},...(input===undefined?{}:{body:JSON.stringify(input)})});
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  };
  const start = async () => {
    child = spawn(process.execPath,['--import',mock,path.join(directory,'backend/server.js')],{cwd:directory,env:{...process.env,PORT:String(port),FOUNDER_PASSWORD:'test-password',INTEGRATION_SHARED_SECRET:'test-secret',GROUP_BOT_TOKEN:'test-token',DATABASE_URL:'',NODE_ENV:'test',APP_DATA_FILE:''},stdio:'ignore'});
    for (let i=0;i<50;i++) {
      try { await call('/api/founder/projects'); return; } catch { await new Promise((resolve)=>setTimeout(resolve,50)); }
    }
    throw new Error('Test server failed to start');
  };
  const stop = async () => { if (child.exitCode === null) { const exited = new Promise((resolve)=>child.once('exit',resolve)); child.kill(); await exited; } };
  t.after(async()=>{await stop();await rm(directory,{recursive:true,force:true});});
  await start();
  const login = await call('/api/founder/login','POST',{password:'test-password'});
  return {call,cookie:login.cookie,directory,base,restart:async()=>{await stop();await start();}};
}
const payload = (messageId=10,changes={}) => ({RequestID:`REQ--123-${messageId}-question`,GroupChatID:'-123',SourceMessageID:String(messageId),RequestType:'Question',OriginalMessage:'Can we move this light?',RequestContext:'',OriginalSenderName:'Client',OriginalSenderTelegramID:'42',RequestedByName:'Client',AttachmentsJSON:'[]',...changes});

test('pilot loop: setup, start, client text/photo, two-user discussion, task assignment and persistent reply',async(t)=>{
  const f=await fixture(t); const call=(r,m,i)=>f.call(r,m,i,f.cookie);
  const created=await call('/api/founder/projects','POST',{name:'Pilot home'}); assert.equal(created.status,201); const p=created.data.project.id;
  assert.equal((await call(`/api/founder/projects/${p}/workflow/start`,'POST',{workflowId:'PILOT-DESIGN-V1'})).status,409);
  assert.equal((await call(`/api/founder/projects/${p}/client`,'POST',{clientName:'Maya',clientTelegramId:'42'})).status,200);
  const employee=await call('/api/founder/employees','POST',{name:'Neha',designation:'Designer',projectId:p,role:'Designer'});
  const credentials=employee.data.credentials;
  const signIn=await f.call('/api/employee/login','POST',credentials); const employeeCookie=signIn.cookie; assert.equal(signIn.status,200);
  const other=await call('/api/founder/projects','POST',{name:'Private project'});
  assert.equal((await f.call(`/api/employee/projects/${other.data.project.id}/workspace`,'GET',undefined,employeeCookie)).status,404);
  const started=await call(`/api/founder/projects/${p}/workflow/start`,'POST',{workflowId:'PILOT-DESIGN-V1',startDate:'2026-10-07',assigneeId:credentials.employeeId}); assert.equal(started.status,200);
  const initial=(await call(`/api/founder/projects/${p}/tasks`)).data.tasks.length;
  await call(`/api/founder/projects/${p}/workflow/start`,'POST',{workflowId:'PILOT-DESIGN-V1'});
  await call(`/api/founder/projects/${p}`,'PATCH',{telegramGroupChatId:'-123'});
  assert.equal((await call(`/api/founder/projects/${p}/tasks`)).data.tasks.length,initial);
  const query=payload(10,{AutomaticClientQuery:true,AttachmentsJSON:'[{"type":"Photo","fileId":"photo-large"}]'});
  assert.equal((await f.call('/api/integrations/telegram/requests','POST',query,'',true)).status,201);
  assert.equal((await f.call('/api/integrations/telegram/requests','POST',query,'',true)).status,200);
  const id=query.RequestID;
  assert.equal((await f.call(`/api/employee/decision-requests/${id}/comment`,'POST',{text:'Compare dimensions'},employeeCookie)).status,200);
  assert.equal((await call(`/api/founder/decision-requests/${id}/comment`,'POST',{text:'Agreed'})).status,200);
  const converted=await call(`/api/founder/decision-requests/${id}/convert`,'POST',{title:'Move light',assigneeId:credentials.employeeId,deadline:'2026-10-09'}); assert.equal(converted.status,200);
  const task=converted.data.task; assert.equal(task.sourceQueryId,id);
  assert.equal((await call(`/api/founder/decision-requests/${id}/convert`,'POST',{})).data.task.id,task.id);
  assert.equal((await f.call(`/api/employee/tasks/${task.id}/messages`,'POST',{text:'Site check booked'},employeeCookie)).status,201);
  assert.equal((await f.call(`/api/employee/tasks/${task.id}`,'PATCH',{status:'In progress'},employeeCookie)).status,200);
  assert.equal((await f.call(`/api/employee/tasks/${task.id}`,'PATCH',{assigneeId:'founder'},employeeCookie)).status,403);
  const media=await fetch(`${f.base}/api/founder/decision-requests/${id}/attachments/0`,{headers:{cookie:f.cookie}}); assert.equal(media.status,200); assert.equal((await media.arrayBuffer()).byteLength,3);
  const employeeMedia=await fetch(`${f.base}/api/employee/decision-requests/${id}/attachments/0`,{headers:{cookie:employeeCookie}}); assert.equal(employeeMedia.status,200);
  const published=await call(`/api/founder/decision-requests/${id}/publish`,'POST',{response:'Approved',idempotencyKey:'reply-1'}); assert.equal(published.status,200);
  assert.equal((await call(`/api/founder/decision-requests/${id}/publish`,'POST',{response:'Approved',idempotencyKey:'reply-1'})).status,200);
  assert.equal((await readFile(path.join(f.directory,'sends.jsonl'),'utf8')).trim().split('\n').length,1);
  await f.restart();
  assert.equal((await call(`/api/founder/tasks/${task.id}`)).data.task.status,'In progress');
  assert.equal((await call(`/api/founder/tasks/${task.id}/messages`)).data.messages[0].text,'Site check booked');
  const restored=await call(`/api/founder/decision-requests/${id}`); assert.equal(restored.data.request.comments.length,2); assert.equal(restored.data.request.publishedMessageId,'99');
  const members=(await call(`/api/founder/projects/${p}/workspace`)).data.project.members;
  assert.equal((await call(`/api/founder/projects/${p}/members/${members[0].id}`,'DELETE')).status,200);
  assert.equal((await f.call(`/api/employee/tasks/${task.id}`,'GET',undefined,employeeCookie)).status,404);
  const revokedMedia=await fetch(`${f.base}/api/employee/decision-requests/${id}/attachments/0`,{headers:{cookie:employeeCookie}}); assert.equal(revokedMedia.status,404);
  assert.equal((await call(`/api/founder/tasks/${task.id}`)).data.task.assigneeId,'');
  await call(`/api/founder/employees/${credentials.employeeId}/disable`,'POST',{});
  assert.equal((await f.call('/api/employee/me','GET',undefined,employeeCookie)).status,401);
  assert.equal((await f.call('/api/employee/login','POST',credentials)).status,401);
});

test('uncertain publishing survives restart and cannot resend; definitive rejection can retry',async(t)=>{
  const f=await fixture(t); const call=(r,m,i)=>f.call(r,m,i,f.cookie);
  const p=(await call('/api/founder/projects','POST',{name:'Send test',clientName:'Maya'})).data.project.id;
  await call(`/api/founder/projects/${p}`,'PATCH',{telegramGroupChatId:'-123'});
  for (const number of [10,11]) await f.call('/api/integrations/telegram/requests','POST',payload(number),'',true);
  const route='/api/founder/decision-requests/REQ--123-10-question/publish';
  assert.equal((await call(route,'POST',{response:'Unknown',idempotencyKey:'u'})).status,502);
  await f.restart();
  assert.equal((await call(route,'POST',{response:'Unknown',idempotencyKey:'u'})).status,409);
  assert.equal((await call(route,'POST',{response:'New attempt',idempotencyKey:'new'})).status,409);
  const route2='/api/founder/decision-requests/REQ--123-11-question/publish';
  assert.equal((await call(route2,'POST',{response:'Fail',idempotencyKey:'f'})).status,502);
  assert.equal((await call(route2,'POST',{response:'Corrected',idempotencyKey:'corrected'})).status,200);
  assert.equal((await readFile(path.join(f.directory,'sends.jsonl'),'utf8')).trim().split('\n').length,3);
});

test('intake rejects invalid media, incorrect client, bad dates and cross-origin mutations',async(t)=>{
  const f=await fixture(t); const call=(r,m,i)=>f.call(r,m,i,f.cookie);
  const p=(await call('/api/founder/projects','POST',{name:'Validation'})).data.project.id;
  await call(`/api/founder/projects/${p}/client`,'POST',{clientName:'Maya',clientTelegramId:'42'});
  assert.equal((await call(`/api/founder/projects/${p}/workflow/start`,'POST',{workflowId:'PILOT-DESIGN-V1',startDate:'2026-02-30'})).status,400);
  await call(`/api/founder/projects/${p}`,'PATCH',{telegramGroupChatId:'-123'});
  assert.equal((await f.call('/api/integrations/telegram/requests','POST',payload(10,{AttachmentsJSON:'[null]'}),'',true)).status,400);
  assert.equal((await f.call('/api/integrations/telegram/requests','POST',payload(10,{AutomaticClientQuery:true,OriginalSenderTelegramID:'43'}),'',true)).status,403);
  assert.equal((await call(`/api/founder/projects/${p}/tasks`)).data.tasks.length,0);
  const response=await fetch(f.base+'/api/founder/projects',{method:'POST',headers:{cookie:f.cookie,origin:'https://evil.example','content-type':'application/json'},body:JSON.stringify({name:'No'})}); assert.equal(response.status,403);
});
