const app = document.querySelector('#app');
const esc = (value = '') => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const api = async (url, options = {}) => {
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
};

const post = (url, data = {}) => api(url, { method: 'POST', body: JSON.stringify(data) });
const patch = (url, data = {}) => api(url, { method: 'PATCH', body: JSON.stringify(data) });
const initials = (name = '') => name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'P';

function formatTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getRoleBadgeClass(role = '') {
  const r = role.toLowerCase();
  if (r.includes('admin') || r.includes('founder')) return 'role-admin';
  if (r.includes('designer')) return 'role-designer';
  if (r.includes('supervisor') || r.includes('site')) return 'role-supervisor';
  if (r.includes('trade') || r.includes('contractor')) return 'role-trade';
  return 'role-default';
}

function toast(message) {
  const root = document.querySelector('#toast-root');
  if (!root) return;
  root.innerHTML = `<div class="toast">${esc(message)}</div>`;
  setTimeout(() => { if (root) root.innerHTML = ''; }, 3200);
}

// ==========================================
// FOUNDER APPLICATION
// ==========================================
async function founderApp() {
  let projects = [];
  let activities = [];
  let currentTab = 'projects'; // 'projects' | 'activity'
  let searchQuery = '';
  let statusFilter = 'ALL';

  try {
    const data = await api('/api/founder/projects');
    projects = data.projects || [];
    return renderShell(projects[0]?.id);
  } catch {
    return renderLogin();
  }

  function renderLogin() {
    app.innerHTML = `
      <main class="login-shell">
        <section class="login-card">
          <div class="brand">
            <span class="brand-mark">i</span>
            <span>studio iksha</span>
          </div>
          <span class="eyebrow">PROJECT OPERATIONS</span>
          <h1>Good work starts<br>with a clear picture.</h1>
          <p class="muted">Sign in to your founder workspace to manage project operations, team rosters, and private client assistants.</p>
          <form id="login-form" class="stack">
            <label>Founder password
              <input name="password" type="password" autocomplete="current-password" placeholder="Enter founder password" required autofocus>
            </label>
            <button class="button primary" type="submit">Continue <span>→</span></button>
          </form>
          <p class="error" id="login-error"></p>
        </section>
        <div class="login-note">A calm, unified operational workspace for Studio Iksha.</div>
      </main>
    `;

    document.querySelector('#login-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = event.currentTarget.querySelector('button');
      button.disabled = true;
      try {
        await post('/api/founder/login', { password: new FormData(event.currentTarget).get('password') });
        await founderApp();
      } catch (error) {
        document.querySelector('#login-error').textContent = error.message;
        button.disabled = false;
      }
    });
  }

  async function loadProjects() {
    const data = await api('/api/founder/projects');
    projects = data.projects || [];
  }

  async function loadActivities() {
    try {
      const data = await api('/api/founder/activity');
      activities = data.activity || [];
    } catch {
      activities = [];
    }
  }

  function renderShell(selectedId = projects[0]?.id) {
    const selected = projects.find((p) => p.id === selectedId) || projects[0];
    const filteredProjects = projects.filter((p) => {
      const matchesSearch = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.clientName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || (p.status || 'Setup').toLowerCase() === statusFilter.toLowerCase();
      return matchesSearch && matchesStatus;
    });

    app.innerHTML = `
      <div class="shell">
        <aside class="sidebar">
          <div class="brand">
            <span class="brand-mark">i</span>
            <span>studio iksha</span>
            <button class="icon-button sidebar-toggle" aria-label="Toggle menu">✕</button>
          </div>

          <div class="workspace-label">WORKSPACE</div>
          <nav class="main-nav">
            <button class="nav-item ${currentTab === 'projects' ? 'active' : ''}" id="nav-projects">
              <span class="nav-icon">▦</span>
              <span>Projects</span>
              <span class="nav-count">${projects.length}</span>
            </button>
            <button class="nav-item ${currentTab === 'activity' ? 'active' : ''}" id="nav-activity">
              <span class="nav-icon">◷</span>
              <span>Activity Log</span>
            </button>
          </nav>

          <div class="side-section">
            <span class="side-heading">PROJECTS</span>
            <button class="icon-button" id="side-add" title="Create project" aria-label="Create project">+</button>
          </div>

          <div class="sidebar-search">
            <input type="text" id="project-search" placeholder="Filter projects…" value="${esc(searchQuery)}">
          </div>

          <div class="project-nav">
            ${filteredProjects.map((p) => `
              <button class="project-nav-item ${p.id === selected?.id && currentTab === 'projects' ? 'selected' : ''}" data-project="${esc(p.id)}">
                <span class="project-dot ${p.status === 'At risk' ? 'risk' : p.status === 'On hold' ? 'hold' : ''}"></span>
                <span class="project-nav-name">${esc(p.name)}</span>
                <span class="project-nav-client">${esc(p.clientName)}</span>
              </button>
            `).join('') || '<div class="empty-nav">No matching projects.</div>'}
          </div>

          <div class="sidebar-bottom">
            <div class="founder-avatar">P</div>
            <div class="founder-meta">
              <strong>Project Founder</strong>
              <span>Studio Iksha Workspace</span>
            </div>
            <button class="icon-button" id="logout" title="Sign out" aria-label="Sign out">↗</button>
          </div>
        </aside>

        <main class="main">
          <header class="topbar">
            <div class="breadcrumbs">
              <button class="icon-button mobile-menu" type="button" aria-label="Open workspace menu">☰</button>
              <span>Workspace</span>
              <span class="crumb-slash">/</span>
              <strong>${currentTab === 'projects' ? (selected ? esc(selected.name) : 'Projects') : 'Activity Log'}</strong>
            </div>
            <div class="topbar-right">
              <span class="secure-note"><i></i> Founder Session Active</span>
              <button class="avatar" title="Founder">P</button>
            </div>
          </header>

          <div class="content">
            ${currentTab === 'activity' ? renderActivityView() : (selected ? renderProjectView(selected) : renderEmpty())}
          </div>
        </main>
      </div>
      <div id="modal-root"></div>
      <div id="toast-root"></div>
    `;

    // Sidebar listeners
    document.querySelector('#nav-projects').addEventListener('click', () => {
      currentTab = 'projects';
      renderShell(selected?.id);
    });

    document.querySelector('#nav-activity').addEventListener('click', async () => {
      currentTab = 'activity';
      await loadActivities();
      renderShell(selected?.id);
    });

    document.querySelector('#project-search')?.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      const navContainer = document.querySelector('.project-nav');
      const filtered = projects.filter((p) => {
        const matchesSearch = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.clientName.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === 'ALL' || (p.status || 'Setup').toLowerCase() === statusFilter.toLowerCase();
        return matchesSearch && matchesStatus;
      });
      navContainer.innerHTML = filtered.map((p) => `
        <button class="project-nav-item ${p.id === selected?.id && currentTab === 'projects' ? 'selected' : ''}" data-project="${esc(p.id)}">
          <span class="project-dot ${p.status === 'At risk' ? 'risk' : p.status === 'On hold' ? 'hold' : ''}"></span>
          <span class="project-nav-name">${esc(p.name)}</span>
          <span class="project-nav-client">${esc(p.clientName)}</span>
        </button>
      `).join('') || '<div class="empty-nav">No matching projects.</div>';
      attachProjectClickListeners();
    });

    attachProjectClickListeners();

    document.querySelector('#side-add')?.addEventListener('click', showCreateProject);
    document.querySelector('#logout')?.addEventListener('click', async () => {
      await post('/api/founder/logout');
      renderLogin();
    });

    document.querySelector('.sidebar-toggle')?.addEventListener('click', () => {
      document.querySelector('.sidebar').classList.remove('open');
    });

    document.querySelector('.mobile-menu')?.addEventListener('click', () => {
      document.querySelector('.sidebar').classList.add('open');
    });

    if (currentTab === 'projects' && selected) {
      document.querySelector('#share-link')?.addEventListener('click', () => createClientLink(selected));
      document.querySelector('#share-link-bottom')?.addEventListener('click', () => createClientLink(selected));
      document.querySelector('#edit-project')?.addEventListener('click', () => showEditProject(selected));
      document.querySelector('#save-updates')?.addEventListener('click', () => showEditProject(selected));
      document.querySelector('#add-member')?.addEventListener('click', () => showAddMember(selected));
      document.querySelector('#new-project-empty')?.addEventListener('click', showCreateProject);
      loadConversation(selected);
    }
  }

  function attachProjectClickListeners() {
    document.querySelectorAll('[data-project]').forEach((el) => {
      el.addEventListener('click', () => {
        currentTab = 'projects';
        renderShell(el.dataset.project);
      });
    });
  }

  function renderEmpty() {
    return `
      <section class="welcome">
        <div class="welcome-art">
          <span>✳</span>
          <span>↗</span>
          <span>○</span>
        </div>
        <span class="eyebrow">WORKSPACE OPERATIONS</span>
        <h1>Make room for<br>the work that matters.</h1>
        <p class="muted">Create a project workspace to track phases, team rosters, and generate a secure assistant link for your client.</p>
        <button id="new-project-empty" class="button primary">Create your first project <span>→</span></button>
      </section>
    `;
  }

  function renderProjectView(project) {
    const status = project.status || 'Setup';
    return `
      <div class="page-heading">
        <div>
          <div class="eyebrow">PROJECT WORKSPACE</div>
          <h1>${esc(project.name)}</h1>
          <div class="project-subline">
            <span>${esc(project.location || 'Location not specified')}</span>
            <span class="dot-sep">·</span>
            <span>Client: <strong>${esc(project.clientName)}</strong></span>
            <span class="dot-sep">·</span>
            <span>Created ${new Date(project.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
        <div class="heading-actions">
          <button id="edit-project" class="button subtle">✎ Edit Facts</button>
          <button id="share-link" class="button primary"><span class="share-icon">↗</span> Share Client Link</button>
        </div>
      </div>

      ${project.blocker ? `
        <div class="blocker-banner">
          <div class="blocker-icon">⚠️</div>
          <div class="blocker-text">
            <strong>Active Blocker (Visible to Client Assistant)</strong>
            <p>${esc(project.blocker)}</p>
          </div>
          <button class="button small-outline" id="resolve-blocker" onclick="document.querySelector('#save-updates').click()">Update Blocker</button>
        </div>
      ` : ''}

      <section class="project-ribbon">
        <div class="ribbon-state">
          <span class="status-dot ${status === 'At risk' ? 'risk' : status === 'On hold' ? 'hold' : ''}"></span>
          <div>
            <span class="eyebrow">PROJECT STATUS</span>
            <strong>${esc(status)}</strong>
          </div>
        </div>
        <div class="ribbon-detail">
          <span class="eyebrow">CURRENT PHASE</span>
          <strong>${esc(project.phase || 'Design')}</strong>
        </div>
        <div class="ribbon-detail">
          <span class="eyebrow">NEXT MILESTONE</span>
          <strong>${esc(project.nextMilestone || 'Not scheduled')}</strong>
        </div>
        <div class="ribbon-detail">
          <span class="eyebrow">TEAM ROSTER</span>
          <strong>${project.members?.length || 0} Members</strong>
        </div>
      </section>

      <div class="section-heading">
        <div>
          <span class="eyebrow">PROJECT OVERVIEW</span>
          <h2>Team & Operations</h2>
        </div>
        <button id="save-updates" class="button subtle">Update Project Facts</button>
      </div>

      <div class="overview-grid">
        <section class="card progress-card">
          <div class="card-top">
            <div>
              <span class="eyebrow">RECENT IN PROGRESS</span>
              <h3>${esc(project.recentTask || 'No recent task recorded')}</h3>
            </div>
            <span class="task-glyph">↗</span>
          </div>
          <div class="progress-meta">
            <span>Current Phase · ${esc(project.phase || 'Design')}</span>
            <span class="status-badge-text ${status === 'At risk' ? 'risk' : ''}">${esc(status)}</span>
          </div>
          <div class="next-step">
            <span class="next-icon">◎</span>
            <div>
              <span class="eyebrow">UP NEXT</span>
              <strong>${esc(project.nextMilestone || 'Milestone not recorded')}</strong>
            </div>
          </div>
        </section>

        <section class="card team-card">
          <div class="card-top">
            <div>
              <span class="eyebrow">TEAM ROSTER</span>
              <h3>Project Team <span class="member-count">${project.members?.length || 0}</span></h3>
            </div>
            <button class="button small-outline" id="add-member">+ Add Member</button>
          </div>
          <div class="member-list">
            ${(project.members || []).map((member, i) => `
              <div class="member-row">
                <span class="member-avatar tone-${i % 4}">${esc(initials(member.name))}</span>
                <div class="member-name">
                  <strong>${esc(member.name)}</strong>
                  <span>${esc(member.designation)}</span>
                </div>
                <span class="role-badge ${getRoleBadgeClass(member.role)}">${esc(member.role)}</span>
              </div>
            `).join('') || '<div class="no-members">No team members assigned yet. Add designers, supervisors, or administrators.</div>'}
          </div>
        </section>
      </div>

      <div class="section-heading lower-heading">
        <div>
          <span class="eyebrow">CLIENT ACCESS</span>
          <h2>Client Project Assistant</h2>
          <p class="muted">Generate a private, single-browser bearer link. Your client can check live progress, milestones, and questions without creating an account.</p>
        </div>
      </div>

      <section class="card link-card">
        <div class="link-symbol">✧</div>
        <div class="link-copy">
          <strong>Single-Claim Private Link</strong>
          <span>The first person to open the link claims it for their browser session. Generating a replacement revokes the previous link.</span>
        </div>
        <div class="link-action">
          <button id="share-link-bottom" class="button secondary">Create Private Link <span>→</span></button>
        </div>
      </section>

      <div class="section-heading lower-heading">
        <div>
          <span class="eyebrow">CLIENT ENGAGEMENT</span>
          <h2>Shared Conversation Transcript</h2>
          <p class="muted">Review questions your client asked the project assistant. Clients are notified that this transcript is visible to the founder.</p>
        </div>
      </div>

      <section id="conversation-panel" class="card conversation-card">
        <div class="conversation-empty">Loading client conversation transcript…</div>
      </section>
    `;
  }

  function renderActivityView() {
    return `
      <div class="page-heading">
        <div>
          <div class="eyebrow">AUDIT & OPERATIONS</div>
          <h1>Workspace Activity Log</h1>
          <p class="muted">Recent operations, project creations, member updates, and client link claims.</p>
        </div>
        <button class="button subtle" id="refresh-activity">↻ Refresh</button>
      </div>

      <section class="card activity-card">
        <div class="activity-list">
          ${activities.map((act) => {
            const project = projects.find((p) => p.id === act.projectId);
            const projectName = project ? project.name : (act.projectId ? 'Project' : 'Workspace');
            let icon = '⚡';
            let title = act.action;
            let detail = '';

            switch (act.action) {
              case 'project_created':
                icon = '✦';
                title = 'Project created';
                detail = `Created workspace for ${esc(act.details?.clientName || projectName)}`;
                break;
              case 'project_updated':
                icon = '✎';
                title = 'Project facts updated';
                detail = `Updated facts for ${esc(projectName)}`;
                break;
              case 'member_added':
                icon = '👤';
                title = 'Team member added';
                detail = `${esc(act.details?.name || 'Member')} (${esc(act.details?.role || 'Team')}) assigned to ${esc(projectName)}`;
                break;
              case 'client_link_created':
                icon = '↗';
                title = 'Client invite link generated';
                detail = `New private link issued for ${esc(projectName)}`;
                break;
              case 'client_link_claimed':
                icon = '✓';
                title = 'Client link claimed';
                detail = `Client claimed browser session for ${esc(projectName)}`;
                break;
            }

            return `
              <div class="activity-row">
                <span class="activity-icon">${icon}</span>
                <div class="activity-content">
                  <div class="activity-header">
                    <strong>${esc(title)}</strong>
                    <span class="activity-tag">${esc(projectName)}</span>
                    <span class="activity-time">${formatTime(act.at)}</span>
                  </div>
                  <p class="activity-detail">${esc(detail)}</p>
                </div>
              </div>
            `;
          }).join('') || '<div class="activity-empty">No activity events recorded yet.</div>'}
        </div>
      </section>
    `;
  }

  async function loadConversation(project) {
    const panel = document.querySelector('#conversation-panel');
    if (!panel || !project) return;
    try {
      const { messages } = await api(`/api/founder/projects/${project.id}/conversation`);
      panel.innerHTML = messages && messages.length ? messages.map((item) => `
        <article class="conversation-item">
          <div class="conversation-meta">
            <span class="client-badge">Client Question</span>
            <span>·</span>
            <span>${new Date(item.at).toLocaleString()}</span>
          </div>
          <p class="conversation-question">${esc(item.question)}</p>
          <div class="conversation-answer-box">
            <span class="assistant-label">Assistant Answer</span>
            <p class="conversation-answer">${esc(item.answer)}</p>
          </div>
        </article>
      `).join('') : '<div class="conversation-empty">No client questions yet. Questions asked by your client will appear here in real-time.</div>';
    } catch {
      panel.innerHTML = '<div class="conversation-empty">Conversation history is currently unavailable.</div>';
    }
  }

  function showCreateProject() {
    const modal = document.querySelector('#modal-root');
    modal.innerHTML = `
      <div class="modal-backdrop">
        <section class="modal">
          <button class="icon-button modal-close" aria-label="Close">✕</button>
          <span class="eyebrow">NEW PROJECT WORKSPACE</span>
          <h2>Start a Project Space</h2>
          <p class="muted">Set up the project facts. You can assign the team and create a client link immediately after.</p>
          <form id="project-form" class="stack">
            <label>Project Name
              <input name="name" placeholder="e.g. Kumar Residence" required autofocus>
            </label>
            <label>Client Name
              <input name="clientName" placeholder="e.g. Asha Kumar" required>
            </label>
            <label>Location <span class="optional">OPTIONAL</span>
              <input name="location" placeholder="City or site address">
            </label>
            <div class="form-pair">
              <label>Current Phase
                <select name="phase">
                  <option>Design</option>
                  <option>Planning</option>
                  <option>Procurement</option>
                  <option>Site execution</option>
                  <option>Finishing</option>
                  <option>Handover</option>
                </select>
              </label>
              <label>Status
                <select name="status">
                  <option>Setup</option>
                  <option>On track</option>
                  <option>At risk</option>
                  <option>On hold</option>
                </select>
              </label>
            </div>
            <label>Recent Task <span class="optional">CLIENT-VISIBLE</span>
              <input name="recentTask" placeholder="e.g. Completed 3D design moodboard and layout presentation">
            </label>
            <label>Next Milestone <span class="optional">CLIENT-VISIBLE</span>
              <input name="nextMilestone" placeholder="e.g. Tile and plumbing fixtures material selection">
            </label>
            <button class="button primary full" type="submit">Create Project Space <span>→</span></button>
          </form>
        </section>
      </div>
    `;

    modal.querySelector('.modal-close').onclick = () => { modal.innerHTML = ''; };
    modal.querySelector('.modal-backdrop').addEventListener('click', (event) => {
      if (event.target.classList.contains('modal-backdrop')) modal.innerHTML = '';
    });
    modal.querySelector('#project-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = Object.fromEntries(new FormData(event.currentTarget));
      try {
        const result = await post('/api/founder/projects', input);
        await loadProjects();
        modal.innerHTML = '';
        renderShell(result.project.id);
        toast('Project space created successfully.');
      } catch (error) {
        toast(error.message);
      }
    });
  }

  function showAddMember(project) {
    const modal = document.querySelector('#modal-root');
    modal.innerHTML = `
      <div class="modal-backdrop">
        <section class="modal compact">
          <button class="icon-button modal-close" aria-label="Close">✕</button>
          <span class="eyebrow">PROJECT TEAM</span>
          <h2>Add Team Member</h2>
          <p class="muted">Add a team member to <strong>${esc(project.name)}</strong>.</p>
          <form id="member-form" class="stack">
            <label>Full Name
              <input name="name" placeholder="e.g. Rohan Mehta" required autofocus>
            </label>
            <label>Designation
              <input name="designation" placeholder="e.g. Lead Interior Designer" required>
            </label>
            <label>Project Role
              <select name="role">
                <option>Project admin</option>
                <option>Designer</option>
                <option>Site supervisor</option>
                <option>Site team</option>
                <option>Contractor</option>
                <option>Trade worker</option>
                <option>Client</option>
                <option>Other</option>
              </select>
            </label>
            <button class="button primary full" type="submit">Add to Project <span>→</span></button>
          </form>
        </section>
      </div>
    `;

    modal.querySelector('.modal-close').onclick = () => { modal.innerHTML = ''; };
    modal.querySelector('.modal-backdrop').addEventListener('click', (event) => {
      if (event.target.classList.contains('modal-backdrop')) modal.innerHTML = '';
    });
    modal.querySelector('#member-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await post(`/api/founder/projects/${project.id}/members`, Object.fromEntries(new FormData(event.currentTarget)));
        await loadProjects();
        modal.innerHTML = '';
        renderShell(project.id);
        toast('Team member added.');
      } catch (error) {
        toast(error.message);
      }
    });
  }

  function showEditProject(project) {
    const modal = document.querySelector('#modal-root');
    modal.innerHTML = `
      <div class="modal-backdrop">
        <section class="modal compact">
          <button class="icon-button modal-close" aria-label="Close">✕</button>
          <span class="eyebrow">PROJECT FACTS UPDATE</span>
          <h2>Update Client-Safe Facts</h2>
          <p class="muted">The client assistant responds strictly based on these recorded facts. Keep them accurate and clear.</p>
          <form id="edit-form" class="stack">
            <div class="form-pair">
              <label>Current Phase
                <select name="phase">
                  ${['Design', 'Planning', 'Procurement', 'Site execution', 'Finishing', 'Handover'].map((v) => `<option ${v === project.phase ? 'selected' : ''}>${v}</option>`).join('')}
                </select>
              </label>
              <label>Status
                <select name="status">
                  ${['Setup', 'On track', 'At risk', 'On hold', 'Completed'].map((v) => `<option ${v === project.status ? 'selected' : ''}>${v}</option>`).join('')}
                </select>
              </label>
            </div>
            <label>Recent Task
              <input name="recentTask" value="${esc(project.recentTask)}" placeholder="e.g. Electrical conduit routing completed on 2nd floor">
            </label>
            <label>Next Milestone
              <input name="nextMilestone" value="${esc(project.nextMilestone)}" placeholder="e.g. Flooring tile delivery and dry-laying review">
            </label>
            <label>Blocker <span class="optional">CLIENT VISIBLE</span>
              <input name="blocker" value="${esc(project.blocker)}" placeholder="e.g. Waiting on client confirmation for kitchen countertop stone">
            </label>
            <button class="button primary full" type="submit">Save Project Facts <span>→</span></button>
          </form>
        </section>
      </div>
    `;

    modal.querySelector('.modal-close').onclick = () => { modal.innerHTML = ''; };
    modal.querySelector('.modal-backdrop').addEventListener('click', (event) => {
      if (event.target.classList.contains('modal-backdrop')) modal.innerHTML = '';
    });
    modal.querySelector('#edit-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await patch(`/api/founder/projects/${project.id}`, Object.fromEntries(new FormData(event.currentTarget)));
        await loadProjects();
        modal.innerHTML = '';
        renderShell(project.id);
        toast('Project facts updated.');
      } catch (error) {
        toast(error.message);
      }
    });
  }

  async function createClientLink(project) {
    if (!project) return;
    try {
      const { link } = await post(`/api/founder/projects/${project.id}/invite`);
      showLinkModal(link, project);
    } catch (error) {
      toast(error.message);
    }
  }

  function showLinkModal(link, project) {
    const modal = document.querySelector('#modal-root');
    modal.innerHTML = `
      <div class="modal-backdrop">
        <section class="modal compact">
          <button class="icon-button modal-close" aria-label="Close">✕</button>
          <div class="success-mark">✓</div>
          <span class="eyebrow">PRIVATE CLIENT LINK</span>
          <h2>Link Ready to Share</h2>
          <p class="muted">Share this private link with <strong>${esc(project.clientName)}</strong>. The first browser to open it will claim access.</p>
          <div class="share-link-box">
            <input id="invite-link-field" readonly value="${esc(link)}">
            <button class="button small-outline" id="copy-link-btn">Copy Link</button>
          </div>
          <div class="security-caption">
            <span>◉</span> Single-browser security · No password or email registration required
          </div>
          <button class="button primary full" id="done-link-btn">Done</button>
        </section>
      </div>
    `;

    modal.querySelector('.modal-close').onclick = () => { modal.innerHTML = ''; };
    modal.querySelector('#done-link-btn').onclick = () => { modal.innerHTML = ''; };
    modal.querySelector('#copy-link-btn').onclick = async () => {
      const field = document.querySelector('#invite-link-field');
      if (field) {
        await navigator.clipboard.writeText(field.value);
        toast('Private link copied to clipboard.');
      }
    };
  }
}

// ==========================================
// CLIENT PORTAL APPLICATION
// ==========================================
async function clientApp() {
  const token = decodeURIComponent(location.pathname.split('/')[2] || '');
  app.innerHTML = `
    <main class="client-shell">
      <header class="client-header">
        <div class="brand">
          <span class="brand-mark">i</span>
          <span>studio iksha</span>
        </div>
        <span class="private-pill"><i></i> PRIVATE CLIENT PORTAL</span>
      </header>
      <section id="client-content" class="client-content">
        <div class="client-loading">
          <span class="spinner"></span>
          <p>Connecting to your project space…</p>
        </div>
      </section>
      <footer class="client-footer">
        Studio Iksha Project Operations <span>·</span> <a href="#" id="client-help">Need assistance?</a>
      </footer>
    </main>
  `;

  const content = document.querySelector('#client-content');

  try {
    const { project } = await post('/api/client/claim', { token });
    renderChat(project);
  } catch (error) {
    content.innerHTML = `
      <section class="client-message">
        <div class="error-symbol">⚠️</div>
        <span class="eyebrow">LINK CLAIM NOTICE</span>
        <h1>Unable to Open Project Link</h1>
        <p class="muted">For privacy and security, each private client link can be claimed by one browser only. If you opened this link on another device or need a replacement, please ask your Studio Iksha project founder to issue a new link.</p>
        <p class="error">${esc(error.message)}</p>
      </section>
    `;
  }

  document.querySelector('#client-help')?.addEventListener('click', (e) => {
    e.preventDefault();
    alert('Please contact your Studio Iksha project founder or site team for assistance.');
  });

  function renderChat(project) {
    const firstName = esc(project.clientName.trim().split(/\s+/)[0]);
    content.innerHTML = `
      <div class="client-welcome">
        <span class="eyebrow">PROJECT SPACE</span>
        <h1>Hello, ${firstName}.</h1>
        <p class="muted">Stay up to date with real-time facts and milestone tracking for <strong>${esc(project.name)}</strong>.</p>
      </div>

      <section class="client-status card">
        <div class="client-status-top">
          <span class="eyebrow">PROJECT SNAPSHOT</span>
          <span class="client-status-badge">
            <i class="status-dot ${project.status === 'At risk' ? 'risk' : project.status === 'On hold' ? 'hold' : ''}"></i>
            ${esc(project.status || 'On track')}
          </span>
        </div>

        <div class="client-facts-grid">
          <div class="client-fact-item">
            <span class="eyebrow">CURRENT PHASE</span>
            <strong>${esc(project.phase || 'Design')}</strong>
          </div>
          <div class="client-fact-item">
            <span class="eyebrow">RECENT TASK</span>
            <strong>${esc(project.recentTask || 'Work in progress')}</strong>
          </div>
          ${project.nextMilestone ? `
            <div class="client-fact-item">
              <span class="eyebrow">NEXT MILESTONE</span>
              <strong>${esc(project.nextMilestone)}</strong>
            </div>
          ` : ''}
          ${project.blocker ? `
            <div class="client-fact-item blocker-fact">
              <span class="eyebrow">CURRENT BLOCKER</span>
              <strong class="blocker-val">${esc(project.blocker)}</strong>
            </div>
          ` : ''}
        </div>
      </section>

      <section class="chat-card card">
        <div class="chat-heading">
          <span class="assistant-avatar">✳</span>
          <div>
            <strong>Project Assistant</strong>
            <span>Ask anything about progress, phase, or milestones</span>
          </div>
          <span class="online-dot" title="Assistant Online"></span>
        </div>

        <div id="messages" class="messages">
          <div class="message assistant-message">
            <span class="message-avatar">✳</span>
            <div class="bubble">
              Hi ${firstName}! I can share live updates on <strong>${esc(project.name)}</strong>. What would you like to know today?
            </div>
          </div>
        </div>

        <div class="suggestions">
          <button data-question="How is the project going?">How is the project going?</button>
          <button data-question="What phase are we currently in?">What phase are we in?</button>
          <button data-question="What was the team's most recent task?">What was the recent task?</button>
          ${project.nextMilestone ? '<button data-question="What is the next milestone?">What is the next milestone?</button>' : ''}
          ${project.blocker ? '<button data-question="Is there anything currently blocking the project?">Are there any blockers?</button>' : ''}
        </div>

        <form id="chat-form" class="chat-form">
          <input name="question" placeholder="Ask about project progress, status, or milestones…" maxlength="1000" autocomplete="off" required>
          <button type="submit" aria-label="Send question">↑</button>
        </form>

        <p class="ai-note">Updates reflect factual data maintained by your project team. The founder can review this conversation.</p>
      </section>
    `;

    document.querySelectorAll('[data-question]').forEach((button) => {
      button.addEventListener('click', () => ask(button.dataset.question));
    });

    document.querySelector('#chat-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const input = new FormData(event.currentTarget).get('question');
      event.currentTarget.reset();
      ask(input);
    });

    loadClientConversation();
  }

  async function loadClientConversation() {
    try {
      const { messages } = await api('/api/client/conversation');
      if (!messages || !messages.length) return;
      const container = document.querySelector('#messages');
      if (!container) return;
      container.innerHTML = messages.map((item) => `
        <div class="message user-message"><div class="bubble">${esc(item.question)}</div></div>
        <div class="message assistant-message"><span class="message-avatar">✳</span><div class="bubble">${esc(item.answer)}</div></div>
      `).join('');
      container.scrollTop = container.scrollHeight;
    } catch {
      // Continue session gracefully
    }
  }

  async function ask(question) {
    const messages = document.querySelector('#messages');
    if (!messages || !question) return;

    messages.insertAdjacentHTML('beforeend', `
      <div class="message user-message"><div class="bubble">${esc(question)}</div></div>
      <div class="message assistant-message pending">
        <span class="message-avatar">✳</span>
        <div class="bubble"><span class="typing"><i></i><i></i><i></i></span></div>
      </div>
    `);
    messages.scrollTop = messages.scrollHeight;

    try {
      const { answer } = await post('/api/client/chat', { question });
      document.querySelector('.pending')?.remove();
      messages.insertAdjacentHTML('beforeend', `
        <div class="message assistant-message">
          <span class="message-avatar">✳</span>
          <div class="bubble">${esc(answer)}</div>
        </div>
      `);
    } catch (error) {
      document.querySelector('.pending')?.remove();
      messages.insertAdjacentHTML('beforeend', `
        <div class="message assistant-message">
          <span class="message-avatar">✳</span>
          <div class="bubble error-bubble">${esc(error.message)}</div>
        </div>
      `);
    }
    messages.scrollTop = messages.scrollHeight;
  }
}

// Router initialization
if (location.pathname.startsWith('/c/')) {
  clientApp();
} else {
  founderApp();
}
