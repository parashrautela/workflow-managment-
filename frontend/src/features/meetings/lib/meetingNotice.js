// frontend/src/features/meetings/lib/meetingNotice.js

/**
 * Counts upcoming scheduled meetings that include the specified employee.
 *
 * @param {Array} meetings - List of meeting objects
 * @param {string} employeeId - ID of the employee
 * @param {number} [now=Date.now()] - Timestamp to compare startsAt against
 * @returns {number}
 */
export function countUpcomingEmployeeMeetings(meetings = [], employeeId, now = Date.now()) {
  if (!employeeId || !Array.isArray(meetings)) return 0;
  return meetings.filter((meeting) => {
    if (meeting.status !== 'Scheduled') return false;
    const start = Date.parse(meeting.startsAt);
    if (isNaN(start) || start <= now) return false;
    return Boolean(
      meeting.attendeeIds?.includes(employeeId) ||
        meeting.attendees?.some((a) => a.id === employeeId),
    );
  }).length;
}
