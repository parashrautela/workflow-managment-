export function projectChatMembers(members = []) {
  const seen = new Set();
  return members.filter((member) => member.employeeId && member.name?.trim() && member.active !== false && !seen.has(member.employeeId) && seen.add(member.employeeId));
}

export function mentionAt(text, cursor) {
  const match = text.slice(0, cursor).match(/(?:^|\s)@([^\s@]*)$/u);
  return match ? { start: cursor - match[1].length - 1, end: cursor, query: match[1] } : null;
}

export function mentionCandidates(members, query) {
  const search = query.toLocaleLowerCase();
  return members.filter((member) => `${member.name} ${member.role || member.designation || ''} ${member.employeeId}`.toLocaleLowerCase().includes(search));
}

export function insertMention(text, mention, name) {
  const label = `@${name} `;
  return { text: text.slice(0, mention.start) + label + text.slice(mention.end), cursor: mention.start + label.length };
}
