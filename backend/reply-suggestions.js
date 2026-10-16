// backend/reply-suggestions.js
// Drafts a suggested Telegram reply to a client query from recorded project data.
// The founder reviews, edits and confirms every reply; nothing here sends anything.

const dateOnly = (value) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '');
const label = (value) => new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const startOf = (task) => dateOnly(task.sourceForecastStart) || dateOnly(task.sourceCurrentStart) || dateOnly(task.sourcePlannedStart);
const endOf = (task) => dateOnly(task.deadline) || dateOnly(task.sourceForecastEnd) || dateOnly(task.sourceCurrentEnd) || dateOnly(task.sourcePlannedEnd);
const isDone = (task) => ['Completed', 'completed', 'Done'].includes(task.status);
const isOpen = (task) => !task.deletedAt && task.status !== 'Cancelled';

// Everything the model may use, and nothing else. Names of staff, costs and internal tasks stay out of client replies;
// internal notes are passed separately and marked as never-to-quote.
export function buildReplyContext(state, request, today = new Date().toISOString().slice(0, 10)) {
  const project = state.projects.find((item) => item.id === request.projectId);
  if (!project) return null;
  const stageName = (task) => project.stages?.find((stage) => stage.id === task.stageId)?.name || '';
  const tasks = state.tasks.filter((task) => task.projectId === project.id && isOpen(task));
  const work = (task) => ({ task: task.title, stage: stageName(task), start: startOf(task) ? label(startOf(task)) : 'not scheduled', end: endOf(task) ? label(endOf(task)) : 'not scheduled', status: task.status });
  const dated = tasks.filter((task) => startOf(task) && endOf(task));
  const open = tasks.filter((task) => !isDone(task));
  const inProgress = open.filter((task) => startOf(task) && startOf(task) <= today && endOf(task) >= today);
  const late = open.filter((task) => endOf(task) && endOf(task) < today);
  const upcoming = open.filter((task) => startOf(task) && startOf(task) > today).sort((a, b) => startOf(a).localeCompare(startOf(b))).slice(0, 5);
  const recentlyDone = tasks.filter(isDone).sort((a, b) => String(endOf(b)).localeCompare(String(endOf(a)))).slice(0, 3);
  const finish = open.length && open.every((task) => endOf(task)) ? label(dated.map(endOf).sort().at(-1)) : 'not confirmed yet';
  const previousReplies = state.decisionRequests
    .filter((item) => item.projectId === project.id && item.id !== request.id && item.response && ['Published', 'Done'].includes(item.status))
    .sort((a, b) => String(b.publishedAt || b.createdAt).localeCompare(String(a.publishedAt || a.createdAt)))
    .slice(0, 4)
    .map((item) => ({ client_asked: item.originalMessage, we_replied: item.response }));
  return {
    query: { from: request.originalSenderName || 'Client', type: request.requestType || 'Question', message: request.originalMessage || '', context: request.context || '' },
    project: {
      name: project.name, client: project.clientName, status: project.status || '', phase: project.phase || '',
      recent_task: project.recentTask || '', next_milestone: project.nextMilestone || '', blocker: project.blocker || '',
      progress: tasks.length ? `${tasks.filter(isDone).length} of ${tasks.length} work items complete` : 'no work items yet',
      projected_finish: finish,
    },
    schedule: { today: label(today), in_progress: inProgress.slice(0, 5).map(work), late: late.slice(0, 5).map(work), next_up: upcoming.map(work), recently_completed: recentlyDone.map(work) },
    previous_replies: previousReplies,
    internal_notes: (request.comments || []).slice(-6).map((comment) => `${comment.author || 'Team'}: ${comment.text}`),
  };
}

const SYSTEM_PROMPT = `You draft replies from Studio Iksha (an interior and construction studio) to a client in the project's Telegram group.
The founder will review and edit your draft before anything is sent.
Rules:
- Use only the supplied project facts and schedule. Never invent dates, progress, prices, approvals, people or promises.
- If the facts do not answer the question, say the team will check and confirm, without guessing.
- Internal notes show the founder's intent. Use them to decide what to say, but never quote them or reveal internal discussion, staff issues or costs.
- Keep it short: 1 to 4 sentences, warm and professional, no headings or bullet lists unless listing 2 to 4 dates.
- Reply in the same language and tone the client used (for example English or Hinglish).
- Do not add a sign-off or the founder's name. Output only the message text.`;

export async function suggestReply(context, { instruction = '', apiKey = process.env.OPENAI_API_KEY, model = process.env.OPENAI_MODEL || 'gpt-5-mini', fetchImpl = fetch } = {}) {
  if (apiKey) {
    try {
      const response = await fetchImpl('https://api.openai.com/v1/responses', {
        method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model, store: false, input: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Context (JSON):\n${JSON.stringify(context)}\n\n${instruction ? `Founder's guidance for this reply: ${instruction}\n\n` : ''}Write the reply to the client's ${context.query.type.toLowerCase()}: "${context.query.message}"` },
        ] }),
        signal: AbortSignal.timeout(25000),
      });
      if (response.ok) {
        const result = await response.json();
        const text = result.output?.flatMap((item) => item.content || []).find((item) => item.type === 'output_text')?.text?.trim();
        if (text) return { suggestion: text.slice(0, 3000), ai: true };
      } else {
        console.error('Reply suggestion request failed:', response.status);
      }
    } catch (error) { console.error('Reply suggestion request failed:', error.message); }
  }
  return { suggestion: fallbackReply(context), ai: false };
}

// Task names read naturally mid-sentence: drop a repeated "Stage — " prefix, keep acronyms such as 2D or POP.
const spoken = (item) => {
  const name = item.task.includes(' — ') ? item.task.split(' — ').slice(1).join(' — ') : item.task;
  return /^[A-Z][a-z]/.test(name) ? name[0].toLowerCase() + name.slice(1) : name;
};

// Without AI, a plain factual update the founder can edit. It states only what is recorded.
export function fallbackReply(context) {
  const { project, schedule } = context;
  const parts = [];
  if (schedule.in_progress.length) parts.push(`Right now we're working on ${schedule.in_progress.slice(0, 2).map(spoken).join(' and ')}.`);
  else if (project.phase) parts.push(`The project is currently in the ${project.phase} phase.`);
  if (schedule.next_up.length) parts.push(`Next up is ${spoken(schedule.next_up[0])}, starting ${schedule.next_up[0].start}.`);
  if (project.blocker) parts.push(`One thing we're sorting out: ${project.blocker}.`);
  parts.push(project.projected_finish !== 'not confirmed yet' ? `We're on track for completion around ${project.projected_finish}.` : `We'll confirm the overall completion date once the remaining schedule is fixed.`);
  return parts.join(' ');
}

