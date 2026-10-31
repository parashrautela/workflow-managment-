# Workflow web architecture

## Runtime

`backend/server.js` is the stable process entry point. It loads state, constructs
feature routes, applies shared authentication/origin guards, and serves the built
React bundle. Feature modules receive explicit collaborators such as `getState`,
`save`, `audit`, authentication functions, and `callBotBridge`.

The frontend starts in `frontend/src/main.jsx` and selects a shell from `apps/`.
Shells compose feature UI. Feature components and their pure helpers live in
`features/<name>/`; reusable UI primitives remain in `components/ui/`.

## Responsibility map

| Backend feature  | Browser feature          | Responsibility                                         |
| ---------------- | ------------------------ | ------------------------------------------------------ |
| `auth/`          | `auth/`, `people/`       | Google admission, sessions, project access, identities |
| `projects/`      | `projects/`              | Project views, lifecycle, files and directory          |
| `tasks/`         | `timeline/`, `tasks/`    | Task projection, dependencies, schedules, task threads |
| `queries/`       | `queries/`, `assistant/` | Request review, reply context and notifications        |
| `collaboration/` | `collaboration/`         | Internal discussion, resources, attachments            |
| `meetings/`      | `meetings/`              | Meetings and reminder delivery                         |
| `operations/`    | `operations/`            | Work queues, reminders and digests                     |
| `integrations/`  | `telegram/`              | Bot HTTP calls, group setup and media                  |

Folders describe ownership; they are not new services. Backend access checks
remain authoritative regardless of what controls the browser renders.

## Persistence and concurrency

`backend/storage/store.js` initializes PostgreSQL and the attachment table.
Most records live in one JSON state payload, loaded into memory on startup.
The local fallback writes `backend/data.json` through an atomic file replacement.

The server serializes requests and saves cloned state snapshots. It restores
state after a failed operation, with checkpoints for durable external delivery
states. This design assumes one writer. Do not remove the queue or add replicas
without replacing the shared-state persistence and rollback model.

Large histories increase snapshot-copy and whole-record-write costs. A future
relational migration must preserve identities, task mappings, audit history,
delivery records, and restart behavior. That migration is separate from source
organization.

## Telegram boundary

`backend/integrations/bot-bridge.js` owns outbound authenticated bot HTTP calls.
`backend/tasks/task-sync.js` and `task-adapter.js` map operational task records to
the web model. Query intake retains source Telegram IDs and file references.

The companion bot is a separate deployment. HTTP integration tests mock that
service; passing tests do not prove its deployed routes match this application.
In the accompanying local bot checkout, routes for task sync, task notices,
resource content, and other newer operations are not all implemented. Check
the bot version and route contract before release.

## How to change this application

1. Find the matching feature on the backend and frontend.
2. Keep validation, access control, audit and persistence behavior on the server.
3. Add a focused unit test beside the module; extend `backend/tests/` when the
   behavior crosses authentication, persistence or HTTP boundaries.
4. Run `npm run verify` and `npm run format:check`.
5. Rebuild the frontend after UI changes. `frontend/app.js` and `app.css` remain
   generated, tracked deployment artifacts; do not hand-edit them.

The source layout, formatter configuration, and CI belong to this repository.
It must remain installable and verifiable without the parent bot checkout.

## Preserved compatibility

- Process entry: `node backend/server.js`.
- Environment keys and API URLs remain unchanged.
- Data defaults remain `backend/data.json` and its `.files/` directory locally.
- Production state/attachment tables remain unchanged.
- The server still serves the existing frontend bundle URLs.
- Pure browser helper tests remain runnable through Node's test runner.

Historical plans and change records live in `docs/archive/` or their dated
documents. Current setup comes from the README and current API reference.
