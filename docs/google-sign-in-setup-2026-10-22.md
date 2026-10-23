# Google sign-in setup — 22 October 2026

## Google Cloud

Use the existing `telegram-not-shii` project. App name: Studio Iksha. Audience: External. The user approved `parashrautela70@gmail.com` for support/developer contact and accepted Google's API user-data policy personally.

Web OAuth client: **Studio Iksha Web**. Authorized JavaScript origins:

- `https://workflow-managment-ebon.vercel.app`
- `http://localhost:4173`

The implementation uses Google Identity Services popup sign-in with server verification through Google's official `google-auth-library`. No redirect URI, Google client secret, offline token or Drive/Sheets scope is needed for sign-in. Set the public web client ID as `GOOGLE_CLIENT_ID` on the web backend service; config is supplied to the frontend by `/api/auth/google/config`.

## Current access flow — 23 October 2026

Login is Google-only for founders and employees. Password login/reset and the old self-link founder flow return HTTP 410. Startup removes password hashes and legacy sessions; existing approved Google identities and their sessions, projects and work history are retained.

1. Existing approved founders enter the founder workspace. All founders have equal control; there is no separate Owner role.
2. Employees → Google sign-in & team access → Founders lets any founder pre-approve another founder by exact name/email, promote a connected employee or reviewed request, remove a founder role, or transfer their own role to another person who has already signed in.
3. At least one approved founder with a claimed Google identity must remain. An unclaimed invitation cannot be the only successor. Role removal ends sessions immediately and retains assigned-project employee access; transfer does the same to the previous founder. Founder actions are audited.
4. Add employee requires the exact Google sign-in email and first project. A Gmail or Google Workspace identity can claim this reservation once, with no approval wait; later logins use the stable Google subject. Email comparison is trimmed/lowercased; Gmail dots/plus aliases are not expanded. No invitation email is sent automatically.
5. Unknown identities get a Pending request, no session and no project access. Founders assign an existing/new employee profile, designation and projects, or explicitly grant founder access/reject. The visible panel refreshes every 30 seconds and has a manual refresh button.
6. Existing Telegram-created profiles without a Google login email remain intact. Edit that existing employee to add their email instead of creating a duplicate. Changing a staff login email revokes the old identity and sessions. Existing linked founder accounts remain founders; founders' login emails cannot be changed through employee editing.

For a fresh installation only, INITIAL_FOUNDER_EMAIL can pre-approve the first founder’s Gmail/Google Workspace account. It is ignored once an approved founder exists. Production requires GOOGLE_CLIENT_ID. The support address itself grants no access, and the implementation does not hardcode an administrator email.

## Security and validation

Google’s official library verifies signature, issuer, exact audience, expiry, verified email and browser-bound nonce. Only one callback can consume a challenge. Google subject is the identity after first claim. Email reservations auto-claim only when Google is authoritative: Gmail, or verified email with a hosted-domain claim. A third-party email on a Google account goes to explicit identity review instead. Reference: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token

A Google login clears the browser’s previous founder/employee sessions, including when the new account is Pending/Rejected. Each authenticated request checks the account’s current approved role and active employee profile. Duplicate emails cannot silently move access to another profile. Tests use local RSA signatures and mock Google public certificates; no Google account or live project is modified by automated tests.

## Historical rollout record

The checkpoints below describe the earlier password-compatible rollout and are superseded by the current access flow above.

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
