---
trigger: always_on
description: Frontend source ownership and generated asset conventions.
---

# Frontend conventions

- Application shells live in `frontend/src/apps/`.
- Feature UI, feature helpers and their tests live in `frontend/src/features/`.
- Shared UI primitives live in `frontend/src/components/ui/`.
- Generic browser helpers live in `frontend/src/lib/`.
- Global styles live in `frontend/src/styles/`; feature styles stay with their feature.
- Follow `frontend/DESIGN.md` for design tokens and UI conventions.
- Edit source files and run `npm run build`; do not hand-edit generated `frontend/app.js` or `frontend/app.css`.
- Backend source lives in `backend/`; this repository uses one root package and lockfile for both sides.
