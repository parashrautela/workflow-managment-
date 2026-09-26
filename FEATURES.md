# Studio Iksha web app feature plan

This file is the shared product brief for the founder, frontend developer, and backend work. It combines the customer needs stated in this thread, the current Telegram workflow, and the previously shared construction workflow implementation plan. It distinguishes the first release from the broader product so later requirements do not get mistaken for V1 commitments.

## Product goal

Move Studio Iksha's construction project operations from Telegram groups and spreadsheet-led updates into a web app the founder can control. The founder creates a project workspace (the “group” in the current request), adds its people, maintains the project facts, and gives the client a private link to ask the project assistant for updates. The larger product adds dependency-aware schedules, private drawing reviews, procurement tracking, and operational alerts.

The frontend should follow the supplied `frontend/DESIGN.md` as a visual reference: calm, warm surfaces, clear hierarchy, and restrained blue actions. Apply it to a dense project-operations interface rather than copying Notion marketing-page layouts.

## V1 scope — founder workspace and one-client assistant

These are the requirements to align on first. The client must not need an email address, account, or password.

### Founder capabilities

1. **Sign in to the founder workspace.** Protect founder-only project, member, link, update, and conversation operations.
2. **Create a project group.** Store project name, client name, location, start date when available, current phase, status, recent task, and next milestone. Do not make up missing project facts.
3. **Add project members.** The founder enters each member's name, designation, and role. V1 records team details; it does not imply that every member has an individual login.
4. **Maintain client-safe project facts.** Update the current phase, overall status, recent task, next milestone, and any blocker that is appropriate to share with the client.
5. **Create and share a private client link.** Generate a high-entropy invite for one client session. The first browser to claim it gets an HTTP-only session; another browser is denied. Creating a replacement link revokes the previous invite/session.
6. **Review the client conversation.** The founder can see the client's questions and the assistant's answers. The client is told that the founder can review the transcript.
7. **See a basic project list.** The founder can open each project's details and manage the team, project facts, link, and conversation.

### Client capabilities

1. Open the project link without email, registration, or password.
2. Ask how the project is going, which phase it is in, and what task was recently done.
3. Ask about a recorded blocker or next milestone when the founder has supplied that information.
4. See a project snapshot and return to the same chat on the browser that claimed the link.
5. See a clear response when the project data is missing; the assistant must not invent dates, activity, approvals, or promises.

### Assistant rules

- Answer from the selected project's client-safe fields only.
- V1 is read-only. The assistant cannot create projects, change members, approve work, update a task, or change dates.
- Keep the transcript for both client continuity and founder visibility.
- If generated AI is unavailable, say what project facts are recorded; do not fabricate a conversational answer.
- Clearly state that the first person to open a bearer link claims it. With no identity check, the system limits the invite to one claimant but cannot prove that claimant is the named client.

### V1 acceptance checklist

- Founder creates a project, adds a member with name/designation/role, and updates the client-safe facts.
- Founder creates a client link; it opens the assistant with the right project context.
- Client uses the link without entering email or creating an account.
- The same browser can return and see its own transcript; a different browser cannot claim the invite.
- Issuing a replacement link invalidates the old invite and client session.
- Founder can read the transcript; client can see that the founder can review it.
- Client API responses do not include the internal team roster or unrelated project data.
- Unfilled facts return “not recorded” or ask the client to contact the founder.

## Full product feature inventory

These are requirements from the broader customer plan. Keep them visible for design and architecture; they are not all part of the first client-link release.

### Project portfolio and workspace

- Portfolio overview of active projects, phase/status, pending approvals, parallel work, blockers/holds, overdue work, procurement/delivery risk, upcoming milestones, and forecast completion.
- Filter every portfolio result and search result by the viewer's project access.
- Project workspace with project details, client and team, workflow version, task board/timeline, dependencies, blockers, approvals, files, procurement readiness, and activity history.
- Project creation flow: identify client/location/dates/owner; select an approved workflow version; assign team roles/audiences; generate stages/tasks and matching stage folders; review project-specific ordering changes and forecast; confirm the client view.
- Project lifecycle controls for active, completed, abandoned/cancelled, and accidental closure. Preserve history when a project closes.

### People, roles, audiences, and access

- Treat internal and external project audiences separately. Telegram membership or possession of a group link is not authorization for web app data.
- Check project membership, role, and audience on every screen, search result, API response, and file download.
- **Project admin/approver:** project configuration, team access, workflow overrides, and reviews. Gousic J or Nishant were identified as possible admins; per-project routing is not settled.
- **Designer:** upload drawings and revisions, see review comments/corrections and decisions; cannot approve their own work by default.
- **Site supervisor:** see schedule, blockers, permitted work, and approved execution files; update allowed task status.
- **Client:** see their project's status, client approvals, and approved deliverables; never see drafts or internal markups/comments.
- **Trade worker:** view-only access to relevant approved files and work status, limited to assigned projects/trades.
- Maintain project memberships with role, audience, active state, and access-change history.
- Decide later whether non-founder team members need individual app accounts and how their identity is verified.

### Workflow templates, tasks, and scheduling

- Use the reviewed Google Sheet as the source of reusable workflow template content until another authority is chosen. Import each reviewed revision as a versioned template and record source/version/import date/reviewer.
- Each project remains pinned to its selected template version unless an authorized migration is approved.
- Keep project-specific trade-order or dependency changes as overrides; never mutate the shared template.
- Represent explicit tasks, phases/stages, roles, audiences, durations, approval/material gates, milestones, and multiple dependencies. A task with multiple predecessors waits for every required predecessor and gate.
- Schedule from a dependency graph and durations, not from row order or one sequential cursor. Allow parallel trade work where dependencies allow.
- Preserve planned, actual, and forecast start/end dates separately. Show downstream forecast impact before applying a delay/order/dependency change; do not silently rewrite in-progress or committed dates.
- The initial design period is described as three months, but whether this is fixed, a target, or an estimate is unresolved.
- The sheet appears to show Residential Interior trades and a separate design section, but some rows/columns are incomplete. Blank fields and colors must not be treated as rules without review.
- Project-specific trade-order overrides must show affected dependencies, active tasks, and forecast impact before an authorized person confirms.

### Drawing files, approvals, and rework

- Create a folder per project stage using approved workflow stage names. Preserve original drafts, markups, corrections, and new revisions; never overwrite the only copy.
- A designer uploads a draft to its stage; record revision, uploader, timestamp, and storage reference.
- Keep draft drawings visible only to authorized internal users and assigned reviewers.
- Admin reviews first. If approved, the same revision proceeds to client review. The client sees a “Drawing under review” status, not the draft or internal materials.
- Client approval applies to that exact revision and unlocks only the permitted external view and dependent tasks.
- Record outcomes (approved/completed, rework needed, on hold), reviewer, role, comments, timestamp, and revision ID.
- Rework records feedback; it does not automatically reassign the task. Decide how designers are notified and whether they must acknowledge the rework.
- Link iPad correction/markup files to the review decision and source drawing revision. Keep the designer's next upload as a new revision.
- Decide whether every revision repeats admin and client approval or whether client review depends on material changes.
- On hold blocks dependent work. Record reason, actor, and time; define who may resume.
- “Latest drawing” queries must authorize the requester first. External users receive only the latest approved revision; if none exists, return status and next step instead of a draft link.
- Use authenticated, access-checked file storage. A public URL in a sheet is not authorization.
- Choose storage provider, migration plan, file size limits, and retention policy before uploads are implemented.

### Procurement and materials

- For applicable trades, track material presentation, selection, client approval where needed, order, expected delivery, and on-site readiness.
- Keep procurement for later trades moving in parallel with current site execution; flag delivery that threatens the next trade start.
- Meeting notes mention a tile/material presentation PDF, Gousic J taking the client to a store, a seven-day buffer, and approximately ten-day tile lead time. Confirm which are steps versus examples/defaults before encoding them.

### Notifications, activity, and AI assistant

- Start with an in-app notification center; Telegram direct messages are not a dependable product channel. Other channels require an explicit decision.
- Notify relevant roles for draft submission, admin/client review, rework, correction upload, approval, hold/resume, material selection/order/delivery risk, blocked work, and meaningful forecast changes.
- Track recipient, event, channel, delivery status, and timestamp. Suppress repeat alerts when state has not changed.
- Maintain an audit history for project lifecycle, membership/access, file/revision, approval, assignment/status, schedule override, and forecast changes.
- Expand the assistant with permission-filtered read-only questions such as “What is blocking this project?”, “Which approvals need my attention?”, “What work is happening in parallel this week?”, and “Show me the latest approved civil drawing.”
- Any future write action from the assistant must go through an explicit UI confirmation and an audit event.

### Migration and legacy behavior

- Inventory current Sheets and bot data, map fields, import reviewed templates/projects to staging, and reconcile discrepancies.
- Pilot the web app alongside only the agreed legacy bot functions. Avoid uncontrolled dual writes; migrate active projects in batches; retire the bot flows only after user acceptance.
- Legacy bot behaviors to review for preservation, redesign, or retirement: four plan choices (new construction, restoration, painting/finishes, interior renovation); client role approval before workflow assignment; client resource uploads; task completion; delay requests with founder approval; issue reporting; member onboarding/TLDRs; founder group-leave closure choices; and founder-to-group message confirmation.
- These Telegram-specific interactions should not be copied literally where the web app provides a clearer project workspace, in-app notifications, and role-checked access.
- JOL India App Store/Mixpanel/release commitments belong to that separate product and are excluded from this construction app.

## Frontend and backend work split

Use this split to assign implementation. The detailed payloads, routes, cookies, and error codes are in [`backend/API.md`](backend/API.md); this section describes the product work each side owns.

### Frontend work

#### V1 screens and interactions

1. **Founder sign-in:** password form, submit/loading state, invalid-password feedback, and expired-session handling. Call `POST /api/founder/login`; keep browser requests same-origin so the HTTP-only session cookie is sent.
2. **Project list/portfolio:** show the founder's projects, select a project, and provide a clear empty state and create-project action. Load from `GET /api/founder/projects`.
3. **Create project group:** form for project name and client name, with optional location, current phase, status, recent task, and next milestone. Submit to `POST /api/founder/projects`.
4. **Project overview:** show only saved status, phase, latest task, next milestone, team, and project assistant status. Do not present invented completion percentages or dates.
5. **Member management:** form for name, designation, and role; display saved members in the project. Use `POST /api/founder/projects/:projectId/members`.
6. **Project facts editor:** let the founder update client-safe phase/status/task/milestone/blocker values. Explain that these facts are what the assistant uses. Use `PATCH /api/founder/projects/:projectId`.
7. **Private-link sharing:** request a link, show it once with a copy action, explain that the first person to open it claims access, and explain how replacement revokes the old link. Use `POST /api/founder/projects/:projectId/invite`.
8. **Founder transcript:** show client questions and assistant answers; tell the client in their chat that the founder can review it. Load from `GET /api/founder/projects/:projectId/conversation`.
9. **Client link page:** read the token from `/c/:token`, call `POST /api/client/claim`, and show the right project snapshot. No client registration, email field, or password screen.
10. **Client assistant:** suggested prompts for project status, current phase, and recent task; submit free text to `POST /api/client/chat`; retain/view prior Q&A via `GET /api/client/conversation`.
11. **Client trust and error states:** explain one-browser claiming and founder transcript visibility; clearly handle invalid/replaced links, already-claimed links, missing project facts, unavailable assistant, and question limits.
12. **Responsive and accessible behavior:** make the founder workspace and client chat usable on mobile; use labels, focus states, keyboard navigation, readable validation/errors, and loading/empty states.

#### Later frontend screens

- Portfolio filters and operational indicators for approvals, parallel work, blockers, overdue tasks, procurement risk, milestones, and forecast dates.
- Project setup steps for workflow version, team/audience assignment, stage/task generation, and schedule-impact review before applying project-specific overrides.
- Timeline/board and task details showing dependencies, ready/blocked states, task status, forecast/planned/actual dates, gate status, and delay impact.
- Stage folders and revision history with audience-specific file lists; draft review, correction, rework, hold/resume, and approved-file states.
- Procurement steps and delivery/readiness risk.
- In-app notification center and activity timeline.
- Read-only assistant surfaces for permission-filtered project questions and approved-file lookup. Any future write action needs an explicit confirmation screen.

### Backend work

#### V1 API and behavior

1. **Founder session:** validate `FOUNDER_PASSWORD`, issue and expire an HTTP-only founder cookie, rate-limit failed sign-in attempts, and protect every founder API route.
2. **Project groups:** validate project fields, persist project facts, return stable IDs, and expose only the founder's projects to the founder session.
3. **Member metadata:** validate name/designation/role, persist members under the correct project, and keep the roster out of every client response.
4. **Client-safe facts:** validate and persist phase, status, recent task, next milestone, and blocker; keep client snapshots limited to fields allowed for that client.
5. **Single-claim invites:** generate a cryptographically random link token, persist only its hash, atomically allow only the first claim, issue a browser-bound client cookie, and invalidate old invite/session on replacement.
6. **Client project access:** derive project access from the client session on every request; never trust a project ID supplied by the client browser.
7. **Assistant responses:** constrain the prompt to that project's client-safe facts, use `store: false`, limit question length/rate, avoid unsupported claims, and return a factual fallback when generated AI is unavailable.
8. **Transcript:** persist each question/answer pair under the session's project; expose only that project’s transcript to its client session and the authenticated founder.
9. **Audit and errors:** record project creation/update, member additions, link creation/claim/replacement; return consistent JSON errors and status codes.
10. **Operations:** validate required environment settings, require HTTPS `PUBLIC_URL` in production, keep secrets out of source control/logs, and define persistent storage/backups before real customer data is used.

#### Later backend services

- Replace the single-process JSON pilot store with a durable operational database, schema migrations, backups, and recovery. Keep runtime records out of uncontrolled dual writes to Google Sheets.
- Add project membership/user identity and role/audience authorization checks to every API, search result, and file download.
- Import and version approved workflow templates; preserve source sheet/version, reviewer, import date, and changelog.
- Model stages, tasks, multiple dependency edges, durations, approval/material gates, and separate planned/actual/forecast dates.
- Implement graph scheduling, parallel tasks, readiness checks, delay-impact calculation, and explicit authorization/confirmation for schedule overrides.
- Add file metadata and revision relationships, secured object storage, access-checked download links, retention and upload limits.
- Implement admin-first/client-second revision approvals; correction links; rework, hold, and resume state; unlock dependent work only for the approved revision.
- Add procurement state, delivery/readiness risks, notification recipient/event/channel/delivery tracking, and audit history.
- Migrate current Sheet/bot projects and data through staging and reconciliation before production cutover.

### Shared frontend/backend contract

- [`backend/API.md`](backend/API.md) defines endpoint paths, payloads, response fields, session behavior, and errors. Change the contract deliberately and update both sides together.
- Backend authorization is authoritative. Hiding a button or page in the frontend is not access control.
- Client link ownership is bearer-link first-claim, not verified identity. Both sides must describe that limitation consistently.
- The founder's transcript visibility must be disclosed to the client and enforced by the API.
- The assistant is read-only in V1; project/task changes happen through founder UI actions and explicit backend endpoints.
- Unknown fields stay unknown. Frontend uses a “not recorded” state; backend and assistant do not infer values.
- Use one reviewed source for current project facts. Later, Sheets may supply reviewed templates, while the operational database owns live projects, tasks, approvals, access, and activity.
- Both teams should align on role names, project status values, phase values, link replacement behavior, and empty/error states before adding later modules.

## Suggested delivery order

1. **V1 founder + client link:** project setup, team metadata, client-safe facts, one-claim link, Q&A, transcript, basic audit.
2. **Backend foundation:** choose durable operational storage; enforce founder/project/client-session access; stabilize API errors and audit; document backup and link revocation behavior.
3. **Workflow and project workspace:** import a reviewed versioned template; generate graph-based tasks; show timeline/board, dependencies, blockers, and schedule forecasts.
4. **Files and approvals:** stage folders, private revisions, admin-first/client-second review, correction/rework/hold and secure external release.
5. **Procurement and alerts:** parallel procurement/readiness and meaningful in-app notifications.
6. **Pilot and migration:** validate permissions and scheduling with one customer project, reconcile the old data, train users, migrate in batches, and retire agreed Telegram flows.

## Decisions needed before the later releases

1. Workflow sheet semantics: sequence versus grouping, color meaning, and whether the visible rows are complete.
2. Durations: fixed/target/estimated three-month design phase; calendar versus working days; holidays/non-working days.
3. Procurement steps and lead times: default versus example for the seven-day buffer and tile lead time.
4. Approvers and holds: who is assigned to each project; whether Gousic J and Nishant are both approvers; who can hold/resume.
5. Drawing review: whether every revision repeats both review stages; designer notification channel and acknowledgement.
6. Storage: provider, retention, upload size, and migration scope.
7. Trade access: view-only scope, project assignment, and per-trade file boundary.
8. Schedule changes: what happens to in-progress work when dependencies or trade order changes.
9. Client-link recovery: link lifetime, optional expiry, how to handle a wrong claimant, and whether one client may use more than one device.
10. Operational data store, hosting, backup, monitoring, and account recovery for founder access.

## Source context

- Customer requirements stated in this conversation, especially the founder-created group, member roles, one-person client link, and client project assistant.
- `Studio Iksha Construction Workflow Implementation Plan.docx`, previously shared with the project. It captures meeting decisions and explicitly marks unresolved rules.
- Existing Telegram bot README and workflow implementation, which describe the current pilot behavior and legacy migration candidates.
- `frontend/DESIGN.md`, the supplied visual direction for the new web app.
