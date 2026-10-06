import { syncProjectTasks } from './task-sync.js';
import { randomUUID } from 'node:crypto';

export class ApiError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const fail = (message, status) => { throw new ApiError(message, status); };
const timestamp = () => new Date().toISOString();
const text = (value, label, maximum = 2000) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum) fail(`Enter ${label} under ${maximum + 1} characters.`);
  return value.trim();
};
export const validDate = (value) => typeof value === 'string' && (!value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value));
const safeLink = (value = '') => {
  if (!value) return '';
  try { const link = new URL(value); if (link.protocol === 'https:' && !link.username && !link.password && value.length <= 2048) return link.href; } catch {}
  fail('Attachment URL must use HTTPS without credentials.');
};
export const workflows = [
  { id: 'PILOT-DESIGN-V1', name: 'Design pilot', stages: [{ name: 'Resources', durationDays: 1, tasks: ['Collect site plans and client references'] }, { name: 'Design', durationDays: 3, tasks: ['Prepare concept and review with client'] }, { name: 'Delivery', durationDays: 2, tasks: ['Deliver approved drawings'] }] },
  { id: 'PILOT-PAINTING-V1', name: 'Painting pilot', stages: [{ name: 'Resources', durationDays: 1, tasks: ['Collect site photos and measurements'] }, { name: 'Preparation', durationDays: 2, tasks: ['Prepare walls and approve colour sample'] }, { name: 'Painting', durationDays: 3, tasks: ['Apply coats and inspect finish'] }] },
];
export function initializePilot(state) {
  for (const key of ['tasks','taskMessages','readPositions']) if (!Array.isArray(state[key])) state[key] = [];
  let recovered = false;
  for (const request of state.decisionRequests) {
    if (request.deliveryStatus === 'Sending') { request.deliveryStatus = 'Unknown'; request.deliveryError = 'Service restarted during send. Check Telegram before sending again.'; recovered = true; }
  }
  return recovered;
}
export function projectSummary(state, project) {
  const tasks = (state.tasks || []).filter((t) => t.projectId === project.id && !t.deletedAt && t.status !== 'Cancelled');
  const done = tasks.filter((t) => t.status === 'Completed').length;
  return { workflowId: project.workflowId || '', workflowStartedAt: project.workflowStartedAt || '', stages: project.stages || [],
    progress: tasks.length ? Math.round(done / tasks.length * 100) : 0, taskCount: tasks.length,
    currentStage: project.stages?.find((s) => tasks.some((t) => t.stageId === s.id && t.status !== 'Completed'))?.name || project.phase,
    deadline: project.stages?.at(-1)?.deadline || '',
    upcomingDeadlines: tasks.filter((t) => t.deadline && t.status !== 'Completed').sort((a,b) => a.deadline.localeCompare(b.deadline)).slice(0,5).map((t) => ({ id: t.id, title: t.title, deadline: t.deadline })),
    openQueryCount: state.decisionRequests.filter((r) => r.projectId === project.id && !['Done','Rejected'].includes(r.status)).length };
}

// Additive routes: founder/employee cookies and the existing {error} contract stay intact.
export function createPilotRoutes({ getState, founder, employeeSession, body, json, save, audit, projectView, callBotBridge }) {
  const actor = (req, namespace) => {
    if (namespace === 'founder') { if (!founder(req)) fail('Founder session required.', 401); return { id: 'founder', name: 'Founder', founder: true }; }
    const employee = employeeSession(req);
    if (!employee) fail('Employee sign-in required.', 401);
    return { id: employee.id, name: employee.name, founder: false };
  };
  const projectFor = (state, user, id) => {
    const project = state.projects.find((p) => p.id === id && (user.founder || p.members?.some((m) => m.employeeId === user.id)));
    if (!project) fail('Project not found in your workspace.', 404);
    return project;
  };
  const admin = (user) => { if (!user.founder) fail('Founder permission required.', 403); };
  const owner = (state, project, ownerId) => {
    if (!ownerId) return '';
    if (ownerId === 'founder') return ownerId;
    if (!state.employees.some((e) => e.id === ownerId && e.active !== false) || !project.members?.some((m) => m.employeeId === ownerId)) fail('Assignee must be an active employee in this project.');
    return ownerId;
  };
  const taskFields = (state, project, input, previous = {}) => {
    const title = input.title === undefined ? previous.title : text(input.title, 'task title', 200);
    if (!title) fail('Task title is required.');
    const description = input.description === undefined ? previous.description || '' : (typeof input.description === 'string' && input.description.length <= 10000 ? input.description.trim() : fail('Invalid task description.'));
    const status = input.status === undefined ? previous.status || 'Open' : input.status;
    if (!['Open','In progress','Blocked','Completed','Cancelled'].includes(status)) fail('Invalid task status.');
    const deadline = input.deadline === undefined ? previous.deadline || '' : input.deadline;
    if (!validDate(deadline)) fail('Deadline must be a real YYYY-MM-DD date.');
    const assigneeId = input.assigneeId === undefined ? previous.assigneeId || '' : owner(state, project, input.assigneeId);
    const stageId = input.stageId === undefined ? previous.stageId || '' : input.stageId;
    if (typeof stageId !== 'string' || (stageId && !project.stages?.some((s) => s.id === stageId))) fail('Choose a stage in this project.');
    return { title, description, status, deadline, assigneeId, stageId };
  };
  const makeTask = (state, project, user, fields, sourceQueryId = '') => {
    const task = { id: randomUUID(), projectId: project.id, ...fields, sourceQueryId, createdBy: user.id, createdAt: timestamp(), updatedAt: timestamp(), deletedAt: '' };
    state.tasks.push(task); audit('task_created', project.id, { taskId: task.id, sourceQueryId, actorId: user.id }); return task;
  };
  const syncing=new Set();
  const synchronize=async(state,project)=>{
    if(!project.telegramGroupChatId || !project.telegramProjectId || !project.workflowStartedAt)return;
    if(syncing.has(project.id))fail('Task sync is already in progress. Refresh shortly.',409);
    syncing.add(project.id);
    try{await syncProjectTasks(state,project,callBotBridge);await save();}
    catch(error){fail('Telegram task sync failed: '+error.message,502);}
    finally{syncing.delete(project.id);}
  };
  return async (req, res, url) => {
    const match = url.pathname.match(/^\/api\/(founder|employee)\/(workflows|projects\/[^/]+\/(?:tasks|workflow\/start|client|workspace)|tasks\/[^/]+(?:\/(?:messages|read))?|decision-requests(?:\/[^/]+(?:\/(?:comment|approve|reject|convert|read))?)?|projects\/[^/]+\/members\/[^/]+|employees\/[^/]+\/disable)$/);
    if (!match) return false;
    const state = getState(); const user = actor(req, match[1]); const route = match[2]; const method = req.method;
    if (route === 'workflows' && method === 'GET') { json(res, 200, { workflows }); return true; }
    let m;
    if ((m = route.match(/^employees\/([^/]+)\/disable$/)) && method === 'POST') {
      admin(user); const employee = state.employees.find((e) => e.id === m[1]); if (!employee) fail('Employee not found.', 404);
      employee.active = false; state.employeeSessions = state.employeeSessions.filter((s) => s.employeeId !== employee.id);
      for (const task of state.tasks) if (task.assigneeId === employee.id) task.assigneeId = '';
      audit('employee_disabled', '', { employeeId: employee.id }); await save(); json(res, 200, { ok: true }); return true;
    }
    if ((m = route.match(/^projects\/([^/]+)\/members\/([^/]+)$/)) && method === 'DELETE') {
      admin(user); const project = projectFor(state,user,m[1]); const member = project.members?.find((p) => p.id === m[2]); if (!member) fail('Member not found.',404);
      project.members = project.members.filter((p) => p.id !== member.id);
      if (project.internalOwnerMemberId === member.id) project.internalOwnerMemberId = '';
      for (const task of state.tasks) if (task.projectId === project.id && task.assigneeId === member.employeeId) task.assigneeId = '';
      audit('project_member_removed',project.id,{ memberId: member.id }); await save(); json(res,200,{ok:true}); return true;
    }
    if ((m = route.match(/^projects\/([^/]+)\/(tasks|workflow\/start|client|workspace)$/))) {
      const project = projectFor(state,user,m[1]);
      if (m[2] === 'client' && method === 'POST') {
        admin(user); if (project.workflowStartedAt) fail('Client cannot be replaced after workflow start.',409);
        const input = await body(req); const clientName = text(input.clientName,'client name',120);
        const clientTelegramId = input.clientTelegramId === undefined ? project.clientTelegramId || '' : input.clientTelegramId;
        if (typeof clientTelegramId !== 'string' || (clientTelegramId && !/^\d+$/.test(clientTelegramId))) fail('Client Telegram ID must be numeric.');
        Object.assign(project,{clientName,clientTelegramId}); audit('client_assigned',project.id); await save(); json(res,200,{project:projectView(project)}); return true;
      }
      if (m[2] === 'workflow/start' && method === 'POST') {
        admin(user); const input = await body(req);
        if (project.telegramGroupChatId) {
          if (['Completed','Abandoned'].includes(project.status)) fail('This project is closed.',409);
          if (project.telegramSetupPending) fail('Finish member setup before choosing a project type.',409);
          const roster = state.telegramGroups.find((group)=>group.groupChatId===project.telegramGroupChatId)?.members.filter((member)=>member.membershipStatus==='Active') || [];
          if (roster.length<2 || roster.some((member)=>!member.assignedName || !member.assignedRole) || roster.filter((member)=>/\bclient\b/i.test(member.assignedRole)).length!==1 || !roster.some((member)=>!/\b(client|founder)\b/i.test(member.assignedRole))) fail('Finish all member profiles, including one client and at least one team member.',409);
          if (project.workflowStartedAt && project.workflowId !== input.workflowId) fail('This project already has a workflow.',409);
          const startDate=input.startDate || project.startDate || timestamp().slice(0,10);
          if (!validDate(startDate)) fail('Enter a valid start date.');
          const assigneeId=owner(state,project,input.assigneeId || 'founder');
          let result;
          try { result=await callBotBridge('/api/integrations/web/projects/start',{groupChatId:project.telegramGroupChatId,workflowId:input.workflowId,startDate}); }
          catch(error){fail(error.message,502);}
          if (!Array.isArray(result.tasks) || !result.tasks.length) fail('The bot did not return its generated tasks.',502);
          if (!project.workflowStartedAt) {
            const stages=[];
            for (const source of result.tasks) {
              let stage=stages.find((item)=>item.name===source.Stage);
              if(!stage){stage={id:`tg-stage-${project.id}-${stages.length}`,name:source.Stage,order:stages.length,durationDays:0,startDate:source.CurrentStart || source.PlannedStart || '',deadline:source.CurrentEnd || source.PlannedEnd || '',dependencies:[]};stages.push(stage);}
              const start=source.CurrentStart || source.PlannedStart || '';const end=source.CurrentEnd || source.PlannedEnd || '';
              if(start && (!stage.startDate || start<stage.startDate))stage.startDate=start;
              if(end>stage.deadline)stage.deadline=end;
              stage.durationDays=stage.startDate && stage.deadline ? Math.round((Date.parse(stage.deadline)-Date.parse(stage.startDate))/86400000)+1 : 0;
              const id=`tg-task-${project.id}-${source.TaskID}`;
              if(!state.tasks.some((task)=>task.id===id))state.tasks.push({id,projectId:project.id,title:source.TaskName,description:'',status:source.Status==='Completed'?'Completed':'Open',assigneeId,stageId:stage.id,deadline:end,telegramTaskId:source.TaskID,telegramSyncStatus:'Synced',sourceQueryId:'',createdBy:user.id,createdAt:timestamp(),updatedAt:timestamp(),deletedAt:''});
            }
            Object.assign(project,{workflowId:result.workflowId,workflowName:result.workflowName,workflowStartedAt:timestamp(),startDate,status:'Active',phase:stages[0].name,stages});
            audit('workflow_started',project.id,{workflowId:result.workflowId,source:'Telegram'});
          }
          project.workflowAnnouncementStatus=result.announcementStatus;
          await save();json(res,200,{project:projectView(project)});return true;
        }
        const workflow = workflows.find((w) => w.id === input.workflowId);
        if (!workflow) fail('Choose a valid workflow.');
        if (!project.clientName || project.clientName === 'Client pending') fail('Assign a client before starting the workflow.',409);
        if (project.status === 'Completed') fail('Completed projects cannot start a workflow.',409);
        if (project.workflowStartedAt) {
          if (project.workflowId !== workflow.id) fail('This project already has a workflow.',409);
          json(res,200,{project:projectView(project)}); return true;
        }
        const startDate = input.startDate || project.startDate || timestamp().slice(0,10);
        if (!validDate(startDate)) fail('Start date must be a real YYYY-MM-DD date.');
        let date = new Date(startDate+'T00:00:00Z'); const stages = [];
        const assigneeId = owner(state,project,input.assigneeId || 'founder');
        // Validate all input before mutating project or generating tasks.
        for (const stage of workflow.stages) {
          const start = date.toISOString().slice(0,10); date.setUTCDate(date.getUTCDate()+stage.durationDays);
          stages.push({ id: randomUUID(), name: stage.name, order: stages.length, durationDays: stage.durationDays, startDate:start, deadline:date.toISOString().slice(0,10), dependencies: stages.length ? [stages.at(-1).id] : [] });
        }
        Object.assign(project,{workflowId:workflow.id,workflowStartedAt:timestamp(),startDate,status:'Active',phase:stages[0].name,stages});
        workflow.stages.forEach((stage,index) => stage.tasks.forEach((title) => makeTask(state,project,user,{title,description:'',status:'Open',assigneeId,stageId:stages[index].id,deadline:stages[index].deadline})));
        audit('workflow_started',project.id,{workflowId:workflow.id}); await save(); json(res,200,{project:projectView(project)}); return true;
      }
      if (['workspace','tasks'].includes(m[2]) && method==='GET') await synchronize(state,project);
      if (m[2] === 'workspace' && method === 'GET') {
        const requests = state.decisionRequests.filter((r) => r.projectId === project.id);
        json(res,200,{project:projectView(project),tasks:state.tasks.filter((t) => t.projectId === project.id && !t.deletedAt),requests}); return true;
      }
      if (m[2] === 'tasks' && method === 'GET') { json(res,200,{tasks:state.tasks.filter((t) => t.projectId === project.id && !t.deletedAt)}); return true; }
      if (m[2] === 'tasks' && method === 'POST') {
        admin(user); if (!project.workflowStartedAt) fail('Start a workflow before creating tasks.',409);
        const fields = taskFields(state,project,await body(req)); const task = makeTask(state,project,user,fields); await synchronize(state,project); await save(); json(res,201,{task}); return true;
      }
    }
    if ((m = route.match(/^tasks\/([^/]+)(?:\/(messages|read))?$/))) {
      const task = state.tasks.find((t) => t.id === m[1] && !t.deletedAt); if (!task) fail('Task not found.',404);
      const project = projectFor(state,user,task.projectId);
      if (!m[2] && method === 'GET') { json(res,200,{task}); return true; }
      if (!m[2] && method === 'PATCH') {
        if (!user.founder && task.assigneeId !== user.id) fail('Only the assignee or founder can update this task.',403);
        const input = await body(req); if (!user.founder && input.assigneeId !== undefined) admin(user);
        Object.assign(task,taskFields(state,project,input,task),{updatedAt:timestamp(),telegramSyncStatus:'Pending'}); await synchronize(state,project); audit('task_updated',project.id,{taskId:task.id,actorId:user.id}); await save(); json(res,200,{task}); return true;
      }
      if (!m[2] && method === 'DELETE') {
        admin(user); task.deletedAt = timestamp(); task.telegramSyncStatus='Pending'; await synchronize(state,project); audit('task_deleted',project.id,{taskId:task.id}); await save(); json(res,200,{ok:true}); return true;
      }
      if (m[2] === 'messages' && method === 'GET') {
        const messages = state.taskMessages.filter((x) => x.taskId === task.id);
        const after = url.searchParams.get('after'); const limit = Number(url.searchParams.get('limit') || 100);
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) fail('Limit must be between 1 and 100.');
        const index = after ? messages.findIndex((x) => x.id === after) : -1; if (after && index < 0) fail('Unknown message cursor.');
        const items = messages.slice(index+1,index+1+limit); const hasMore = messages.length > index+1+limit;
        json(res,200,{messages:items,pagination:{hasMore,nextCursor:hasMore ? items.at(-1).id : null}}); return true;
      }
      if (m[2] === 'messages' && method === 'POST') {
        if (['Completed','Cancelled'].includes(task.status)) fail('Reopen this task before replying.',409);
        const input = await body(req); const message = {id:randomUUID(),taskId:task.id,projectId:project.id,authorId:user.id,author:user.name,text:text(input.text,'message'),attachmentUrl:safeLink(input.attachmentUrl),at:timestamp()};
        state.taskMessages.push(message); audit('task_message',project.id,{taskId:task.id,messageId:message.id,actorId:user.id}); await save(); json(res,201,{message}); return true;
      }
      if (m[2] === 'read' && method === 'POST') {
        const input = await body(req); const messages = state.taskMessages.filter((x) => x.taskId === task.id);
        const index = messages.findIndex((x) => x.id === input.lastMessageId); if (index < 0) fail('Read position must belong to this task.');
        const read = state.readPositions.find((r) => r.userId === user.id && r.taskId === task.id);
        if (!read) state.readPositions.push({userId:user.id,taskId:task.id,lastMessageId:input.lastMessageId});
        else if (index > messages.findIndex((x) => x.id === read.lastMessageId)) read.lastMessageId = input.lastMessageId;
        await save(); json(res,200,{ok:true}); return true;
      }
    }
    if (route === 'decision-requests' && method === 'GET' && !user.founder) {
      json(res,200,{requests:state.decisionRequests.filter((r) => state.projects.some((p) => p.id === r.projectId && p.members?.some((m) => m.employeeId === user.id)))}); return true;
    }
    if ((m = route.match(/^decision-requests\/([^/]+)(?:\/(comment|approve|reject|convert|read))?$/))) {
      const request = state.decisionRequests.find((r) => r.id === decodeURIComponent(m[1])); if (!request) fail('Request not found.',404);
      const project = projectFor(state,user,request.projectId);
      if (!m[2] && method === 'GET') { json(res,200,{request}); return true; }
      if (m[2] === 'comment' && method === 'POST') {
        const input = await body(req); const comment = {id:randomUUID(),author:user.name,authorId:user.id,text:text(input.text,'comment'),at:timestamp()};
        (request.comments ||= []).push(comment); audit('decision_request_comment',project.id,{requestId:request.id,actorId:user.id}); await save(); json(res,200,{request}); return true;
      }
      if (['approve','reject','convert'].includes(m[2]) && method === 'POST') {
        admin(user); const input = await body(req);
        if (m[2] === 'convert' && request.taskId) { const task = state.tasks.find((t) => t.id === request.taskId); json(res,200,{request,task}); return true; }
        const target = m[2] === 'reject' ? 'Rejected' : 'Approved';
        if (['Rejected','Done'].includes(request.status) && request.status !== target) fail('This query is already closed.',409);
        if (m[2] === 'reject') request.reviewNote = text(input.reason,'rejection reason');
        if (m[2] === 'convert') {
          if (!project.workflowStartedAt) fail('Start a workflow before converting to a task.',409);
          const fields = taskFields(state,project,{...input,title:input.title || request.originalMessage || 'Client query'});
          const task = makeTask(state,project,user,fields,request.id); request.taskId = task.id; await synchronize(state,project);
        }
        // Decision and delivery are separate: approving does not publish any message.
        request.decisionStatus = target; if (request.status !== 'Published') request.status = target;
        request.reviewedAt = timestamp(); request.reviewedBy = user.id;
        audit('query_'+m[2],project.id,{requestId:request.id,taskId:request.taskId || ''}); await save(); json(res,200,{request,task:state.tasks.find((t) => t.id === request.taskId) || null}); return true;
      }
    }
    // Let legacy routes handle existing operations where no new method matched.
    return false;
  };
}
