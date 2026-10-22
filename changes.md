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
