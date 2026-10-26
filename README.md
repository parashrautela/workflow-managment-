# Workflow Management Tool 🚀

A modern, intuitive workflow and project management platform designed to streamline task tracking, automation, and team collaboration.

## 📋 Overview

The **Workflow Management Tool** provides teams with a clean, distraction-free environment to organize, automate, and monitor their day-to-day operations and project lifecycles. Built with modern design principles inspired by calm, paper-like productivity systems.

## ✨ Features

- **Project workspaces**: Track status, phase, recent work, milestones, team members, and update history.
- **Client portal**: Share a private link for project questions and assistant replies based on recorded facts.
- **Conversation review**: Founders can review the client Q&A transcript in Messages.
- **Installable app**: PWA metadata lets supported browsers open the site as a standalone app.
- **Telegram decision inbox**: A conversation view for `/approval` and `/question` requests, with private notes, a separate Telegram reply composer, and completion tracking. Link each project group from its settings panel. The first version shows marked requests, not every group message.
- **Telegram group setup**: A newly discovered group appears immediately as a project needing setup on the founder home screen. Assign member names and roles, then finish its bot workflow setup. The bot announces role assignments in the group.
- **UI system**: Responsive screens built with shadcn/ui components and Tailwind CSS.

## 🛠️ Tech Stack & Design

- **Frontend**: React, Vite, Tailwind CSS v4, and shadcn/ui registry components
- **Figma Board**: [Figma Project Board](https://www.figma.com/board/UWscIC0R0NrqZyKUmmuGEB/Untitled?node-id=0-1&t=EMt7WHN72keLxW68-1)
- **Design Tokens**: Standardized color, spacing, and typography scales (see [frontend/DESIGN.md](frontend/DESIGN.md))
- **Architecture**: Modular and scalable architecture

## 🚀 Getting Started

### Prerequisites

- Node.js (v20.6+ recommended)

### Setup & Run Locally

1. **Clone the repository:**
   ```bash
   git clone https://github.com/parashrautela/workflow-managment-.git
   cd workflow-managment-
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
   Open `.env` and set `GOOGLE_CLIENT_ID` to your Google Web OAuth client ID. On a fresh installation only, set `INITIAL_FOUNDER_EMAIL` to the first founder’s Gmail or Google Workspace email; it is ignored after an approved founder exists. Login is Google-only; passwords and founder keys are not accepted. Register your local origin (for example `http://localhost:3000`) in that OAuth client. Add `OPENAI_API_KEY` optionally for AI-powered Q&A responses. Add `DATABASE_URL` to use PostgreSQL; when running locally without it, the app stores data in `backend/data.json`. For Telegram group setup, set `BOT_BRIDGE_URL` to the Telegram bot service's HTTPS origin and use the same `INTEGRATION_SHARED_SECRET` in both services. The bot needs `WEB_APP_URL` pointed at this app.

3. **Start the development server:**
   ```bash
   npm run dev
   ```
   Or start in production mode with `npm start`.

4. **Access the application:**
   Open [http://localhost:3000](http://localhost:3000) in your browser.

### UI components

The frontend uses shadcn/ui components in `frontend/src/components/ui` with the configuration in `components.json`. To add another component, run `npx shadcn@latest add <component>` from the repository root, then run `npm run build` to refresh `frontend/app.js` and `frontend/app.css`.

## 📄 License

This project is licensed under the MIT License.

### Project communication and meetings

Founders manage work; staff can view every task in their assigned projects and contribute messages, images and PDFs. Use a task's **Post internally** button for team discussion, or review a selected message before sending it to the project Telegram group. Mark measurements or briefs as resources to make them available to dependent tasks.

Use **Hold** on an incoming query to save it on a task while waiting for more information. Held and handled queries remain in history. Open a task to schedule a meeting; the **Meetings** page manages attendees, reminder times, edits and cancellations. **Project chats** lists all accessible internal project conversations.

The Purchase template is under Timeline → Reusable plan templates. Preview and edit its selection, proposal and client order-confirmation steps before adding it. Project details now groups client name, city and spaces in one place.

Deployment order: release the companion bot's task-notice endpoint first, then this web app. The web startup creates the attachment table in the existing PostgreSQL database; preserve that table with normal database backups. No extra dependency, OAuth scope or environment variable is required. Real Telegram delivery and physical mobile acceptance remain deployment checks.


### Queries and group context

The Queries tab includes ordinary Telegram text and supported photo, document,
video, voice, and audio messages from everyone in the linked project group.
Client messages remain queries; other ordinary messages are labelled Group message
and do not add to the pending-query count. Founders can accept them into a task,
including attaching without changing dates or waiting for more context. Explicit question/approval commands
remain available. Only queries from assigned clients can be rejected. A founder
can confirm rejection with the default reply or add optional context.

In Accept → stage → task → action, **Waiting for more context** is the fourth
choice beside Delay, Redo, and Mark complete. It saves the query and its files in
the chosen task discussion while leaving task status and dates unchanged. The
same wording replaces Hold elsewhere. A clarification reply does not clear this
waiting state; Return to review makes it actionable again.

Capture applies to new messages received by the bot after deployment; Telegram
history is not imported. The group bot must receive ordinary group messages
(administrator access or disabled BotFather privacy). Bot and service messages
are excluded. Deploy both bot capture and web changes.
