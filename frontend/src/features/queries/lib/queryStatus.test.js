import test from 'node:test';
import assert from 'node:assert/strict';
import { needsQueryAttention, queryInboxTab, queryStatusLabel } from './queryStatus.js';

test('each request lands in one inbox tab', () => {
  assert.equal(queryInboxTab({ requestType: 'Question', status: 'Pending' }), 'action');
  assert.equal(queryInboxTab({ requestType: 'Update', status: 'Pending' }), 'action');
  assert.equal(
    queryInboxTab({ requestType: 'Question', status: 'On hold', decisionStatus: 'Held' }),
    'waiting',
  );
  assert.equal(queryInboxTab({ requestType: 'Message', status: 'On hold' }), 'waiting');
  assert.equal(queryInboxTab({ requestType: 'Question', status: 'Published' }), 'handled');
  assert.equal(
    queryInboxTab({ requestType: 'Question', status: 'Pending', decisionStatus: 'Accepted' }),
    'handled',
  );
  assert.equal(queryInboxTab({ requestType: 'Message', status: 'Pending' }), 'group');
  assert.equal(
    queryInboxTab({ requestType: 'Message', status: 'Pending', decisionStatus: 'Accepted' }),
    'handled',
  );
});

test('ordinary group chat stays visible context without being pending work', () => {
  assert.equal(needsQueryAttention({ requestType: 'Message', status: 'Pending' }), false);
  assert.equal(needsQueryAttention({ requestType: 'Question', status: 'Pending' }), true);
  assert.equal(
    needsQueryAttention({ requestType: 'Question', status: 'On hold', decisionStatus: 'Held' }),
    false,
  );
  assert.equal(queryStatusLabel({ requestType: 'Message', status: 'Pending' }), 'Group message');
  assert.equal(
    queryStatusLabel({ requestType: 'Question', status: 'On hold' }),
    'Waiting for more context',
  );
});
