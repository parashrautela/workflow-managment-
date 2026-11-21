import { ApiError } from './api-error.js';
import { driveTag } from './google-drive.js';
import { STUDIO_TIME_ZONE } from '../frontend/src/lib/dates.js';

// Drive layout, agreed with the studio:
//   <chosen folder>/<Project name>/<N Stage>/<Photos|Documents|Videos>/<YYYY-MM-DD Sender caption.ext>
// A file with no stage goes to <Project>/Unsorted/<type>/. Folders are made when their first file arrives.

const day = new Intl.DateTimeFormat('en-CA', { timeZone: STUDIO_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'video/mp4': 'mp4', 'video/quicktime': 'mov' };
// Characters Drive and desktop sync clients trip on, and control characters, become spaces.
export const cleanName = (text, max) => String(text || '').replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim();
export const typeFolder = (mime) => (/^image\//.test(mime) ? 'Photos' : /^video\//.test(mime) ? 'Videos' : 'Documents');
const sortedStages = (project) => [...(project.stages || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

// The stage the app shows as current: the first one with unfinished work.
export function currentStageId(state, project) {
  return sortedStages(project).find((stage) => state.tasks.some((task) => task.projectId === project.id && task.stageId === stage.id && task.status !== 'Completed'))?.id || '';
}

// Group files and files attached to tasks, in one shape.
function items(state) {
  const projects = new Map(state.projects.map((project) => [project.id, project]));
  const tasks = new Map(state.tasks.map((task) => [task.id, task]));
  const people = new Map(state.employees.map((employee) => [employee.id, employee.name]));
  const list = [];
  for (const record of state.projectFiles) {
    const project = projects.get(record.projectId);
    if (project) list.push({ kind: 'group', record, project, stageId: record.stageId || '', at: record.submittedAt || '', sender: record.submittedBy, caption: record.caption || '',
      original: record.name, mime: record.mimeType || { Photo: 'image/jpeg', Video: 'video/mp4' }[record.type] || 'application/octet-stream', keepOriginal: false });
  }
  for (const record of state.taskFiles) {
    const task = tasks.get(record.taskId), project = projects.get(record.projectId || task?.projectId);
    if (project) list.push({ kind: 'task', record, project, stageId: task?.stageId || '', at: record.at || '', sender: record.authorName || people.get(record.authorId) || (record.authorId === 'founder' ? 'Founder' : 'Team member'),
      caption: '', original: record.name, mime: record.type || 'application/octet-stream', keepOriginal: true });
  }
  return list;
}

// Documents and task uploads keep their own name; photos and videos are named by their caption, or numbered per sender and day.
const usesNumber = (item) => !item.keepOriginal && typeFolder(item.mime) !== 'Documents' && !cleanName(item.caption, 60);
const dayOf = (at) => day.format(new Date(at || Date.now()));
export function driveName(item, number = 1) {
  const sender = cleanName(item.sender, 40) || 'Team member', prefix = `${dayOf(item.at)} ${sender}`;
  if (item.keepOriginal || typeFolder(item.mime) === 'Documents') return `${prefix} ${cleanName(item.original, 120) || 'file'}`;
  const ext = /\.([a-z0-9]{1,8})$/i.exec(item.original || '')?.[1]?.toLowerCase() || EXT[item.mime] || '';
  return `${prefix} ${cleanName(item.caption, 60) || String(number).padStart(2, '0')}${ext ? '.' + ext : ''}`;
}
function numbers(list) {
  const groups = new Map(), result = new Map();
  for (const item of list.filter(usesNumber)) {
    const key = `${item.project.id}|${dayOf(item.at)}|${cleanName(item.sender, 40)}`;
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  for (const group of groups.values())
    group.sort((a, b) => a.at.localeCompare(b.at) || a.record.id.localeCompare(b.record.id)).forEach((item, index) => result.set(item.record.id, index + 1));
  return result;
}

const projectFolder = (project) => ({ key: `p:${project.id}`, name: cleanName(project.name, 100) || 'Project' });
const stageFolder = (project, stageId) => {
  const stages = sortedStages(project), index = stages.findIndex((stage) => stage.id === stageId);
  return index < 0 ? { key: `s:${project.id}:unsorted`, name: 'Unsorted' } : { key: `s:${project.id}:${stageId}`, name: `${index + 1} ${cleanName(stages[index].name, 80) || 'Stage'}` };
};
export function folderPath(item) {
  const stage = stageFolder(item.project, item.stageId), type = typeFolder(item.mime);
  return [projectFolder(item.project), stage, { key: `${stage.key.replace(/^s:/, 't:')}:${type}`, name: type }];
}
// Project renames, stage renames and reorders rename the folders already made. A deleted stage's folder stays as it is.
function renames(state) {
  const made = state.drive.folders || {}, list = [];
  for (const project of state.projects) {
    const wanted = [projectFolder(project), ...sortedStages(project).map((stage) => stageFolder(project, stage.id))];
    for (const { key, name } of wanted) if (made[key] && made[key].name !== name) list.push({ key, id: made[key].id, name });
  }
  return list;
}

export function createDriveSync({ getState, inLine, save, client, loadBytes, batch = 10 }) {
  let running = false, again = false;
  async function pass() {
    const plan = await inLine(() => {
      const state = getState(), drive = state.drive;
      if (!drive?.token || !drive.folder?.id) return null;
      const list = items(state), counts = numbers(list);
      const work = list.filter((item) => item.record.status !== 'Stored')
        .sort((a, b) => (a.record.driveTriedAt || '').localeCompare(b.record.driveTriedAt || '')).slice(0, batch)
        .map((item) => ({ id: item.record.id, kind: item.kind, path: folderPath(item), name: driveName(item, counts.get(item.record.id)), mime: item.mime, tag: driveTag(`${item.kind}:${item.record.id}`),
          source: item.kind === 'task' ? { attachmentId: item.record.id }
            : { groupChatId: item.project.telegramGroupChatId, submissionId: item.record.id, fileId: item.record.fileId, type: item.record.type, mimeType: item.record.mimeType } }));
      const moves = renames(state);
      return work.length || moves.length ? structuredClone({ token: drive.token, rootId: drive.folder.id, folders: drive.folders || {}, work, moves }) : null;
    });
    if (!plan) return false;
    const accessToken = await client.accessToken({ token: plan.token });
    const folders = { ...plan.folders }, made = {}, renamed = {}, results = [];
    for (const move of plan.moves) {
      try { await client.rename(accessToken, move.id, move.name); renamed[move.key] = move.name; } catch { /* tried again next round */ }
    }
    for (const job of plan.work) {
      try {
        let parent = plan.rootId;
        for (const step of job.path) {
          if (!folders[step.key]) folders[step.key] = made[step.key] = { id: await client.folder(accessToken, parent, step.name, driveTag(step.key)), name: step.name };
          parent = folders[step.key].id;
        }
        const id = (await client.find(accessToken, parent, job.tag))
          || (await client.upload(accessToken, { parentId: parent, name: job.name, mime: job.mime, tag: job.tag, bytes: await loadBytes(job.source) }));
        results.push({ job, id });
      } catch (error) {
        results.push({ job, error: error instanceof ApiError ? error.message : 'Could not save to Google Drive. Iksha will try again.' });
      }
    }
    await inLine(async () => {
      const state = getState(), drive = state.drive;
      // Disconnected or moved to another folder meanwhile: these results belong to the old place.
      if (!drive || drive.token !== plan.token || drive.folder?.id !== plan.rootId) return;
      drive.folders = { ...(drive.folders || {}), ...made };
      for (const [key, name] of Object.entries(renamed)) if (drive.folders[key]) drive.folders[key] = { ...drive.folders[key], name };
      const at = new Date().toISOString();
      for (const { job, id, error } of results) {
        const record = (job.kind === 'task' ? state.taskFiles : state.projectFiles).find((row) => row.id === job.id);
        if (record) Object.assign(record, id ? { status: 'Stored', driveFileId: id, error: '', driveTriedAt: at } : { status: 'Pending', error, driveTriedAt: at });
      }
      await save();
    });
    // A full batch that saved something means more may be waiting.
    return plan.work.length === batch && results.some((result) => result.id);
  }
  async function run() {
    if (running) { again = true; return; }
    running = true;
    try {
      do { again = false; while (await pass().catch(() => false)); } while (again);
    } finally { running = false; }
  }
  return { run, kick: () => void run() };
}

// Once: the bot used to save files to Drive itself. From now on the web app saves everything into the connected
// Drive's layout, so every group file starts again as waiting, without the bot's old errors.
export function initializeDrive(state) {
  if (state.driveUploads === 'web') return false;
  for (const file of state.projectFiles) Object.assign(file, { status: 'Pending', error: '', driveFileId: '' });
  state.driveUploads = 'web';
  return true;
}
