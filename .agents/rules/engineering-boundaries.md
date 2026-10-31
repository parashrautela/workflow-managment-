---
trigger: always_on
description: Feature ownership and behavior preservation during changes.
---

# Engineering boundaries

The owner's request to restructure the entire project supersedes the previous
frontend-only backend lock. Both backend and frontend may be maintained within
the requested scope.

- Use `backend/<feature>/` and `frontend/src/features/<feature>/` for feature code.
- Keep `backend/server.js` as the process entry and route composition point.
- Keep authorization and validation on the server; UI controls are not access checks.
- Preserve API contracts, runtime data locations, audit history and delivery safeguards.
- Keep runtime databases, credentials and real uploads out of source changes.
- Run `npm run verify` and `npm run format:check` before handing over a change.
- Consult `docs/ARCHITECTURE.md` for the single-writer persistence constraint.
