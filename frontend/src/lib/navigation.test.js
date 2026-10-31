import test from 'node:test';
import assert from 'node:assert/strict';
import { readNavigation, navigationUrl, navigate, goBack } from './navigation.js';

test('navigation URLs preserve the app host, preview path and unrelated parameters', () => {
  const href = navigationUrl('http://localhost:4318/after/?theme=light', {
    section: 'projects',
    projectId: 'project / 1',
    projectTab: 'tasks',
    taskId: 'task&2',
  });
  const url = new URL(href);
  assert.equal(url.pathname, '/after/');
  assert.equal(url.searchParams.get('theme'), 'light');
  assert.deepEqual(readNavigation(href), {
    section: 'projects',
    projectId: 'project / 1',
    projectTab: 'tasks',
    taskId: 'task&2',
    queryId: '',
    conversationId: '',
  });
  assert.equal(readNavigation('http://localhost/?section=unknown&tab=unknown').section, 'actions');
  assert.equal(readNavigation('http://localhost/?tab=unknown').projectTab, '');
});

test('parent navigation clears child views, while opening a task retains its project and tab', () => {
  const project = 'http://localhost/employee?section=projects&project=p1&tab=tasks';
  const task = navigationUrl(project, { taskId: 't1' });
  assert.equal(readNavigation(task).projectId, 'p1');
  assert.equal(readNavigation(task).projectTab, 'tasks');
  const otherProject = readNavigation(navigationUrl(task, { projectId: 'p2' }));
  assert.equal(otherProject.projectId, 'p2');
  assert.equal(otherProject.projectTab, '');
  assert.equal(otherProject.taskId, '');
  const home = readNavigation(navigationUrl(task, { section: 'actions' }));
  assert.equal(home.projectId, '');
  assert.equal(home.projectTab, '');
  assert.equal(home.taskId, '');
});

function browserAt(href) {
  const browser = new EventTarget();
  const entries = [{ href, state: null }];
  let index = 0;
  browser.location = new URL(href);
  const restore = () => {
    browser.location = new URL(entries[index].href);
    browser.dispatchEvent(new Event('popstate'));
  };
  browser.history = {
    get state() {
      return entries[index].state;
    },
    get length() {
      return entries.length;
    },
    pushState(state, _, url) {
      entries.splice(index + 1, Infinity, { href: url, state });
      index++;
      browser.location = new URL(url);
    },
    replaceState(state, _, url) {
      entries[index] = { href: url, state };
      browser.location = new URL(url);
    },
    back() {
      if (index > 0) {
        index--;
        restore();
      }
    },
    forward() {
      if (index < entries.length - 1) {
        index++;
        restore();
      }
    },
  };
  return browser;
}

test('Back and Forward walk the actual screen sequence without adding entries or jumping home', (t) => {
  const previousWindow = globalThis.window;
  const browser = browserAt('http://localhost/after/');
  globalThis.window = browser;
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });
  navigate({ section: 'projects' });
  navigate({ projectId: 'p1' });
  navigate({ projectTab: 'tasks' });
  navigate({ taskId: 't1' });
  const taskUrl = browser.location.href;
  navigate({ taskId: 't1' });
  assert.equal(browser.history.length, 5);
  goBack();
  assert.equal(readNavigation(browser.location.href).projectTab, 'tasks');
  assert.equal(readNavigation(browser.location.href).taskId, '');
  browser.history.back();
  assert.equal(readNavigation(browser.location.href).projectId, 'p1');
  assert.equal(readNavigation(browser.location.href).projectTab, '');
  browser.history.forward();
  browser.history.forward();
  assert.equal(browser.location.href, taskUrl);
  assert.equal(browser.history.length, 5);
});

test('Back from a direct task link closes the task without leaving its parent screen', (t) => {
  const previousWindow = globalThis.window;
  const browser = browserAt('http://localhost/?section=projects&project=p1&tab=tasks&task=t1');
  globalThis.window = browser;
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });
  goBack({ taskId: '' });
  assert.equal(browser.history.length, 1);
  assert.equal(readNavigation(browser.location.href).taskId, '');
  assert.equal(readNavigation(browser.location.href).projectId, 'p1');
  assert.equal(readNavigation(browser.location.href).projectTab, 'tasks');
});
