import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRecentActivity,
  dayGreeting,
  partitionMeetings,
  studioDateKey,
  summarizeQueries,
  summarizeWorkQueue,
} from './todaySummary.js';

test('studioDateKey converts timestamps cleanly to IST calendar days', () => {
  // 2026-11-25 19:00 UTC is 2026-11-26 00:30 IST
  assert.equal(studioDateKey('2026-11-25T19:00:00Z'), '2026-11-26');
  assert.equal(studioDateKey('2026-11-25T10:00:00Z'), '2026-11-25');
  assert.equal(dayGreeting(new Date('2026-11-25T04:00:00Z')), 'Good morning');
  assert.equal(dayGreeting(new Date('2026-11-25T09:00:00Z')), 'Good afternoon');
  assert.equal(dayGreeting(new Date('2026-11-25T14:00:00Z')), 'Good evening');
});

test('partitionMeetings splits scheduled meetings into today, tomorrow, upcoming, and past', () => {
  const now = new Date('2026-11-25T06:00:00Z'); // 11:30 IST on 2026-11-25
  const meetings = [
    { id: 'm-past', status: 'Scheduled', startsAt: '2026-11-24T08:00:00Z' },
    { id: 'm-done', status: 'Completed', startsAt: '2026-11-25T08:00:00Z' },
    { id: 'm-today', status: 'Scheduled', startsAt: '2026-11-25T10:00:00Z' },
    { id: 'm-tmrw', status: 'Scheduled', startsAt: '2026-11-26T06:00:00Z' },
    { id: 'm-later', status: 'Scheduled', startsAt: '2026-11-29T06:00:00Z' },
  ];
  const groups = partitionMeetings(meetings, now);
  assert.deepEqual(
    groups.today.map((m) => m.id),
    ['m-today'],
  );
  assert.deepEqual(
    groups.tomorrow.map((m) => m.id),
    ['m-tmrw'],
  );
  assert.deepEqual(
    groups.upcoming.map((m) => m.id),
    ['m-later'],
  );
  assert.deepEqual(
    groups.past.map((m) => m.id),
    ['m-past'],
  );
  assert.equal(groups.nextUpcoming?.id, 'm-tmrw');
});

test('summarizeQueries counts wait tiers and ignores closed projects or handled items', () => {
  const now = Date.parse('2026-11-25T12:00:00Z');
  const projects = [
    { id: 'p1', name: 'Sharma Residence', status: 'On track' },
    { id: 'p2', name: 'Old Site', status: 'Completed' },
  ];
  const requests = [
    {
      id: 'q1',
      projectId: 'p1',
      requestType: 'Question',
      status: 'Pending',
      createdAt: '2026-11-21T10:00:00Z',
    },
    {
      id: 'q2',
      projectId: 'p1',
      requestType: 'Question',
      status: 'Pending',
      createdAt: '2026-11-24T08:00:00Z',
    },
    {
      id: 'q3',
      projectId: 'p1',
      requestType: 'Question',
      status: 'Pending',
      createdAt: '2026-11-25T10:00:00Z',
    },
    {
      id: 'q4',
      projectId: 'p2',
      requestType: 'Question',
      status: 'Pending',
      createdAt: '2026-11-20T10:00:00Z',
    },
    {
      id: 'q5',
      projectId: 'p1',
      requestType: 'Message',
      status: 'Pending',
      createdAt: '2026-11-25T09:00:00Z',
    },
  ];
  const result = summarizeQueries(requests, projects, now);
  assert.equal(result.total, 3);
  assert.equal(result.over72h, 1);
  assert.equal(result.over24h, 1);
  assert.equal(result.fresh, 1);
  assert.deepEqual(
    result.top.map((q) => q.id),
    ['q1', 'q2'],
  );
});

test('summarizeWorkQueue skips upcoming tasks and sorts overdue first', () => {
  const summary = summarizeWorkQueue([
    { id: 't1', title: 'Later', status: 'Open', statusState: { key: 'upcoming', overdue: false } },
    { id: 't2', title: 'Blocked item', status: 'Blocked', statusState: { key: 'blocked', overdue: false } },
    { id: 't3', title: 'Late item', status: 'Open', statusState: { key: 'open', overdue: true } },
    { id: 't4', title: 'Approve', status: 'Pending', statusState: { key: 'waiting', overdue: false } },
  ]);
  assert.equal(summary.total, 3);
  assert.equal(summary.overdue, 1);
  assert.equal(summary.approvals, 1);
  assert.equal(summary.blocked, 1);
  assert.equal(summary.top[0].task.id, 't3');
});

test('buildRecentActivity merges chat messages and queries newest-first', () => {
  const projects = [
    { id: 'p1', name: 'Ravi Home', status: 'On track' },
    { id: 'p2', name: 'Kapoor Villa', status: 'On track' },
  ];
  const activity = buildRecentActivity({
    projects,
    chatMessagesByProject: {
      p1: [{ id: 'm1', senderName: 'Neha', text: 'Tiles arrived on site', at: '2026-11-25T11:00:00Z' }],
    },
    decisionRequests: [
      {
        id: 'q1',
        projectId: 'p2',
        originalSenderName: 'Rohan',
        originalMessage: 'Can we move the visit?',
        createdAt: '2026-11-25T12:00:00Z',
      },
    ],
  });
  assert.deepEqual(
    activity.map((item) => item.kind),
    ['query', 'chat'],
  );
  assert.equal(activity[0].projectName, 'Kapoor Villa');
  assert.equal(activity[1].snippet, 'Tiles arrived on site');
});
