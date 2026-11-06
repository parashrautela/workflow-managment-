// Turns the assistant's plain-text answer into parts the page can lay out as a report.
// The shapes come from backend/queries/project-assistant.js; anything else falls back to plain text.

// "Project — Stage — Task", with its status on the next line.
const TASK = /^(.+?) — (.*?) — (.+)$/;
// "Not recorded" values and "No team members assigned." lines: facts that are missing, shown grey.
const EMPTY_VALUE =
  /not recorded|none recorded|no one assigned|not set|^no .+ (assigned|recorded)\.?$/i;

function listItem(text) {
  const colon = text.indexOf(':');
  if (colon > 0 && colon <= 24 && !text.slice(0, colon).includes(' — ')) {
    const value = text.slice(colon + 1).trim();
    return { kind: 'field', label: text.slice(0, colon), value, empty: EMPTY_VALUE.test(value) };
  }
  const dash = text.indexOf(' — ');
  if (dash > 0)
    return { kind: 'pair', primary: text.slice(0, dash), secondary: text.slice(dash + 3) };
  return { kind: 'bullet', text, empty: EMPTY_VALUE.test(text) };
}

export function parseAnswer(text) {
  const answer = { title: '', intro: [], sections: [], tasks: [] };
  let section = null;
  // Lines with no blank line between them belong together, such as a task and its status.
  let group = null;
  const target = () => (section ? section.items : answer.intro);
  const flush = () => {
    if (!group) return;
    const [first, ...rest] = group;
    const task = rest.length ? first.match(TASK) : null;
    if (task)
      answer.tasks.push({
        project: task[1],
        stage: task[2],
        title: task[3],
        status: rest.join(' · '),
      });
    else target().push({ kind: 'text', lines: group });
    group = null;
  };
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('- ')) flush();
    if (!line) continue;
    if (line.startsWith('# ') && !answer.title && !section) answer.title = line.slice(2);
    else if (line.startsWith('## '))
      answer.sections.push((section = { heading: line.slice(3), items: [] }));
    else if (line.startsWith('# ')) target().push({ kind: 'text', lines: [line.slice(2)] });
    else if (line.startsWith('- ')) target().push(listItem(line.slice(2)));
    else (group ||= []).push(line);
  }
  flush();
  return answer;
}

// The same tones the rest of the app uses: late work is overdue even while it waits for approval.
export function statusTone(status) {
  if (/overdue/i.test(status)) return 'overdue';
  if (/approval|blocked/i.test(status)) return 'warning';
  if (/in progress/i.test(status)) return 'info';
  if (/done|completed/i.test(status)) return 'success';
  return 'neutral';
}
