import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAnswer, statusTone } from './answer.js';

test('a work list becomes tasks with project, stage, title and status', () => {
  const answer = parseAnswer(
    'Nair Apartment — Design — Prepare concept\nOpen · Overdue\n\nKapoor Villa —  — Site walk\nApproval pending',
  );
  assert.deepEqual(answer.tasks, [
    {
      project: 'Nair Apartment',
      stage: 'Design',
      title: 'Prepare concept',
      status: 'Open · Overdue',
    },
    { project: 'Kapoor Villa', stage: '', title: 'Site walk', status: 'Approval pending' },
  ]);
  assert.equal(answer.title, '');
});

test('a report becomes a title, an intro line and one section per project', () => {
  const answer = parseAnswer(
    '# Next milestones\n2 projects found in saved workspace records.\n\n## Kapoor Villa\n- Next milestone: Not recorded\n- Current phase: Design\n\n## Nair Apartment\n- Neha Shah — Interior Designer',
  );
  assert.equal(answer.title, 'Next milestones');
  assert.deepEqual(answer.intro, [
    { kind: 'text', lines: ['2 projects found in saved workspace records.'] },
  ]);
  assert.deepEqual(answer.sections[0], {
    heading: 'Kapoor Villa',
    items: [
      { kind: 'field', label: 'Next milestone', value: 'Not recorded', empty: true },
      { kind: 'field', label: 'Current phase', value: 'Design', empty: false },
    ],
  });
  assert.deepEqual(answer.sections[1].items, [
    { kind: 'pair', primary: 'Neha Shah', secondary: 'Interior Designer' },
  ]);
});

test('missing facts are marked so they can be shown grey', () => {
  const answer = parseAnswer('## Kapoor Villa\n- No team members assigned.\n- Ravi visited site');
  assert.deepEqual(answer.sections[0].items, [
    { kind: 'bullet', text: 'No team members assigned.', empty: true },
    { kind: 'bullet', text: 'Ravi visited site', empty: false },
  ]);
});

test('text that matches no shape stays plain', () => {
  const answer = parseAnswer('No pending work recorded.');
  assert.deepEqual(answer.intro, [{ kind: 'text', lines: ['No pending work recorded.'] }]);
  assert.equal(answer.tasks.length, 0);
});

test('overdue wins over approval, matching the status chips elsewhere', () => {
  assert.equal(statusTone('Approval pending · Overdue'), 'overdue');
  assert.equal(statusTone('Approval pending'), 'warning');
  assert.equal(statusTone('Open'), 'neutral');
});
