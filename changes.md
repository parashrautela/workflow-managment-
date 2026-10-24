# Changes

## 22 October 2026 — Web client review fixes

Implemented the non-Google-sign-in client-review backlog. See [implementation and validation](docs/client-review-implementation-2026-10-22.md) for scope, tests, release order and limitations.

- Telegram discovery recovery, multiple project roles/clients and task eligibility.
- Daily work queues, employee workload filters, supervisor transfer and private morning digest connection/scheduling.
- Spaces, editable standard tasks, sequential placement, branching stage links and reusable plan templates.
- Navigation, validation and concise message/summary cleanup.
- Validation: 84 web tests, 75 bot tests, production web build and bot syntax checks pass.
- Release pending: Railway has paused deploys during an upstream outage. No new production release.

- Final UI follow-up: verified automatic graph fitting and visible nodes after saving a branching connection; retained the library’s native sizing instead of timing workarounds.

## Google sign-in — 22 October 2026

The user explicitly added Google sign-in/Console setup to scope. Implemented verified Google identity, browser-bound single-use nonces, pending founder approval, explicit existing-profile linking, selected project grants, rejected/disabled denial and authenticated founder Google linking. Existing password login remains. Added Google's official verifier, plus compatible fixes for existing Vite/source-map advisories (npm audit: 0 vulnerabilities). Google Cloud branding was prepared and accepted by the user; the approved Web client is being created. See docs/google-sign-in-setup-2026-10-22.md.

- Google setup verification: 92 web tests pass, production build passes, and a disposable browser request was approved into an existing employee profile without duplication. OAuth client creation succeeded; the public ID is staged on the web backend.

- Bot rollout verified healthy: new PR #17 revision is ACTIVE in Railway and its public /health returns HTTP 200 with {ok:true}.
- User approved publishing the factual privacy page required for Google branding. Added /privacy for both Railway and Vercel, linked it from sign-in, and prepared the branding URL. Production Google client ID application was triggered.

### Production deployment and Google configuration complete

- Deployed bot #17 and web #28 successfully; live Google config is enabled through both production hosts.
- Created Google Web client, saved the user-approved privacy/homepage branding, and published Google audience to In production.
- Verified live Employees Google management and Continue with Google button while retaining the existing founder session.
- Awaiting the user's own founder Google account selection for the first live account-link/sign-in check.
- Final automated validation: 167 passing tests (92 web, 75 bot), production build passes, npm audit 0 vulnerabilities.

## Live Google identity check

The real Google sign-in created a Pending request for parashrautela70@gmail.com. A fresh Employees request refresh still shows Pending; founder linkage is not yet confirmed despite the user reporting success. The authenticated founder tab is Chrome 699941509, with Link my founder Google account expanded. The public welcome-page Google button creates a staff request; use the separate authenticated founder-link flow to grant founder access. Explicit action-time authorization or the user completing that flow is pending. Do not approve it as a new employee as a substitute.

## Google founder sign-in completed — 22 October 2026

- User explicitly approved linking parashrautela70@gmail.com as founder at action time. Completed the authenticated Employees → Link my founder Google account flow.
- Live UI confirmed “Founder Google sign-in linked: parashrautela70@gmail.com” and no pending Google access requests. Existing employee count remained 3; no duplicate staff profile was created.
- Signed out, then completed a fresh real Google sign-in without entering the founder key. The founder workspace opened, and Employees confirmed the linked identity.
- An initial browser challenge had expired while multiple app tabs were open; Try again issued a fresh challenge and sign-in succeeded. No change to production code was needed.
- Saved verification screenshot: /private/tmp/iksha-google-founder-verified.png. Google Cloud is In production, privacy page is live, both backend releases are ACTIVE.
- This supersedes the pending founder-link checkpoint above. Remaining live acceptance checks concern personal Telegram digests and native Telegram command interactions, not Google setup.

## Consistent dropdowns and expandable cards — 23 October 2026

User requested consistent styling for all dropdowns. Added shared controls.css for plain selects, NativeSelect, and dialog controls: matching heights, sage borders, white backgrounds, chevrons, hover/focus/disabled states, and a styled scrollable option card where the browser supports customizable selects. Browsers without support retain the native option picker. Mobile controls use 44px targets and 16px text.

Expandable sections (supervisor replacement, digest settings, Google founder link, project spaces, stage connections, plan templates, default stage options, and task resources) share whole-row headers, right-aligned rotating chevrons, open-state dividers and keyboard focus. Removed NativeSelect's width-constraining wrapper and duplicate icon so width/flex classes apply directly to the select. No behavior, permissions or records changed.

Validation: production build and git diff --check passed. Local browser verified option-card appearance, ArrowDown/Enter selection, expandable card body layout, and Add stage dialog select sizing. Saved screenshots /private/tmp/iksha-dropdown-menu-updated.png and /private/tmp/iksha-dropdown-cards-updated.png. Physical mobile/older-browser picker rendering has not been tested. Publication pending.

### Dropdown release verified

PR https://github.com/parashrautela/workflow-managment-/pull/29 merged. Production serves the shared dropdown stylesheet; live browser verified the styled Person option card and expandable supervisor card in the existing founder Google session. Proof: /private/tmp/iksha-live-dropdown-update.png and /private/tmp/iksha-live-disclosure-update.png. No production records were edited during UI checks.

## Google-only team access — 23 October 2026

User confirmed equal founder powers, immediate access for pre-added staff emails limited to assigned projects, and adding the second founder later. Implemented Google-only login in UI and API, removed password creation/reset and Telegram-generated web passwords, added explicit email pre-approval, unknown-account role/project review, equal founder invitation/promotion/removal and atomic role transfer. Last claimed founder is protected. Existing Google founder identity remains approved; migration removes old password hashes/key sessions and retains project/profile history. No real second founder or employee has been added for this release.

Frontend browser verified equal-founder panel and successful employee pre-approval in disposable local data. Automated verification covers real local RSA verification, forged/wrong tokens, nonce replay/concurrent use, email authority and exact matching, duplicate prevention, assigned-project privacy, role/session revocation, founder equality, unclaimed-successor guard, transfer and restart. All 96 web tests (including final duplicate-email checks), production build and whitespace checks passed. Source branch codex/google-only-team-access. See work/production-web/docs/google-sign-in-setup-2026-10-22.md for current setup and migration behavior. Production publication pending.

### Google-only release verified live

PR https://github.com/parashrautela/workflow-managment-/pull/30 merged as d0007331ce14a6a001a1b42f57280fa7a611dfbe. Vercel serves the new UI and the production API returns HTTP 410 for the former founder password login. Existing Google founder session survived the migration. A fresh real Google sign-out/sign-in as parashrautela70@gmail.com opened the founder workspace successfully. Live Employees → Founders shows Parash as connected, the last-founder removal button disabled, and the add-founder form ready. Existing counts remain 15 projects / 3 employee profiles. No real employee or second founder was created during verification.

Existing staff such as Ravi/Nishank need their exact Google sign-in email saved using Edit on their existing profile; this pre-approves the same employee ID and avoids duplicates. The second founder can be added later by name/email. Founder role transfer/removal and new-staff access were verified with isolated signed-token tests and disposable UI data; the second founder's real account and physical mobile remain untested. All 96 web tests and production build passed. Screenshots: /private/tmp/iksha-google-only-login-live.png and /private/tmp/iksha-google-only-founders-live.png.


## 2026-10-23 — project communication and meetings

User authorized the complete new transcript plan. Implementation underway; scope and acceptance are in work/production-web/docs/project-communication-plan-2026-10-23.md. Preserve existing profiles and project history. No real notification sends during development.


## 2026-10-24 — communication and meetings implementation complete

Implemented the six-part transcript plan: founder-only task mutations with project-wide staff reading/discussion; separate durable image/PDF attachments and reviewed Telegram sharing with selected tags; predecessor resource handoff; hold/resume queries and compact history with consistent unattended counts; task-linked meetings, IST reminders, attendee selection, edit/cancel and delivery history; internal project chat directory, city-grouped supervisor project selection, simplified client/location/spaces details, scalable task filters and an editable built-in Purchase template. Existing identities and history are retained. Removed the superseded standalone ProjectSpaces editor.

Verification: 107 web tests and 77 bot tests pass (184 total); web production build, bot syntax and whitespace checks pass. Browser demo used 120 tasks in a fake project, verified internal posting, reviewed sharing through a local mock bridge, hold removing the unattended query, meeting creation/delivery status, purchase preview/apply, details fields and city grouping. File signature, binary persistence and access revocation are covered by HTTP tests. The browser file-picker check outlasted its disposable session and is not counted as passed. No real notifications, staff changes or production records were used.

Publication pending. Ship the bot before the web app. New attachment bytes use an additive PostgreSQL table, separate from the workspace snapshot; local development uses the data file's adjacent .files directory. Real PostgreSQL deployment, native mobile and Telegram delivery acceptance remain. Bot calls/missed calls remain outside this release as agreed in the plan.


## 2026-10-24 — review branches published

Web implementation: 54eda04 on codex/project-communication-meetings, draft PR https://github.com/parashrautela/workflow-managment-/pull/31. Companion bot: 3f8c226 on codex/task-sharing-bridge, draft PR https://github.com/parashrautela/telegrambot/pull/18. Both are pushed and attached to this chat. Main/production remain unchanged. Deployment order is bot #18, then web #31. Final verification is 107 web tests + 77 bot tests (184 total), frontend build, bot syntax and whitespace checks. The final added safeguard excludes disabled/departed attendees even during grouped fallback. Real Telegram delivery, deployed PostgreSQL and physical mobile acceptance remain pending.


## 2026-10-24 — site admin personal reminders

Focused reminder fix; calling remains excluded. Fixed the daily sender overlooking a saved Telegram Start connection when the employee profile is created afterwards. Employee status, settings and delivery now recognize both saved connection records and legacy employee connection timestamps. Future work checks forecast, current and planned dates.

Added Actions needed → Morning digest settings controls to get/copy the bot link, show active staff connection status, preview one person's current task list and explicitly send today's real list before the scheduled time. Manual and automatic sends share the same daily delivery record; duplicate and uncertain sends are blocked. Send checkpoints preserve the attempt if persistence fails after Telegram delivery. No web login is required for the recipient.

Verification: 112 backend/frontend tests pass, production build, syntax and whitespace checks pass. Disposable browser demo verified copying the link, connected/waiting states, personal preview, mocked delivery history and disabled repeat send. No real staff received messages. Live acceptance requires choosing a site admin, their pressing Start, deployment and one confirmed delivery. These changes currently build on pending web PR #31; existing bot Start and personal-send endpoints are reused.


## 2026-10-25 — restore revoked employee access

User requested a way to reactivate an existing revoked employee so the same Telegram account can be assigned Site Supervisor/Site Admin in the new test project. Added a founder-only Restore access button on revoked employee cards with an explicit confirmation dialog. POST /api/founder/employees/:id/enable reactivates the same employee; approved Google access and retained project memberships become available again. It preserves Telegram identity/Start connection and profile history, leaves Google approval status unchanged, does not resurrect revoked sessions or cleared task assignments, and records employee_enabled. Repeated restore requests are idempotent. Onboarding errors now direct founders to Employees for recovery.

Verification: 113 backend/frontend tests pass; production build, syntax and whitespace checks pass. New HTTP test reproduces the disabled Telegram assignment error, restores the account, confirms role assignment succeeds, checks the same employee ID/count and Telegram connection, fresh Google sign-in, old-session denial, non-founder denial, cleared assignments, restart persistence and audit entry. Disposable browser check confirmed the revoked card button, confirmation, refreshed active card and connected Telegram indicator. Screenshots: /private/tmp/iksha-restore-access-dialog.png and /private/tmp/iksha-restored-employee-demo.png. No real employee was reactivated and no real reminder was sent. Publication/deployment status must be checked separately.
