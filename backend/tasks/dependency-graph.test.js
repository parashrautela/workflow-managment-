// backend/dependency-graph.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePredecessors,
  adaptBotTaskToWeb,
  buildProjectDependencyGraph,
} from './task-adapter.js';
import { syncProjectTasks } from './task-sync.js';
import { createPilotRoutes } from './pilot.js';

test('1. A -> B and A -> C branching', () => {
  const tasks = [
    {
      id: 'web-a',
      telegramTaskId: 'T-A',
      title: 'Task A',
      dependencies: [],
      dependenciesLoaded: true,
    },
    {
      id: 'web-b',
      telegramTaskId: 'T-B',
      title: 'Task B',
      dependencies: [{ predecessorTelegramTaskId: 'T-A', type: 'FS' }],
      dependenciesLoaded: true,
    },
    {
      id: 'web-c',
      telegramTaskId: 'T-C',
      title: 'Task C',
      dependencies: [{ predecessorTelegramTaskId: 'T-A', type: 'FS' }],
      dependenciesLoaded: true,
    },
  ];
  const { nodes, edges, warnings } = buildProjectDependencyGraph(tasks);
  assert.equal(nodes.length, 3);
  assert.equal(edges.length, 2);
  assert.equal(warnings.length, 0);

  const edgeB = edges.find((e) => e.target === 'web-b');
  const edgeC = edges.find((e) => e.target === 'web-c');
  assert.equal(edgeB.source, 'web-a');
  assert.equal(edgeC.source, 'web-a');
  assert.equal(edgeB.type, 'FS');
  assert.equal(edgeC.type, 'FS');
});

test('2. B + C -> D merging, with both prerequisites retained', () => {
  const tasks = [
    {
      id: 'web-b',
      telegramTaskId: 'T-B',
      title: 'Task B',
      dependencies: [],
      dependenciesLoaded: true,
    },
    {
      id: 'web-c',
      telegramTaskId: 'T-C',
      title: 'Task C',
      dependencies: [],
      dependenciesLoaded: true,
    },
    {
      id: 'web-d',
      telegramTaskId: 'T-D',
      title: 'Task D',
      dependencies: [
        { predecessorTelegramTaskId: 'T-B', type: 'FS' },
        { predecessorTelegramTaskId: 'T-C', type: 'SS' },
      ],
      dependenciesLoaded: true,
    },
  ];
  const { nodes, edges, warnings } = buildProjectDependencyGraph(tasks);
  assert.equal(nodes.length, 3);
  assert.equal(edges.length, 2);
  assert.equal(warnings.length, 0);

  const incomingToD = edges.filter((e) => e.target === 'web-d');
  assert.equal(incomingToD.length, 2);
  assert.ok(incomingToD.some((e) => e.source === 'web-b' && e.type === 'FS'));
  assert.ok(incomingToD.some((e) => e.source === 'web-c' && e.type === 'SS'));
});

test('3. FS and SS parsing', () => {
  const parsed = parsePredecessors('T-1:FS, T-2:SS, T-3', '');
  assert.equal(parsed.loaded, true);
  assert.equal(parsed.dependencies.length, 3);
  assert.deepEqual(parsed.dependencies[0], {
    predecessorTelegramTaskId: 'T-1',
    type: 'FS',
    unsupported: false,
    raw: 'T-1:FS',
  });
  assert.deepEqual(parsed.dependencies[1], {
    predecessorTelegramTaskId: 'T-2',
    type: 'SS',
    unsupported: false,
    raw: 'T-2:SS',
  });
  assert.deepEqual(parsed.dependencies[2], {
    predecessorTelegramTaskId: 'T-3',
    type: 'FS',
    unsupported: false,
    raw: 'T-3',
  });
  assert.equal(parsed.malformed.length, 0);

  // Unsupported edge type detection
  const unsupported = parsePredecessors('T-4:FF, T-5:SF', '');
  assert.equal(unsupported.dependencies.length, 2);
  assert.ok(unsupported.dependencies[0].unsupported);
  assert.equal(unsupported.malformed.length, 2);
});

test('4. Legacy predecessor fallback only when multi-predecessor is absent or blank', () => {
  // Legacy used when PredecessorTaskIDs is undefined
  const legacyOnly = parsePredecessors(undefined, 'T-LEGACY');
  assert.equal(legacyOnly.loaded, true);
  assert.equal(legacyOnly.dependencies.length, 1);
  assert.equal(legacyOnly.dependencies[0].predecessorTelegramTaskId, 'T-LEGACY');
  assert.equal(legacyOnly.dependencies[0].type, 'FS');

  // Legacy used when PredecessorTaskIDs is empty string
  const blankMulti = parsePredecessors('   ', 'T-LEGACY2');
  assert.equal(blankMulti.loaded, true);
  assert.equal(blankMulti.dependencies.length, 1);
  assert.equal(blankMulti.dependencies[0].predecessorTelegramTaskId, 'T-LEGACY2');

  // Multi-predecessor preferred when present, ignoring legacy
  const multiPreferred = parsePredecessors('T-1:SS', 'T-LEGACY');
  assert.equal(multiPreferred.dependencies.length, 1);
  assert.equal(multiPreferred.dependencies[0].predecessorTelegramTaskId, 'T-1');
  assert.equal(multiPreferred.dependencies[0].type, 'SS');
});

test('5. Telegram/web ID mapping never derives IDs from titles, sequence numbers, or array positions', () => {
  const tasks = [
    {
      id: 'custom-web-id-99',
      telegramTaskId: 'TG-100',
      title: '1. Foundation',
      sequence: 10,
      dependencies: [],
      dependenciesLoaded: true,
    },
    {
      id: 'custom-web-id-77',
      telegramTaskId: 'TG-200',
      title: '2. Framing',
      sequence: 20,
      dependencies: [{ predecessorTelegramTaskId: 'TG-100', type: 'FS' }],
      dependenciesLoaded: true,
    },
  ];
  // Reversing array position does not alter graph resolution
  const { edges } = buildProjectDependencyGraph([...tasks].reverse());
  assert.equal(edges.length, 1);
  assert.equal(edges[0].source, 'custom-web-id-99');
  assert.equal(edges[0].target, 'custom-web-id-77');
});

test('6. Existing-project metadata hydration without task duplication or assignment changes', async () => {
  const project = {
    id: 'proj-1',
    telegramGroupChatId: '-1001',
    telegramProjectId: 'P001',
    workflowStartedAt: '2026-10-01T00:00:00Z',
    stages: [{ id: 'stage-1', name: 'Stage 1' }],
    members: [{ employeeId: 'emp-42', name: 'Alice', telegramUserId: '999' }],
  };
  const existingTask = {
    id: 'web-task-1',
    projectId: 'proj-1',
    telegramTaskId: 'P001-T10',
    title: 'Site Prep',
    status: 'In progress',
    assigneeId: 'emp-42',
    stageId: 'stage-1',
    deadline: '2026-10-15',
    telegramSyncStatus: 'Synced',
  };
  const state = { tasks: [existingTask] };

  const mockBotSnapshot = {
    tasks: [
      {
        TaskID: 'P001-T10',
        TaskName: 'Site Prep',
        Status: 'In Progress',
        Stage: 'Stage 1',
        PlannedEnd: '2026-10-15',
        PredecessorTaskIDs: '',
        PredecessorTaskID: '',
        GateType: 'material',
        ApprovalStatus: 'Approved',
        Trade: 'Civil',
        Phase: 'Execution',
      },
    ],
  };

  const bridge = async (route, input) => {
    assert.deepEqual(input.updates, []); // Snapshot read-only call
    return mockBotSnapshot;
  };

  await syncProjectTasks(state, project, bridge, { readOnly: true });

  assert.equal(state.tasks.length, 1, 'No duplicate tasks created');
  assert.equal(state.tasks[0].id, 'web-task-1', 'ID preserved');
  assert.equal(state.tasks[0].assigneeId, 'emp-42', 'Assignee preserved');
  assert.equal(state.tasks[0].sourceGateType, 'material', 'Source gate preserved');
  assert.equal(state.tasks[0].sourceTrade, 'Civil', 'Source trade preserved');
  assert.equal(state.tasks[0].sourceApprovalStatus, 'Approved', 'Source approval status preserved');
});

test('7. Pending local edits surviving metadata refresh without being marked as outbound changes', async () => {
  const project = {
    id: 'proj-1',
    telegramGroupChatId: '-1001',
    telegramProjectId: 'P001',
    workflowStartedAt: '2026-10-01T00:00:00Z',
    stages: [{ id: 'stage-1', name: 'Stage 1' }],
    members: [],
  };
  const taskWithPendingEdits = {
    id: 'web-task-2',
    projectId: 'proj-1',
    telegramTaskId: 'P001-T20',
    title: 'Local edited title',
    status: 'Completed',
    deadline: '2026-10-25',
    telegramSyncStatus: 'Pending', // Pending local edit
  };
  const state = { tasks: [taskWithPendingEdits] };

  const mockBotSnapshot = {
    tasks: [
      {
        TaskID: 'P001-T20',
        TaskName: 'Old Bot Title',
        Status: 'Pending',
        Stage: 'Stage 1',
        PlannedEnd: '2026-10-10',
        PredecessorTaskIDs: 'P001-T10:FS',
      },
    ],
  };

  const bridge = async () => mockBotSnapshot;
  await syncProjectTasks(state, project, bridge, { readOnly: true });

  assert.equal(taskWithPendingEdits.title, 'Local edited title', 'Local title preserved');
  assert.equal(taskWithPendingEdits.status, 'Completed', 'Local status preserved');
  assert.equal(taskWithPendingEdits.deadline, '2026-10-25', 'Local deadline preserved');
  assert.equal(taskWithPendingEdits.telegramSyncStatus, 'Pending', 'Sync status left untouched');
  assert.equal(taskWithPendingEdits.dependencies.length, 1, 'Dependencies hydrated');
  assert.equal(taskWithPendingEdits.dependencies[0].predecessorTelegramTaskId, 'P001-T10');
});

test('8. Missing references, cycles, disconnected tasks, and absent metadata', () => {
  const tasks = [
    // Disconnected task with unconfigured metadata
    {
      id: 'web-disconnected',
      telegramTaskId: 'T-DISC',
      title: 'Custom Notes',
      dependencies: [],
      dependenciesLoaded: false,
    },
    // Missing reference
    {
      id: 'web-bad-ref',
      telegramTaskId: 'T-BAD',
      title: 'Bad Ref',
      dependencies: [{ predecessorTelegramTaskId: 'NON_EXISTENT_ID', type: 'FS' }],
      dependenciesLoaded: true,
    },
    // Self-reference
    {
      id: 'web-self',
      telegramTaskId: 'T-SELF',
      title: 'Self Loop',
      dependencies: [{ predecessorTelegramTaskId: 'T-SELF', type: 'FS' }],
      dependenciesLoaded: true,
    },
    // Cycle: Cyc1 -> Cyc2 -> Cyc1
    {
      id: 'web-cyc1',
      telegramTaskId: 'T-C1',
      title: 'Cyc 1',
      dependencies: [{ predecessorTelegramTaskId: 'T-C2', type: 'FS' }],
      dependenciesLoaded: true,
    },
    {
      id: 'web-cyc2',
      telegramTaskId: 'T-C2',
      title: 'Cyc 2',
      dependencies: [{ predecessorTelegramTaskId: 'T-C1', type: 'FS' }],
      dependenciesLoaded: true,
    },
  ];

  const { nodes, edges, warnings } = buildProjectDependencyGraph(tasks);
  assert.equal(nodes.length, 5);

  const missingWarn = warnings.find((w) => w.type === 'missing_reference');
  assert.ok(missingWarn, 'Missing reference warning detected');
  assert.equal(missingWarn.predecessorTelegramTaskId, 'NON_EXISTENT_ID');

  const selfWarn = warnings.find((w) => w.type === 'self_reference');
  assert.ok(selfWarn, 'Self reference warning detected');

  const cycleWarn = warnings.find((w) => w.type === 'cycle');
  assert.ok(cycleWarn, 'Cycle warning detected');

  const discNode = nodes.find((n) => n.id === 'web-disconnected');
  assert.equal(discNode.unconfigured, true, 'Disconnected unconfigured task marked');
});

test('9. Unauthorized and unrelated-employee access control', async () => {
  const state = {
    projects: [
      {
        id: 'proj-alpha',
        name: 'Alpha',
        members: [{ employeeId: 'emp-alice' }],
      },
    ],
    tasks: [],
    decisionRequests: [],
    employees: [{ id: 'emp-bob', name: 'Bob', active: true }],
  };

  const routes = createPilotRoutes({
    getState: () => state,
    founder: () => false, // Not founder
    employeeSession: (req) =>
      req.headers.cookie?.includes('bob') ? { id: 'emp-bob', name: 'Bob' } : null,
    body: async () => ({}),
    json: () => {},
    save: async () => {},
    audit: () => {},
    projectView: (p) => p,
    callBotBridge: async () => ({}),
  });

  // Bob is not assigned to proj-alpha
  const reqUnrelated = { method: 'GET', headers: { cookie: 'bob=1' } };
  let statusUnrelated = null;
  const mockRes = {
    writeHead: (s) => {
      statusUnrelated = s;
    },
    end: () => {},
  };
  await assert.rejects(
    async () => {
      await routes(
        reqUnrelated,
        mockRes,
        new URL('http://localhost/api/employee/projects/proj-alpha/workspace'),
      );
    },
    (err) => err.status === 404,
    'Unrelated employee receives 404',
  );

  // Unauthenticated user
  const reqNoAuth = { method: 'GET', headers: {} };
  await assert.rejects(
    async () => {
      await routes(
        reqNoAuth,
        mockRes,
        new URL('http://localhost/api/employee/projects/proj-alpha/workspace'),
      );
    },
    (err) => err.status === 401,
    'Unauthenticated user receives 401',
  );
});

test('10. Refresh reflecting a changed bot snapshot without outbound task updates', async () => {
  const project = {
    id: 'proj-live',
    telegramGroupChatId: '-777',
    telegramProjectId: 'P777',
    workflowStartedAt: '2026-10-01T00:00:00Z',
    stages: [{ id: 'stg-1', name: 'Design' }],
    members: [],
  };
  const task = {
    id: 'web-live-1',
    projectId: 'proj-live',
    telegramTaskId: 'P777-T01',
    title: 'Initial Concept',
    status: 'In progress',
    deadline: '2026-10-05',
    telegramSyncStatus: 'Synced',
  };
  const state = { tasks: [task] };

  let receivedUpdates = null;
  const bridge = async (route, input) => {
    receivedUpdates = input.updates;
    return {
      tasks: [
        {
          TaskID: 'P777-T01',
          TaskName: 'Initial Concept',
          Status: 'Completed',
          Stage: 'Design',
          PlannedEnd: '2026-10-07',
          PredecessorTaskIDs: '',
        },
      ],
    };
  };

  await syncProjectTasks(state, project, bridge, { readOnly: true });

  assert.deepEqual(receivedUpdates, [], 'No outbound updates sent');
  assert.equal(task.status, 'Completed', 'Reflected bot status');
  assert.equal(task.deadline, '2026-10-07', 'Reflected bot deadline');
  assert.equal(task.telegramSyncStatus, 'Synced', 'Task remains synced');
});

test('11. Initial import and later refresh retaining the same dependency structure', async () => {
  const sourceTaskRows = [
    {
      TaskID: 'P-1',
      TaskName: 'Task 1',
      Status: 'Completed',
      Stage: 'Planning',
      PredecessorTaskIDs: '',
      PredecessorTaskID: '',
    },
    {
      TaskID: 'P-2',
      TaskName: 'Task 2',
      Status: 'Pending',
      Stage: 'Execution',
      PredecessorTaskIDs: 'P-1:FS',
      PredecessorTaskID: '',
    },
  ];

  // Initial import
  const importedTask1 = { id: 'web-1', projectId: 'p', telegramTaskId: 'P-1' };
  const importedTask2 = { id: 'web-2', projectId: 'p', telegramTaskId: 'P-2' };
  adaptBotTaskToWeb(importedTask1, sourceTaskRows[0]);
  adaptBotTaskToWeb(importedTask2, sourceTaskRows[1]);

  const initialGraph = buildProjectDependencyGraph([importedTask1, importedTask2]);
  assert.equal(initialGraph.edges.length, 1);
  assert.equal(initialGraph.edges[0].source, 'web-1');
  assert.equal(initialGraph.edges[0].target, 'web-2');

  // Later refresh with same structure
  adaptBotTaskToWeb(importedTask1, sourceTaskRows[0]);
  adaptBotTaskToWeb(importedTask2, sourceTaskRows[1]);

  const refreshedGraph = buildProjectDependencyGraph([importedTask1, importedTask2]);
  assert.equal(refreshedGraph.edges.length, 1);
  assert.equal(refreshedGraph.edges[0].source, 'web-1');
  assert.equal(refreshedGraph.edges[0].target, 'web-2');
  assert.deepEqual(initialGraph.edges, refreshedGraph.edges);
});
