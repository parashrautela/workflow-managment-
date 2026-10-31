# Web-owned project onboarding verification — 6 October 2026

Local tests passed with isolated fixtures and fake Google/Telegram responses. These are implementation checks; live pilot acceptance is still pending.

- [x] A discovered Telegram project opens with Add members first and inline profile editing. Workspace tabs stay hidden until client/team setup is complete.
- [x] Exactly one client, at least one worker and names/designations for every active observed member are required before starting a plan.
- [x] Assigning Telegram staff connects them to the project's employee workspace. New login details stay visible until acknowledged.
- [x] After setup, choose the project type from the bot's actual Sheets templates. Restoration generated 11 canonical tasks and the web app imported the same tasks in a local end-to-end browser check.
- [x] Bot start retries do not duplicate tasks or announcements. Uncertain Telegram delivery is shown for manual checking rather than automatically resent.
- [x] Files show Pending/Saved status, update automatically and are available only to founders/assigned employees. Download routes require authentication.
- [x] Photo/document uploads preserve actual file bytes, recover existing Drive files and retry failed storage/sync without starving later files (mock tests).
- [x] Existing client query discussion, publish confirmation, private employee access and persistence tests pass.
- [ ] Merge/deploy this web change together with the bot's web-owned-project-flow change.
- [ ] Enable Google Drive API and connect the destination account; the existing bot account reported `accessNotConfigured` during the read-only check.
- [ ] Run the live acceptance checklist in the bot repository's DRIVE_SETUP.md, with a real group, PDF and photo, and record evidence in Notion.

The folder ID is configurable. Changing it redirects future uploads; it does not move previous files or transfer their ownership. Source task IDs are retained during initial workflow import; ongoing task edits in the two backends are not synchronized by this change.

Backend edits in this change implement the user's explicit request for workflow handoff and automatic storage, which supersedes the repository's older frontend-only rule.
