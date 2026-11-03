import test from 'node:test';
import assert from 'node:assert/strict';
import { founderPageTitle, pageTitle } from './pageTitle.js';

const signedIn = { authState: 'signed-in' };

test('titles list the most specific part first and skip empty parts', () => {
  assert.equal(pageTitle(), 'Studio Iksha');
  assert.equal(
    pageTitle('Tasks', '', 'Sharma Residence'),
    'Tasks | Sharma Residence | Studio Iksha',
  );
});

test('every founder section has its own title', () => {
  const titles = {
    projects: 'Projects | Studio Iksha',
    actions: 'Actions needed | Studio Iksha',
    groups: 'Telegram groups | Studio Iksha',
    decisions: 'Client queries | Studio Iksha',
    meetings: 'Meetings | Studio Iksha',
    chats: 'Project chats | Studio Iksha',
    assistant: 'Assistant | Studio Iksha',
    employees: 'Employees | Studio Iksha',
    activity: 'Activity | Studio Iksha',
    trash: 'Trash | Studio Iksha',
  };
  for (const [section, title] of Object.entries(titles)) {
    assert.equal(founderPageTitle({ ...signedIn, section }), title);
  }
});

test('project titles name the visible tab, then the project', () => {
  const project = { ...signedIn, section: 'projects', projectName: 'Sharma Residence 3BHK' };
  assert.equal(
    founderPageTitle({ ...project, projectTab: 'tasks' }),
    'Tasks | Sharma Residence 3BHK | Studio Iksha',
  );
  assert.equal(
    founderPageTitle({ ...project, projectTab: 'files' }),
    'Files | Sharma Residence 3BHK | Studio Iksha',
  );
  for (const projectTab of ['', 'schedule', 'timeline', 'overview']) {
    assert.equal(
      founderPageTitle({ ...project, projectTab }),
      'Timeline | Sharma Residence 3BHK | Studio Iksha',
    );
  }
});

test('a project that cannot be found says so in the tab title', () => {
  assert.equal(
    founderPageTitle({
      ...signedIn,
      section: 'projects',
      projectId: 'p_gone',
      projectName: '',
      projectTab: 'tasks',
    }),
    'Project not found | Studio Iksha',
  );
  assert.equal(
    founderPageTitle({ ...signedIn, section: 'projects', projectName: '' }),
    'Projects | Studio Iksha',
  );
});

test('signed-out and loading states do not claim a workspace screen', () => {
  assert.equal(
    founderPageTitle({ authState: 'signed-out', section: 'decisions' }),
    'Sign in | Studio Iksha',
  );
  assert.equal(founderPageTitle({ authState: 'checking', section: 'decisions' }), 'Studio Iksha');
});
