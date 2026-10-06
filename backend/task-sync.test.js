import test from 'node:test';
import assert from 'node:assert/strict';
import {syncProjectTasks} from './task-sync.js';
test('existing pilot completion and custom query task are repaired once; Telegram updates then flow back',async()=>{
 const project={id:'p',telegramGroupChatId:'-123',telegramProjectId:'P1',workflowStartedAt:'yes',stages:[{id:'s',name:'Resources'}],members:[]};
 const a={id:'a',projectId:'p',telegramTaskId:'P1-T001',title:'Resources',status:'Completed',stageId:'s',assigneeId:'founder',deadline:'2026-10-06'};
 const c={id:'12345678-1234-1234-1234-123456789abc',projectId:'p',title:'Query followup',status:'Open',stageId:'s',deadline:''};
 const state={tasks:[a,c,{id:'other',projectId:'other'}]};let rows=[];
 const bridge=async(route,input)=>{assert.equal(route,'/api/integrations/web/tasks/sync');assert.equal(input.groupChatId,'-123');for(const t of input.updates){rows=rows.filter(r=>r.TaskID!==t.taskId);rows.push({TaskID:t.taskId,TaskName:t.title,Status:t.status,Stage:t.stage,PlannedEnd:t.deadline});}return {tasks:rows};};
 await syncProjectTasks(state,project,bridge);assert.equal(rows.length,2);assert.equal(rows[0].Status,'Completed');assert.equal(c.telegramTaskId,'WEB-'+c.id);
 rows[1].Status='Completed';await syncProjectTasks(state,project,bridge);assert.equal(c.status,'Completed');assert.equal(rows.length,2);
 a.deletedAt='today';a.telegramSyncStatus='Pending';await syncProjectTasks(state,project,bridge);assert.equal(rows[0].Status,'Completed');assert.equal(rows.find(r=>r.TaskID==='P1-T001').Status,'Archived');
});
test('failed bridge does not acknowledge task synchronization',async()=>{const task={id:'a',projectId:'p',title:'a',status:'Open'};await assert.rejects(syncProjectTasks({tasks:[task]},{id:'p',telegramGroupChatId:'-1',telegramProjectId:'P1',workflowStartedAt:'yes'},async()=>{throw new Error('offline');}));assert.equal(task.telegramSyncStatus,undefined);});
