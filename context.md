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
