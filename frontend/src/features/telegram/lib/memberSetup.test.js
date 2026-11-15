import test from 'node:test';
import assert from 'node:assert/strict';
import { memberValues, memberChanged, setupBlocker } from './memberSetup.js';

const person = (extra = {}) => ({
  telegramName: 'Asha K',
  assignedName: '',
  assignedRole: '',
  ...extra,
});
const none = () => undefined;

test('a card saves what was typed, else what is saved, else the Telegram name', () => {
  assert.deepEqual(memberValues(person()), { name: 'Asha K', role: '' });
  assert.deepEqual(memberValues(person({ assignedName: 'Asha', assignedRole: 'Client' })), {
    name: 'Asha',
    role: 'Client',
  });
  assert.deepEqual(
    memberValues(person({ assignedName: 'Asha', assignedRole: 'Client' }), {
      name: ' Asha Kumar ',
    }),
    { name: 'Asha Kumar', role: 'Client' },
  );
});

test('only a card that is new or differs from what is saved needs saving', () => {
  const saved = person({ assignedName: 'Asha', assignedRole: 'Client' });
  assert.equal(memberChanged(person({ assignedRole: 'Client' }), undefined), true); // never fully saved
  assert.equal(memberChanged(saved, undefined), false);
  assert.equal(memberChanged(saved, { name: 'Asha' }), false); // typed the same thing back
  assert.equal(memberChanged(saved, { role: 'Client, Designer' }), true);
});

test('Finish setup names the one thing still missing, in order', () => {
  const client = person({ assignedName: 'Asha', assignedRole: 'Client' });
  const designer = person({ assignedName: 'Neha', assignedRole: 'Designer' });
  assert.equal(setupBlocker([client, person()], none), 'Save 1 more person first.');
  assert.equal(setupBlocker([person(), person()], none), 'Save 2 more people first.');
  assert.equal(
    setupBlocker([client, designer], (m) => (m === designer ? { role: 'Painter' } : undefined)),
    'Save your changes first.',
  );
  assert.equal(setupBlocker([designer, designer], none), 'Give one person the Client role.');
  assert.match(setupBlocker([client, client], none), /team role/);
  assert.equal(setupBlocker([client, designer], none), '');
});
