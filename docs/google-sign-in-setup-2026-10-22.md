# Google sign-in setup — 22 October 2026

## Google Cloud

Use the existing `telegram-not-shii` project. App name: Studio Iksha. Audience: External. The user approved `parashrautela70@gmail.com` for support/developer contact and accepted Google's API user-data policy personally.

Web OAuth client: **Studio Iksha Web**. Authorized JavaScript origins:

- `https://workflow-managment-ebon.vercel.app`
- `http://localhost:4173`

The implementation uses Google Identity Services popup sign-in with server verification through Google's official `google-auth-library`. No redirect URI, Google client secret, offline token or Drive/Sheets scope is needed for sign-in. Set the public web client ID as `GOOGLE_CLIENT_ID` on the web backend service; config is supplied to the frontend by `/api/auth/google/config`.

## Access flow

1. Team members choose Continue with Google on either sign-in page.
2. A first sign-in creates one Pending request and no workspace session/project access.
3. Founder opens Employees → Google sign-in & access requests, links an existing staff profile or creates one, chooses projects/role, then approves or rejects.
4. Approved staff sign in again and see their granted projects. Disabled accounts are denied. Rejecting a Google identity revokes its Google sessions.
5. To enable founder Google login, first sign in with the existing founder key, open Employees → Link my founder Google account, and choose the founder's own Google account. Linking requires the same authenticated founder session. Later sign-ins with that identity enter the founder workspace. Support email alone grants no founder privileges.

Existing password login remains available. Google-only staff can receive a password through the existing founder reset flow if needed.

## Security and validation

Tokens are verified for Google's signature/issuer, the exact client ID/audience, expiry, verified email, and a browser-bound nonce. Nonces expire after ten minutes, are single-use, and are bound to an HttpOnly SameSite cookie. Google subject IDs identify accounts; email alone never silently merges identities or grants founder access.

Tests use locally signed RSA tokens with mocked Google public certificates. The HTTP test exercises pending requests, restart/reuse, existing-profile linking, scoped project access, rejection/session revocation, legacy login and explicit founder Google linking. A browser check verified approving a disposable request into an existing employee profile without duplication.

User approved publishing the privacy page at `/privacy` and using it in Google branding. The client has been created and its public ID staged/applied on the production web backend. Live popup sign-in and audience publishing remain to verify after the web deployment.

## Production release verified — Google setup

- Bot PR #17 merged as `d3c08db92f8b0dd374000c52731be3b254d26da5`; new revision ACTIVE in Railway; public `/health` returns `{ok:true}`.
- Web PR #28 merged as `8c48c0421ef2dbebc5075d0b0ab54af6cdaa3988`; new revision ACTIVE in Railway and production Vercel serves the new frontend/privacy page.
- Production `/api/auth/google/config` returns HTTP 200 with enabled=true through both Railway and the Vercel API proxy, using the correct public client ID.
- Google branding: Studio Iksha, approved support/contact email, live homepage and approved live `/privacy` URL. Google Audience now explicitly shows **In production**.
- Live founder session was preserved across the release. Employees → Google sign-in & access requests loads, and the real Continue with Google button renders under Link my founder Google account.
- Final human step pending: user chooses their own Google account in that live linking flow; then verify the founder-linked confirmation and a Google sign-in. Do not grant a different account founder access or assume contact-email ownership implies founder authorization.
- Final automated validation: 92 web tests + 75 bot tests = 167 passing tests, production build passes, npm audit reports 0 vulnerabilities. Live personal Telegram digest and native client command acceptance remain separate checks.

## Google founder sign-in completed — 22 October 2026

- User explicitly approved linking parashrautela70@gmail.com as founder at action time. Completed the authenticated Employees → Link my founder Google account flow.
- Live UI confirmed “Founder Google sign-in linked: parashrautela70@gmail.com” and no pending Google access requests. Existing employee count remained 3; no duplicate staff profile was created.
- Signed out, then completed a fresh real Google sign-in without entering the founder key. The founder workspace opened, and Employees confirmed the linked identity.
- An initial browser challenge had expired while multiple app tabs were open; Try again issued a fresh challenge and sign-in succeeded. No change to production code was needed.
- Saved verification screenshot: /private/tmp/iksha-google-founder-verified.png. Google Cloud is In production, privacy page is live, both backend releases are ACTIVE.
- This supersedes the pending founder-link checkpoint above. Remaining live acceptance checks concern personal Telegram digests and native Telegram command interactions, not Google setup.
