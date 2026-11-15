import { hasRole, isStaff } from '../../people/lib/roles.js';

// What a member card would save: the typed draft, else the saved name (an unassigned person has none yet), else the Telegram name.
export const memberValues = (member, draft = {}) => ({
  name: (draft.name ?? (member.assignedName || member.telegramName)).trim(),
  role: (draft.role ?? member.assignedRole ?? '').trim(),
});

export const isMemberSaved = (member) => Boolean(member.assignedName && member.assignedRole);

// A card needs saving when it was never saved, or its name or roles differ from what is saved.
export function memberChanged(member, draft) {
  if (!isMemberSaved(member)) return true;
  const { name, role } = memberValues(member, draft);
  return name !== member.assignedName.trim() || role !== member.assignedRole.trim();
}

// The one thing still stopping Finish setup, in plain words ('' when nothing is).
export function setupBlocker(members, draftFor) {
  const unsaved = members.filter((member) => !isMemberSaved(member)).length;
  if (unsaved) return `Save ${unsaved} more ${unsaved === 1 ? 'person' : 'people'} first.`;
  if (members.some((member) => memberChanged(member, draftFor(member))))
    return 'Save your changes first.';
  if (members.length < 2) return 'A project needs at least two people: a client and a team member.';
  if (!members.some((member) => hasRole(member.assignedRole, 'Client')))
    return 'Give one person the Client role.';
  if (!members.some((member) => isStaff(member.assignedRole)))
    return 'Give at least one person a team role, such as Supervisor or Designer.';
  return '';
}
