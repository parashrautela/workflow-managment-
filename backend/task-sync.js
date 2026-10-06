import {applyStageSnapshot} from './stage-snapshot.js';
const toBot = {Open:'Pending','In progress':'In Progress',Blocked:'Issue Reported',Completed:'Completed',Cancelled:'Archived'};
const toWeb = status => status==='Completed'?'Completed':status.startsWith('Archived')?'Cancelled':status==='In Progress'?'In progress':status==='Issue Reported' || status.includes('Delay')?'Blocked':'Open';
export async function syncProjectTasks(state,project,callBotBridge) {
  if(!project.telegramGroupChatId || !project.telegramProjectId || !project.workflowStartedAt)return false;
  if(project.workflowId==='STAGE-SIX-V1'){const snapshot=await callBotBridge('/api/integrations/web/tasks/sync',{groupChatId:project.telegramGroupChatId,updates:[]});applyStageSnapshot(state,project,snapshot.tasks);return true;}
  const local=state.tasks.filter(task=>task.projectId===project.id);
  const pending=local.filter(task=>task.telegramSyncStatus!=='Synced');
  const updates=pending.map(task=>{
    const member=project.members?.find(item=>item.employeeId===task.assigneeId);
    return {taskId:task.telegramTaskId || `WEB-${task.id}`,title:task.title,stage:project.stages?.find(stage=>stage.id===task.stageId)?.name || '',status:task.deletedAt?'Archived':toBot[task.status],deadline:task.deadline || '',assigneeTelegramId:task.assigneeId==='founder'?'founder':member?.telegramUserId || '',assigneeName:task.assigneeId==='founder'?'Founder':member?.name || ''};
  });
  const snapshot=await callBotBridge('/api/integrations/web/tasks/sync',{groupChatId:project.telegramGroupChatId,updates});
  if(!Array.isArray(snapshot.tasks))throw new Error('Telegram task sync returned no task snapshot.');
  for(const task of pending){task.telegramTaskId ||= `WEB-${task.id}`;task.telegramSyncStatus='Synced';}
  for(const source of snapshot.tasks){
    const task=local.find(item=>item.telegramTaskId===source.TaskID);
    if(!task || task.deletedAt)continue;
    task.status=toWeb(source.Status || 'Pending');task.title=source.TaskName;
    task.deadline=source.CurrentEnd || source.PlannedEnd || '';
    const stage=project.stages?.find(item=>item.name===source.Stage);if(stage)task.stageId=stage.id;
  }
  return true;
}
