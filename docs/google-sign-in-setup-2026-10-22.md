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

Live Google popup sign-in and production deployment/configuration must be verified after the client and backend environment are ready.
