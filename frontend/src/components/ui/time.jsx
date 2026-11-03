import * as React from 'react';
import {
  formatCalendar,
  formatDate,
  formatDateShort,
  formatDateTime,
  formatRelative,
  formatTime,
} from '@/lib/dates';

const formats = {
  relative: (value) => formatRelative(value),
  date: formatDate,
  short: formatDateShort,
  calendar: (value) => formatCalendar(value),
  datetime: formatDateTime,
  time: formatTime,
};

// Shows a date in one of the agreed formats, with the exact time on hover.
function Time({ value, format = 'relative', timeZone, className }) {
  const label = formats[format](value, { timeZone });
  if (!label) return null;
  const exact = format === 'calendar' ? label : formatDateTime(value, { timeZone });
  return (
    <time
      data-slot="time"
      dateTime={value instanceof Date ? value.toISOString() : String(value)}
      title={exact}
      className={className}
    >
      {label}
    </time>
  );
}

export { Time };
