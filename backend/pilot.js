import { syncProjectTasks, refreshStageDates } from './task-sync.js';
import { adaptBotTaskToWeb } from './task-adapter.js';
import { randomUUID } from 'node:crypto';
import { buildCustomStage, previewCustomMoves, insertCustomTask } from './custom-plan.js';

export class ApiError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const fail = (message, status) => { throw new ApiError(message, status); };
const timestamp = () => new Date().toISOString();
const text = (value, label, maximum = 2000) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum) fail(`Enter ${label} under ${maximum + 1} characters.`);
  return value.trim();
};
export const BLANK_WORKFLOW_ID = 'BLANK-V1';
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
// Same order as the bot's STAGE_TASKS; used to link an accepted query to a task of a stage it just created.
const STAGE_TASK_KEYS = ['site-check', 'drawing', 'approval', 'client', 'execution', 'final-check'];
// An accepted query becomes the first message in its task's thread, with its photos and files.
export function pushQueryMessage(state, task, request) {
  if (state.taskMessages.some((message) => message.taskId === task.id && message.queryId === request.id)) return;
  state.taskMessages.push({
    id: randomUUID(), taskId: task.id, projectId: task.projectId, authorId: 'system',
    author: `${request.requestType === 'Update' ? 'Update' : 'Query'} from ${request.originalSenderName || 'Telegram'}`,
    text: [request.originalMessage, request.context].filter(Boolean).join('\n\n') || 'Shared a file.',
    attachmentUrl: '', queryId: request.id,
    attachments: (request.attachments || []).map((item, index) => ({ index, type: item.type, fileName: item.fileName || '' })),
    at: timestamp(),
  });
}
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
  const syncing=new Set();const lastSync=new Map();
  const synchronize=async(state,project)=>{
    if(!project.telegramGroupChatId || !project.telegramProjectId || !project.workflowStartedAt)return;
    if(Date.now()-(lastSync.get(project.id)||0)<30000 && !state.tasks.some(task=>task.projectId===project.id && task.telegramSyncStatus!=='Synced'))return;
    if(syncing.has(project.id))fail('Task sync is already in progress. Refresh shortly.',409);
    syncing.add(project.id);
    try{await syncProjectTasks(state,project,callBotBridge);await save();lastSync.set(project.id,Date.now());}
    catch(error){fail('Telegram task sync failed: '+error.message,502);}
    finally{syncing.delete(project.id);}
  };
  const activeSnapshotRefreshes=new Map();const lastSnapshotRefresh=new Map();
  const refreshProjectWorkspaceSnapshot=async(state,project)=>{
    if(!project.telegramGroupChatId || !project.telegramProjectId || !project.workflowStartedAt)return {ok:true};
    const now=Date.now();
    if(now-(lastSnapshotRefresh.get(project.id)||0)<15000)return {ok:true,cached:true};
    if(activeSnapshotRefreshes.has(project.id))return activeSnapshotRefreshes.get(project.id);
    const promise=(async()=>{
      try{
        await syncProjectTasks(state,project,callBotBridge,{readOnly:true});
        lastSnapshotRefresh.set(project.id,Date.now());
        await save();
        return {ok:true};
      }catch(err){
        return {ok:false,staleData:true,warning:'Live Telegram sync unavailable; showing saved workspace data.'};
      }finally{
        activeSnapshotRefreshes.delete(project.id);
      }
    })();
    activeSnapshotRefreshes.set(project.id,promise);
    return promise;
  };
  const botError = (error) => fail(error.message, error.botStatus && error.botStatus < 500 ? error.botStatus : 502);
  const requireLinked = (project) => { if (!project.telegramGroupChatId || !project.workflowStartedAt) fail('Link this project to its Telegram group and start its plan before changing the schedule.',409); };
  const requireSynced = (state, project) => {
    const pending = state.tasks.find((t) => t.projectId === project.id && !t.deletedAt && t.telegramSyncStatus !== 'Synced');
    if (pending) fail(`"${pending.title}" has unsaved changes. Wait for sync, then try again.`,409);
  };
  const refreshFromBot = async (state, project) => { try { await syncProjectTasks(state,project,callBotBridge,{readOnly:true}); } catch { /* the sheet is updated; the next refresh hydrates */ } };
  const assigneeForBot = (project, assigneeId) => {
    const member = assigneeId && project.members?.find((item) => item.employeeId === assigneeId);
    return member?.telegramUserId ? { assigneeTelegramId: String(member.telegramUserId), assigneeName: member.name || '' } : {};
  };
  // Only the fields the bot understands; it validates names, durations and placement itself.
  const stageSpecForBot = (project, spec) => {
    if (!spec || typeof spec !== 'object' || typeof spec.name !== 'string' || !Array.isArray(spec.tasks)) fail('Send a stage name and its tasks.');
    const placement = spec.placement && typeof spec.placement === 'object' ? { type: spec.placement.type, stageName: spec.placement.stageName, startDate: spec.placement.startDate } : undefined;
    return {
      name: spec.name, placement, doneCount: spec.doneCount, ...(spec.custom === true ? { custom: true } : {}),
      tasks: spec.tasks.map((task) => ({ key: task?.key, durationDays: task?.durationDays, role: task?.role, ...(spec.custom === true ? { title: task?.title } : {}), ...assigneeForBot(project, owner(getState(), project, task?.assigneeId)) })),
    };
  };
  const botStaleGuard = (task) => ({ fromStart: task.sourceForecastStart || task.sourceCurrentStart || task.sourcePlannedStart || '', fromEnd: task.sourceForecastEnd || task.sourceCurrentEnd || task.sourcePlannedEnd || '' });
  return async (req, res, url) => {
    const match = url.pathname.match(/^\/api\/(founder|employee)\/(workflows|projects\/[^/]+\/(?:tasks|workflow\/start|client|workspace|default-plan|schedule\/(?:preview|apply)|stages\/(?:insert-task\/)?(?:preview|apply))|tasks\/[^/]+(?:\/(?:messages|read))?|decision-requests(?:\/[^/]+(?:\/(?:comment|approve|reject|convert|read|accept|accept-preview))?)?|projects\/[^/]+\/members\/[^/]+|employees\/[^/]+\/disable)$/);
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
    if ((m = route.match(/^projects\/([^/]+)\/default-plan$/)) && method === 'GET') {
      // The founders' INTERIOR 1 plan in six-task stages, for "start from the default plan" and the add-stage prefill.
      admin(user); projectFor(state,user,m[1]);
      let result; try { result = await callBotBridge('/api/integrations/web/default-plan', {}); } catch (error) { botError(error); }
      json(res,200,{stages:Array.isArray(result.stages) ? result.stages : []}); return true;
    }
    if ((m = route.match(/^projects\/([^/]+)\/stages\/(insert-task\/)?(preview|apply)$/)) && method === 'POST') {
      // Founder-built plans. The bot builds the task rows and dates; the web only sends what the founder chose.
      admin(user); const project = projectFor(state,user,m[1]);
      if (['Completed', 'Abandoned'].includes(project.status)) fail('This project is closed.', 409);
      const input = await body(req); const mode = m[3];
      if (!project.telegramGroupChatId) {
        const existing = state.tasks.filter((task) => task.projectId === project.id && !task.deletedAt);
        if (m[2]) {
          const result = insertCustomTask(project, existing, input.task, (id) => owner(state, project, id));
          if (mode === 'apply') {
            for (const task of result.tasks) {
              const stored = state.tasks.find((item) => item.id === task.id);
              if (stored) Object.assign(stored, task); else state.tasks.push(task);
            }
            refreshStageDates(project, result.tasks); audit('stage_task_added', project.id, { taskId: result.addedId }); await save();
          }
          json(res, 200, { ...result, tasks: state.tasks.filter((task) => task.projectId === project.id && !task.deletedAt), project: projectView(project) }); return true;
        }
        const built = buildCustomStage(project, existing, input.stage, (id) => owner(state, project, id));
        const result = { ok: true, conflicts: [], warnings: [], stages: [{ name: built.stage.name, startDate: built.stage.startDate, endDate: built.stage.deadline }], created: built.tasks.map((task) => ({ title: task.title, start: task.sourceForecastStart, end: task.deadline })), finish: [...existing, ...built.tasks].map((task) => task.deadline).filter(Boolean).sort().at(-1) || '' };
        if (mode === 'apply') {
          project.stages ||= []; project.stages.push(built.stage); state.tasks.push(...built.tasks);
          project.workflowId ||= 'CUSTOM-V1'; project.workflowStartedAt ||= timestamp(); project.startDate ||= built.stage.startDate; project.status = 'Active';
          audit('stage_added', project.id, { actorId: user.id, stage: built.stage.name, created: built.tasks.length }); await save();
        }
        json(res, 200, { ...result, tasks: state.tasks.filter((task) => task.projectId === project.id && !task.deletedAt), project: projectView(project) }); return true;
      }
      requireLinked(project); requireSynced(state,project);
      let payload;
      if (m[2]) {
        const task = input.task || {};
        const stageName = project.stages?.find((stage) => stage.id === task.stageId)?.name;
        if (!stageName) fail('Choose a stage in this project.');
        let afterTaskId = '';
        if (task.afterTaskId) {
          const after = state.tasks.find((t) => t.id === task.afterTaskId && t.projectId === project.id && !t.deletedAt);
          if (!after?.telegramTaskId) fail('Task not found in this project.',404);
          afterTaskId = after.telegramTaskId;
        }
        payload = { task: { stageName, afterTaskId, title: task.title, role: task.role, durationDays: task.durationDays, ...assigneeForBot(project, task.assigneeId) } };
      } else {
        const specs = Array.isArray(input.stages) ? input.stages : [input.stage];
        if (!specs.length || specs.length > 40) fail('Send between 1 and 40 stages.');
        payload = { stages: specs.map((spec) => stageSpecForBot(project, spec)) };
      }
      let result;
      try { result = await callBotBridge(`/api/integrations/web/stages/${m[2] ? 'insert-task' : 'add'}`, { groupChatId: project.telegramGroupChatId, mode, actorName: user.name || 'Founder', ...payload }); }
      catch (error) { botError(error); }
      if (mode === 'apply') {
        await refreshFromBot(state,project);
        audit(m[2] ? 'stage_task_added' : 'stage_added',project.id,{actorId:user.id,stages:(result.stages || []).map((stage) => stage.name),created:(result.created || []).length});
        await save();
      }
      json(res,200,{ ...result, tasks: state.tasks.filter((t) => t.projectId === project.id && !t.deletedAt), project: projectView(project) });
      return true;
    }
    if ((m = route.match(/^projects\/([^/]+)\/schedule\/(preview|apply)$/)) && method === 'POST') {
      // Founder timeline moves. The bot's engine checks dependencies and writes the Google Sheet; the web never computes dates itself.
      admin(user); const project = projectFor(state,user,m[1]);
      if (['Completed', 'Abandoned'].includes(project.status)) fail('This project is closed.', 409);
      if (!project.telegramGroupChatId) {
        const input = await body(req);
        const local = state.tasks.filter((task) => task.projectId === project.id && !task.deletedAt);
        const result = previewCustomMoves(local, input.moves);
        if (m[2] === 'apply') {
          for (const task of result.tasks) Object.assign(state.tasks.find((item) => item.id === task.id), task);
          refreshStageDates(project, result.tasks); audit('schedule_changed', project.id, { actorId: user.id, affected: result.affected.length }); await save();
        }
        json(res, 200, { ...result, tasks: m[2] === 'apply' ? result.tasks : local }); return true;
      }
      if (!project.telegramGroupChatId || !project.workflowStartedAt) fail('Link this project to its Telegram group and start its plan before changing the schedule.',409);
      const input = await body(req);
      if (!Array.isArray(input.moves) || !input.moves.length || input.moves.length > 60) fail('Send between 1 and 60 schedule moves.');
      const webIds = new Map();
      const moves = input.moves.map((move) => {
        const task = state.tasks.find((t) => t.id === move?.taskId && t.projectId === project.id && !t.deletedAt);
        if (!task) fail('Task not found in this project.',404);
        if (!task.telegramTaskId || task.telegramSyncStatus !== 'Synced') fail(`"${task.title}" has unsaved changes. Wait for sync, then move it.`,409);
        if (!validDate(move.start) || !validDate(move.end) || !move.start || !move.end) fail('Moves need real YYYY-MM-DD start and end dates.');
        webIds.set(task.telegramTaskId, task.id);
        return { taskId: task.telegramTaskId, start: move.start, end: move.end, fromStart: move.fromStart, fromEnd: move.fromEnd, forecastOnly: move.forecastOnly === true };
      });
      let result;
      try { result = await callBotBridge('/api/integrations/web/schedule/'+m[2], { groupChatId: project.telegramGroupChatId, moves, actorName: user.name || 'Founder' }); }
      catch (error) { fail(error.message, /changed since|being saved|cannot|waits for/i.test(error.message) ? 409 : 502); }
      const webId = (botId) => webIds.get(botId) || state.tasks.find((t) => t.projectId === project.id && t.telegramTaskId === botId)?.id || '';
      const mapItems = (items = []) => items.map((item) => ({ ...item, webTaskId: webId(item.taskId) }));
      if (m[2] === 'apply') {
        try { await syncProjectTasks(state,project,callBotBridge,{readOnly:true}); } catch { /* the sheet is updated; the next refresh hydrates */ }
        audit('schedule_changed',project.id,{actorId:user.id,moved:moves.map((move)=>move.taskId),affected:(result.affected||[]).length});
        await save();
      }
      json(res,200,{ ok: result.ok, conflicts: mapItems(result.conflicts), warnings: mapItems(result.warnings), affected: mapItems(result.affected), finish: result.finish || '', tasks: state.tasks.filter((t) => t.projectId === project.id && !t.deletedAt) });
      return true;
    }
    if ((m = route.match(/^projects\/([^/]+)\/(tasks|workflow\/start|client|workspace)$/))) {
      const project = projectFor(state,user,m[1]);
      if (m[2] === 'client' && method === 'POST') {
        if (['Completed', 'Abandoned'].includes(project.status)) fail('This project is closed.',409);
        admin(user); if (project.workflowStartedAt && project.workflowId !== 'CUSTOM-V1') fail('Client cannot be replaced after workflow start.',409);
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
          // A blank project has no tasks yet; every template must return its generated tasks.
          if (!Array.isArray(result.tasks) || (!result.tasks.length && input.workflowId !== BLANK_WORKFLOW_ID)) fail('The bot did not return its generated tasks.',502);
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
              if(!state.tasks.some((task)=>task.id===id)){
                const newTask={id,projectId:project.id,title:source.TaskName,description:'',status:source.Status==='Completed'?'Completed':'Open',assigneeId,stageId:stage.id,deadline:end,telegramTaskId:source.TaskID,telegramSyncStatus:'Synced',sourceQueryId:'',createdBy:user.id,createdAt:timestamp(),updatedAt:timestamp(),deletedAt:''};
                adaptBotTaskToWeb(newTask,source);
                state.tasks.push(newTask);
              }
            }
            Object.assign(project,{workflowId:result.workflowId,workflowName:result.workflowName,workflowStartedAt:timestamp(),startDate,status:'Active',phase:stages[0]?.name || 'Planning',stages});
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
          // Deadlines are inclusive last days, matching the bot and the timeline. The next stage starts the day after.
          const start = date.toISOString().slice(0,10); date.setUTCDate(date.getUTCDate()+stage.durationDays-1);
          const deadline = date.toISOString().slice(0,10); date.setUTCDate(date.getUTCDate()+1);
          stages.push({ id: randomUUID(), name: stage.name, order: stages.length, durationDays: stage.durationDays, startDate:start, deadline, dependencies: stages.length ? [stages.at(-1).id] : [] });
        }
        Object.assign(project,{workflowId:workflow.id,workflowStartedAt:timestamp(),startDate,status:'Active',phase:stages[0]?.name || 'Planning',stages});
        workflow.stages.forEach((stage,index) => stage.tasks.forEach((title) => makeTask(state,project,user,{title,description:'',status:'Open',assigneeId,stageId:stages[index].id,deadline:stages[index].deadline})));
        audit('workflow_started',project.id,{workflowId:workflow.id}); await save(); json(res,200,{project:projectView(project)}); return true;
      }
      if (m[2]==='tasks' && method==='GET') await synchronize(state,project);
      if (m[2] === 'workspace' && method === 'GET') {
        const refreshResult = await refreshProjectWorkspaceSnapshot(state, project);
        const requests = state.decisionRequests.filter((r) => r.projectId === project.id);
        const projectTasks = state.tasks.filter((t) => t.projectId === project.id && !t.deletedAt);
        json(res,200,{project:projectView(project),tasks:projectTasks,requests,staleData:Boolean(refreshResult?.staleData),syncWarning:refreshResult?.warning || ''}); return true;
      }
      if (m[2] === 'tasks' && method === 'GET') { json(res,200,{tasks:state.tasks.filter((t) => t.projectId === project.id && !t.deletedAt)}); return true; }
      if (m[2] === 'tasks' && method === 'POST') {
        admin(user); if (['Completed', 'Abandoned'].includes(project.status)) fail('This project is closed.',409);
        if (!project.workflowStartedAt) fail('Start a workflow before creating tasks.',409);
        const fields = taskFields(state,project,await body(req)); const task = makeTask(state,project,user,fields); await synchronize(state,project); await save(); json(res,201,{task}); return true;
      }
    }
    if ((m = route.match(/^tasks\/([^/]+)(?:\/(messages|read))?$/))) {
      const task = state.tasks.find((t) => t.id === m[1] && !t.deletedAt); if (!task) fail('Task not found.',404);
      const project = projectFor(state,user,task.projectId);
      if (!m[2] && method === 'GET') { json(res,200,{task}); return true; }
      if (!m[2] && method === 'PATCH') {
        if (['Completed', 'Abandoned'].includes(project.status)) fail('This project is closed.',409);
        if (!user.founder && task.assigneeId !== user.id) fail('Only the assignee or founder can update this task.',403);
        const input = await body(req); if (!user.founder && input.assigneeId !== undefined) admin(user);
        Object.assign(task,taskFields(state,project,input,task),{updatedAt:timestamp(),telegramSyncStatus:'Pending'}); await synchronize(state,project); audit('task_updated',project.id,{taskId:task.id,actorId:user.id}); await save(); json(res,200,{task}); return true;
      }
      if (!m[2] && method === 'DELETE') {
        if (['Completed', 'Abandoned'].includes(project.status)) fail('This project is closed.',409);
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
    if ((m = route.match(/^decision-requests\/([^/]+)\/(accept|accept-preview)$/)) && method === 'POST') {
      // Accept = link the query to a task (or a new stage) and apply one action. Replies are sent separately, after review.
      admin(user);
      const request = state.decisionRequests.find((r) => r.id === decodeURIComponent(m[1])); if (!request) fail('Request not found.',404);
      const project = projectFor(state,user,request.projectId); requireLinked(project);
      const input = await body(req); const apply = m[2] === 'accept'; const target = input.target || {};
      const projectTasks = () => state.tasks.filter((t) => t.projectId === project.id && !t.deletedAt);
      if (request.acceptedAt) {
        if (apply && JSON.stringify(request.acceptInput) === JSON.stringify(target)) { json(res,200,{ok:true,request,task:state.tasks.find((t) => t.id === request.taskId) || null,summary:request.acceptSummary,tasks:projectTasks()}); return true; }
        fail('This query was already accepted.',409);
      }
      if (['Rejected','Done'].includes(request.status) || request.decisionStatus === 'Rejected') fail('This query is already closed.',409);
      requireSynced(state,project);
      const call = { groupChatId: project.telegramGroupChatId, mode: apply ? 'apply' : 'preview', actorName: user.name || 'Founder' };
      let result; let linkTask = null;
      if (target.kind === 'task') {
        linkTask = state.tasks.find((t) => t.id === target.taskId && t.projectId === project.id && !t.deletedAt);
        if (!linkTask?.telegramTaskId) fail('Task not found in this project.',404);
        const type = target.action?.type;
        if (type === 'attach') {
          if (request.requestType !== 'Update') fail('Only updates can be attached without a schedule change.');
          result = { ok: true, conflicts: [], warnings: [], affected: [], finish: '', summary: `Attached to "${linkTask.title}".` };
        } else {
          if (!['delay','redo','complete'].includes(type)) fail('Choose delay, redo or mark complete.');
          try { result = await callBotBridge('/api/integrations/web/tasks/action', { ...call, taskId: linkTask.telegramTaskId, action: type, days: target.action.days, ...botStaleGuard(linkTask), note: `Query ${request.id}` }); }
          catch (error) { botError(error); }
        }
      } else if (target.kind === 'new-stage') {
        try { result = await callBotBridge('/api/integrations/web/stages/add', { ...call, stages: [stageSpecForBot(project, target.stage)] }); }
        catch (error) { botError(error); }
        const stage = result.stages?.[0];
        result.summary = `Added stage "${stage?.name}"${stage?.startDate ? ` (${stage.startDate} to ${stage.endDate})` : ''}.`;
      } else fail('Choose a task or add a new stage.');
      if (!apply) { json(res,200,{ ...result, tasks: undefined }); return true; }
      if (!result.ok) fail(result.conflicts?.[0]?.reason || 'The schedule change was refused.',409);
      await refreshFromBot(state,project);
      try {
        if (target.kind === 'new-stage') {
          const slot = Math.max(0, STAGE_TASK_KEYS.indexOf(target.linkTaskKey));
          const created = result.created || [];
          const botId = (created.find((item) => new RegExp(`-ST\\d+-${slot + 1}$`).test(item.taskId)) || created[0])?.taskId;
          linkTask = state.tasks.find((t) => t.projectId === project.id && t.telegramTaskId === botId) || null;
        }
        if (!linkTask) throw new Error('linked task missing after sync');
        Object.assign(request, { taskId: linkTask.id, linkedStageId: linkTask.stageId, acceptedAt: timestamp(), acceptInput: target, acceptSummary: result.summary, decisionStatus: 'Approved', reviewedAt: timestamp(), reviewedBy: user.id });
        if (request.status !== 'Published') request.status = 'Approved';
        pushQueryMessage(state,linkTask,request);
        audit('query_accepted',project.id,{requestId:request.id,taskId:linkTask.id,action:target.kind === 'task' ? target.action.type : 'new-stage'});
      } catch (error) {
        console.error('accept_local_failed', request.id, error.message);
        await save();
        fail('The schedule was updated but the query could not be linked. Do not repeat the action; open the timeline to confirm.',500);
      }
      await save();
      json(res,200,{ ok: true, request, task: linkTask, summary: result.summary, affected: result.affected || [], warnings: result.warnings || [], finish: result.finish || '', tasks: projectTasks() });
      return true;
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
        // The reason is also the reply the founder sends to the group (published separately, after review).
        if (m[2] === 'reject') { request.reviewNote = text(input.reason,'rejection reason',3000); request.rejectionReply = request.reviewNote; request.rejectedAt = timestamp(); }
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
