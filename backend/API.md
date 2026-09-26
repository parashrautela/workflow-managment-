# V1 API contract

Base URL is the same origin that serves the web app. All request and response bodies use JSON. The browser should send requests with same-origin credentials enabled so the session cookies are included.

## Founder session

The founder signs in with the password configured in `FOUNDER_PASSWORD`. The server sets an HTTP-only, SameSite=Strict cookie that expires after eight hours. In production, the cookie is also Secure and the app must use HTTPS. Founder routes return `401` when the session is missing or expired.

### `POST /api/founder/login`

Request:

```json
{ "password": "..." }
```

Success: `200 { "ok": true }` plus the founder session cookie. Wrong password: `401`. Too many attempts from one IP: `429`.

### `POST /api/founder/logout`

Invalidates the current founder session and clears its cookie. Returns `200 { "ok": true }`.

## Founder project operations

All routes below require the founder session.

### `GET /api/founder/projects`

Returns `{ "projects": [...] }`. Each project includes `id`, `name`, `clientName`, `location`, `startDate`, `internalOwnerMemberId`, `internalOwner`, `phase`, `status`, `recentTask`, `nextMilestone`, `blocker`, `members`, and `createdAt`.

### `POST /api/founder/projects`

Creates a project group. Required: `name`, `clientName`. Optional: `location`, `startDate` (`YYYY-MM-DD`), `phase`, `status`, `recentTask`, `nextMilestone`. The founder assigns an internal owner after adding project members.

```json
{
  "name": "Kumar Residence",
  "clientName": "Asha Kumar",
  "location": "Pune",
  "startDate": "2026-10-01",
  "phase": "Design",
  "status": "Setup",
  "recentTask": "",
  "nextMilestone": ""
}
```

Success: `201 { "project": ... }`. Missing required fields: `400`.

### `PATCH /api/founder/projects/:projectId`

Updates the client-facing project facts (`phase`, `status`, `recentTask`, `nextMilestone`, `blocker`), project `startDate`, and `internalOwnerMemberId`. Only supplied fields are changed. `startDate` must use `YYYY-MM-DD`; `internalOwnerMemberId` must belong to an internal member of the same project (or be an empty string to clear it). Each changed field is included in the project-update audit detail. Success: `200 { "project": ... }`.

### `GET /api/founder/projects/:projectId/updates`

Returns up to the latest 50 saved project updates, newest first. Updates are created when a PATCH changes one or more project fields; a no-op PATCH does not create an entry. Each item includes `id`, `projectId`, `actor`, `changes` (field names mapped to `{ old, new }`), and `at` (ISO timestamp). Success: `{ "updates": [...] }`. Missing project: `404`. Existing projects begin with an empty update history; new changes are recorded from deployment onward.

### `POST /api/founder/projects/:projectId/members`

Adds a project member. All fields are required: `name`, `designation`, and `role`.

```json
{ "name": "Rohan Mehta", "designation": "Interior designer", "role": "Designer" }
```

Success: `201 { "member": { "id", "name", "designation", "role" } }`.

### `POST /api/founder/projects/:projectId/invite`

Replaces any existing client invite for this project and revokes the previous client session. Success: `201 { "link": "https://.../c/<token>" }`. The cleartext token is returned once; only its hash is stored. Production link generation requires `PUBLIC_URL` set to the HTTPS app origin.

### `GET /api/founder/projects/:projectId/conversation`

Returns the latest 30 client question-and-answer pairs, newest first:

```json
{ "messages": [{ "projectId": "...", "question": "...", "answer": "...", "at": "..." }] }
```

### `GET /api/founder/activity`

Returns the latest 40 basic audit events: `{ "activity": [...] }`.

## Client link and assistant

The client does not create an account or enter an email. Opening `/c/:token` claims the invite in that browser and sets an HTTP-only, SameSite=Strict cookie that lasts 30 days. The first browser to claim the invite wins. A second browser gets `410`; the founder must create a replacement link if the wrong person claimed it. The mechanism guarantees one claimant, but cannot verify the claimant’s real-world identity.

### `POST /api/client/claim`

Request: `{ "token": "<token from path>" }`.

Success: `200 { "project": { "name", "clientName", "phase", "status", "recentTask", "nextMilestone", "blocker" } }` plus the client session cookie. Invalid or replaced invite: `404`. Already claimed by another browser: `410`.

### `GET /api/client/project`

Returns the same client-safe project snapshot for an active client session. It does not return the team roster or internal project identifiers.

### `GET /api/client/conversation`

Returns up to the latest 30 question-and-answer pairs for this client session’s project. This is the client’s own transcript; the founder can also see it in the founder project view.

### `POST /api/client/chat`

Request: `{ "question": "How is the project going?" }`. Questions must contain 1–1,000 characters. Success: `{ "answer": "..." }`. A session is limited to 30 questions per hour per running server process. The conversation is stored and visible to the founder. Without `OPENAI_API_KEY`, a fact-based fallback answers common project questions. With the key, the server calls the OpenAI Responses API using `OPENAI_MODEL` and `store: false`; it sends the project snapshot and question only.

## Common errors

Errors use `{ "error": "Human-readable message" }`. Relevant status codes are `400` invalid input, `401` missing/invalid session, `404` missing project or invalid invite, `410` invite already claimed by another browser, and `429` rate limit.

## Current storage and runtime notes

V1 stores projects, memberships, invites, sessions, conversations, and audit events in `backend/data.json`. Session identifiers and invite tokens are hashed before storage. The JSON store is suitable only for a single-process pilot; it is not shared between app instances and does not provide database backups or robust concurrent-write guarantees. Client sessions are browser-bound, so opening the invite later in another browser requires the founder to issue a replacement link.
