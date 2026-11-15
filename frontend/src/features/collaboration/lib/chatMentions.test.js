import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatMessageMentions,
  insertMention,
  mentionAt,
  mentionCandidates,
  mentionsUser,
  projectChatMembers,
} from './chatMentions.js';

const members = [
  { employeeId: 'EMP-A', name: 'Neha Sharma', role: 'Designer' },
  { employeeId: 'EMP-B', name: 'Ravi', designation: 'Site Supervisor' },
];

test('chat lists each assigned employee once and excludes inactive and non-employee profiles', () => {
  assert.deepEqual(
    projectChatMembers([
      ...members,
      members[0],
      { employeeId: 'EMP-C', name: 'Former', active: false },
      { name: 'Client' },
      { employeeId: 'EMP-D', name: ' ' },
    ]),
    members,
  );
  assert.deepEqual(projectChatMembers(), []);
});

test('typing @ offers project members, searchable by name, role or employee ID', () => {
  assert.deepEqual(mentionAt('@', 1), { start: 0, end: 1, query: '' });
  assert.deepEqual(mentionCandidates(members, ''), members);
  assert.deepEqual(mentionCandidates(members, 'SHAR'), [members[0]]);
  assert.deepEqual(mentionCandidates(members, 'super'), [members[1]]);
  assert.deepEqual(mentionCandidates(members, 'emp-b'), [members[1]]);
  assert.deepEqual(mentionCandidates(members, 'Nobody'), []);
  assert.equal(mentionAt('person@example.com', 18), null);
  assert.equal(mentionAt('@Neha Sharma ', 13), null);
  assert.equal(mentionAt('hello', 5), null);
});

test('mention selection replaces only the query at the cursor and preserves surrounding text', () => {
  const text = 'Please\n@Ne check this';
  const mention = mentionAt(text, 10);
  assert.deepEqual(mention, { start: 7, end: 10, query: 'Ne' });
  const next = insertMention(text, mention, 'Neha Sharma');
  assert.equal(next.text, 'Please\n@Neha Sharma  check this');
  assert.equal(next.cursor, 20);
  assert.equal(mentionAt(next.text, next.cursor), null, 'inserting a full name closes suggestions');
  assert.deepEqual(mentionAt('Hi @रवि', 7), { start: 3, end: 7, query: 'रवि' });
});

test('mentionsUser identifies whether a user name is mentioned', () => {
  assert.equal(mentionsUser('Hey @Neha Sharma, please verify', 'Neha Sharma'), true);
  assert.equal(mentionsUser('Hey @Neha, please verify', 'Neha'), true);
  assert.equal(mentionsUser('Hey @Ravi check this', 'Neha Sharma'), false);
  assert.equal(mentionsUser('Email me at neha@example.com', 'Neha'), false);
  assert.equal(mentionsUser('', 'Neha'), false);
  assert.equal(mentionsUser('Hello', ''), false);
});

test('formatMessageMentions tokenizes known member mentions', () => {
  const text = 'Hey @Neha Sharma and @Ravi please review!';
  const tokens = formatMessageMentions(text, ['Neha Sharma', 'Ravi']);
  assert.deepEqual(tokens, [
    { text: 'Hey ', isMention: false },
    { text: '@Neha Sharma', isMention: true },
    { text: ' and ', isMention: false },
    { text: '@Ravi', isMention: true },
    { text: ' please review!', isMention: false },
  ]);
});
