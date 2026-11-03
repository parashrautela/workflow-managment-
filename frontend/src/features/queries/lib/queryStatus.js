export const needsQueryAttention = (request) =>
  request.requestType !== 'Message' &&
  !request.decisionStatus &&
  !['On hold', 'Done', 'Rejected', 'Published', 'Approved'].includes(request.status);

// Inbox tabs in display order. Every request sits in exactly one of them; All shows everything.
export const INBOX_TABS = [
  { value: 'action', label: 'Needs action' },
  { value: 'waiting', label: 'Waiting for context' },
  { value: 'handled', label: 'Handled' },
  { value: 'group', label: 'Group messages' },
  { value: 'all', label: 'All' },
];

export const queryInboxTab = (request) => {
  if (request.status === 'On hold') return 'waiting';
  if (needsQueryAttention(request)) return 'action';
  const decided =
    Boolean(request.decisionStatus) ||
    ['Done', 'Rejected', 'Published', 'Approved'].includes(request.status);
  return request.requestType === 'Message' && !decided ? 'group' : 'handled';
};

export const queryStatusLabel = (request) =>
  request.requestType === 'Message'
    ? 'Group message'
    : request.status === 'On hold'
      ? 'Waiting for more context'
      : request.status;
