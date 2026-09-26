# Workflow Management Tool 🚀

A modern, intuitive workflow and project management platform designed to streamline task tracking, automation, and team collaboration.

## 📋 Overview

The **Workflow Management Tool** provides teams with a clean, distraction-free environment to organize, automate, and monitor their day-to-day operations and project lifecycles. Built with modern design principles inspired by calm, paper-like productivity systems.

## ✨ Features

- **Workflow Builder**: Visual pipeline to design and execute business workflows.
- **Task & Project Tracking**: Flexible boards, lists, and timeline views for all your team tasks.
- **Role-Based Access Control**: Granular permissions for admins, managers, and contributors.
- **Real-Time Collaboration**: Instant status updates and team activity feeds.
- **Modern Design System**: Clean typography, crisp contrast, and warm canvas styling.

## 🛠️ Tech Stack & Design

- **Frontend**: Modern web technologies & design system
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

## 📄 License

This project is licensed under the MIT License.
