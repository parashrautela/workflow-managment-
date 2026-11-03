// frontend/src/lib/graphLayout.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeGraphLayout, resolveAssigneeName, NODE_WIDTH, NODE_HEIGHT } from './graphLayout.js';

test('resolveAssigneeName handles founder, unassigned, and employee matches', () => {
  assert.equal(resolveAssigneeName({ assigneeId: 'founder' }), 'Founder');
  assert.equal(resolveAssigneeName({ assigneeId: '' }), 'Unassigned');
  assert.equal(resolveAssigneeName({ assigneeId: 'emp-1' }, [{ id: 'emp-1', name: 'Bob' }]), 'Bob');
  assert.equal(
    resolveAssigneeName({ assigneeId: 'emp-2', assigneeName: 'Fallback' }, []),
    'Fallback',
  );
});

test('computeGraphLayout generates stable left-to-right positions and preserves disconnected tasks', () => {
  const tasks = [
    {
      id: 't1',
      telegramTaskId: 'TG-1',
      title: 'Task 1',
      dependencies: [],
      dependenciesLoaded: true,
    },
    {
      id: 't2',
      telegramTaskId: 'TG-2',
      title: 'Task 2',
      dependencies: [{ predecessorTelegramTaskId: 'TG-1', type: 'FS' }],
      dependenciesLoaded: true,
    },
    {
      id: 't-disc',
      telegramTaskId: 'TG-DISC',
      title: 'Disconnected Task',
      dependencies: [],
      dependenciesLoaded: false,
    },
  ];

  const { nodes, edges, warnings } = computeGraphLayout({ tasks });
  assert.equal(nodes.length, 3);
  assert.equal(edges.length, 1);
  assert.equal(warnings.length, 0);

  const n1 = nodes.find((n) => n.id === 't1');
  const n2 = nodes.find((n) => n.id === 't2');
  const nDisc = nodes.find((n) => n.id === 't-disc');

  assert.ok(n1.position.x < n2.position.x, 'Task 1 is positioned to the left of dependent Task 2');
  assert.ok(nDisc, 'Disconnected task is present in nodes');
  assert.equal(nDisc.data.unconfigured, true);
});

test('computeGraphLayout selection highlights upstream and downstream paths', () => {
  // A -> B -> C and X -> Y
  const tasks = [
    { id: 'a', telegramTaskId: 'A', title: 'A', dependencies: [], dependenciesLoaded: true },
    {
      id: 'b',
      telegramTaskId: 'B',
      title: 'B',
      dependencies: [{ predecessorTelegramTaskId: 'A', type: 'FS' }],
      dependenciesLoaded: true,
    },
    {
      id: 'c',
      telegramTaskId: 'C',
      title: 'C',
      dependencies: [{ predecessorTelegramTaskId: 'B', type: 'SS' }],
      dependenciesLoaded: true,
    },
    { id: 'x', telegramTaskId: 'X', title: 'X', dependencies: [], dependenciesLoaded: true },
    {
      id: 'y',
      telegramTaskId: 'Y',
      title: 'Y',
      dependencies: [{ predecessorTelegramTaskId: 'X', type: 'FS' }],
      dependenciesLoaded: true,
    },
  ];

  // Selecting 'b' should highlight 'a' (upstream), 'b' (self), 'c' (downstream), and dim 'x' and 'y'
  const { nodes, edges } = computeGraphLayout({ tasks, selectedTaskId: 'b' });

  const nodeA = nodes.find((n) => n.id === 'a');
  const nodeB = nodes.find((n) => n.id === 'b');
  const nodeC = nodes.find((n) => n.id === 'c');
  const nodeX = nodes.find((n) => n.id === 'x');
  const nodeY = nodes.find((n) => n.id === 'y');

  assert.equal(nodeA.data.isHighlighted, true);
  assert.equal(nodeB.data.isSelected, true);
  assert.equal(nodeC.data.isHighlighted, true);
  assert.equal(nodeX.data.isDimmed, true);
  assert.equal(nodeY.data.isDimmed, true);

  const edgeAB = edges.find((e) => e.source === 'a' && e.target === 'b');
  const edgeBC = edges.find((e) => e.source === 'b' && e.target === 'c');
  const edgeXY = edges.find((e) => e.source === 'x' && e.target === 'y');

  assert.equal(edgeAB.data.isHighlighted, true);
  assert.equal(edgeBC.data.isHighlighted, true);
  assert.equal(edgeXY.data.isHighlighted, false);
});
