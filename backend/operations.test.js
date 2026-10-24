import test from 'node:test';
import assert from 'node:assert/strict';
import {workQueue,replacementPreview,createOperationsRoutes} from './operations.js';
const fixture=()=>({projects:[{id:'p',name:'House',status:'Active',members:[{employeeId:'old',role:'Site Supervisor'},{employeeId:'designer',role:'Designer'}],stages:[{id:'s',name:'Painting'}]}],employees:[{id:'old',name:'Old',active:true},{id:'new',name:'New',active:true,telegramUserId:'42',telegramConnectedAt:'yes'},{id:'designer',name:'Designer',active:true}],tasks:[{id:'a',projectId:'p',stageId:'s',title:'Site check',sourceRole:'Site Supervisor',assigneeId:'old',status:'Open',deadline:'2026-10-20'},{id:'b',projectId:'p',stageId:'s',title:'Drawing',sourceRole:'Designer',status:'Open',deadline:'2026-10-25'},{id:'c',projectId:'p',title:'Old work',assigneeId:'old',status:'Completed'}]});
test('daily queue filters the responsible person and rejects leaking other work',()=>{
 const state=fixture();const now=new Date('2026-10-22T06:00:00Z');
 assert.deepEqual(workQueue(state,{personId:'old',now}).map(task=>task.id),['a']);
 assert.deepEqual(workQueue(state,{personId:'all',user:{id:'designer'},now}).map(task=>task.id),['b']);
 assert.equal(workQueue(state,{personId:'all',status:'overdue',now}).length,1);
});
test('replacement preview excludes history and verifies every selected project',()=>{
 const state=fixture();assert.deepEqual(replacementPreview(state,{fromId:'old',toId:'new',projectIds:['p']}).affected.map(task=>task.id),['a']);
 assert.throws(()=>replacementPreview(state,{fromId:'old',toId:'new',projectIds:['other']}),/supervisor/);
});
test('replacement apply has a stale-view guard and leaves completed work assigned to its author',async()=>{
 const state=fixture();let result;
 const route=createOperationsRoutes({getState:()=>state,founder:()=>true,body:async req=>req.input,json:(res,status,data)=>{result={status,data};},save:async()=>{},audit:()=>{},callBotBridge:async()=>({})});
 const input={fromId:'old',toId:'new',projectIds:['p']};
 await route({method:'POST',input},{},new URL('http://test/api/founder/supervisor-replacement/preview'));const fingerprint=result.data.fingerprint;
 await assert.rejects(route({method:'POST',input:{...input,fingerprint:'stale'}},{},new URL('http://test/api/founder/supervisor-replacement/apply')),/changed/);
 await route({method:'POST',input:{...input,fingerprint}},{},new URL('http://test/api/founder/supervisor-replacement/apply'));
 assert.equal(state.tasks[0].assigneeId,'new');assert.equal(state.tasks[2].assigneeId,'old');assert.ok(state.projects[0].members.find(row=>row.employeeId==='new').roles.includes('Site Supervisor'));
});
test('morning digest sends personal work once and never automatically duplicates an uncertain send',async()=>{
 const state=fixture();state.tasks[0].assigneeId='new';state.projects[0].members.push({employeeId:'new',role:'Site Supervisor'});let sends=0;
 const route=createOperationsRoutes({getState:()=>state,save:async()=>{},callBotBridge:async()=>{sends++;throw Error('connection lost');}});
 await route.tick(new Date('2026-10-22T04:00:00Z'));await route.tick(new Date('2026-10-22T05:00:00Z'));
 assert.equal(sends,1);assert.equal(state.digestDeliveries[0].status,'Unknown');
});

test('replacement preserves other roles and does not steal a named colleague task',()=>{
 const state=fixture();state.tasks.push({id:'design',projectId:'p',assigneeId:'old',sourceRole:'Designer',status:'Open'},{id:'colleague',projectId:'p',sourceAssigneeTelegramId:'999',sourceRole:'Site Supervisor',status:'Open'});
 assert.deepEqual(replacementPreview(state,{fromId:'old',toId:'new',projectIds:['p']}).affected.map(task=>task.id),['a']);
 state.projects[0].members[0].active=false;
 assert.equal(workQueue(state,{personId:'old'}).length,0);
});

test('Start before staff assignment remains connected and receives only their actionable work once',async()=>{
 const state=fixture();state.telegramGroups=[{members:[{telegramUserId:'77',membershipStatus:'Active'}]}];
 const sends=[];
 const route=createOperationsRoutes({getState:()=>state,save:async()=>{},callBotBridge:async(path,input)=>{sends.push(input);return {messageId:123};}});
 await route.connect('77');
 state.employees[0].telegramUserId='77';
 state.tasks.push({id:'future',projectId:'p',assigneeId:'old',status:'Open',sourcePlannedStart:'2099-01-01',title:'Future work'});
 state.tasks.push({id:'cancelled',projectId:'p',assigneeId:'old',status:'Cancelled',title:'Cancelled work'});
 await route.tick(new Date('2026-10-22T04:00:00Z'));
 await route.tick(new Date('2026-10-22T05:00:00Z'));
 assert.equal(sends.length,1);assert.equal(sends[0].telegramUserId,'77');
 assert.match(sends[0].text,/Site check/);assert.doesNotMatch(sends[0].text,/Future work|Cancelled work|Drawing|Old work/);
 assert.equal(state.digestDeliveries[0].status,'Sent');
});

test('digest schedule respects local time, weekends, disabled accounts and empty work',async()=>{
 const state=fixture();state.employees[0].telegramUserId='77';state.employees[0].telegramConnectedAt='yes';
 const sends=[];
 const route=createOperationsRoutes({getState:()=>state,save:async()=>{},callBotBridge:async(path,input)=>{sends.push(input);return {messageId:1};}});
 state.digestSettings=[{enabled:true,time:'09:00',timeZone:'Asia/Kolkata',weekends:false}];
 await route.tick(new Date('2026-10-22T03:29:00Z'));assert.equal(sends.length,0);
 await route.tick(new Date('2026-10-24T04:00:00Z'));assert.equal(sends.length,0);
 state.digestSettings[0].enabled=false;
 await route.tick(new Date('2026-10-22T04:00:00Z'));assert.equal(sends.length,0);
 state.digestSettings[0].enabled=true;state.employees[0].active=false;
 await route.tick(new Date('2026-10-22T04:00:00Z'));assert.equal(sends.length,0);
 state.employees[0].active=true;
 await route.tick(new Date('2026-10-22T03:30:00Z'));assert.equal(sends.length,1);
 assert.equal(state.digestDeliveries.length,1);
});

test('founder can preview and send today without waiting; staff and unconnected people cannot send',async()=>{
 const state=fixture();state.employees[0].telegramUserId='77';
 let result,allowed=true,sends=0,checkpoints=0;
 const route=createOperationsRoutes({getState:()=>state,founder:()=>allowed,employeeSession:()=>({id:'designer'}),body:async req=>req.input,json:(res,status,data)=>{result={status,data};},save:async()=>{},checkpoint:()=>checkpoints++,callBotBridge:async(path)=>{if(path.endsWith('/profile'))return {username:'project_bot'};sends++;return {messageId:3};}});
 const request=(method='GET',input)=>route({method,input},{},new URL('http://test/api/founder/personal-reminder?employeeId=old'));
 await request();assert.equal(result.data.connected,false);assert.equal(result.data.taskCount,1);
 await assert.rejects(request('POST',{employeeId:'old'}),/Start/);assert.equal(sends,0);
 allowed=false;await assert.rejects(request(),/Sign-in/);
 await assert.rejects(route({method:'POST',input:{employeeId:'old'}},{},new URL('http://test/api/employee/personal-reminder')),/Founder permission/);
 allowed=true;state.telegramConnections=[{telegramUserId:'77'}];
 await route({method:'GET'},{},new URL('http://test/api/founder/operations-settings'));assert.equal(result.data.connections[0].connected,true);
 await request();assert.equal(result.data.connected,true);
 await request('POST',{employeeId:'old'});assert.equal(result.data.delivery.status,'Sent');assert.ok(checkpoints>=2);
 await request('POST',{employeeId:'old'});assert.equal(sends,1);
 await route.tick(new Date());assert.equal(sends,1);
 state.tasks[0].status='Completed';state.digestDeliveries=[];
 await request('POST',{employeeId:'old'});assert.equal(result.data.empty,true);assert.equal(sends,1);
});

test('missing send confirmation stays uncertain and prevents duplicate retries',async()=>{
 const state=fixture();state.employees[0].telegramUserId='77';state.employees[0].telegramConnectedAt='yes';
 let sends=0,checkpointState;
 const route=createOperationsRoutes({getState:()=>state,save:async()=>{},checkpoint:()=>{checkpointState=structuredClone(state);},callBotBridge:async()=>{sends++;return {};}});
 await route.tick(new Date('2026-10-22T04:00:00Z'));
 assert.equal(state.digestDeliveries[0].status,'Unknown');
 assert.equal(checkpointState.digestDeliveries[0].status,'Unknown');
 await route.tick(new Date('2026-10-22T05:00:00Z'));assert.equal(sends,1);
});

test('persistence failure after sending preserves a durable Sending checkpoint and does not resend',async()=>{
 let state=fixture();state.employees[0].telegramUserId='77';state.employees[0].telegramConnectedAt='yes';
 let sends=0,checkpointState,saves=0;
 const route=createOperationsRoutes({getState:()=>state,save:async()=>{if(++saves===3)throw Error('disk unavailable');},checkpoint:()=>{checkpointState=structuredClone(state);},callBotBridge:async()=>{sends++;return {messageId:5};}});
 await assert.rejects(route.tick(new Date('2026-10-22T04:00:00Z')),/disk unavailable/);
 assert.equal(checkpointState.digestDeliveries[0].status,'Sending');
 assert.deepEqual(checkpointState.digestDeliveries[0].messageIds,[5]);
 state=checkpointState;
 await route.tick(new Date('2026-10-22T05:00:00Z'));assert.equal(sends,1);
});

test('manual reminder sends and records the exact edited text to the selected person only',async()=>{
 const state=fixture();state.employees[0].telegramUserId='77';state.employees[0].telegramConnectedAt='yes';
 const sent=[];let result;
 const route=createOperationsRoutes({getState:()=>state,founder:()=>true,body:async req=>req.input,json:(res,status,data)=>{result=data;},save:async()=>{},callBotBridge:async(path,input)=>{sent.push(input);return {messageId:sent.length};}});
 const post=text=>route({method:'POST',input:{employeeId:'old',text}},{},new URL('http://test/api/founder/personal-reminder'));
 const text='Parash, please check the bathroom waterproofing today.\nSend two photos. <Keep this note>';
 await post(text);
 assert.deepEqual(sent,[{telegramUserId:'77',text}]);assert.equal(result.delivery.text,text);
 await route({method:'GET'},{},new URL('http://test/api/founder/personal-reminder?employeeId=old'));
 assert.equal(result.text,text);assert.equal(result.delivery.status,'Sent');
 await post(text);assert.equal(sent.length,1);
 await assert.rejects(post('Changed after sending'),/already attempted/);assert.equal(sent.length,1);
 const nextDay=new Date(state.digestDeliveries[0].date+'T04:00:00Z');nextDay.setUTCDate(nextDay.getUTCDate()+1);
 await route.tick(nextDay);
 assert.equal(sent.length,2);assert.match(sent[1].text,/Site check/);assert.doesNotMatch(sent[1].text,/Send two photos/);
});

test('edited reminder rejects invalid drafts and can send a manual note without actionable tasks',async()=>{
 const state=fixture();state.employees[0].telegramUserId='77';state.employees[0].telegramConnectedAt='yes';state.tasks=[];
 const sent=[];let result;
 const route=createOperationsRoutes({getState:()=>state,founder:()=>true,body:async req=>req.input,json:(res,status,data)=>{result=data;},save:async()=>{},callBotBridge:async(path,input)=>{sent.push(input);return {messageId:1};}});
 const post=text=>route({method:'POST',input:{employeeId:'old',text}},{},new URL('http://test/api/founder/personal-reminder'));
 for(const text of ['', '   \n',null,42,{},'a'.repeat(12001)])await assert.rejects(post(text),/Enter a reminder/);
 assert.equal(sent.length,0);assert.equal(state.digestDeliveries?.length || 0,0);
 await post('Personal reminder connection test.');
 assert.equal(sent.length,1);assert.equal(result.delivery.taskCount,0);assert.equal(sent[0].text,'Personal reminder connection test.');
});

test('long edited reminder is chunked without losing text or splitting Unicode characters',async()=>{
 const state=fixture();state.employees[0].telegramUserId='77';state.employees[0].telegramConnectedAt='yes';
 const sent=[];
 const route=createOperationsRoutes({getState:()=>state,founder:()=>true,body:async req=>req.input,json:()=>{},save:async()=>{},callBotBridge:async(path,input)=>{sent.push(input);return {messageId:sent.length};}});
 const text='A'.repeat(3499)+'🙂'+'\n'+'B'.repeat(4000);
 await route({method:'POST',input:{employeeId:'old',text}},{},new URL('http://test/api/founder/personal-reminder'));
 assert.equal(sent.map(row=>row.text).join(''),text);assert.equal(sent.length,3);
 assert.ok(sent.every(row=>row.text.length<=3500 && !/[\uD800-\uDBFF]$/.test(row.text)));
 assert.equal(state.digestDeliveries[0].text,text);assert.equal(state.digestDeliveries[0].status,'Sent');
});
