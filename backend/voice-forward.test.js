import test from 'node:test';
import assert from 'node:assert/strict';
import { forwardVoiceToFounders } from './voice-forward.js';

const voice = [{ type: 'voice', fileId: 'v' }];
const state = {
  employees: [
    { id: 'f1', telegramUserId: '1', telegramConnectedAt: 'x' }, // connected founder
    { id: 'f2', telegramUserId: '2' }, // founder who has not pressed Start
    { id: 's1', telegramUserId: '3', telegramConnectedAt: 'x' }, // connected staff, not a founder
    { id: 'f3', telegramUserId: '4', telegramConnectedAt: 'x', active: false }, // disabled founder
  ],
  googleAccounts: ['f1', 'f2', 'f3'].map((employeeId) => ({ kind: 'founder', status: 'Approved', employeeId })),
};
const send = (request) => { const calls = []; forwardVoiceToFounders(state, { id: 'r', groupChatId: '-1', ...request }, async (route, payload) => { calls.push([route, payload]); }); return calls; };

test('voice notes go only to connected, active founders', () => {
  assert.deepEqual(send({ requestType: 'Question', attachments: voice }), [['/api/integrations/web/decisions/voice', { requestId: 'r', groupChatId: '-1', telegramUserIds: ['1'] }]]);
});

test('staff chatter, other media and a failing bot send nothing or never throw', async () => {
  assert.deepEqual(send({ requestType: 'Message', attachments: voice }), []);
  assert.deepEqual(send({ requestType: 'Question', attachments: [{ type: 'Photo', fileId: 'p' }] }), []);
  forwardVoiceToFounders(state, { id: 'r', groupChatId: '-1', requestType: 'Update', attachments: voice }, async () => { throw new Error('bot down'); });
  await new Promise((resolve) => setImmediate(resolve)); // an unhandled rejection would fail the run here
});
