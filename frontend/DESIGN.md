# Studio Iksha workspace design

The workspace follows Sol's product look: a white page sheet floating on a faint
lavender canvas, Roboto Slab headings, Geist body text, cool neutral ink with a
near-black main action, light borders, and hairline shadows only on raised controls
(the active sidebar row, the chosen segmented option, outline buttons, chips). Every value below is a token in `src/styles/index.css`. Use the
token. If a value is missing, add it there rather than writing a one-off.

The Tailwind theme is cleared down to these scales, so an off-system class such
as `text-lg`, `font-bold`, `rounded-3xl` or `text-amber-500` generates no CSS.

## Type

Sizes are 12, 14, 16, 20, 24 and 32px, and 14px is the default. Nothing is under
12px apart from the logo and the sign-in hero. Weights are 400, 500 and 600 only.

Each role sets size, line height and weight together. Use `type-<role>` in JSX and
`font: var(--type-<role>)` in CSS.

| Role            | Size       | Line height | Weight | Use                                  |
| --------------- | ---------- | ----------- | ------ | ------------------------------------ |
| `heading-32`    | 32         | 1.2         | 400    | Page title, one per screen (`h1`)    |
| `heading-24`    | 24         | 1.2         | 400    | Section, dialog, sheet, drawer title |
| `heading-20`    | 20         | 1.2         | 400    | Card-level heading                   |
| `heading-16`    | 16         | 1.2         | 600    | Card title, in Geist                 |
| `label-14`      | 14         | 1.4         | 400    | Single line: fields, rows            |
| `label-12`      | 12         | 1.4         | 400    | Single line: metadata, captions      |
| `copy-16/14/12` | 16, 14, 12 | 1.5         | 400    | Multi-line text                      |
| `button-14/12`  | 14, 12     | 1.4         | 500    | Buttons                              |

`label-14` and `label-12` have `-strong` versions at weight 500. `text-xs` and
`text-sm` carry the label-12 and copy-14 line heights, so both stay on the system.

Panel, dialog and drawer titles use `heading-24`. They never outrank the page
title. A screen embedded inside another page uses `h2`: `MeetingsView` and
`ProjectConversations` take an `embedded` prop for this.

## Spacing

Padding, margins and gaps are 4, 8, 12, 16, 24 or 32px, as `--space-<n>` in CSS and
the matching Tailwind steps in JSX: `1`, `2`, `3`, `4`, `6` and `8`.

| Token           | Value | Use                   |
| --------------- | ----- | --------------------- |
| `--gap-list`    | 12px  | Between list items    |
| `--gap-grid`    | 16px  | Between grid cards    |
| `--gap-section` | 24px  | Between page sections |

## Corners

All corners derive from `--radius`.

| Token / class                          | Value | Use                                 |
| -------------------------------------- | ----- | ----------------------------------- |
| `--radius`, `rounded-md`, `rounded-lg` | 8px   | Controls, buttons, small tiles      |
| `--radius-card`, `rounded-xl`          | 12px  | Cards and bordered boxes            |
| `--radius-panel`, `rounded-2xl`        | 16px  | Dialogs and panels                  |
| `--radius-chip`, `rounded-full`        | full  | Chips, avatars, dots, progress bars |

Side sheets touch the screen edge, so they have square corners.

## Colour

| Token                    | Value   | Job                               |
| ------------------------ | ------- | --------------------------------- |
| `--background`           | #f7f7ff | Canvas and sidebar                |
| `--card`                 | #ffffff | Page sheet, cards and inputs      |
| `--subtle`               | #f9f9fb | Inset strips, wells, pill tracks  |
| `--muted`                | #f4f4f8 | Quiet panels                      |
| `--secondary`            | #f1f1f6 | Quiet chips and tiles             |
| `--foreground`           | #2b2a36 | Primary text                      |
| `--secondary-foreground` | #545361 | Text on `--secondary`             |
| `--muted-foreground`     | #6e6d7c | Supporting text, one value only   |
| `--border`               | #e4e4ec | Dividers and cards                |
| `--border-strong`        | #d4d4de | Dashed outlines and hover borders |
| `--input`                | #e4e4ec | Form control borders              |

The accent is near-black ink and belongs to actions and selection: `--primary`
#1a1825 is the fill, focus line and active tab; `--accent` #f4f4f8 is the tint
behind hovered and selected rows. Muted text is #6e6d7c rather than Sol's lighter
grey so it still reaches 4.5:1 on every surface.

Depth comes from three shadows, never from heavier borders: `--shadow-raised` for
the active sidebar row, `--shadow-pill` for the chosen segmented option, outline
buttons and status chips, and `--shadow-float` for floating panels.

Focus and selection are one thin line. A focused field turns its 1px border to ink,
any other control gets a 1px line just inside its edge, and a selected item keeps
its ink border. Never add a ring, glow or halo around an element.

Each status has one colour with four steps, and each step has one job.

| Status    | Text (`text-x`) | Tint (`bg-x-bg`) | Outline (`border-x-border`) | Fill (`bg-x-fill`) |
| --------- | --------------- | ---------------- | --------------------------- | ------------------ |
| `overdue` | #a8263a         | #fbeeee          | #efc9cd                     | #b62c41            |
| `warning` | #7f5206         | #fbf2df          | #ecd6a6                     | #a1670f            |
| `success` | #1f6b48         | #e8f3ec          | #bfdccb                     | #2b7a55            |
| `info`    | #2a5f94         | #e8f0f8          | #c2d6ea                     | #3a72a8            |

Every text step reaches at least 5.5:1 on every surface above and on its own tint.
White text reaches 4.5:1 on every fill. `--destructive` is the overdue fill.

Status colours carry meaning. Do not use them to decorate icons or tabs.

Stage colours are categorical: they tell stages apart, so they are the one palette
outside the status tokens. Stage blocks use green, lavender, blue, peach, ochre,
teal, rose and stone, set as `--stage-bg`, `--stage-border` and `--stage-ink` on
`.iksha-stage.color-<n>` in `src/styles/iksha.css`. Each ink reaches 4.5:1 on its
own tint. Status labels remain explicit.

The app has no dark theme. `dark:` classes only apply under an explicit `.dark`
ancestor, so the app looks the same on light-mode and dark-mode devices.

## Shared parts

Build screens from these. Do not restyle them per screen: if one needs something new, change the
part so every screen gets it.

### Buttons

`components/ui/button.jsx`. One shape, 8px. Two heights on desktop, 36px by default and 32px with
`size="sm"`. All sizes are 44px on phones, which the component handles.

| Variant               | When                                                               |
| --------------------- | ------------------------------------------------------------------ |
| `default`             | The one main action in an area                                     |
| `outline`             | Secondary actions, and Cancel                                      |
| `ghost`               | Quiet actions in dense rows and toolbars                           |
| `destructive`         | Final confirmation of something destructive, inside a dialog       |
| `destructive-outline` | Starts a destructive action from a page, such as Abandon or Reject |
| `destructive-ghost`   | A quiet destructive action repeated in rows, such as Remove        |
| `link`                | Inline text actions                                                |

Do not pass height, shape, text size or colour through `className`. Width and spacing are fine.

An icon in a button never gets its own margin: the button's gap is the only space between icon and
label (8px, or 6px at `size="sm"`). A leading icon carries its own whitespace, so the icon side is
tighter than the label side: 12px and 16px by default, 10px and 12px at `size="sm"`.

Use `RefreshButton` from `components/ui/refresh-button.jsx` for every Refresh. Its icon spins while
the reload runs, for at least 600ms, so a fast reload still shows that it happened. Icons in buttons
nudge on hover (refresh turns, send lifts, arrows step forward), set once in `styles/controls.css`.

Labels are verbs that say what happens: `Send to Telegram`, `Post to team`, `Save note`,
`Review and send`. Use sentence case on every button, label, tab and dialog title. Keep capitals
only for proper nouns such as Telegram, Google and Drive.

### Dialog footers

Use `DialogFooter`. Cancel sits left of the primary action, right aligned, at every width. A
destructive action that is not the point of the dialog can sit far left with `mr-auto`.

### Status

`lib/taskStatus.js` is the only place that decides what a task's status is, and `StatusChip` in
`components/ui/status-chip.jsx` is the only way to show it. It reads the task and never changes it,
so call `taskStatus(task, { stage })`, or pass `schedule` if you already have the dates.

The chip is a white pill with a hairline shadow; its tone is a small dot in the tone's fill colour,
so a long list of late work stays calm. Pass `action` when the item waits on the reader and its row
opens it: the chip then ends in a chevron.

| Status             | Tone    | Meaning                                                                                       |
| ------------------ | ------- | --------------------------------------------------------------------------------------------- |
| `Overdue · 27d`    | overdue | Open work past its deadline                                                                   |
| `Approval pending` | warning | Pending approval, review, requested delay, or a started founder-built task named for approval |
| `Blocked`          | warning | Stored as Blocked, or an issue was reported                                                   |
| `On hold`          | neutral | Stored as On hold on the task or in the sheet                                                 |
| `In progress`      | info    | Stored as In progress, or the scheduled start has passed                                      |
| `Upcoming`         | neutral | The scheduled start is still ahead                                                            |
| `Open`             | neutral | Open with no dates                                                                            |
| `Done`             | success | Completed                                                                                     |
| `Cancelled`        | neutral | Cancelled                                                                                     |

Approval pending, Blocked and On hold keep their word when late and add `· overdue`, turning the
overdue tone. Project status uses the same chip with `PROJECT_STATUS_TONES`.

### Dates

`lib/dates.js` holds every date format, and nothing else calls `toLocaleString`. Use
`components/ui/time.jsx` to show one, which adds the exact time on hover.

| Format     | Reads like          | When                                 |
| ---------- | ------------------- | ------------------------------------ |
| `relative` | 2h, Yesterday, 3d   | Lists and message times              |
| `date`     | 5 Oct 2026          | Fixed moments                        |
| `calendar` | 5 Oct 2026          | Deadlines and start dates            |
| `short`    | 5 Oct               | Tight spaces where the year is clear |
| `datetime` | 5 Oct 2026, 2:30 pm | Exact moments                        |
| `time`     | 2:30 pm             | A time on a known day                |

Keep the three kinds of date apart. An instant shows in the reader's time zone. A calendar date
such as `2026-10-05` keeps its day everywhere. A timeline day is a UTC-midnight number, so pass
`{ timeZone: 'UTC' }`. Use `todayInput()` to fill a date input, because `toISOString` gives
yesterday in the early morning in India.

### Filters

Use `SegmentedControl` from `components/ui/segmented-control.jsx` for one choice from a short,
visible set: project status, role, timeline zoom, list or graph, a composer mode. Use the shared
select when the options are long or come from data, such as people, projects and stages.

When both sit in one filter row, as on Actions needed, give the selects `variant="pill"` and
`size="sm"` so they match the segmented pills: status pills on the left, pickers on the right.

### Empty states

Use `Empty` from `components/ui/empty.jsx`, with an icon, title, description and optional action.

- `first-use`: nothing exists yet. Say what will appear and how it gets here.
- `no-results`: things exist but a search or filter hides them. Offer a way back, such as Clear
  filters.

Only offer actions the app can really do. Files has no upload, so its empty state explains that
files come from the Telegram group.

### Cards

Use `Card` from `components/ui/card.jsx`, or the `card-box` class for anything else that is
card-shaped. Both give 12px corners and 16px padding. `card-box` sets no background, so add one
such as `bg-card` or a status tint.

Rows that are options in a list keep their tighter padding, and so do chat bubbles. Whole panels
such as the inbox shell and the graph use panel corners.

## Timeline and platform

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

## Sign-in

One card holds the form beside a panel of glass arched windows, which catch the light as the pointer
moves. The artwork is decoration in `features/auth/WorkspaceAccess.jsx`, so the form never depends on
animation, and reduced motion shows a still image. Sign-in is Google only, so the screen has no email
or password fields. Its colours are local to `features/auth/workspace-access.css` because they describe
artwork, not interface states.
