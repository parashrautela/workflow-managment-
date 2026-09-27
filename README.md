# Workflow Management Tool 🚀

A modern, intuitive workflow and project management platform designed to streamline task tracking, automation, and team collaboration.

## 📋 Overview

The **Workflow Management Tool** provides teams with a clean, distraction-free environment to organize, automate, and monitor their day-to-day operations and project lifecycles. Built with modern design principles inspired by calm, paper-like productivity systems.

## ✨ Features

- **Project workspaces**: Track status, phase, recent work, milestones, team members, and update history.
- **Client portal**: Share a private link for project questions and assistant replies based on recorded facts.
- **Conversation review**: Founders can review the client Q&A transcript in Messages.
- **Installable app**: PWA metadata lets supported browsers open the site as a standalone app.
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
   Open `.env` and set `FOUNDER_PASSWORD` to a private password. Add `OPENAI_API_KEY` optionally for AI-powered Q&A responses. Add `DATABASE_URL` to use PostgreSQL; when running locally without it, the app stores data in `backend/data.json`.

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
