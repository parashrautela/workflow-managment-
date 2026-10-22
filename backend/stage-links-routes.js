import { ApiError } from './api-error.js';
import {planStageConnections,connectionFingerprint,connectionTasks} from './stage-connections.js';
import {syncProjectTasks,refreshStageDates} from './task-sync.js';
const fail=(message,status=409)=>{throw new ApiError(message,status);};
export function createStageLinksRoutes({getState,founder,body,json,save,audit,callBotBridge}) {
 return async(req,res,url)=>{
  const match=url.pathname.match(/^\/api\/founder\/projects\/([^/]+)\/stage-links\/(preview|apply)$/);
  if(!match || req.method!=='POST')return false;
  if(!founder(req))fail('Founder sign-in required.',401);
  const state=getState(),project=state.projects.find(row=>row.id===match[1]);if(!project)fail('Project not found.',404);if(['Completed','Abandoned'].includes(project.status))fail('This project is closed.');
  const input=await body(req),rows=()=>state.tasks.filter(task=>task.projectId===project.id && !task.deletedAt && task.status!=='Cancelled');
  if(project.telegramGroupChatId){if(rows().some(task=>task.telegramSyncStatus!=='Synced'))fail('Sync pending task edits before changing connections.');await syncProjectTasks(state,project,callBotBridge,{readOnly:true});}
  const normalized=connectionTasks(rows()),fingerprint=connectionFingerprint(normalized);
  if(input.fingerprint!==fingerprint)fail('The schedule changed. Refresh and preview the connections again.');
  if(!Array.isArray(input.links))fail('Send stage connections.',400);
  let result;
  if(project.telegramGroupChatId){
   const byId=new Map((project.stages || []).map(stage=>[stage.id,stage.name]));
   if(input.links.some(link=>!byId.has(link.source) || !byId.has(link.target)))fail('Choose stages in this project.',400);
   const links=input.links.map(link=>({...link,source:byId.get(link.source),target:byId.get(link.target)}));
   result=await callBotBridge('/api/integrations/web/stages/connections',{groupChatId:project.telegramGroupChatId,mode:match[2],links,fingerprint:input.botFingerprint});
   if(match[2]==='apply')await syncProjectTasks(state,project,callBotBridge,{readOnly:true});
  }else{
   result=planStageConnections(normalized,input.links);
   if(match[2]==='apply')for(const planned of result.tasks){const task=rows().find(row=>row.id===planned.id);Object.assign(task,{sourceForecastStart:planned.start,sourceForecastEnd:planned.end,deadline:planned.end,planPredecessors:planned.dependencies.map(edge=>({taskId:edge.id,type:edge.type})),planPredecessorId:planned.dependencies[0]?.id || '',planDependencyType:planned.dependencies[0]?.type || 'FS',updatedAt:new Date().toISOString()});}
  }
  if(match[2]==='apply'){project.stageLinks=input.links;refreshStageDates(project,rows());audit('stage_connections_updated',project.id,{links:input.links});await save();}
  json(res,200,{ok:true,affected:result.affected,finish:result.finish,fingerprint,botFingerprint:result.fingerprint,tasks:match[2]==='apply'?rows():undefined});return true;
 };
}
