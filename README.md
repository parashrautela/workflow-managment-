# Studio Iksha Workflow Web

The workflow management web application for founders, staff, and clients. This is
an independent Git repository and deploys separately from the Telegram bot service.

## Start locally

Use Node.js 22.13+ and npm:

```sh
npm ci
cp .env.example .env
npm run build
npm run dev
```

Configure `GOOGLE_CLIENT_ID` and, on a fresh installation,
`INITIAL_FOUNDER_EMAIL` before signing in. Google sign-in is the login mechanism;
legacy password/founder keys are not accepted. Register the local origin in the
Google OAuth client. See [Google sign-in setup](docs/google-sign-in-setup-2026-10-22.md).

Local development uses `backend/data.json` unless `DATABASE_URL` is set.
Production requires PostgreSQL, `NODE_ENV=production`, and an HTTPS `PUBLIC_URL`.
Set optional OpenAI and bot integration variables only for the features you need.
Keep credentials in the ignored `.env` or hosting environment.

The default server address is `http://localhost:3000`. The backend serves the
compiled frontend, so rebuild after source UI changes.

## Verification

```sh
npm run verify
npm run format:check
```

`verify` runs backend/script syntax checks, all backend and browser-helper tests,
and the frontend build. HTTP integration tests copy the backend into temporary
fixtures and mock Google and Telegram. No live production credentials are needed.

| Command                  | Purpose                                                      |
| ------------------------ | ------------------------------------------------------------ |
| `npm start`              | Start the production entry point                             |
| `npm run dev`            | Load `.env` and restart the backend on source changes        |
| `npm run build`          | Compile `frontend/src/` to `frontend/app.js` and `app.css`   |
| `npm test`               | Run all tests                                                |
| `npm run test:decisions` | Run the Telegram decision HTTP integration test              |
| `npm run check`          | Syntax-check backend code and scripts without executing them |
| `npm run format`         | Apply the pinned formatter                                   |

## Source map

```text
backend/
  server.js       Process entry, shared state, route composition
  auth/           Google identity, admission, roles, task access
  projects/       Group migration and project closure
  tasks/          Workflow routes, task adapters, schedules and dependency links
  queries/        Query context, notifications, reply/project assistants
  collaboration/  Messages, uploads and discussion routes
  meetings/       Meetings and reminder delivery
  operations/     Work queues, digests and Telegram connection status
  integrations/   Bot HTTP client and Telegram media loading
  storage/        PostgreSQL and local state persistence
  http/           Request parsing and shared API errors
  tests/          HTTP integration tests and identity fixtures
frontend/src/
  apps/           Founder, employee and client application shells
  features/       Product UI and feature-specific helpers/tests
  components/     Shared UI components and UI primitives
  lib/            Generic HTTP client and styling utility
  styles/         Global design system and application styles
  data/           Generated workflow input
scripts/          Source checks
docs/             Architecture, API, setup and historical notes
```

Unit tests are colocated with their modules. UI and backend features share names
where their responsibilities correspond. Imports use explicit paths; there are
no catch-all barrel exports to hide dependencies.

## Integration and operating constraints

The bot service uses Google Sheets for operational schedules. This app calls it
through `BOT_BRIDGE_URL` with `INTEGRATION_SHARED_SECRET`; request intake arrives
through authenticated `/api/integrations/telegram/*` routes. Confirm the deployed
bot supports the required routes before releasing an integrated feature.

The current state store uses one in-memory state object and a PostgreSQL JSON
record. Run one writer/service instance. Requests are serialized to protect
mutation/rollback behavior. See [architecture](docs/ARCHITECTURE.md) for the
implications and deferred work.

- [Architecture and engineering conventions](docs/ARCHITECTURE.md)
- [API reference](docs/api.md)
- [Product feature history](docs/features.md)
- [Design system](frontend/DESIGN.md)
- [Original product overview](docs/guides/product-overview.md)
