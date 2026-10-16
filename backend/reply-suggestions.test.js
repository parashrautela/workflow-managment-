import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReplyContext, fallbackReply, suggestReply } from './reply-suggestions.js';

const state = {
  projects: [{ id: 'p1', name: 'Ravi home 2', clientName: 'Nishank', status: 'Active', phase: 'Design', blocker: '', stages: [{ id: 's1', name: 'Design' }, { id: 's2', name: 'Civil Work' }], members: [{ name: 'Parash', employeeId: 'EMP-1' }] }],
  tasks: [
    { id: 't1', projectId: 'p1', stageId: 's1', title: 'Client brief', status: 'Completed', deadline: '2026-10-11', sourceCurrentStart: '2026-10-09', assigneeId: 'EMP-1' },
    { id: 't2', projectId: 'p1', stageId: 's1', title: 'Concept design and layout', status: 'In progress', deadline: '2026-10-18', sourceForecastStart: '2026-10-12' },
    { id: 't3', projectId: 'p1', stageId: 's1', title: 'Start floor plan', status: 'Open', deadline: '2026-10-14', sourceCurrentStart: '2026-10-13' },
    { id: 't4', projectId: 'p1', stageId: 's2', title: 'Site condition check', status: 'Open', deadline: '2026-10-25', sourcePlannedStart: '2026-10-24' },
    { id: 't5', projectId: 'p1', stageId: 's2', title: 'Old removed task', status: 'Cancelled', deadline: '2026-10-20' },
  ],
  decisionRequests: [
    { id: 'r0', projectId: 'p1', originalMessage: 'hello', response: 'Hi Nishank! We are on the design stage.', status: 'Published', publishedAt: '2026-10-16T19:00:00Z' },
    { id: 'r1', projectId: 'p1', requestType: 'Question', originalSenderName: 'Nishank Jain', originalMessage: "what's the going work?", comments: [{ author: 'Founder', text: 'Mention the floor plan is a day late, no blame.' }] },
  ],
};

test('the reply context carries the schedule, past replies and internal notes, and leaves out staff and cancelled work', () => {
  const context = buildReplyContext(state, state.decisionRequests[1], '2026-10-16');
  assert.equal(context.query.message, "what's the going work?");
  assert.deepEqual(context.schedule.in_progress.map((item) => item.task), ['Concept design and layout']);
  assert.deepEqual(context.schedule.late.map((item) => [item.task, item.end]), [['Start floor plan', '14 Oct']]);
  assert.deepEqual(context.schedule.next_up.map((item) => [item.task, item.start]), [['Site condition check', '24 Oct']]);
  assert.equal(context.project.progress, '1 of 4 work items complete');
  assert.equal(context.project.projected_finish, '25 Oct');
  assert.deepEqual(context.previous_replies, [{ client_asked: 'hello', we_replied: 'Hi Nishank! We are on the design stage.' }]);
  assert.deepEqual(context.internal_notes, ['Founder: Mention the floor plan is a day late, no blame.']);
  const text = JSON.stringify(context);
  assert.ok(!text.includes('Parash') && !text.includes('EMP-1'), 'no staff names or IDs');
  assert.ok(!text.includes('Old removed task'), 'no cancelled work');
  assert.equal(buildReplyContext(state, { id: 'x', projectId: 'missing' }), null);
});

test('the model gets the guardrails, the context and the founder guidance, and its text is returned', async () => {
  const context = buildReplyContext(state, state.decisionRequests[1], '2026-10-16');
  let sent;
  const fetchImpl = async (url, options) => { sent = { url, body: JSON.parse(options.body) }; return Response.json({ output: [{ content: [{ type: 'output_text', text: '  We are finishing the concept design this week.  ' }] }] }); };
  const result = await suggestReply(context, { instruction: 'keep it short', apiKey: 'test-key', fetchImpl });
  assert.deepEqual(result, { suggestion: 'We are finishing the concept design this week.', ai: true });
  assert.equal(sent.url, 'https://api.openai.com/v1/responses');
  assert.equal(sent.body.store, false);
  assert.match(sent.body.input[0].content, /Never invent dates/);
  assert.match(sent.body.input[0].content, /never quote them/);
  assert.match(sent.body.input[1].content, /keep it short/);
  assert.match(sent.body.input[1].content, /Concept design and layout/);
});

test('without AI, or when it fails, a factual draft is returned instead', async () => {
  const context = buildReplyContext(state, state.decisionRequests[1], '2026-10-16');
  const offline = await suggestReply(context, { apiKey: '' });
  assert.equal(offline.ai, false);
  assert.equal(offline.suggestion, fallbackReply(context));
  assert.match(offline.suggestion, /working on concept design and layout/);
  assert.match(offline.suggestion, /site condition check, starting 24 Oct/);
  assert.match(offline.suggestion, /around 25 Oct/);
  const named = fallbackReply({ project: { projected_finish: 'not confirmed yet' }, schedule: { in_progress: [{ task: '2D drawing' }], next_up: [{ task: 'Design plan — Design approval', start: '17 Oct' }] } });
  assert.equal(named, "Right now we're working on 2D drawing. Next up is design approval, starting 17 Oct. We'll confirm the overall completion date once the remaining schedule is fixed.");
  const failing = await suggestReply(context, { apiKey: 'test-key', fetchImpl: async () => new Response('nope', { status: 500 }) });
  assert.equal(failing.ai, false);
});
