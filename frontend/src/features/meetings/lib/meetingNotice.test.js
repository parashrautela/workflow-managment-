import test from 'node:test';
import assert from 'node:assert/strict';
import { countUpcomingEmployeeMeetings } from './meetingNotice.js';

test('counts scheduled future meetings including the employee', () => {
  const now = new Date('2026-11-15T10:00:00Z').getTime();
  const meetings = [
    {
      id: 'm1',
      status: 'Scheduled',
      startsAt: '2026-11-15T12:00:00Z',
      attendeeIds: ['EMP-1', 'EMP-2'],
    },
    {
      id: 'm2',
      status: 'Scheduled',
      startsAt: '2026-11-15T09:00:00Z', // In the past
      attendeeIds: ['EMP-1'],
    },
    {
      id: 'm3',
      status: 'Cancelled',
      startsAt: '2026-11-15T14:00:00Z', // Cancelled
      attendeeIds: ['EMP-1'],
    },
    {
      id: 'm4',
      status: 'Completed',
      startsAt: '2026-11-15T15:00:00Z', // Completed
      attendeeIds: ['EMP-1'],
    },
    {
      id: 'm5',
      status: 'Scheduled',
      startsAt: '2026-11-15T16:00:00Z',
      attendees: [{ id: 'EMP-1' }], // Identified via attendees array
    },
    {
      id: 'm6',
      status: 'Scheduled',
      startsAt: '2026-11-15T17:00:00Z',
      attendeeIds: ['EMP-99'], // Not this employee
    },
  ];

  assert.equal(countUpcomingEmployeeMeetings(meetings, 'EMP-1', now), 2);
  assert.equal(countUpcomingEmployeeMeetings(meetings, 'EMP-2', now), 1);
  assert.equal(countUpcomingEmployeeMeetings(meetings, 'EMP-99', now), 1);
  assert.equal(countUpcomingEmployeeMeetings(meetings, 'EMP-NONE', now), 0);
  assert.equal(countUpcomingEmployeeMeetings([], 'EMP-1', now), 0);
  assert.equal(countUpcomingEmployeeMeetings(meetings, null, now), 0);
});
