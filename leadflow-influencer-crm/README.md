# Leadflow Influencer CRM

React + Vite frontend for CreatorScan.

## Prerequisites

- Node.js 18+
- Backend API running (default `http://localhost:8090`)

## Local Run

```bash
npm install
cp .env.example .env
npm run dev
```

Default frontend URL: `http://localhost:5173`

## Environment Variables

- `VITE_PORT`: frontend dev port (default `5173`)
- `VITE_API_BASE_URL`: backend API base URL (default `http://localhost:8090`)

## Build

```bash
npm run build
npm run preview
```

## Core Pages

- `/dashboard`: dashboard metrics and trends
- `/influencers`: creator list and filters
- `/details/:id`: creator detail and contact status controls
- `/marketing`: email compose/history/templates
- `/settings`: profile, SMTP and security settings
