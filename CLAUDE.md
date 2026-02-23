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

## 开发未完成项与任务分配

### 前端（leadflow-influencer-crm）
- 红人列表地区字段硬编码为“未知”，需要接入后端实际 location 数据
- 红人列表“批量发送邮件”按钮未绑定行为
- 红人详情“更改状态”按钮未实现

### 后端（creator_scan_api）
- Creator 数据未包含可直接输出的 location 字段
- 缺少用于更新红人状态/跟进状态的接口

### 插件（chrome_extension）
- 任务创建平台仅支持 TikTok，Instagram/YouTube 在 UI 中处于 Coming Soon
- 批量任务搜索入口仅支持 TikTok（background.js 仅返回 TikTok 搜索 URL）

### 任务分配（建议）
| 模块 | 任务 | 负责人 | 依赖 |
| --- | --- | --- | --- |
| 前端 | 红人列表地区字段接入与展示 | 前端 | 后端提供 location 字段 |
| 后端 | Creator 数据补充 location 字段输出 | 后端 | 数据来源/采集或导入字段 |
| 前端 | 红人列表批量发送邮件功能接入（选中项 + /emails/send） | 前端 | 后端批量发送接口已存在 |
| 前端 | 红人详情“更改状态”功能实现 | 前端 | 后端提供状态更新接口 |
| 后端 | 红人状态更新接口（例如跟进状态/标签） | 后端 | 数据模型与权限校验 |
| 插件 | Instagram/YouTube 任务创建入口与搜索 URL 支持 | 插件 | background.js 任务搜索支持 |
