const status=s=>s==='Ready'?'Open':s==='In Progress'?'In progress':s==='Completed'?'Completed':s==='On hold'?'On hold':s==='Needs assignment'?'Needs assignment':s==='Waiting'?'Waiting':'Blocked';
export function applyStageSnapshot(state,project,sources){
 if(!Array.isArray(sources)||sources.some(s=>s.WorkflowID!=='STAGE-SIX-V1'))throw new Error('Invalid linked-stage task snapshot.');
 project.stages ||= [];
 for(const source of sources){
  let stage=project.stages.find(s=>s.telegramStageId===source.StageID);
  if(!stage){stage={id:`linked-${project.id}-${source.StageID}`,telegramStageId:source.StageID,name:source.Stage,order:project.stages.length,startDate:source.PlannedStart,deadline:source.PlannedEnd,dependencies:[]};project.stages.push(stage);}
  if(source.PlannedStart<stage.startDate)stage.startDate=source.PlannedStart;if(source.PlannedEnd>stage.deadline)stage.deadline=source.PlannedEnd;
  const member=project.members?.find(m=>String(m.telegramUserId)===String(source.AssignedTelegramID));
  const id=`tg-task-${project.id}-${source.TaskID}`;let task=state.tasks.find(t=>t.id===id);
  if(!task){task={id,projectId:project.id,description:'',createdBy:'founder',createdAt:new Date().toISOString(),sourceQueryId:'',deletedAt:''};state.tasks.push(task);}
  Object.assign(task,{title:source.TaskName,status:status(source.Status),stageId:stage.id,stepKey:source.StepKey,stepOrder:Number(source.StepOrder),telegramTaskId:source.TaskID,telegramSyncStatus:'Synced',linkedStage:true,assigneeId:member?.employeeId||'',assigneeName:source.AssignedName,assigneeTelegramId:source.AssignedTelegramID,deadline:source.ForecastEnd||source.PlannedEnd,plannedStart:source.PlannedStart,plannedEnd:source.PlannedEnd,forecastStart:source.ForecastStart,forecastEnd:source.ForecastEnd,blockedReason:source.BlockedReason,holdReason:source.HoldReason,revision:source.DrawingRevision,approvedRevision:source.ApprovedRevision,notificationStatus:source.NotificationState,predecessorTaskIds:String(source.PredecessorTaskIDs||'').split(',').filter(Boolean).map(e=>e.split(':')[0]),updatedAt:new Date().toISOString()});
 }
}
