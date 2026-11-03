import { useEffect } from 'react';
import { founderProjectTab, founderProjectTabs, founderSectionLabel } from './navigation.js';

// Most specific first, so the part that differs survives when browser tabs get narrow.
export const pageTitle = (...parts) => [...parts.filter(Boolean), 'Studio Iksha'].join(' | ');

export function founderPageTitle({ authState, section, projectId, projectName, projectTab }) {
  if (authState === 'checking') return pageTitle();
  if (authState === 'signed-out') return pageTitle('Sign in');
  if (section === 'projects' && projectName) {
    return pageTitle(founderProjectTabs[founderProjectTab(projectTab)], projectName);
  }
  if (section === 'projects' && projectId) return pageTitle('Project not found');
  return pageTitle(founderSectionLabel(section));
}

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
