import test from 'node:test';
import assert from 'node:assert/strict';
import { rolesOf, matchesRole, hasRole } from './roles.js';
import { canWorkOnTask } from './work-access.js';
test('multiple roles preserve founder eligibility without substring privileges', () => {
  assert.deepEqual(rolesOf('Founder, Designer, Founder'), ['Founder', 'Designer']);
  assert.equal(matchesRole('Founder, Designer', 'Design Head/ Admin'), true);
  assert.equal(hasRole('Not a Founder', 'Founder'), false);
  const project = {
    members: [
      { employeeId: 'a', role: 'Founder, Designer' },
      { employeeId: 'b', role: 'Designer' },
      { employeeId: 'c', role: 'Painter' },
    ],
  };
  assert.equal(canWorkOnTask(project, { sourceRole: 'Designer' }, { id: 'b' }), true);
  assert.equal(canWorkOnTask(project, { sourceRole: 'Designer' }, { id: 'c' }), false);
  assert.equal(
    canWorkOnTask(project, { assigneeId: 'c', sourceRole: 'Designer' }, { id: 'b' }),
    false,
  );
  assert.equal(canWorkOnTask(project, { assigneeId: 'c' }, { id: 'a' }), true);
  assert.equal(canWorkOnTask(project, { sourceRole: 'Designer' }, { id: 'outsider' }), false);
});
