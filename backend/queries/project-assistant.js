import { workQueue } from '../operations/operations.js';

export async function answerProjectQuestion(project, question) {
  const facts = {
    project: project.name,
    overall_status: project.status,
    current_phase: project.phase,
    recent_task: project.recentTask || 'Not set yet',
    next_milestone: project.nextMilestone || 'Not set yet',
    blocker: project.blocker || 'No blocker has been recorded',
  };
  if (process.env.OPENAI_API_KEY) {
    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-5-mini',
          store: false,
          input: [
            {
              role: 'system',
              content:
                'You are Studio Iksha project’s client update assistant. Answer only from the supplied project facts. Be concise and friendly. Never invent progress, dates, tasks, decisions, or promises. If a fact is missing, say it is not available in the project update and suggest asking the project founder. Do not reveal private/internal data.',
            },
            {
              role: 'user',
              content: `Project facts: ${JSON.stringify(facts)}\nClient question: ${question}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (response.ok) {
        const result = await response.json();
        const text = result.output
          ?.flatMap((item) => item.content || [])
          .find((item) => item.type === 'output_text')?.text;
        if (text) return text;
      }
    } catch (error) {
      console.error('AI request failed:', error.message);
    }
  }
  const q = question.toLowerCase();
  if (/phase|stage/.test(q)) return `The project is currently in the ${facts.current_phase} phase.`;
  if (/recent|last|being done|task/.test(q))
    return `The latest task recorded is: ${facts.recent_task}.`;
  if (/block|issue|problem/.test(q)) return `${facts.blocker}.`;
  if (/next|milestone/.test(q)) return `The next milestone recorded is: ${facts.next_milestone}.`;
  return `The project is ${facts.overall_status}, currently in ${facts.current_phase}. The latest task recorded is ${facts.recent_task}. Ask me about the current phase, recent task, blocker, or next milestone.`;
}

export function founderAssistantAnswer(state, question) {
  if (/pending|my work|my task|ongoing|summari[sz]e|what.*doing/i.test(question)) {
    const q = question.toLowerCase(),
      person = state.employees.find(
        (employee) => employee.name?.length > 2 && q.includes(employee.name.toLowerCase()),
      ),
      project = state.projects.find((project) => q.includes(project.name.toLowerCase()));
    const items = workQueue(state, {
      personId: person?.id || (/my work|my task/i.test(question) ? 'founder' : 'all'),
      projectId: project?.id || '',
    });
    return items.length
      ? items
          .slice(0, 60)
          .map(
            (task) =>
              `${task.projectName} — ${task.stageName} — ${task.title}\n${task.approval ? 'Approval pending' : task.status}${task.overdue ? ' · Overdue' : ''}`,
          )
          .join('\n\n')
      : 'No pending work recorded.';
  }
  const q = question.toLowerCase();
  const named = state.projects.filter(
    (project) =>
      q.includes(project.name.toLowerCase()) || q.includes(project.clientName.toLowerCase()),
  );
  const wantsCompleted = /complet|finish|done/.test(q);
  const wantsAll = /all projects|every project|entire workspace/.test(q);
  const wantsBlockers = /block|risk|issue|delay/.test(q);
  const wantsTeam = /team|member|employee|working on|assigned/.test(q);
  const wantsMilestones = /milestone|next|upcoming|deadline/.test(q);
  const wantsClientQuestions = /client question|client ask|conversation/.test(q);
  const wantsActivity = /activit|change|update history|recent update/.test(q);
  if (wantsActivity && !named.length) {
    const entries = state.activity
      .slice(0, 8)
      .map(
        (item) =>
          `- ${state.projects.find((project) => project.id === item.projectId)?.name || item.details?.name || 'Workspace'}: ${item.action.replace(/_/g, ' ')} · ${new Date(item.at).toLocaleDateString()}`,
      );
    return entries.length
      ? ['# Recent activity', ...entries].join('\n')
      : '# Recent activity\nNo activity has been recorded yet.';
  }
  let projects = named.length
    ? named
    : state.projects.filter((project) =>
        wantsCompleted
          ? project.status === 'Completed'
          : wantsAll || project.status !== 'Completed',
      );
  if (!named.length && wantsBlockers)
    projects = projects.filter((project) => project.blocker || project.status === 'At risk');
  if (!projects.length)
    return state.projects.length
      ? '# No matching projects\nTry a project name, or ask about ongoing projects, blockers, team members, or milestones.'
      : '# No projects yet\nCreate a project to start tracking progress here.';
  const title = wantsClientQuestions
    ? 'Client questions'
    : wantsTeam
      ? 'Project teams'
      : wantsMilestones
        ? 'Next milestones'
        : wantsBlockers
          ? 'Blockers and risks'
          : wantsCompleted
            ? 'Completed projects'
            : wantsAll
              ? 'All projects'
              : 'Ongoing projects';
  const lines = [
    `# ${named.length === 1 ? 'Project details' : title}`,
    `${projects.length} ${projects.length === 1 ? 'project' : 'projects'} found in saved workspace records.`,
  ];
  for (const project of projects.slice(0, 20)) {
    lines.push('', `## ${project.name}`);
    if (wantsClientQuestions) {
      const questions = state.conversations
        .filter((item) => item.projectId === project.id)
        .slice(-3)
        .reverse();
      if (questions.length) questions.forEach((item) => lines.push(`- ${item.question}`));
      else lines.push('- No client questions recorded.');
      continue;
    }
    if (wantsTeam) {
      if (project.members?.length)
        project.members.forEach((member) =>
          lines.push(`- ${member.name} — ${member.role || member.designation || 'Team member'}`),
        );
      else lines.push('- No team members assigned.');
      continue;
    }
    if (wantsMilestones) {
      lines.push(
        `- Next milestone: ${project.nextMilestone || 'Not recorded'}`,
        `- Current phase: ${project.phase || 'Not recorded'}`,
      );
      continue;
    }
    if (wantsBlockers) {
      lines.push(
        `- Status: ${project.status || 'Setup'}`,
        `- Blocker: ${project.blocker || 'Marked at risk; details not recorded'}`,
      );
      continue;
    }
    lines.push(
      `- Client: ${project.clientName || 'Not recorded'}`,
      `- Status: ${project.status || 'Setup'} · ${project.phase || 'Phase not set'}`,
      `- Location: ${project.location || 'Not recorded'}`,
      `- Recent work: ${project.recentTask || 'Not recorded'}`,
      `- Next milestone: ${project.nextMilestone || 'Not recorded'}`,
      `- Blocker: ${project.blocker || 'None recorded'}`,
      `- Team: ${project.members?.length ? project.members.map((member) => member.name).join(', ') : 'No one assigned'}`,
    );
  }
  if (projects.length > 20)
    lines.push(`${projects.length - 20} more matching projects. Ask for a project by name.`);
  return lines.join('\n');
}
