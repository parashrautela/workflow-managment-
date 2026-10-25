import test from 'node:test';
import assert from 'node:assert/strict';
import { needsQueryAttention, queryStatusLabel } from './queryStatus.js';

test('ordinary group chat stays visible context without being pending work', () => {
  assert.equal(needsQueryAttention({requestType:'Message',status:'Pending'}),false);
  assert.equal(needsQueryAttention({requestType:'Question',status:'Pending'}),true);
  assert.equal(needsQueryAttention({requestType:'Question',status:'On hold',decisionStatus:'Held'}),false);
  assert.equal(queryStatusLabel({requestType:'Message',status:'Pending'}),'Group message');
  assert.equal(queryStatusLabel({requestType:'Question',status:'On hold'}),'Waiting for more context');
});
