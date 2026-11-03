// Every date the app shows goes through here, so there is one format. See frontend/DESIGN.md.
//
// Three kinds of value arrive, and they must not be mixed up:
// - An instant, such as `2026-10-05T09:30:00Z`: a moment, shown in the reader's time zone.
// - A calendar date, such as `2026-10-05`: a day with no time, which must read 5 Oct everywhere.
// - A timeline day: a UTC-midnight number. Pass `{ timeZone: 'UTC' }` so it keeps its day.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY = 86400000;

// Meetings are arranged in studio time, whoever reads them.
export const STUDIO_TIME_ZONE = 'Asia/Kolkata';

const isCalendar = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

function read(value, timeZone) {
  if (value === null || value === undefined || value === '') return null;
  const calendar = isCalendar(value);
  const date = value instanceof Date ? value : new Date(calendar ? `${value}T00:00:00Z` : value);
  if (!Number.isFinite(date.getTime())) return null;
  return { date, timeZone: calendar ? 'UTC' : timeZone };
}

function partsOf({ date, timeZone }) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value ?? '';
  return {
    year: Number(part('year')),
    month: Number(part('month')),
    day: Number(part('day')),
    weekday: part('weekday'),
    time: `${Number(part('hour'))}:${part('minute')} ${part('dayPeriod').toLowerCase()}`,
  };
}

// 5 Oct 2026
export function formatDate(value, { timeZone } = {}) {
  const input = read(value, timeZone);
  if (!input) return '';
  const { day, month, year } = partsOf(input);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

// 5 Oct, for tight spaces where the year is already clear.
export function formatDateShort(value, { timeZone } = {}) {
  const input = read(value, timeZone);
  if (!input) return '';
  const { day, month } = partsOf(input);
  return `${day} ${MONTHS[month - 1]}`;
}

// 2:30 pm
export function formatTime(value, { timeZone } = {}) {
  const input = read(value, timeZone);
  return input ? partsOf(input).time : '';
}

// 5 Oct 2026, 2:30 pm. A calendar date has no time, so it stays a plain date.
export function formatDateTime(value, { timeZone } = {}) {
  const input = read(value, timeZone);
  if (!input) return '';
  return isCalendar(value)
    ? formatDate(value)
    : `${formatDate(value, { timeZone })}, ${partsOf(input).time}`;
}

// A deadline can arrive with a time attached. Its day is what was chosen, so keep that day.
export function formatCalendar(value) {
  return typeof value === 'string' ? formatDate(value.slice(0, 10)) : formatDate(value);
}

// In lists: Now, 5m, 2h, Yesterday, 3d, then the plain date.
export function formatRelative(value, now = new Date()) {
  const input = read(value);
  if (!input) return '';
  if (isCalendar(value)) return formatDate(value);
  const elapsed = now.getTime() - input.date.getTime();
  if (elapsed < -60000) return formatDate(value);
  if (elapsed < 60000) return 'Now';
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 60) return `${minutes}m`;
  const dayNumber = (date) => {
    const { year, month, day } = partsOf({ date });
    return Date.UTC(year, month - 1, day) / DAY;
  };
  const days = dayNumber(now) - dayNumber(input.date);
  if (days === 0) return `${Math.floor(minutes / 60)}h`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d`;
  return formatDate(value);
}

// Timeline column headers. These take a timeline day.
export const monthLabel = (value) => MONTHS[new Date(value).getUTCMonth()];
export const weekdayLabel = (value) => WEEKDAYS[new Date(value).getUTCDay()];
export const weekdayLetter = (value) => WEEKDAYS[new Date(value).getUTCDay()].charAt(0);

// Today in the reader's own time zone, for a date input. Using toISOString here gives
// yesterday's date in the early morning anywhere ahead of UTC, such as India.
export function todayInput(now = new Date()) {
  const { year, month, day } = partsOf({ date: now });
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
