// The six tasks of every stage, in order. Mirrors the bot's STAGE_TASKS (src/stage-plan.js);
// stageTemplate.fixture.json is copied from the bot and a test keeps the two identical.
export const STAGE_TASKS = [
  { key: 'site-check', title: 'Site Condition Check', role: 'Site Supervisor' },
  { key: 'drawing', title: 'Drawing', role: 'Designer' },
  { key: 'approval', title: 'Drawing approval', role: 'Design Head/ Admin' },
  { key: 'client', title: 'Client Presentation & approval', role: 'Client' },
  { key: 'execution', title: 'Site Execution', role: 'Site Team', roleEditable: true },
  { key: 'final-check', title: 'Final check', role: 'Design Head/ Admin' },
];

// Suggestions for the person who does the site work; the founder can type any role.
export const EXECUTION_ROLES = ['Site Team', 'Tile person', 'Electrician', 'Plumber', 'Carpenter', 'Painter', 'POP Person'];

// Dropdown values: 0 means the task is left out of the stage.
export const DURATION_OPTIONS = [0, ...Array.from({ length: 30 }, (_, index) => index + 1)];
export const durationLabel = (days) => (days ? `${days} day${days === 1 ? '' : 's'}` : 'Skip');

export const defaultStageTasks = () => STAGE_TASKS.map((task) => ({ key: task.key, durationDays: task.key === 'execution' ? 3 : 1, role: task.roleEditable ? task.role : undefined, assigneeId: '' }));

// Stages that pointed at an unticked stage follow the previous kept stage instead; the first kept stage starts on the start date.
export function defaultPlanSpecs(stages, startDate) {
  const kept = stages.filter((stage) => stage.include);
  const names = new Set(kept.map((stage) => stage.name));
  return kept.map((stage, index) => {
    let placement = stage.placement;
    if (index === 0) placement = { type: "date", startDate };
    else if (!placement?.stageName || !names.has(placement.stageName)) placement = { type: "after", stageName: kept[index - 1].name };
    return { name: stage.name, placement, tasks: stage.tasks.map(({ key, durationDays, role }) => ({ key, durationDays, ...(role ? { role } : {}) })) };
  });
}
