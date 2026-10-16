import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarHue, buildPeopleIndex, personFor } from './taskPeople.js';

const owner = (task) => (task.assigneeId === 'founder' ? 'Founder' : task.assigneeName || 'Unassigned');
const tasks = [
  { id: 'a', telegramTaskId: 'P-T10', assigneeId: 'founder', status: 'Completed' },
  { id: 'b', telegramTaskId: 'P-T20', assigneeName: 'Asha Designer', dependencies: [{ predecessorTelegramTaskId: 'P-T10', type: 'FS' }] },
  { id: 'c', telegramTaskId: 'P-T30', sourceRole: 'Client', dependencies: [{ predecessorTelegramTaskId: 'P-T20', type: 'FS' }] },
  { id: 'd', telegramTaskId: 'P-T40', sourceRole: 'Design Head/ Admin', dependencies: [{ predecessorTelegramTaskId: 'P-T20', type: 'SS' }] },
  { id: 'e', telegramTaskId: 'P-T50', assigneeName: 'Ravi', status: 'Cancelled', dependencies: [{ predecessorTelegramTaskId: 'P-T20', type: 'FS' }] },
];

test('a task knows who does it, who it needs work from and who it hands over to', () => {
  const people = buildPeopleIndex(tasks, owner)(tasks[1]);
  assert.equal(people.owner.name, 'Asha Designer');
  assert.deepEqual(people.from.map((person) => person.name), ['Founder']);
  assert.deepEqual(people.to.map((person) => [person.name, person.isRole]), [['Client', true], ['Design Head/ Admin', true]], 'cancelled successors are left out');
});

test('roles stand in for unassigned work, and the owner is not repeated', () => {
  assert.deepEqual(personFor({ sourceRole: 'Design Head/ Admin' }, owner), { name: 'Design Head/ Admin', initials: 'DH', isRole: true });
  assert.equal(personFor({}, owner), null);
  const self = [{ id: 'x', telegramTaskId: 'T1', assigneeName: 'Asha' }, { id: 'y', telegramTaskId: 'T2', assigneeName: 'Asha', dependencies: [{ predecessorTelegramTaskId: 'T1' }] }];
  assert.deepEqual(buildPeopleIndex(self, owner)(self[1]).from, []);
  assert.equal(avatarHue('Asha'), avatarHue('Asha'));
});
