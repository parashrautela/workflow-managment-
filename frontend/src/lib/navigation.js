import { useSyncExternalStore } from 'react';

const eventName = 'iksha:navigation';
const fields = {
  section: 'section',
  projectId: 'project',
  projectTab: 'tab',
  taskId: 'task',
  queryId: 'query',
  conversationId: 'conversation',
};
const sections = new Set([
  'actions',
  'projects',
  'groups',
  'decisions',
  'meetings',
  'chats',
  'assistant',
  'employees',
  'activity',
  'trash',
]);
const tabs = new Set([
  'schedule',
  'timeline',
  'tasks',
  'meetings',
  'chat',
  'queries',
  'files',
  'team',
  'overview',
]);

export function readNavigation(href) {
  const params = new URL(href).searchParams;
  const section = params.get('section');
  return {
    section: sections.has(section) ? section : 'actions',
    projectId: params.get('project') || '',
    projectTab: tabs.has(params.get('tab')) ? params.get('tab') : '',
    taskId: params.get('task') || '',
    queryId: params.get('query') || '',
    conversationId: params.get('conversation') || '',
  };
}

export function navigationUrl(href, changes) {
  const url = new URL(href);
  const params = url.searchParams;
  // A new parent screen must not inherit the previous screen's child selection.
  const clear =
    'section' in changes
      ? ['project', 'tab', 'task', 'query', 'conversation']
      : 'projectId' in changes
        ? ['tab', 'task', 'query']
        : 'projectTab' in changes
          ? ['task', 'query']
          : [];
  clear.forEach((key) => params.delete(key));
  for (const [field, key] of Object.entries(fields)) {
    if (!(field in changes)) continue;
    const value = changes[field];
    if (!value || (field === 'section' && value === 'actions')) params.delete(key);
    else params.set(key, value);
  }
  return url.href;
}

export function navigate(changes, { replace = false } = {}) {
  const url = navigationUrl(window.location.href, changes);
  if (url === window.location.href) return;
  const current = window.history.state;
  const depth = current?.ikshaPath === window.location.pathname ? current.ikshaDepth || 0 : 0;
  window.history[replace ? 'replaceState' : 'pushState'](
    { ...current, ikshaPath: window.location.pathname, ikshaDepth: depth + (replace ? 0 : 1) },
    '',
    url,
  );
  window.dispatchEvent(new Event(eventName));
}

export function goBack(fallback = { section: 'actions' }) {
  const state = window.history.state;
  if (state?.ikshaPath === window.location.pathname && state.ikshaDepth > 0) {
    window.history.back();
  } else {
    navigate(fallback, { replace: true });
  }
}

function subscribe(listener) {
  window.addEventListener('popstate', listener);
  window.addEventListener(eventName, listener);
  return () => {
    window.removeEventListener('popstate', listener);
    window.removeEventListener(eventName, listener);
  };
}
const snapshot = () => window.location.href;

export function useNavigation() {
  return readNavigation(useSyncExternalStore(subscribe, snapshot));
}
