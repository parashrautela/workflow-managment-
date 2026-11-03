// People around a task for the timeline: who does it, who they need work from, and who they hand it to.
// "From" and "to" come from the plan's links: owners of the tasks just before and just after this one.

const initialsOf = (name) =>
  name
    .split(/[\s/&]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

// A named person when one is assigned, otherwise the plan's role so the bar still says who is responsible.
export function personFor(task, ownerName) {
  const assigned = ownerName(task);
  if (assigned && assigned !== 'Unassigned')
    return { name: assigned, initials: initialsOf(assigned), isRole: false };
  if (task.sourceAssigneeName)
    return {
      name: task.sourceAssigneeName,
      initials: initialsOf(task.sourceAssigneeName),
      isRole: false,
    };
  if (task.sourceRole)
    return { name: task.sourceRole, initials: initialsOf(task.sourceRole), isRole: true };
  return null;
}

const open = (task) => !task.deletedAt && task.status !== 'Cancelled';
const unique = (people, owner) => {
  const seen = new Set(owner ? [owner.name] : []);
  return people.filter((person) => person && !seen.has(person.name) && seen.add(person.name));
};

export function buildPeopleIndex(tasks, ownerName) {
  const byBotId = new Map(
    tasks.filter((task) => task.telegramTaskId).map((task) => [task.telegramTaskId, task]),
  );
  const successors = new Map();
  for (const task of tasks.filter(open)) {
    for (const dependency of task.dependencies || []) {
      const list = successors.get(dependency.predecessorTelegramTaskId) || [];
      list.push(task);
      successors.set(dependency.predecessorTelegramTaskId, list);
    }
  }
  return (task) => {
    const owner = personFor(task, ownerName);
    const from = (task.dependencies || [])
      .map((dependency) => byBotId.get(dependency.predecessorTelegramTaskId))
      .filter((item) => item && open(item))
      .map((item) => personFor(item, ownerName));
    const to = (successors.get(task.telegramTaskId) || []).map((item) =>
      personFor(item, ownerName),
    );
    return { owner, from: unique(from, owner), to: unique(to, owner) };
  };
}

// Stable soft colour per person, so the same person looks the same on every bar.
export function avatarHue(name) {
  let hash = 0;
  for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) % 360;
  return hash;
}
