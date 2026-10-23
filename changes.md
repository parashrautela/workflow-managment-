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
