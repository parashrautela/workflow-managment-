# Context

This web branch implements the client-review backlog including Google sign-in, which the user subsequently authorized. Source changes are complete and tested locally.

Read [the implementation report](docs/client-review-implementation-2026-10-22.md) and [changes.md](changes.md) before continuing. Preserve legacy data and existing authentication. The companion repositories are `parashrautela/telegrambot` and `parashrautela/workflow-managment-`.

Release the bot before the web app because the web uses new bridge endpoints. Railway currently reports an upstream issue and paused deploys, so deployment and real Telegram acceptance remain outstanding. Do not replace production environment settings with local `.env` values.

Google sign-in is now authorized and implemented; the earlier exclusion is superseded. Existing silent Telegram members need `/join` or verified ID recovery; complete enumeration is not available through the Bot API. Digest delivery requires each recipient to press Start, and uncertain sends must not be automatically retried.

## Review and release handoff

- Web draft PR: https://github.com/parashrautela/workflow-managment-/pull/28 (implementation head `9b4a7da`; Vercel preview check succeeded).
- Bot draft PR: https://github.com/parashrautela/telegrambot/pull/17 (implementation head `92401e8`).
- Both PRs report clean merge state. No production merge or deployment was made. Railway reports deployments paused during an upstream issue.
- Next release action: deploy the bot, then the web, then perform the real Telegram acceptance checks. Google sign-in remains excluded.

## Google sign-in authorization update

The user now explicitly authorized Google sign-in and Google Cloud Console setup. The earlier Google exclusion is superseded. Implement staff Google identity with founder-controlled approval and project grants, keep existing login methods, and update changes.md/context.md. Console setup and deployment status are being checked.

## Google release configuration

Google OAuth client Studio Iksha Web is created in telegram-not-shii. Public client ID: `988142753322-bsj6k7hadsnrj6lv559l1g1uv6oj7hmh.apps.googleusercontent.com`. Live origin: https://workflow-managment-ebon.vercel.app; local testing: http://localhost:4173. No client secret or redirect URI is used by the popup integration. User personally accepted the Google API user-data policy and explicitly approved client creation.

92 web tests pass, including real RSA-signed token validation and an HTTP admission/session integration test; the build passes. Added Google sign-in documentation. Bot PR #17 is merged (d3c08db); Railway accepted a build, which must become healthy before web cutover. Web backend GOOGLE_CLIENT_ID is staged in Railway (giving-smile project, workflow-managment- service); apply it with the new web release.

## Release checkpoint

Bot PR #17 is now deployed and healthy (d3c08db, ACTIVE; /health OK). User approved the privacy page at https://workflow-managment-ebon.vercel.app/privacy. Source includes the static page and both hosting routes. Web backend GOOGLE_CLIENT_ID was applied using Railway's staged-change Deploy button. Next: merge/deploy web PR #28, verify both hosting releases, finish Google branding privacy URL/audience, and have the user link their founder Google account from the authenticated Employees page.

## Production release verified — Google setup

- Bot PR #17 merged as `d3c08db92f8b0dd374000c52731be3b254d26da5`; new revision ACTIVE in Railway; public `/health` returns `{ok:true}`.
- Web PR #28 merged as `8c48c0421ef2dbebc5075d0b0ab54af6cdaa3988`; new revision ACTIVE in Railway and production Vercel serves the new frontend/privacy page.
- Production `/api/auth/google/config` returns HTTP 200 with enabled=true through both Railway and the Vercel API proxy, using the correct public client ID.
- Google branding: Studio Iksha, approved support/contact email, live homepage and approved live `/privacy` URL. Google Audience now explicitly shows **In production**.
- Live founder session was preserved across the release. Employees → Google sign-in & access requests loads, and the real Continue with Google button renders under Link my founder Google account.
- Final human step pending: user chooses their own Google account in that live linking flow; then verify the founder-linked confirmation and a Google sign-in. Do not grant a different account founder access or assume contact-email ownership implies founder authorization.
- Final automated validation: 92 web tests + 75 bot tests = 167 passing tests, production build passes, npm audit reports 0 vulnerabilities. Live personal Telegram digest and native client command acceptance remain separate checks.

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
