import { googleTestIdentity } from './test-helpers/google-identity.js';
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
  const google = await googleTestIdentity(directory);
  await google.seed(path.join(directory, 'backend/data.json'));
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
    child = spawn(process.execPath,['--import',mock,'--import',google.mock,path.join(directory,'backend/server.js')],{cwd:directory,env:{...process.env,PORT:String(port),GOOGLE_CLIENT_ID:google.clientId,INITIAL_FOUNDER_EMAIL:'',INTEGRATION_SHARED_SECRET:'test-secret',GROUP_BOT_TOKEN:'test-token',DATABASE_URL:'',NODE_ENV:'test',APP_DATA_FILE:''},stdio:'ignore'});
    for (let i=0;i<50;i++) {
      try { await call('/api/founder/projects'); return; } catch { await new Promise((resolve)=>setTimeout(resolve,50)); }
    }
    throw new Error('Test server failed to start');
  };
  const stop = async () => { if (child.exitCode === null) { const exited = new Promise((resolve)=>child.once('exit',resolve)); child.kill(); await exited; } };
  t.after(async()=>{await stop();await rm(directory,{recursive:true,force:true});});
  await start();
  const login = await google.signIn(base);
  return {call,signIn:identity=>google.signIn(base,identity),cookie:login.cookie,directory,base,restart:async()=>{await stop();await start();}};
}
const payload = (messageId=10,changes={}) => ({RequestID:`REQ--123-${messageId}-question`,GroupChatID:'-123',SourceMessageID:String(messageId),RequestType:'Question',OriginalMessage:'Can we move this light?',RequestContext:'',OriginalSenderName:'Client',OriginalSenderTelegramID:'42',RequestedByName:'Client',AttachmentsJSON:'[]',...changes});

test('custom timelines persist across restart, close read-only, and abandonment retains recoverable history', async (t) => {
  const f = await fixture(t); const call = (route, method, input) => f.call(route, method, input, f.cookie);
  const p = (await call('/api/founder/projects', 'POST', { name: 'Custom home' })).data.project.id;
  const stage = { custom: true, name: 'Permits', placement: { type: 'date', startDate: '2026-11-01' }, tasks: [{ key: 'permit', title: 'Apply for permit', role: 'Architect', assigneeId: 'founder', durationDays: 3 }] };
  const added = await call(`/api/founder/projects/${p}/stages/apply`, 'POST', { stage });
  assert.equal(added.status, 200);
  await f.restart();
  const workspace = await call(`/api/founder/projects/${p}/workspace`);
  assert.equal(workspace.data.project.stages[0].name, 'Permits');
  assert.equal(workspace.data.tasks[0].sourceForecastStart, '2026-11-01');
  assert.equal((await call(`/api/founder/projects/${p}/client`, 'POST', { clientName: 'Maya' })).status, 200, 'client can be assigned after planning');
  assert.equal((await call(`/api/founder/projects/${p}/complete`, 'POST', {})).status, 200);
  assert.equal((await call(`/api/founder/projects/${p}/complete`, 'POST', {})).status, 200);
  assert.equal((await call(`/api/founder/projects/${p}/stages/apply`, 'POST', { stage })).status, 409);
  assert.equal((await call(`/api/founder/projects/${p}/trash`, 'POST', {})).status, 200);
  assert.equal((await call(`/api/founder/trash/${p}/restore`, 'POST', {})).status, 200);
  assert.equal((await call(`/api/founder/projects/${p}/workspace`)).data.project.status, 'Completed');
  const abandoned = (await call('/api/founder/projects', 'POST', { name: 'Cancelled home' })).data.project.id;
  await call(`/api/founder/projects/${abandoned}/stages/apply`, 'POST', { stage });
  assert.equal((await call(`/api/founder/projects/${abandoned}/trash`, 'POST', {})).status, 200);
  await f.restart();
  const trash = await call('/api/founder/trash');
  assert.equal(trash.data.projects.find((project) => project.id === abandoned).status, 'Abandoned');
  assert.equal((await call(`/api/founder/trash/${abandoned}/restore`, 'POST', {})).status, 200);
  assert.equal((await call(`/api/founder/projects/${abandoned}/workspace`)).data.tasks[0].title, 'Apply for permit');
});

test('pilot loop: setup, start, client text/photo, two-user discussion, task assignment and persistent reply',async(t)=>{
  const f=await fixture(t); const call=(r,m,i)=>f.call(r,m,i,f.cookie);
  const created=await call('/api/founder/projects','POST',{name:'Pilot home'}); assert.equal(created.status,201); const p=created.data.project.id;
  assert.equal((await call(`/api/founder/projects/${p}/workflow/start`,'POST',{workflowId:'PILOT-DESIGN-V1'})).status,409);
  assert.equal((await call(`/api/founder/projects/${p}/client`,'POST',{clientName:'Maya',clientTelegramId:'42'})).status,200);
  const employee=await call('/api/founder/employees','POST',{name:'Neha',designation:'Designer',projectId:p,role:'Designer',email:'neha@gmail.com'});
  const credentials={employeeId:employee.data.employee.id};
  const signIn=await f.signIn({sub:'neha-google',email:'neha@gmail.com',name:'Neha'}); const employeeCookie=signIn.cookie; assert.equal(signIn.status,200);
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
  assert.equal((await f.call(`/api/employee/tasks/${task.id}`,'PATCH',{status:'In progress'},employeeCookie)).status,403);
  assert.equal((await f.call(`/api/employee/tasks/${task.id}`,'PATCH',{assigneeId:'founder'},employeeCookie)).status,403);
  const media=await fetch(`${f.base}/api/founder/decision-requests/${id}/attachments/0`,{headers:{cookie:f.cookie}}); assert.equal(media.status,200); assert.equal((await media.arrayBuffer()).byteLength,3);
  const employeeMedia=await fetch(`${f.base}/api/employee/decision-requests/${id}/attachments/0`,{headers:{cookie:employeeCookie}}); assert.equal(employeeMedia.status,200);
  const published=await call(`/api/founder/decision-requests/${id}/publish`,'POST',{response:'Approved',idempotencyKey:'reply-1'}); assert.equal(published.status,200);
  assert.equal((await call(`/api/founder/decision-requests/${id}/publish`,'POST',{response:'Approved',idempotencyKey:'reply-1'})).status,200);
  assert.equal((await readFile(path.join(f.directory,'sends.jsonl'),'utf8')).trim().split('\n').length,1);
  await f.restart();
  assert.equal((await call(`/api/founder/tasks/${task.id}`)).data.task.status,'Open');
  assert.equal((await call(`/api/founder/tasks/${task.id}/messages`)).data.messages[0].text,'Site check booked');
  const restored=await call(`/api/founder/decision-requests/${id}`); assert.equal(restored.data.request.comments.length,2); assert.equal(restored.data.request.publishedMessageId,'99');
  const members=(await call(`/api/founder/projects/${p}/workspace`)).data.project.members;
  assert.equal((await call(`/api/founder/projects/${p}/members/${members[0].id}`,'DELETE')).status,200);
  assert.equal((await f.call(`/api/employee/tasks/${task.id}`,'GET',undefined,employeeCookie)).status,404);
  const revokedMedia=await fetch(`${f.base}/api/employee/decision-requests/${id}/attachments/0`,{headers:{cookie:employeeCookie}}); assert.equal(revokedMedia.status,404);
  assert.equal((await call(`/api/founder/tasks/${task.id}`)).data.task.assigneeId,'');
  await call(`/api/founder/employees/${credentials.employeeId}/disable`,'POST',{});
  assert.equal((await f.call('/api/employee/me','GET',undefined,employeeCookie)).status,401);
  assert.equal((await f.signIn({sub:'neha-google',email:'neha@gmail.com',name:'Neha'})).status,403);
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

test('founders pre-approve Google email, preserve profile history and revoke the old identity on email change', async t => {
  const f = await fixture(t), call = (r,m,i) => f.call(r,m,i,f.cookie);
  const p = (await call('/api/founder/projects','POST',{name:'Access home'})).data.project.id;
  assert.equal((await call('/api/founder/employees','POST',{name:'Ravi',designation:'Designer',projectId:p})).status,400);
  const created = await call('/api/founder/employees','POST',{name:'Ravi',designation:'Designer',projectId:p,email:' RAVI@gmail.com '});
  assert.equal(created.status,201); assert.ok(!created.data.credentials); const id=created.data.employee.id;
  assert.equal((await call('/api/founder/employees','POST',{name:'Duplicate',designation:'Designer',projectId:p,email:'ravi@gmail.com'})).status,409);
  const signed=await f.signIn({sub:'ravi-google',email:'ravi@gmail.com',name:'Ravi'}); assert.equal(signed.data.redirect,'/employee');
  assert.equal((await f.call('/api/employee/me','GET',undefined,signed.cookie)).data.employee.id,id);
  const edited=await call(`/api/founder/employees/${id}`,'PATCH',{name:'Ravi Kumar',designation:'Senior designer',email:'new-ravi@gmail.com'});
  assert.equal(edited.status,200);
  assert.equal((await f.call('/api/employee/me','GET',undefined,signed.cookie)).status,401);
  assert.equal((await f.signIn({sub:'ravi-google',email:'ravi@gmail.com',name:'Ravi'})).data.status,'Rejected');
  const replacement=await f.signIn({sub:'ravi-new-google',email:'new-ravi@gmail.com',name:'Ravi'});
  assert.equal((await f.call('/api/employee/me','GET',undefined,replacement.cookie)).data.employee.id,id);
  const workspace=(await call(`/api/founder/projects/${p}/workspace`)).data;
  assert.equal(workspace.project.members.find(member=>member.employeeId===id).name,'Ravi Kumar');
  assert.equal((await call(`/api/founder/employees/${id}`,'PATCH',{email:'not-email'})).status,400);
  assert.equal((await call(`/api/founder/employees/${id}/password`,'POST',{password:'any-password'})).status,410);
  assert.equal((await f.call('/api/employee/login','POST',{employeeId:id,password:'any-password'})).status,410);
});

test('spaces, reusable templates and branched stage links persist with atomic batch validation', async t => {
  const f=await fixture(t), call=(route,method,input)=>f.call(route,method,input,f.cookie);
  const create=async name=>(await call('/api/founder/projects','POST',{name})).data.project.id;
  const p=await create('Template source');
  assert.equal((await call(`/api/founder/projects/${p}/spaces`,'POST',{spaces:['Living room','Kitchen']})).status,200);
  const one=(name,placement)=>({custom:true,name,spaces:['Kitchen'],placement,tasks:[{title:`Work ${name}`,role:'Founder',durationDays:2}]});
  const stages=[one('A',{type:'date',startDate:'2026-11-01'}),one('B',{type:'parallel',stageName:'A'}),one('C',{type:'after',predecessors:[{stageName:'A',type:'FS'},{stageName:'B',type:'FS'}]})];
  assert.equal((await call(`/api/founder/projects/${p}/stages/preview`,'POST',{stages})).data.created.length,3);
  assert.equal((await call(`/api/founder/projects/${p}/workspace`)).data.tasks.length,0,'preview has no writes');
  const bad=await call(`/api/founder/projects/${p}/stages/apply`,'POST',{stages:[stages[0],{...stages[1],tasks:[]}]});
  assert.equal(bad.status,400);
  assert.equal((await call(`/api/founder/projects/${p}/workspace`)).data.tasks.length,0,'a bad later stage does not partially save');
  const added=await call(`/api/founder/projects/${p}/stages/apply`,'POST',{stages});assert.equal(added.status,200);
  assert.equal(added.data.tasks.find(task=>task.title==='Work C').sourceForecastStart,'2026-11-03');
  assert.equal(added.data.tasks.find(task=>task.title==='Work C').planPredecessors.length,2);
  assert.equal((await call(`/api/founder/projects/${p}/spaces`,'POST',{spaces:['Living room']})).status,400,'used rooms remain protected');
  const saved=await call('/api/founder/plan-templates','POST',{projectId:p,name:'House plan'});assert.equal(saved.status,201);
  assert.equal(saved.data.template.stages.find(stage=>stage.name==='C').placement.predecessors.length,2);
  const target=await create('Template destination');
  const reusable=saved.data.template.stages.map(stage=>({...stage,custom:true,spaces:[],placement:stage.placement || {type:'date',startDate:'2026-12-01'}}));
  assert.equal((await call(`/api/founder/projects/${target}/stages/apply`,'POST',{stages:reusable})).status,200);
  const {connectionTasks,connectionFingerprint,stageLinksFor}=await import('./stage-connections.js');
  let workspace=(await call(`/api/founder/projects/${p}/workspace`)).data;
  const normalized=connectionTasks(workspace.tasks),fingerprint=connectionFingerprint(normalized);
  const ids=Object.fromEntries(workspace.project.stages.map(stage=>[stage.name,stage.id]));
  const links=[{source:ids.A,target:ids.C,type:'FS'},{source:ids.B,target:ids.C,type:'FS'}];
  const preview=await call(`/api/founder/projects/${p}/stage-links/preview`,'POST',{links,fingerprint});assert.equal(preview.status,200);
  assert.equal((await call(`/api/founder/projects/${p}/stage-links/apply`,'POST',{links,fingerprint:'stale'})).status,409);
  assert.equal((await call(`/api/founder/projects/${p}/stage-links/apply`,'POST',{links,fingerprint})).status,200);
  await f.restart();workspace=(await call(`/api/founder/projects/${p}/workspace`)).data;
  assert.equal(stageLinksFor(connectionTasks(workspace.tasks)).length,2);
  assert.deepEqual(workspace.project.spaces,['Living room','Kitchen']);
  assert.equal((await call('/api/founder/plan-templates')).data.templates.filter(row=>!row.builtin).length,1);
});

test('active multiple clients are accepted and departures revoke automatic query routing',async t=>{
 const f=await fixture(t), snapshot=members=>f.call('/api/integrations/telegram/groups/snapshot','POST',{groups:[{groupChatId:'-123',title:'Shared client home',status:'Linked',botUsername:'actual_project_bot',telegramMemberCount:4,members}]},'',true);
 const person=(id,role,status='Active')=>({telegramUserId:id,telegramName:`Person ${id}`,assignedName:`Person ${id}`,assignedRole:role,membershipStatus:status});
 const members=[person('41','Client'),person('42','Client'),person('43','Founder, Designer')];
 assert.equal((await snapshot(members)).status,200);
 const groups=await f.call('/api/founder/telegram-groups','GET',undefined,f.cookie);assert.equal(groups.data.groups[0].botUsername,'actual_project_bot');
 const query=(id,sender)=>f.call('/api/integrations/telegram/requests','POST',payload(id,{OriginalSenderTelegramID:sender,AutomaticClientQuery:true}),'',true);
 assert.equal((await query(201,'41')).status,201);assert.equal((await query(202,'42')).status,201);assert.equal((await query(203,'43')).status,403);
 await snapshot([person('41','Client','Left'),members[1],members[2]]);
 assert.equal((await query(204,'41')).status,403);assert.equal((await query(205,'42')).status,201);
});

test('project-wide staff discussion uploads survive restart and revocation; staff cannot change task fields',async t=>{
 const f=await fixture(t),call=(r,m,i)=>f.call(r,m,i,f.cookie);
 const p=(await call('/api/founder/projects','POST',{name:'Reference house'})).data.project.id;
 await call(`/api/founder/projects/${p}/client`,'POST',{clientName:'Client'});
 const staff=await call('/api/founder/employees','POST',{name:'Reader',designation:'Designer',projectId:p,role:'Designer',email:'reader@gmail.com'});assert.equal(staff.status,201);
 const employeeCookie=(await f.signIn({sub:'reader',email:'reader@gmail.com',name:'Reader'})).cookie;
 await call(`/api/founder/projects/${p}/workflow/start`,'POST',{workflowId:'PILOT-DESIGN-V1',startDate:'2026-11-01',assigneeId:'founder'});
 const tasks=(await f.call(`/api/employee/projects/${p}/workspace`,'GET',undefined,employeeCookie)).data.tasks;assert.equal(tasks.length,3);
 const task=tasks[0],data=Buffer.from('%PDF-1.7\nDrawing').toString('base64');
 const upload=await f.call(`/api/employee/tasks/${task.id}/files`,'POST',{name:'wall.pdf',type:'application/pdf',data},employeeCookie);assert.equal(upload.status,201);
 const fields={text:'Wall measurements',fileIds:[upload.data.file.id],clientKey:'reader-message-1',isResource:true};
 const message=await f.call(`/api/employee/tasks/${task.id}/messages`,'POST',fields,employeeCookie);assert.equal(message.status,201);
 assert.equal((await f.call(`/api/employee/tasks/${task.id}/messages`,'POST',fields,employeeCookie)).data.message.id,message.data.message.id);
 assert.equal((await f.call(`/api/employee/tasks/${task.id}`,'PATCH',{deadline:'2026-12-01'},employeeCookie)).status,403);
 assert.equal((await f.call(`/api/employee/tasks/${task.id}/messages/${message.data.message.id}/publish`,'POST',{confirm:true,recipientIds:[]},employeeCookie)).status,403);
 assert.equal((await f.call(`/api/employee/tasks/${task.id}/files`,'POST',{name:'bad.png',type:'image/png',data},employeeCookie)).status,400);
 await f.restart();
 const url=f.base+`/api/employee/files/${upload.data.file.id}/content`;
 assert.equal((await fetch(url)).status,401);const stored=await fetch(url,{headers:{cookie:employeeCookie}});assert.equal(stored.status,200);assert.equal(stored.headers.get('content-type'),'application/pdf');assert.match(stored.headers.get('content-disposition'),/attachment/);assert.equal(await stored.text(),'%PDF-1.7\nDrawing');
 const members=(await call(`/api/founder/projects/${p}/workspace`)).data.project.members;await call(`/api/founder/projects/${p}/members/${members[0].id}`,'DELETE');assert.equal((await fetch(url,{headers:{cookie:employeeCookie}})).status,404);
});

test('holding a query stores its evidence without changing work and only unattended queries count',async t=>{
 const f=await fixture(t),call=(r,m,i)=>f.call(r,m,i,f.cookie);
 const p=(await call('/api/founder/projects','POST',{name:'Hold house'})).data.project.id;
 await call(`/api/founder/projects/${p}/client`,'POST',{clientName:'Maya',clientTelegramId:'42'});
 await call(`/api/founder/projects/${p}/workflow/start`,'POST',{workflowId:'PILOT-DESIGN-V1',startDate:'2026-11-01'});await call(`/api/founder/projects/${p}`,'PATCH',{telegramGroupChatId:'-123'});
 await f.call('/api/integrations/telegram/requests','POST',payload(900),'',true);
 const task=(await call(`/api/founder/projects/${p}/tasks`)).data.tasks[0];const original=structuredClone(task);
 const path='/api/founder/decision-requests/'+payload(900).RequestID;
 assert.equal((await call(path+'/hold','POST',{taskId:task.id})).status,200);assert.equal((await call(path+'/hold','POST',{taskId:task.id})).status,409);
 const ws=(await call(`/api/founder/projects/${p}/workspace`)).data;assert.equal(ws.project.openQueryCount,0);assert.deepEqual(ws.tasks.find(row=>row.id===task.id),original);assert.equal((await call(`/api/founder/tasks/${task.id}/messages`)).data.messages.length,1);
 await f.restart();assert.equal((await call(path)).data.request.status,'On hold');
 assert.equal((await call(path+'/resume','POST',{})).status,200);assert.equal((await call(`/api/founder/projects/${p}/workspace`)).data.project.openQueryCount,1);
});
