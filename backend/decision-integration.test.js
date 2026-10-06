import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test('Telegram request enters founder inbox once, stays private, and can be resolved', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'iksha-decision-'));
  const source = path.dirname(fileURLToPath(import.meta.url));
  await cp(source, path.join(root, 'backend'), { recursive: true, filter: (sourcePath) => !sourcePath.endsWith('.test.js') });
  await cp(path.join(source, '../package.json'), path.join(root, 'package.json'));
  await symlink(path.join(source, '../node_modules'), path.join(root, 'node_modules'));
  await writeFile(path.join(root, 'mock-telegram.js'), `const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (String(url).endsWith('/sendMessage') && String(url).startsWith('https://api.telegram.org/bot')) {
    const input = JSON.parse(options.body);
    if (input.chat_id !== '-123' || input.reply_parameters.message_id !== 10 || input.text !== 'Approved') return Response.json({ ok: false }, { status: 400 });
    return Response.json({ ok: true, result: { message_id: 99 } });
  }
  return originalFetch(url, options);
};`);
  const port = await freePort();
  let starts=0;
  const bridge = http.createServer(async (req, res) => {
    assert.equal(req.headers.authorization, 'Bearer test-secret');
    let raw = ''; for await (const part of req) raw += part;
    const input = JSON.parse(raw);
    res.setHeader('content-type', 'application/json');
    if (req.url.endsWith('/group-members')) { assert.equal(input.groupChatId, '-456'); res.end(JSON.stringify({ ok: true, changed: true })); }
    else if (req.url.endsWith('/projects')) { assert.equal(input.clientName, 'Asha Kumar'); res.end(JSON.stringify({ projectId: 'P999', projectName: input.projectName })); }
    else if(req.url.endsWith('/workflows'))res.end(JSON.stringify({workflows:[{id:'RESTORATION-V1',name:'Restoration',stages:[]}]}));
    else if(req.url.endsWith('/projects/start')){starts++;res.end(JSON.stringify({workflowId:'RESTORATION-V1',workflowName:'Restoration',announcementStatus:'Sent',tasks:[{TaskID:'P999-T001',TaskName:'Collect drawings',Stage:'Resources',Status:'Pending',PlannedStart:'2026-10-07',PlannedEnd:'2026-10-07'}]}));}
    else if(req.url.endsWith('/resources/content'))res.end(JSON.stringify({bytes:Buffer.from('FILE').toString('base64'),mimeType:'application/pdf'}));
    else { res.statusCode = 404; res.end('{}'); }
  });
  await new Promise((resolve) => bridge.listen(0, '127.0.0.1', resolve));
  const bridgeUrl = `http://127.0.0.1:${bridge.address().port}`;
  const child = spawn(process.execPath, ['--import', path.join(root, 'mock-telegram.js'), path.join(root, 'backend/server.js')], { cwd: root, env: { ...process.env, PORT: String(port), FOUNDER_PASSWORD: 'test-password', INTEGRATION_SHARED_SECRET: 'test-secret', GROUP_BOT_TOKEN: 'test-bot-token', BOT_BRIDGE_URL: bridgeUrl, DATABASE_URL: '', NODE_ENV: 'test' }, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  const call = async (route, method = 'GET', value, headers = {}) => {
    const response = await fetch(base + route, { method, headers: { 'content-type': 'application/json', ...headers }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie') };
  };
  try {
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try { await call('/api/founder/projects'); ready = true; break; }
      catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
    }
    assert.ok(ready, 'server started');
    const session = await call('/api/founder/login', 'POST', { password: 'test-password' });
    const cookie = { cookie: session.cookie.split(';')[0] };
    const project = await call('/api/founder/projects', 'POST', { name: 'Test Home', clientName: 'Client' }, cookie);
    const projectId = project.data.project.id;
    const payload = { RequestID: 'REQ--123-10-approval', GroupChatID: '-123', SourceMessageID: '10', RequestType: 'Approval', OriginalMessage: 'Approve lights?', RequestContext: '', OriginalSenderName: 'Client', RequestedByName: 'Designer', AttachmentsJSON: '[]' };
    assert.equal((await call('/api/integrations/telegram/requests', 'POST', payload)).status, 401);
    const bridgeHeaders = { authorization: 'Bearer test-secret' };
    assert.equal((await call('/api/integrations/telegram/requests', 'POST', payload, bridgeHeaders)).status, 409);
    assert.equal((await call(`/api/founder/projects/${projectId}`, 'PATCH', { telegramGroupChatId: '-123' }, cookie)).status, 200);
    assert.equal((await call('/api/integrations/telegram/requests', 'POST', payload, bridgeHeaders)).status, 201);
    assert.equal((await call('/api/integrations/telegram/requests', 'POST', payload, bridgeHeaders)).status, 200);
    assert.equal((await call('/api/founder/decision-requests')).status, 401);
    const inbox = await call('/api/founder/decision-requests', 'GET', undefined, cookie);
    assert.equal(inbox.data.requests.length, 1);
    assert.equal(inbox.data.requests[0].projectId, projectId);
    const item = encodeURIComponent(payload.RequestID);
    assert.equal((await call(`/api/founder/decision-requests/${item}/comment`, 'POST', { text: 'Check dimensions' }, cookie)).status, 200);
    assert.equal((await call(`/api/founder/decision-requests/${item}/publish`, 'POST', { response: 'Approved' }, cookie)).status, 200);
    assert.equal((await call(`/api/founder/decision-requests/${item}/publish`, 'POST', { response: 'Approved' }, cookie)).status, 409);
    assert.equal((await call(`/api/founder/decision-requests/${item}/resolve`, 'POST', {}, cookie)).status, 200);
    const finalInbox = await call('/api/founder/decision-requests', 'GET', undefined, cookie);
    assert.equal(finalInbox.data.requests[0].status, 'Done');
    assert.equal(finalInbox.data.requests[0].publishedMessageId, '99');
    assert.equal(finalInbox.data.requests[0].comments[0].text, 'Check dimensions');
    const snapshot = { groups: [{ groupChatId: '-456', title: 'New Site Group', status: 'Available', members: [{ telegramUserId: '123', telegramName: 'Asha', membershipStatus: 'Active', assignedName: '', assignedRole: '' }, { telegramUserId: '124', telegramName: 'Painter', membershipStatus: 'Active', assignedName: '', assignedRole: '' }] }] };
    assert.equal((await call('/api/integrations/telegram/groups/snapshot', 'POST', snapshot)).status, 401);
    assert.equal((await call('/api/integrations/telegram/groups/snapshot', 'POST', snapshot, bridgeHeaders)).status, 200);
    const pending = await call('/api/founder/projects', 'GET', undefined, cookie);
    const pendingProject = pending.data.projects.find((item) => item.telegramGroupChatId === '-456');
    assert.equal(pendingProject.name, 'New Site Group');
    assert.equal(pendingProject.status, 'Needs setup');
    assert.equal(pendingProject.telegramSetupPending, true);
    assert.equal(pendingProject.telegramMembers.length, 2);
    assert.equal((await call('/api/integrations/telegram/groups/snapshot', 'POST', snapshot, bridgeHeaders)).status, 200);
    assert.equal((await call('/api/founder/projects', 'GET', undefined, cookie)).data.projects.filter((item) => item.telegramGroupChatId === '-456').length, 1);
    assert.equal((await call('/api/founder/telegram-groups')).status, 401);
    const discovered = await call('/api/founder/telegram-groups', 'GET', undefined, cookie);
    assert.equal(discovered.data.groups[0].members.length, 2);
    assert.equal((await call('/api/founder/telegram-groups/-456/create-project', 'POST', { projectName: 'New Site Group', startDate: '2026-09-30' }, cookie)).status, 409);
    assert.equal((await call('/api/founder/telegram-groups/-456/members/123', 'POST', { name: 'Asha Kumar', role: 'Client' }, cookie)).status, 200);
    const staff = await call('/api/founder/telegram-groups/-456/members/124','POST',{name:'Painter',role:'Painter'},cookie);
    assert.ok(staff.data.credentials.employeeId);
    const created = await call('/api/founder/telegram-groups/-456/create-project', 'POST', { projectName: 'New Site Group', startDate: '2026-09-30' }, cookie);
    assert.equal(created.status, 201);
    assert.equal(created.data.project.id, pendingProject.id);
    assert.equal(created.data.project.telegramSetupPending, false);
    assert.equal(created.data.project.telegramGroupChatId, '-456');
    assert.equal((await call('/api/founder/telegram-groups/-456/create-project', 'POST', { projectName: 'New Site Group', startDate: '2026-09-30' }, cookie)).status, 409);
    const linkedId=created.data.project.id;
    assert.equal(created.data.project.members[0].employeeId,staff.data.credentials.employeeId);
    assert.equal((await call(`/api/founder/projects/${linkedId}/workflows`,'GET',undefined,cookie)).data.workflows[0].id,'RESTORATION-V1');
    assert.equal((await call(`/api/founder/projects/${linkedId}/workflow/start`,'POST',{workflowId:'RESTORATION-V1',startDate:'2026-10-07'},cookie)).status,200);
    await call(`/api/founder/projects/${linkedId}/workflow/start`,'POST',{workflowId:'RESTORATION-V1'},cookie);
    assert.equal((await call(`/api/founder/projects/${linkedId}/tasks`,'GET',undefined,cookie)).data.tasks.length,1);assert.equal(starts,2);
    const resource={SubmissionID:'RES--456-15',SourceMessageID:'15',ProjectID:'P999',GroupChatID:'-456',TelegramUserID:'123',TelegramFileID:'fake-file',FileName:'drawing.pdf',ResourceType:'Document',DriveStatus:'Pending'};
    assert.equal((await call('/api/integrations/telegram/resources','POST',resource)).status,401);
    assert.equal((await call('/api/integrations/telegram/resources','POST',{...resource,TelegramUserID:'777'},bridgeHeaders)).status,403);
    assert.equal((await call('/api/integrations/telegram/resources','POST',resource,bridgeHeaders)).status,200);
    assert.equal((await call(`/api/founder/projects/${linkedId}/files`)).status,401);
    assert.equal((await call(`/api/founder/projects/${linkedId}/files`,'GET',undefined,cookie)).data.files[0].status,'Pending');
    await call('/api/integrations/telegram/resources','POST',{...resource,DriveStatus:'Stored',DriveFileID:'stored-file'},bridgeHeaders);
    const files=(await call(`/api/founder/projects/${linkedId}/files`,'GET',undefined,cookie)).data.files;assert.equal(files.length,1);assert.equal(files[0].status,'Stored');assert.equal(files[0].driveFileId,undefined);
    const downloaded=await fetch(base+`/api/founder/projects/${linkedId}/files/RES--456-15`,{headers:cookie});assert.equal(downloaded.status,200);assert.equal(await downloaded.text(),'FILE');
    const staffSession=await call('/api/employee/login','POST',staff.data.credentials);const staffCookie={cookie:staffSession.cookie.split(';')[0]};
    assert.equal((await call(`/api/employee/projects/${linkedId}/files`,'GET',undefined,staffCookie)).status,200);
    assert.equal((await call(`/api/employee/projects/${projectId}/files`,'GET',undefined,staffCookie)).status,404);

  } finally {
    child.kill();
    await new Promise((resolve) => bridge.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
