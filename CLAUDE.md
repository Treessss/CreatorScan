# CLAUDE.md
This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CreatorScan is a full-stack influencer/creator CRM system with three components:
1. **Backend API** (`creator_scan_api/`) - FastAPI server
2. **Frontend** (`leadflow-influencer-crm/`) - React + Vite + TypeScript
3. **Chrome Extension** (`chrome_extension/`) - Manifest V3 extension for scraping creator data

## Backend (creator_scan_api/)

### Run & Develop
```bash
cd creator_scan_api
pip install -r requirements.txt
# Configure .env with DB credentials and SECRET_KEY
uvicorn app.main:app --reload
```

### Architecture (Domain-Driven Design)
```
app/
├── core/           # Infrastructure: config, database, security, exceptions
├── domains/        # Business domains (auth, user, creator, email, dashboard)
│   └── <domain>/
│       ├── models.py
│       ├── schemas.py
│       ├── repository.py  # DB access layer
│       ├── service.py     # Business logic
│       └── router.py      # HTTP endpoints
└── main.py         # Entry point, CORS, router registration
```

### Key Endpoints
- `POST /token` - Login (JWT auth)
- `POST /creators/push` - Push creator data from extension (requires `X-API-Key` header)
- `GET /creators/` - List creators
- `POST /emails/send` - Batch send emails
- `GET /emails/sync` - Sync Gmail replies

### Database
- PostgreSQL via SQLAlchemy
- Tables auto-created on startup (no migrations yet)
- Config via `.env`: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_SERVER`, `POSTGRES_DB`, `SECRET_KEY`

## Frontend (leadflow-influencer-crm/)

### Run & Develop
```bash
cd leadflow-influencer-crm
npm install
# Set GEMINI_API_KEY in .env.local
npm run dev  # Runs on http://localhost:3000
```

### Tech Stack
- React + TypeScript + Vite
- Redux Toolkit for state management
- Pages: Login, Dashboard, InfluencerList, InfluencerDetail, Settings, ApiSettings, SubAccounts, EmailMarketing

### Key Configuration
- API base URL: `http://localhost:8000`
- Auth: JWT token stored after login, sent via `Authorization` header

## Chrome Extension (chrome_extension/)

### Structure
- `manifest.json` - Manifest V3
- `background.js` - Service worker for enrichment tasks
- `content.js` - Content scripts for TikTok/Instagram/YouTube
- `results.js` - Results page logic (export, push to backend)
- `popup.js` - Extension popup

### Key Features
- Scrapes creator data from TikTok, Instagram, YouTube
- Background enrichment (deep scraping)
- Export to CSV/XLSX
- Push to backend API (`/creators/push`) with `X-API-Key` header

### Data Flow
Extension collects creator data → User configures API Key in extension settings → Push to backend → Visible in Frontend InfluencerList

## Important Patterns

### Authentication
- Backend uses JWT tokens (python-jose + passlib with bcrypt)
- API Key authentication for extension pushes (hashed storage, validated via dependency)

### Creator Deduplication
- Unique constraint: `(platform, username_normalized)`
- Service-level check + DB UPSERT behavior

### CORS
Backend configured to allow:
- `http://localhost:3000` (Frontend)
- `chrome-extension://*` (Extension)
