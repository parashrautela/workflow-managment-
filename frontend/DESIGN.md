# Studio Iksha workspace design

The approved workspace preview defines the visual direction for the production
web app. Use the shared variables in `src/index.css` and rules in `src/iksha.css`.

| Token   | Value   | Use                       |
| ------- | ------- | ------------------------- |
| Canvas  | #fafbf7 | Main workspace            |
| Sidebar | #f1f3ed | Project navigation        |
| Surface | #ffffff | Cards and inputs          |
| Ink     | #273c36 | Primary text              |
| Muted   | #6e7c6c | Supporting text           |
| Accent  | #315e4c | Actions and selected tabs |
| Border  | #e1e6db | Dividers and cards        |

Use Georgia for project and page headings and system sans-serif for controls
and body text. Keep borders light, shadows minimal, controls compact, and
metadata readable. Stage blocks use green, lavender, blue, peach, and ochre.
Colours identify stages; status labels remain explicit.

Use the existing founder and employee authentication and production APIs.
The timeline reads saved source dates, stage dates and task deadlines; it opens
the existing task thread for editing. Do not invent task dates or send hourly
schedule fields to a backend that accepts only date-only deadlines. Stage date
fallbacks represent the containing plan; a deadline-only item is a one-day
marker. Calendar dates retain their day across browser timezones.

The live frontend is published to the existing Vercel web app; `/api` routes to
the existing Railway service. `/employee` and `/c/:token` use this same host.
Presentation mode is removed. Preserve review and explicit reply publishing
controls, access checks, and real Telegram/Sheets synchronization behavior.
