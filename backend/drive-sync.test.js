import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from './api-error.js';
import { createDriveSync, currentStageId, driveName, folderPath, initializeDrive } from './drive-sync.js';

// An in-memory Drive: folders and files with their parent, name and Iksha tag.
function fakeDrive() {
  const nodes = new Map([['root', { name: 'Iksha Studio', parent: null }]]);
  let next = 0, uploads = 0;
  const client = {
    accessToken: async () => 'access',
    find: async (token, parent, tag) => [...nodes].find(([, node]) => node.parent === parent && node.tag === tag)?.[0] || '',
    folder: async (token, parent, name, tag) => (await client.find(token, parent, tag)) || (nodes.set(`d${++next}`, { name, parent, tag }), `d${next}`),
    upload: async (token, { parentId, name, tag, bytes }) => {
      if (String(bytes) === 'TOO BIG') throw new ApiError('File is over 20 MB, so Telegram won’t hand it to the bot. Ask for a smaller copy.', 413);
      uploads += 1; nodes.set(`u${++next}`, { name, parent: parentId, tag }); return `u${next}`;
    },
    rename: async (token, id, name) => { nodes.get(id).name = name; },
  };
  const path = (id) => { const parts = []; for (let node = nodes.get(id); node?.parent; node = nodes.get(node.parent)) parts.unshift(node.name); return parts.join('/'); };
  const files = () => [...nodes].filter(([id]) => id.startsWith('u')).map(([id]) => path(id)).sort();
  return { client, nodes, files, uploads: () => uploads };
}

const at = (hour) => `2026-11-21T0${hour}:00:00Z`; // morning in India, so the day is 2026-11-21
function studio() {
  const project = { id: 'p1', name: 'Sharma Residence', telegramGroupChatId: '-100', stages: [
    { id: 's-design', name: 'Design', order: 1 }, { id: 's-res', name: 'Resources', order: 0 }] };
  return {
    drive: { token: 'sealed', folder: { id: 'root' }, folders: {} },
    projects: [project], employees: [{ id: 'e1', name: 'Neha Iyer' }],
    tasks: [{ id: 't1', projectId: 'p1', stageId: 's-design', status: 'In progress' }, { id: 't0', projectId: 'p1', stageId: 's-res', status: 'Completed' }],
    projectFiles: [
      { id: 'RES-1', projectId: 'p1', stageId: 's-res', type: 'Photo', mimeType: 'image/jpeg', name: 'photo-1.jpg', caption: 'Kitchen wall: crack?', submittedBy: 'Ravi', submittedAt: at(5), fileId: 'a' },
      { id: 'RES-2', projectId: 'p1', stageId: 's-res', type: 'Photo', mimeType: 'image/jpeg', name: 'photo-2.jpg', caption: '', submittedBy: 'Ravi', submittedAt: at(6), fileId: 'b' },
      { id: 'RES-3', projectId: 'p1', stageId: 's-res', type: 'Photo', mimeType: 'image/jpeg', name: 'photo-3.jpg', caption: '', submittedBy: 'Ravi', submittedAt: at(7), fileId: 'c' },
      { id: 'RES-4', projectId: 'p1', stageId: 's-res', type: 'Document', mimeType: 'application/pdf', name: 'floor-plan.pdf', caption: 'see page 2', submittedBy: 'Ravi', submittedAt: at(5), fileId: 'd' },
      { id: 'RES-5', projectId: 'p1', stageId: '', type: 'Document', mimeType: 'image/png', name: 'IMG_0042.png', caption: '', submittedBy: 'Client', submittedAt: at(5), fileId: 'e' },
      { id: 'RES-6', projectId: 'p1', stageId: 's-design', type: 'Video', mimeType: 'video/mp4', name: 'video-9.mp4', caption: 'walkthrough', submittedBy: 'Ravi', submittedAt: at(8), fileId: 'f' },
      { id: 'RES-7', projectId: 'p1', stageId: 's-design', type: 'Video', mimeType: 'video/mp4', name: 'video-10.mp4', caption: 'site', submittedBy: 'Ravi', submittedAt: at(8), fileId: 'BIG' },
    ],
    taskFiles: [{ id: 'w1', taskId: 't1', projectId: 'p1', name: 'Quote v2.pdf', type: 'application/pdf', authorId: 'e1', at: at(9) }],
  };
}
function worker(state, drive, batch) {
  let saves = 0;
  const sync = createDriveSync({ getState: () => state, inLine: (fn) => Promise.resolve().then(fn), save: async () => { saves += 1; }, client: drive.client,
    loadBytes: async (source) => (source.fileId === 'BIG' ? 'TOO BIG' : 'bytes'), ...(batch ? { batch } : {}) });
  return { sync, saves: () => saves };
}

test('files land in Project / N Stage / type, named by day, sender and caption', async () => {
  const state = studio(), drive = fakeDrive();
  await worker(state, drive).sync.run();
  assert.deepEqual(drive.files(), [
    'Sharma Residence/1 Resources/Documents/2026-11-21 Ravi floor-plan.pdf',
    'Sharma Residence/1 Resources/Photos/2026-11-21 Ravi 01.jpg',
    'Sharma Residence/1 Resources/Photos/2026-11-21 Ravi 02.jpg',
    'Sharma Residence/1 Resources/Photos/2026-11-21 Ravi Kitchen wall crack.jpg',
    'Sharma Residence/2 Design/Documents/2026-11-21 Neha Iyer Quote v2.pdf',
    'Sharma Residence/2 Design/Videos/2026-11-21 Ravi walkthrough.mp4',
    'Sharma Residence/Unsorted/Photos/2026-11-21 Client 01.png',
  ]);
  const big = state.projectFiles.find((file) => file.id === 'RES-7');
  assert.deepEqual([big.status, big.error], ['Pending', 'File is over 20 MB, so Telegram won’t hand it to the bot. Ask for a smaller copy.']);
  assert.ok(state.projectFiles.filter((file) => file.id !== 'RES-7').every((file) => file.status === 'Stored' && file.driveFileId));
  assert.equal(state.taskFiles[0].status, 'Stored');
  assert.equal(Object.keys(state.drive.folders).length, 9);
});

test('a second run uploads nothing new; renames and reorders rename the folders', async () => {
  const state = studio(), drive = fakeDrive();
  await worker(state, drive).sync.run();
  const before = drive.uploads();
  state.projects[0].name = 'Sharma Residence 3BHK';
  state.projects[0].stages[0].order = -1; // Design now comes first
  await worker(state, drive).sync.run();
  assert.equal(drive.uploads(), before);
  assert.ok(drive.files().includes('Sharma Residence 3BHK/1 Design/Videos/2026-11-21 Ravi walkthrough.mp4'));
  assert.ok(drive.files().includes('Sharma Residence 3BHK/2 Resources/Photos/2026-11-21 Ravi 01.jpg'));
});

test('a crash after upload but before saving finds the copy instead of uploading twice', async () => {
  const state = studio(), drive = fakeDrive();
  await worker(state, drive).sync.run();
  const before = drive.uploads();
  for (const file of state.projectFiles) Object.assign(file, { status: 'Pending', driveFileId: '' });
  await worker(state, drive).sync.run();
  assert.equal(drive.uploads(), before);
  assert.equal(state.projectFiles[0].status, 'Stored');
});

test('nothing runs without a folder, and results are dropped if Drive is disconnected meanwhile', async () => {
  const state = studio(), drive = fakeDrive();
  state.drive.folder = null;
  await worker(state, drive).sync.run();
  assert.equal(drive.uploads(), 0);
  const moving = studio();
  const sync = createDriveSync({ getState: () => moving, inLine: (fn) => Promise.resolve().then(fn), save: async () => {}, client: drive.client,
    loadBytes: async () => { moving.drive = null; return 'bytes'; } });
  await sync.run();
  assert.ok(moving.projectFiles.every((file) => file.status !== 'Stored'));
});

test('big backlogs go in batches until done', async () => {
  const state = studio(), drive = fakeDrive();
  await worker(state, drive, 2).sync.run();
  assert.equal(state.projectFiles.filter((file) => file.status === 'Stored').length, 6);
});

test('helpers: names stay safe, the current stage is the first unfinished one, and the bot’s old status is reset once', () => {
  const state = studio(), project = state.projects[0];
  assert.equal(currentStageId(state, project), 's-design');
  const item = { project, stageId: 'gone', at: at(5), sender: 'A/B', caption: '../etc', original: 'x', mime: 'image/jpeg', keepOriginal: false };
  assert.equal(driveName(item), '2026-11-21 A B .. etc.jpg'); // slashes go; a Drive name is never a path
  assert.deepEqual(folderPath(item).map((step) => step.name), ['Sharma Residence', 'Unsorted', 'Photos']);
  const old = { projectFiles: [{ id: 'x', status: 'Stored', error: 'old', driveFileId: 'legacy' }] };
  assert.equal(initializeDrive(old), true);
  assert.deepEqual(old.projectFiles[0], { id: 'x', status: 'Pending', error: '', driveFileId: '' });
  assert.equal(initializeDrive(old), false);
});
