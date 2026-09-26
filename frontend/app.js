const app = document.querySelector('#app');
const esc = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const api = async (url, options = {}) => {
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Request failed.'); return data;
};
const post = (url, data = {}) => api(url, { method: 'POST', body: JSON.stringify(data) });
const initials = (name) => name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();

async function founderApp() {
  let projects = [];
  try { ({ projects } = await api('/api/founder/projects')); return renderFounder(); }
  catch { return renderLogin(); }
  function renderLogin() {
    app.innerHTML = `<main class="login-shell"><section class="login-card"><div class="brand"><span class="brand-mark">i</span><span>studio iksha</span></div><span class="eyebrow">PROJECT OPERATIONS</span><h1>Good work starts<br>with a clear picture.</h1><p class="muted">Sign in to see your projects and keep everyone moving together.</p><form id="login-form" class="stack"><label>Founder password<input name="password" type="password" autocomplete="current-password" required autofocus></label><button class="button primary" type="submit">Continue <span>→</span></button></form><p class="error" id="login-error"></p></section><div class="login-note">A calmer way to keep every project in view.</div></main>`;
    document.querySelector('#login-form').addEventListener('submit', async (event) => { event.preventDefault(); const button = event.currentTarget.querySelector('button'); button.disabled = true; try { await post('/api/founder/login', { password: new FormData(event.currentTarget).get('password') }); await founderApp(); } catch (error) { document.querySelector('#login-error').textContent = error.message; button.disabled = false; } });
  }
  async function loadProjects() { ({ projects } = await api('/api/founder/projects')); }
  function renderFounder(selectedId = projects[0]?.id) {
    const selected = projects.find((p) => p.id === selectedId);
    app.innerHTML = `<div class="shell"><aside class="sidebar"><div class="brand"><span class="brand-mark">i</span><span>studio iksha</span><button class="icon-button sidebar-toggle" aria-label="Toggle menu">☰</button></div><div class="workspace-label">WORKSPACE</div><nav><button class="nav-item active"><span class="nav-icon">▦</span> Projects <span class="nav-count">${projects.length}</span></button><button class="nav-item" data-toast="Notifications are coming soon."><span class="nav-icon">◷</span> Activity</button></nav><div class="side-section"><span class="side-heading">YOUR PROJECTS</span><button class="icon-button" id="side-add" aria-label="Create project">+</button></div><div class="project-nav">${projects.map((p) => `<button class="project-nav-item ${p.id === selectedId ? 'selected' : ''}" data-project="${esc(p.id)}"><span class="project-dot ${p.status === 'At risk' ? 'risk' : ''}"></span><span>${esc(p.name)}</span></button>`).join('') || '<div class="empty-nav">Your projects will appear here.</div>'}</div><div class="sidebar-bottom"><div class="founder-avatar">P</div><div class="founder-meta"><strong>Project founder</strong><span>Workspace owner</span></div><button class="icon-button" id="logout" aria-label="Sign out">↗</button></div></aside><main class="main"><header class="topbar"><div class="breadcrumbs"><span>Workspace</span><span class="crumb-slash">/</span><strong>Projects</strong></div><div class="topbar-right"><span class="secure-note"><i></i> Private workspace</span><button class="avatar">P</button></div></header><div class="content">${selected ? renderProject(selected) : renderEmpty()}</div></main></div><div id="modal-root"></div><div id="toast-root"></div>`;
    document.querySelectorAll('[data-project]').forEach((el) => el.addEventListener('click', () => renderFounder(el.dataset.project)));
    document.querySelector('#new-project')?.addEventListener('click', showCreateProject);
    document.querySelector('#side-add').addEventListener('click', showCreateProject);
    document.querySelector('#logout').addEventListener('click', async () => { await post('/api/founder/logout'); renderLogin(); });
    document.querySelectorAll('[data-toast]').forEach((el) => el.addEventListener('click', () => toast(el.dataset.toast)));
    document.querySelector('.sidebar-toggle').addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));
    const mobileMenu = document.createElement('button'); mobileMenu.className = 'icon-button mobile-menu'; mobileMenu.type = 'button'; mobileMenu.setAttribute('aria-label', 'Open workspace menu'); mobileMenu.textContent = '☰';
    mobileMenu.addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));
    document.querySelector('.breadcrumbs').prepend(mobileMenu);
    if (!selected) return;
    document.querySelector('#add-member')?.addEventListener('click', showAddMember);
    document.querySelector('#share-link')?.addEventListener('click', createClientLink);
    document.querySelector('#copy-link')?.addEventListener('click', copyLink);
    document.querySelector('#share-link-bottom')?.addEventListener('click', createClientLink);
    document.querySelector('#edit-project')?.addEventListener('click', showEditProject);
    document.querySelector('#save-updates')?.addEventListener('click', showEditProject);
    loadConversation(selected);
  }
  function renderEmpty() { return `<section class="welcome"><div class="welcome-art"><span>✳</span><span>↗</span><span>○</span></div><span class="eyebrow">YOUR WORK, IN ONE PLACE</span><h1>Make room for<br>the work that matters.</h1><p class="muted">Create a project workspace to bring your client, team, and next steps together.</p><button id="new-project" class="button primary">Create your first project <span>→</span></button></section>`; }
  function renderProject(project) {
    const status = project.status || 'On track';
    return `<div class="page-heading"><div><div class="eyebrow">PROJECT WORKSPACE</div><h1>${esc(project.name)}</h1><div class="project-subline"><span>${esc(project.location || 'Location not set')}</span><span class="dot-sep">·</span><span>For ${esc(project.clientName)}</span></div></div><button id="share-link" class="button primary"><span class="share-icon">↗</span> Share client link</button></div><section class="project-ribbon"><div class="ribbon-state"><span class="status-dot ${status === 'At risk' ? 'risk' : ''}"></span><div><span class="eyebrow">PROJECT STATUS</span><strong>${esc(status)}</strong></div></div><div class="ribbon-detail"><span class="eyebrow">CURRENT PHASE</span><strong>${esc(project.phase)}</strong></div><div class="ribbon-detail"><span class="eyebrow">NEXT MILESTONE</span><strong>${esc(project.nextMilestone || 'Not set')}</strong></div><button id="edit-project" class="icon-button" title="Update project">✎</button></section><div class="section-heading"><div><span class="eyebrow">PROJECT OVERVIEW</span><h2>Team & progress</h2></div><button id="save-updates" class="button subtle">Update project</button></div><div class="overview-grid"><section class="card progress-card"><div class="card-top"><div><span class="eyebrow">RECENTLY IN PROGRESS</span><h3>${esc(project.recentTask || 'No recent task added')}</h3></div><span class="task-glyph">↗</span></div><div class="progress-meta"><span>Current phase · ${esc(project.phase)}</span><span>${esc(status)}</span></div><div class="next-step"><span class="next-icon">◎</span><div><span class="eyebrow">UP NEXT</span><strong>${esc(project.nextMilestone || 'Add the next milestone')}</strong></div></div></section><section class="card team-card"><div class="card-top"><div><span class="eyebrow">THE PEOPLE BEHIND IT</span><h3>Project team <span class="member-count">${project.members.length}</span></h3></div><button class="button small-outline" id="add-member">+ Add member</button></div><div class="member-list">${project.members.map((member, i) => `<div class="member-row"><span class="member-avatar tone-${i % 4}">${esc(initials(member.name))}</span><span class="member-name"><strong>${esc(member.name)}</strong><span>${esc(member.designation)}</span></span><span class="role-badge">${esc(member.role)}</span></div>`).join('') || '<div class="no-members">Add the people working on this project.</div>'}</div></section></div><div class="section-heading lower-heading"><div><span class="eyebrow">KEEP THE CONVERSATION OPEN</span><h2>Client project assistant</h2><p class="muted">A private link lets your client ask about progress, phase, or recent work—without an account.</p></div></div><section class="card link-card"><div class="link-symbol">✧</div><div class="link-copy"><strong>One link. One client.</strong><span>The first person to open the link claims it. It won’t work for anyone else afterward.</span></div><div class="link-action"><button id="share-link-bottom" class="button secondary">Create private link <span>→</span></button></div></section><div class="section-heading lower-heading"><div><span class="eyebrow">SHARED PROJECT CONTEXT</span><h2>Client conversation</h2><p class="muted">The client can see that their questions are shared with you.</p></div></div><section id="conversation-panel" class="card conversation-card"><div class="conversation-empty">Loading conversation…</div></section>`;
  }
  async function loadConversation(project) {
    const panel = document.querySelector('#conversation-panel'); if (!panel || !project) return;
    try {
      const { messages } = await api(`/api/founder/projects/${project.id}/conversation`);
      panel.innerHTML = messages.length ? messages.map((item) => `<article class="conversation-item"><div class="conversation-meta"><span>Client · ${new Date(item.at).toLocaleString()}</span></div><p class="conversation-question">${esc(item.question)}</p><p class="conversation-answer">${esc(item.answer)}</p></article>`).join('') : '<div class="conversation-empty">No client questions yet. Questions and answers will appear here once your client starts chatting.</div>';
    } catch { panel.innerHTML = '<div class="conversation-empty">Conversation history is unavailable.</div>'; }
  }
  function showCreateProject() {
    const modal = document.querySelector('#modal-root');
    modal.innerHTML = `<div class="modal-backdrop"><section class="modal"><button class="icon-button modal-close" aria-label="Close">×</button><span class="eyebrow">NEW PROJECT</span><h2>Start a project space</h2><p class="muted">Set up the basics. You can add the team and share a client link next.</p><form id="project-form" class="stack"><label>Project name<input name="name" placeholder="e.g. Kumar Residence" required autofocus></label><label>Client name<input name="clientName" placeholder="Who is this project for?" required></label><label>Location <span class="optional">OPTIONAL</span><input name="location" placeholder="City or site address"></label><div class="form-pair"><label>Current phase<select name="phase"><option>Design</option><option>Planning</option><option>Procurement</option><option>Site execution</option><option>Finishing</option><option>Handover</option></select></label><label>Status<select name="status"><option>Setup</option><option>On track</option><option>At risk</option><option>On hold</option></select></label></div><label>Recent task<input name="recentTask" placeholder="What was the team last working on?"></label><label>Next milestone<input name="nextMilestone" placeholder="What is the next important step?"></label><button class="button primary full" type="submit">Create project space <span>→</span></button></form></section></div>`;
    modal.querySelector('.modal-close').onclick = () => { modal.innerHTML = ''; };
    modal.querySelector('.modal-backdrop').addEventListener('click', (event) => { if (event.target.classList.contains('modal-backdrop')) modal.innerHTML = ''; });
    modal.querySelector('#project-form').addEventListener('submit', async (event) => { event.preventDefault(); const input = Object.fromEntries(new FormData(event.currentTarget)); try { const result = await post('/api/founder/projects', input); await loadProjects(); modal.innerHTML = ''; renderFounder(result.project.id); toast('Your project space is ready.'); } catch (error) { toast(error.message); } });
  }
  function showAddMember() {
    const modal = document.querySelector('#modal-root'); const project = projects.find((p) => p.id === document.querySelector('[data-project].selected')?.dataset.project) || projects[0];
    modal.innerHTML = `<div class="modal-backdrop"><section class="modal compact"><button class="icon-button modal-close">×</button><span class="eyebrow">PROJECT TEAM</span><h2>Add a team member</h2><p class="muted">Give them a clear place in ${esc(project.name)}.</p><form id="member-form" class="stack"><label>Full name<input name="name" placeholder="Name" required autofocus></label><label>Designation<input name="designation" placeholder="e.g. Interior designer" required></label><label>Role<select name="role"><option>Project admin</option><option>Designer</option><option>Site supervisor</option><option>Site team</option><option>Contractor</option><option>Client</option><option>Trade worker</option><option>Other</option></select></label><button class="button primary full">Add to project <span>→</span></button></form></section></div>`;
    modal.querySelector('.modal-close').onclick = () => { modal.innerHTML = ''; };
    modal.querySelector('#member-form').addEventListener('submit', async (event) => { event.preventDefault(); try { await post(`/api/founder/projects/${project.id}/members`, Object.fromEntries(new FormData(event.currentTarget))); await loadProjects(); modal.innerHTML = ''; renderFounder(project.id); toast('Team member added.'); } catch (error) { toast(error.message); } });
  }
  function showEditProject() {
    const project = projects.find((p) => p.id === document.querySelector('[data-project].selected')?.dataset.project) || projects[0];
    const modal = document.querySelector('#modal-root');
    modal.innerHTML = `<div class="modal-backdrop"><section class="modal compact"><button class="icon-button modal-close">×</button><span class="eyebrow">PROJECT UPDATE</span><h2>Update project facts</h2><p class="muted">These are the facts your client assistant uses. Keep them current and accurate.</p><form id="edit-form" class="stack"><label>Current phase<select name="phase">${['Design','Planning','Procurement','Site execution','Finishing','Handover'].map((v) => `<option ${v === project.phase ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label>Status<select name="status">${['Setup','On track','At risk','On hold','Completed'].map((v) => `<option ${v === project.status ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label>Recent task<input name="recentTask" value="${esc(project.recentTask)}"></label><label>Next milestone<input name="nextMilestone" value="${esc(project.nextMilestone)}"></label><label>Blocker <span class="optional">VISIBLE TO CLIENT ASSISTANT</span><input name="blocker" value="${esc(project.blocker)}" placeholder="No blocker recorded"></label><button class="button primary full">Save project update <span>→</span></button></form></section></div>`;
    modal.querySelector('.modal-close').onclick = () => { modal.innerHTML = ''; };
    modal.querySelector('#edit-form').addEventListener('submit', async (event) => { event.preventDefault(); try { await api(`/api/founder/projects/${project.id}`, { method: 'PATCH', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); await loadProjects(); modal.innerHTML = ''; renderFounder(project.id); toast('Project details updated.'); } catch (error) { toast(error.message); } });
  }
  async function createClientLink() {
    const project = projects.find((p) => p.id === document.querySelector('[data-project].selected')?.dataset.project) || projects[0];
    if (!project) return; try { const { link } = await post(`/api/founder/projects/${project.id}/invite`); showLink(link, project); } catch (error) { toast(error.message); }
  }
  function showLink(link, project) {
    const modal = document.querySelector('#modal-root');
    modal.innerHTML = `<div class="modal-backdrop"><section class="modal compact"><button class="icon-button modal-close">×</button><div class="success-mark">✓</div><span class="eyebrow">PRIVATE CLIENT LINK</span><h2>Ready to share</h2><p class="muted">Send this to ${esc(project.clientName)}. The first person to open it claims access; anyone else will be blocked.</p><div class="share-link-box"><input id="invite-link" readonly value="${esc(link)}"><button class="button small-outline" id="copy-link-modal">Copy</button></div><div class="security-caption"><span>◉</span> No email or account needed · One client session</div><button class="button primary full" id="done-link">Done</button></section></div>`;
    modal.querySelector('.modal-close').onclick = () => { modal.innerHTML = ''; };
    modal.querySelector('#done-link').onclick = () => { modal.innerHTML = ''; };
    modal.querySelector('#copy-link-modal').onclick = copyLink;
  }
  async function copyLink() { const field = document.querySelector('#invite-link'); if (!field) return; await navigator.clipboard.writeText(field.value); toast('Private link copied.'); }
}

function toast(message) { const root = document.querySelector('#toast-root'); if (!root) return; root.innerHTML = `<div class="toast">${esc(message)}</div>`; setTimeout(() => { if (root) root.innerHTML = ''; }, 3200); }

async function clientApp() {
  const token = decodeURIComponent(location.pathname.split('/')[2] || '');
  app.innerHTML = `<main class="client-shell"><header class="client-header"><div class="brand"><span class="brand-mark">i</span><span>studio iksha</span></div><span class="private-pill"><i></i> PRIVATE PROJECT SPACE</span></header><section id="client-content" class="client-content"><div class="client-loading"><span class="spinner"></span><p>Opening your project space…</p></div></section><footer class="client-footer">Thoughtfully managed by Studio Iksha <span>·</span> <a href="#" id="client-help">Need help?</a></footer></main>`;
  const content = document.querySelector('#client-content');
  try {
    const { project } = await post('/api/client/claim', { token });
    renderChat(project);
  } catch (error) {
    content.innerHTML = `<section class="client-message"><div class="error-symbol">↗</div><span class="eyebrow">PRIVATE PROJECT LINK</span><h1>This link has already been used.</h1><p class="muted">For your privacy, each client link can be claimed by one person. Please ask the project founder to create a new link for you.</p><p class="error">${esc(error.message)}</p></section>`;
  }
  document.querySelector('#client-help').addEventListener('click', (event) => { event.preventDefault(); alert('Please contact your Studio Iksha project founder.'); });
  function renderChat(project) {
    content.innerHTML = `<div class="client-welcome"><span class="eyebrow">YOUR PROJECT, MADE CLEAR</span><h1>Hello, ${esc(project.clientName.split(' ')[0])}.</h1><p class="muted">I’m here to help you stay in the loop on <strong>${esc(project.name)}</strong>.</p></div><section class="client-status card"><div class="client-status-top"><span class="eyebrow">PROJECT SNAPSHOT</span><span class="client-status-badge"><i class="status-dot ${project.status === 'At risk' ? 'risk' : ''}"></i>${esc(project.status)}</span></div><div class="client-facts"><div><span class="eyebrow">CURRENT PHASE</span><strong>${esc(project.phase)}</strong></div><div><span class="eyebrow">RECENT TASK</span><strong>${esc(project.recentTask || 'Not recorded')}</strong></div></div></section><section class="chat-card card"><div class="chat-heading"><span class="assistant-avatar">✳</span><div><strong>Your project assistant</strong><span>Ask about progress, phase, or recent work</span></div><span class="online-dot" title="Available"></span></div><div id="messages" class="messages"><div class="message assistant-message"><span class="message-avatar">✳</span><div class="bubble">Hi ${esc(project.clientName.split(' ')[0])}! I can give you a clear update on how things are going. What would you like to know?</div></div></div><div class="suggestions"><button data-question="How is the project going?">How is the project going?</button><button data-question="What phase are we in?">What phase are we in?</button><button data-question="What was the recent task?">What was the recent task?</button></div><form id="chat-form" class="chat-form"><input name="question" placeholder="Ask me about your project…" maxlength="1000" autocomplete="off" required><button type="submit" aria-label="Send message">↑</button></form><p class="ai-note">Project updates are based on information shared by your team. The project founder can review this conversation.</p></section>`;
    document.querySelectorAll('[data-question]').forEach((button) => button.addEventListener('click', () => ask(button.dataset.question)));
    document.querySelector('#chat-form').addEventListener('submit', (event) => { event.preventDefault(); const input = new FormData(event.currentTarget).get('question'); event.currentTarget.reset(); ask(input); });
    loadClientConversation();
  }
  async function loadClientConversation() {
    try {
      const { messages } = await api('/api/client/conversation'); if (!messages.length) return;
      const container = document.querySelector('#messages'); if (!container) return;
      container.innerHTML = messages.map((item) => `<div class="message user-message"><div class="bubble">${esc(item.question)}</div></div><div class="message assistant-message"><span class="message-avatar">✳</span><div class="bubble">${esc(item.answer)}</div></div>`).join('');
      container.scrollTop = container.scrollHeight;
    } catch { /* The current client session can continue without history. */ }
  }
  async function ask(question) {
    const messages = document.querySelector('#messages'); if (!messages) return;
    messages.insertAdjacentHTML('beforeend', `<div class="message user-message"><div class="bubble">${esc(question)}</div></div><div class="message assistant-message pending"><span class="message-avatar">✳</span><div class="bubble"><span class="typing"><i></i><i></i><i></i></span></div></div>`);
    messages.scrollTop = messages.scrollHeight;
    try { const { answer } = await post('/api/client/chat', { question }); document.querySelector('.pending')?.remove(); messages.insertAdjacentHTML('beforeend', `<div class="message assistant-message"><span class="message-avatar">✳</span><div class="bubble">${esc(answer)}</div></div>`); }
    catch (error) { document.querySelector('.pending')?.remove(); messages.insertAdjacentHTML('beforeend', `<div class="message assistant-message"><span class="message-avatar">✳</span><div class="bubble">${esc(error.message)}</div></div>`); }
    messages.scrollTop = messages.scrollHeight;
  }
}

if (location.pathname.startsWith('/c/')) clientApp(); else founderApp();
