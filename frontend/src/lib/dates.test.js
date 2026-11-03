import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCalendar,
  formatDate,
  formatDateShort,
  formatDateTime,
  formatRelative,
  formatTime,
  monthLabel,
  STUDIO_TIME_ZONE,
  todayInput,
  weekdayLabel,
  weekdayLetter,
} from './dates.js';

function inZone(t, zone) {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  t.after(() => {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  });
}

test('fixed dates read day month year, with no ISO or US format', () => {
  assert.equal(formatDate('2026-10-05'), '5 Oct 2026');
  assert.equal(formatDate('2026-09-14'), '14 Sep 2026');
  assert.equal(formatDateShort('2026-10-05'), '5 Oct');
});

test('empty and unreadable values show nothing instead of Invalid Date', () => {
  for (const value of ['', null, undefined, 'not a date']) {
    assert.equal(formatDate(value), '');
    assert.equal(formatDateTime(value), '');
    assert.equal(formatRelative(value), '');
    assert.equal(formatTime(value), '');
  }
});

test('a calendar date keeps its day in every time zone', (t) => {
  for (const zone of ['Asia/Kolkata', 'America/Los_Angeles', 'Pacific/Kiritimati', 'UTC']) {
    inZone(t, zone);
    assert.equal(formatDate('2026-10-05'), '5 Oct 2026', zone);
    assert.equal(formatDateTime('2026-10-05'), '5 Oct 2026', zone);
    assert.equal(formatRelative('2026-10-05'), '5 Oct 2026', zone);
  }
});

test('a deadline that arrives with a time keeps its chosen day', (t) => {
  inZone(t, 'America/Los_Angeles');
  assert.equal(formatCalendar('2026-10-05T00:00:00.000Z'), '5 Oct 2026');
  assert.equal(formatCalendar('2026-10-05'), '5 Oct 2026');
  assert.equal(formatCalendar(''), '');
});

test('a timeline day keeps its day when read as UTC', (t) => {
  inZone(t, 'America/Los_Angeles');
  const day = Date.UTC(2026, 9, 5);
  assert.equal(formatDate(day, { timeZone: 'UTC' }), '5 Oct 2026');
  assert.equal(formatDateShort(day, { timeZone: 'UTC' }), '5 Oct');
  assert.equal(monthLabel(day), 'Oct');
  assert.equal(weekdayLabel(day), 'Mon');
  assert.equal(weekdayLetter(day), 'M');
});

test('an instant reads in the reader zone or an explicit one', (t) => {
  inZone(t, 'Asia/Kolkata');
  const instant = '2026-10-05T09:00:00Z';
  assert.equal(formatTime(instant), '2:30 pm');
  assert.equal(formatDateTime(instant), '5 Oct 2026, 2:30 pm');
  assert.equal(formatTime(instant, { timeZone: 'UTC' }), '9:00 am');
  assert.equal(
    formatDateTime('2026-10-05T18:45:00Z', { timeZone: STUDIO_TIME_ZONE }),
    '6 Oct 2026, 12:15 am',
  );
});

test('relative times step from now to a plain date', (t) => {
  inZone(t, 'Asia/Kolkata');
  const now = new Date('2026-10-20T06:30:00Z');
  const ago = (ms) => new Date(now.getTime() - ms).toISOString();
  const minute = 60000;
  const hour = 60 * minute;
  assert.equal(formatRelative(ago(20000), now), 'Now');
  assert.equal(formatRelative(ago(5 * minute), now), '5m');
  assert.equal(formatRelative(ago(2 * hour), now), '2h');
  assert.equal(formatRelative('2026-10-19T12:00:00Z', now), 'Yesterday');
  assert.equal(formatRelative('2026-10-17T12:00:00Z', now), '3d');
  assert.equal(formatRelative('2026-10-05T12:00:00Z', now), '5 Oct 2026');
});

test('relative days follow the calendar, not 24 hour blocks', (t) => {
  inZone(t, 'Asia/Kolkata');
  const justAfterMidnight = new Date('2026-10-19T19:00:00Z'); // 12:30 am on the 20th in India
  assert.equal(formatRelative('2026-10-19T17:00:00Z', justAfterMidnight), 'Yesterday');
  assert.equal(formatRelative('2026-10-19T18:45:00Z', justAfterMidnight), '15m');
});

test('a future instant shows its date rather than a negative time', () => {
  const now = new Date('2026-10-20T06:30:00Z');
  assert.equal(formatRelative('2026-10-25T06:30:00Z', now), '25 Oct 2026');
});

test('today for a date input uses the local day, including early morning in India', (t) => {
  inZone(t, 'Asia/Kolkata');
  // 2 am on 1 Nov in India is still 31 Oct in UTC.
  const earlyMorning = new Date('2026-10-31T20:30:00Z');
  assert.equal(earlyMorning.toISOString().slice(0, 10), '2026-10-31');
  assert.equal(todayInput(earlyMorning), '2026-11-01');
});
