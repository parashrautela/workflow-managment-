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
