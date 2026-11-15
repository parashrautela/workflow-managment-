export function projectChatMembers(members = []) {
  const seen = new Set();
  return members.filter(
    (member) =>
      member.employeeId &&
      member.name?.trim() &&
      member.active !== false &&
      !seen.has(member.employeeId) &&
      seen.add(member.employeeId),
  );
}

export function mentionAt(text, cursor) {
  const match = text.slice(0, cursor).match(/(?:^|\s)@([^\s@]*)$/u);
  return match ? { start: cursor - match[1].length - 1, end: cursor, query: match[1] } : null;
}

export function mentionCandidates(members, query) {
  const search = query.toLocaleLowerCase();
  return members.filter((member) =>
    `${member.name} ${member.role || member.designation || ''} ${member.employeeId}`
      .toLocaleLowerCase()
      .includes(search),
  );
}

export function insertMention(text, mention, name) {
  const label = `@${name} `;
  return {
    text: text.slice(0, mention.start) + label + text.slice(mention.end),
    cursor: mention.start + label.length,
  };
}

export function mentionsUser(text, userName) {
  if (!text || !userName) return false;
  const name = userName.trim();
  if (!name) return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`@${escaped}(?=[\\s.,!?]|$)`, 'iu');
  return regex.test(text);
}

export function formatMessageMentions(text, memberNames = []) {
  if (!text) return [];
  const validNames = memberNames
    .map((name) => name?.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (!validNames.length) {
    return [{ text, isMention: false }];
  }
  const pattern = validNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const regex = new RegExp(`(@(?:${pattern}))(?=[\\s.,!?]|$)`, 'gu');
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), isMention: false });
    }
    parts.push({ text: match[1], isMention: true });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), isMention: false });
  }
  return parts;
}
