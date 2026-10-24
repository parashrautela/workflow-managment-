import { ApiError } from './api-error.js';
import {syncProjectTasks} from './task-sync.js';
import {stageLinksFor,connectionTasks} from './stage-connections.js';
import { randomUUID } from 'node:crypto';
import { hasRole, matchesRole, rolesOf, roleText } from './roles.js';
import { canWorkOnTask } from './work-access.js';

export const purchaseTemplate={id:'builtin-purchase-v1',name:'Purchase — selection to order',builtin:true,stages:[{name:'Purchase',spaces:[],tasks:[{title:'Select items and specifications',role:'Founder',durationDays:1},{title:'Prepare and send purchase proposal',role:'Designer',durationDays:1},{title:'Client confirms payment and order',role:'Client',durationDays:1}]}]};

const closed = project => ['Completed','Abandoned'].includes(project.status);
const open = task => !task.deletedAt && !['Completed','Cancelled'].includes(task.status);
const fail = (message,status=400) => { throw new ApiError(message,status); };
const dayAt = (now,timeZone='Asia/Kolkata') => new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export function responsibleFor(project,task,id) {
  if (id !== 'founder' && !project.members?.some(member => member.employeeId === id && member.active !== false)) return false;
  if (task.assigneeId) return task.assigneeId===id;
  if(task.sourceAssigneeTelegramId)return id==='founder'?task.sourceAssigneeTelegramId===project.leaderTelegramId:project.members?.some(member=>member.employeeId===id && member.telegramUserId===task.sourceAssigneeTelegramId);
  const roles = id==='founder' ? 'Founder' : project.members?.find(member=>member.employeeId===id);
  return matchesRole(typeof roles==='string'?roles:roles?.roles || roles?.role,task.sourceRole || task.role);
}
export function workQueue(state,{personId='founder',projectId='',status='pending',now=new Date(),user={founder:true}}={}) {
  const today=dayAt(now);
  return state.tasks.flatMap(task=>{
    const project=state.projects.find(row=>row.id===task.projectId);
    if(!project || closed(project) || !open(task) || (projectId && project.id!==projectId))return [];
    if(!user.founder && !canWorkOnTask(project,task,user))return [];
    if(personId && personId!=='all' && !responsibleFor(project,task,personId))return [];
    const approval=task.sourceGateType==='approval' || /approval|approve|final check/i.test(task.title);
    const overdue=Boolean(task.deadline && task.deadline<today);
    if(status==='approvals' && !approval || status==='overdue' && !overdue || status==='blocked' && task.status!=='Blocked' || status==='in-progress' && task.status!=='In progress')return [];
    const stage=project.stages?.find(row=>row.id===task.stageId);
    return [{...task,projectName:project.name,stageName:stage?.name || '',spaces:stage?.spaces || [],approval,overdue,project:{id:project.id,name:project.name,status:project.status,telegramGroupChatId:project.telegramGroupChatId || '',stages:project.stages || [],members:project.members || []}}];
  }).sort((a,b)=>Number(b.overdue)-Number(a.overdue) || (a.deadline || '9999').localeCompare(b.deadline || '9999') || a.projectName.localeCompare(b.projectName));
}
export function replacementPreview(state,input) {
  const from=state.employees.find(row=>row.id===input.fromId),to=state.employees.find(row=>row.id===input.toId && row.active!==false);
  if(!from || !to || from.id===to.id)fail('Choose different existing employees and an active replacement.');
  if(!Array.isArray(input.projectIds) || !input.projectIds.length || input.projectIds.length>100 || new Set(input.projectIds).size!==input.projectIds.length)fail('Choose the projects to transfer.');
  const projects=input.projectIds.map(id=>{
    const project=state.projects.find(row=>row.id===id && !closed(row));
    const member=project?.members?.find(row=>row.employeeId===from.id && row.active!==false);
    if(!member || !matchesRole(member.roles || member.role,'Site Supervisor'))fail('The departing employee must be the site supervisor in each selected active project.');
    return project;
  });
  const affected=state.tasks.filter(task=>input.projectIds.includes(task.projectId) && open(task) && ((task.assigneeId===from.id && (!(task.sourceRole || task.role) || matchesRole('Site Supervisor',task.sourceRole || task.role))) || (!task.assigneeId && matchesRole('Site Supervisor',task.sourceRole || task.role) && (!task.sourceAssigneeTelegramId || task.sourceAssigneeTelegramId===from.telegramUserId))));
  const fingerprint=JSON.stringify({from:from.id,to:to.id,projects:projects.map(project=>({id:project.id,members:project.members})),tasks:affected.map(task=>({id:task.id,assigneeId:task.assigneeId,updatedAt:task.updatedAt}))});
  return {from,to,projects,affected,fingerprint};
}
export function digestText(employee,items,date) {
  return `${employee.name} — pending work · ${date}\n`+items.map(task=>`${task.projectName} — ${task.stageName} — ${task.title}\n${task.approval?'Approval pending':task.status}${task.overdue?' · Overdue':''}`).join('\n\n');
}
export function createOperationsRoutes({getState,founder,employeeSession,body,json,save,audit,callBotBridge,integrationSecret}) {
  let ticking=false,lastSnapshotAt=0;
  const refreshWork=async()=>{
    const state=getState(),projects=state.projects.filter(project=>!closed(project) && project.telegramGroupChatId && project.workflowStartedAt);
    if(!projects.length || Date.now()-lastSnapshotAt<15000)return;
    const snapshot=await callBotBridge('/api/integrations/web/work/snapshot',{groupChatIds:projects.map(project=>project.telegramGroupChatId)});
    if(!Array.isArray(snapshot.projects))throw Error('Live work snapshot unavailable.');
    for(const project of projects){const source=snapshot.projects.find(row=>row.groupChatId===project.telegramGroupChatId);if(!source)throw Error('A project was missing from the live work snapshot.');project.leaderTelegramId=source.leaderTelegramId;await syncProjectTasks(state,project,async()=>({tasks:source.tasks}),{readOnly:true});}
    lastSnapshotAt=Date.now();await save();
  };
  const settings=state=>state.digestSettings?.[0] || {enabled:true,time:'09:00',timeZone:'Asia/Kolkata',weekends:true};
  const tick=async(now=new Date())=>{
    if(ticking)return; ticking=true;
    try {
      const state=getState(),config=settings(state);if(!config.enabled)return;
      const local=new Intl.DateTimeFormat('en-GB',{timeZone:config.timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23',weekday:'short'}).formatToParts(now);
      const part=type=>local.find(item=>item.type===type)?.value;
      if(`${part('hour')}:${part('minute')}`<config.time || (!config.weekends && ['Sat','Sun'].includes(part('weekday'))))return;
      await refreshWork();
      const date=dayAt(now,config.timeZone);state.digestDeliveries ||= [];
      for(const employee of state.employees.filter(row=>row.active!==false && row.telegramConnectedAt && row.telegramUserId)) {
        if(state.digestDeliveries.some(row=>row.employeeId===employee.id && row.date===date))continue;
        const items=workQueue(state,{personId:employee.id,now}).filter(task=>!task.sourceForecastStart || task.sourceForecastStart<=date);
        if(!items.length)continue;
        const delivery={id:randomUUID(),employeeId:employee.id,date,status:'Sending',createdAt:now.toISOString()};
        state.digestDeliveries.push(delivery);await save();
        try {const chunks=[];let text='';for(const line of digestText(employee,items,date).split('\n')){if(text.length+line.length+1>3500){chunks.push(text);text='';}text+=(text?'\n':'')+line;}if(text)chunks.push(text);delivery.messageIds=[];for(const text of chunks){const result=await callBotBridge('/api/integrations/web/personal/send',{telegramUserId:employee.telegramUserId,text});delivery.messageIds.push(result.messageId);await save();}delivery.status='Sent';}
        catch(error){delivery.status='Unknown';delivery.error='Delivery was not confirmed. Check Telegram before resending.';}
        await save();
      }
    } finally {ticking=false;}
  };
  const route=async(req,res,url)=>{
    const match=url.pathname.match(/^\/api\/(founder|employee)\/(work-queue|operations-settings|supervisor-replacement\/(preview|apply)|projects\/([^/]+)\/(spaces|stage-spaces)|plan-templates(?:\/([^/]+))?|personal-connection)$/);
    if(!match)return false;
    const state=getState(),user=match[1]==='founder'?(founder(req)?{id:'founder',founder:true}:null):employeeSession(req);
    if(!user)fail('Sign-in required.',401);
    const path=match[2];
    if(path==='work-queue' && req.method==='GET') {
      let syncWarning='';try{await refreshWork();}catch{syncWarning='Live Telegram sync unavailable; showing saved work.';}
      const personId=user.founder?(url.searchParams.get('personId') || 'founder'):user.id;
      const tasks=workQueue(state,{personId,projectId:url.searchParams.get('projectId') || '',status:url.searchParams.get('status') || 'pending',user});
      json(res,200,{tasks,syncWarning,telegramConnected:Boolean(user.telegramConnectedAt),employees:user.founder?state.employees.filter(row=>row.active!==false).map(({id,name,designation})=>({id,name,designation})):[],updatedAt:new Date().toISOString()});return true;
    }
    if(path==='personal-connection' && req.method==='GET') {
      const profile=await callBotBridge('/api/integrations/web/personal/profile',{});
      json(res,200,{username:profile.username,link:`https://t.me/${profile.username}?start=work`,connected:Boolean(user.telegramConnectedAt)});return true;
    }
    if(!user.founder)fail('Founder permission required.',403);
    if(path==='operations-settings') {
      if(req.method==='GET'){json(res,200,{digest:settings(state),deliveries:(state.digestDeliveries || []).slice(-50),connections:state.employees.map(row=>({employeeId:row.id,connected:Boolean(row.telegramConnectedAt)}))});return true;}
      if(req.method==='POST') {
        const input=await body(req);
        if(typeof input.timeZone!=='string' || !input.timeZone || typeof input.enabled!=='boolean' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time) || typeof input.weekends!=='boolean')fail('Choose a valid digest schedule.');
        try{new Intl.DateTimeFormat('en',{timeZone:input.timeZone}).format();}catch{fail('Choose a valid timezone.');}
        state.digestSettings=[{enabled:input.enabled,time:input.time,timeZone:input.timeZone,weekends:input.weekends}];await save();json(res,200,{digest:settings(state)});return true;
      }
    }
    if(path.startsWith('supervisor-replacement/') && req.method==='POST') {
      const input=await body(req),preview=replacementPreview(state,input);
      const result={ok:true,from:{id:preview.from.id,name:preview.from.name},to:{id:preview.to.id,name:preview.to.name},projects:preview.projects.map(row=>({id:row.id,name:row.name,location:row.location || ''})),tasks:preview.affected.map(row=>({id:row.id,title:row.title,projectId:row.projectId})),fingerprint:preview.fingerprint};
      if(match[3]==='apply') {
        if(input.fingerprint!==preview.fingerprint)fail('Assignments changed. Preview the replacement again.',409);
        // Verify and update Telegram before changing local assignments; explicit IDs are checked by the bot.
        const linked=preview.projects.filter(project=>project.telegramGroupChatId);
        if(linked.length && !preview.to.telegramUserId)fail('Connect the replacement employee to Telegram first.');
        const groups=linked.map(project=>({groupChatId:project.telegramGroupChatId,taskIds:preview.affected.filter(task=>task.projectId===project.id).map(task=>task.telegramTaskId).filter(Boolean)}));
        if(groups.length)await callBotBridge('/api/integrations/web/supervisors/replace',{groups,fromTelegramUserId:preview.from.telegramUserId,toTelegramUserId:preview.to.telegramUserId,toName:preview.to.name});
        for(const project of preview.projects) {
          const old=project.members.find(row=>row.employeeId===preview.from.id);
          old.roles=rolesOf(old.roles || old.role).filter(role=>!matchesRole(role,'Site Supervisor'));old.role=roleText(old.roles);old.active=old.roles.length>0;
          let replacement=project.members.find(row=>row.employeeId===preview.to.id);
          if(!replacement){replacement={id:randomUUID(),employeeId:preview.to.id,name:preview.to.name,telegramUserId:preview.to.telegramUserId || ''};project.members.push(replacement);}
          replacement.active=true;replacement.roles=[...new Set([...rolesOf(replacement.roles || replacement.role),'Site Supervisor'])];replacement.role=roleText(replacement.roles);replacement.designation=replacement.role;
          // Retain the old profile for historical attribution; it no longer owns the transferred role.
        }
        for(const task of preview.affected){task.assigneeId=preview.to.id;task.sourceAssigneeTelegramId=preview.to.telegramUserId || '';task.sourceAssigneeName=preview.to.name;task.updatedAt=new Date().toISOString();if(task.telegramTaskId)task.telegramSyncStatus='Synced';}
        audit('supervisor_replaced','',{fromId:preview.from.id,toId:preview.to.id,projectIds:input.projectIds,taskIds:preview.affected.map(task=>task.id)});await save();
      }
      json(res,200,result);return true;
    }
    if(match[4]) {
      const project=state.projects.find(row=>row.id===match[4]);if(!project)fail('Project not found.',404);if(closed(project))fail('This project is closed.',409);
      const input=req.method==='POST'?await body(req):{};
      if(match[5]==='spaces') {
        if(req.method==='POST') {
          if(!Array.isArray(input.spaces) || input.spaces.length>100 || input.spaces.some(name=>typeof name!=='string' || !name.trim() || name.trim().length>60))fail('Enter up to 100 space names, each under 61 characters.');
          const names=input.spaces.map(name=>name.trim());if(new Set(names.map(name=>name.toLowerCase())).size!==names.length)fail('Space names must be unique.');
          const used=(project.stages || []).flatMap(stage=>stage.spaces || []);
          if(used.some(name=>!names.includes(name)))fail('A space used by a stage cannot be removed. Update its stages first.');
          project.spaces=names;audit('project_spaces_updated',project.id);await save();
        }
        json(res,200,{spaces:project.spaces || []});return true;
      }
      if(match[5]==='stage-spaces' && req.method==='POST') {
        const stage=project.stages?.find(row=>row.id===input.stageId);if(!stage)fail('Stage not found.',404);
        if(!Array.isArray(input.spaces) || new Set(input.spaces).size!==input.spaces.length || input.spaces.some(name=>!project.spaces?.includes(name)))fail('Choose spaces from this project.');
        stage.spaces=input.spaces;await save();json(res,200,{stage});return true;
      }
    }
    if(path.startsWith('plan-templates')) {
      state.savedTemplates ||= [];
      if(req.method==='GET'){json(res,200,{templates:[purchaseTemplate,...state.savedTemplates]});return true;}
      if(req.method==='POST') {
        const input=await body(req),project=state.projects.find(row=>row.id===input.projectId);
        if(!project || typeof input.name!=='string' || !input.name.trim() || input.name.length>80)fail('Choose a project and enter a template name.');
        const savedLinks=stageLinksFor(connectionTasks(state.tasks.filter(task=>task.projectId===project.id)));
        const stages=(project.stages || []).flatMap(stage=>{
          const tasks=state.tasks.filter(task=>task.stageId===stage.id && task.projectId===project.id && !task.deletedAt && task.status!=='Cancelled').sort((a,b)=>(Number(a.sourceSequence)||0)-(Number(b.sourceSequence)||0));
          if(!tasks.length)return [];
          if(tasks.some(task=>!(task.sourceForecastStart || task.sourceCurrentStart || task.sourcePlannedStart) || !task.deadline))fail('Set task dates before saving a reusable template.');
          const predecessors=savedLinks.filter(link=>link.target===stage.id).map(link=>({stageName:project.stages.find(row=>row.id===link.source)?.name,type:link.type})).filter(link=>link.stageName);
          return [{name:stage.name,spaces:stage.spaces || [],placement:predecessors.length?{type:'after',predecessors}:null,tasks:tasks.map(task=>({title:task.title.startsWith(stage.name+' — ')?task.title.slice(stage.name.length+3):task.title,role:task.sourceRole || task.role || 'Team',durationDays:Math.max(1,(task.sourceForecastStart || task.sourceCurrentStart || task.sourcePlannedStart) && task.deadline?Math.round((Date.parse(task.deadline)-Date.parse(task.sourceForecastStart || task.sourceCurrentStart || task.sourcePlannedStart))/86400000)+1:1)}))}];
        });
        if(!stages.length)fail('Add tasks before saving a template.');
        const ordered=[],seen=new Set(),visiting=new Set();const visit=stage=>{if(seen.has(stage.name))return;if(visiting.has(stage.name))fail('The plan contains a dependency cycle.');visiting.add(stage.name);for(const edge of stage.placement?.predecessors || []){const predecessor=stages.find(row=>row.name===edge.stageName);if(predecessor)visit(predecessor);}visiting.delete(stage.name);seen.add(stage.name);ordered.push(stage);};for(const stage of stages)visit(stage);
        const template={id:randomUUID(),name:input.name.trim(),stages:ordered,createdAt:new Date().toISOString()};state.savedTemplates.push(template);await save();json(res,201,{template});return true;
      }
      if(req.method==='DELETE' && match[6]){state.savedTemplates=state.savedTemplates.filter(row=>row.id!==match[6]);await save();json(res,200,{ok:true});return true;}
    }
    return false;
  };
  route.tick=tick;
  route.connect=async id=>{
    const state=getState(),telegramUserId=String(id),employees=state.employees.filter(row=>row.telegramUserId===telegramUserId && row.active!==false);
    const known=employees.length || state.telegramGroups.some(group=>group.members?.some(member=>String(member.telegramUserId)===telegramUserId && member.membershipStatus==='Active'));
    if(!known)fail('Ask the founder to assign your Telegram profile first.',404);
    state.telegramConnections ||= [];
    if(!state.telegramConnections.some(row=>row.telegramUserId===telegramUserId))state.telegramConnections.push({telegramUserId,connectedAt:new Date().toISOString()});
    for(const employee of employees)employee.telegramConnectedAt=new Date().toISOString();await save();return {ok:true};
  };
  return route;
}
