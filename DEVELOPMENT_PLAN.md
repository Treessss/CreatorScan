# CreatorScan Development Plan

Last updated: 2026-02-20

## 1. Project Status Summary

Current architecture is complete and runnable as a full workflow:

- Chrome extension: collect creator data, export CSV/XLSX, push to backend
- Backend API (FastAPI): auth, users/sub-accounts, creators, email, templates, dashboard
- Frontend CRM (React): login, dashboard, influencer list/detail, email marketing, settings

Overall status: **Beta usable** (core flow works, but production-readiness is incomplete).

## 2. Completed Work

- End-to-end core data flow exists:
  - Extension collects data
  - Extension pushes to `/creators/push` with API key
  - Backend stores and serves creator data
  - Frontend displays creators and supports filtering/pagination/import/delete
- Auth and account model implemented:
  - JWT login
  - master/sub account model
  - API key support for extension push
- Email domain implemented:
  - SMTP config CRUD
  - batch send in background tasks
  - logs and template CRUD
- Dashboard API and UI implemented (cards/charts/activity are wired)

## 3. Gaps and Incomplete Areas

### P0 (must finish first)

- Settings page has placeholder-only sections:
  - profile form is static
  - security/password/2FA/session area is mostly UI-only
- API contract mismatch:
  - `GET /emails/logs` declares one response model but returns list
- Environment/config mismatch:
  - frontend and extension default to `localhost:8090`
  - backend run docs imply default uvicorn behavior (commonly `8000`)
- Documentation mismatch:
  - frontend README still template content, not project-specific instructions

### P1 (important next)

- Extension task orchestration supports only TikTok search URL path (Instagram/YouTube task mode not finished)
- Dashboard trend values partially hardcoded (`0%` placeholders)
- Some buttons in UI have no behavior:
  - sub-account audit "refresh" action
  - influencer detail "change status"
- Code quality cleanup:
  - dead/unreachable code in creator service

### P2 (production readiness)

- Add database migration system (Alembic)
- Add automated tests (backend + frontend critical flows)
- Add CI checks (lint, type-check, tests)
- Harden CORS and environment settings for production
- Add deployment/runbook docs and versioned release process

## 4. Stage Plan (recommended)

## Stage 1: Baseline Stabilization (P0)

- Unify ports and environment variables
- Fix `/emails/logs` response model and frontend compatibility
- Wire real profile/password update flows in Settings
- Rewrite frontend README and top-level run instructions

Acceptance criteria:

- Fresh setup can run extension + backend + frontend with one documented port strategy
- Settings profile/password changes persist to backend
- OpenAPI schema matches runtime responses

## Stage 2: Feature Completion (P1)

- Complete missing UI actions (refresh logs, change status flow)
- Extend task mode to Instagram/YouTube or explicitly hide unsupported modes
- Replace dashboard placeholder trends with real computed metrics
- Remove dead code and align module boundaries

Acceptance criteria:

- No visible "button without action" in core workflows
- Task mode behavior is explicit and consistent per platform
- Dashboard trends are data-driven

## Stage 3: Production Hardening (P2)

- Introduce Alembic migrations and migration docs
- Add tests for:
  - auth
  - creators CRUD/filter
  - email send/log flow
  - critical frontend pages
- Add CI pipeline
- Security and config review (CORS, secrets, token expiration, error handling)

Acceptance criteria:

- New environment can bootstrap via migration command
- CI must pass for merge
- Critical backend routes covered by tests

## 5. Task Backlog (Actionable Checklist)

- [x] Define and implement unified `.env` strategy for backend/frontend/extension
- [x] Change frontend API base URL to env-driven config
- [x] Change extension server URL default/config strategy
- [x] Fix backend email logs response model mismatch
- [x] Wire Settings profile form to `userService.updateProfile`
- [x] Wire Settings password form to `userService.updatePassword`
- [x] Decide 2FA scope: implement backend support or remove toggle until supported
- [x] Implement sub-account audit refresh button behavior
- [x] Implement influencer status update behavior and backend endpoint (if missing)
- [x] Decide multi-platform task scope (implement IG/YouTube or disable UI options)
- [x] Replace dashboard trend placeholders with actual trend calculations
- [x] Remove unreachable code and service-layer leftovers
- [x] Add Alembic and first migration baseline
- [x] Add backend tests (pytest) for critical APIs
- [x] Add frontend smoke tests for key pages
- [x] Add CI workflow (lint + tests + build)
- [x] Rewrite `leadflow-influencer-crm/README.md`
- [x] Add top-level project runbook with startup order and troubleshooting

## 6. Suggested Development Order (next 2 weeks)

- Week 1:
  - P0 all items (stability + contract + real settings behavior)
- Week 2:
  - P1 core items (feature completion + dashboard correctness)
  - Start P2 foundation (Alembic + baseline tests)

## 7. Definition of Done

A task is done only when:

- Code implemented
- Basic test/verification completed
- Docs updated if behavior/config changed
- No contract mismatch between frontend/backend for related API

## 8. Post-Review Findings (2026-02-20)

The following items were discovered during a full backend/frontend/extension code review after initial backlog completion. These are now the active implementation queue and must be developed in strict order:

- [x] `#1` [High] Scope creator uniqueness by owner to avoid cross-account overwrite (`platform + unique_id + owner_id`)
- [x] `#2` [High] Fix background task DB session lifecycle (do not pass request-scoped `db` into background tasks)
- [x] `#3` [High] Add creator ownership checks before email send/sync operations
- [x] `#4` [High] Make password update flow verify current password (frontend + backend contract)
- [x] `#5` [Medium] Handle username update conflict gracefully (duplicate username validation + API error)
- [x] `#6` [Medium] Implement or explicitly remove 2FA/session remote logout placeholders
- [x] `#7` [Medium] Implement behavior for frontend placeholder buttons (login trial, dashboard view-all, detail share/more)
- [x] `#8` [Medium] Extend non-TikTok URL/task support in extension or hard-disable all unsupported entry points consistently

Follow-up delivered on 2026-02-20 (new requirement):
- [x] Implemented real 2FA flow (setup/enable/disable + login OTP verification)
- [x] Enabled extension task mode support for Instagram and YouTube

UI standardization follow-up delivered on 2026-02-21:
- [x] Replaced frontend CRM native browser dialogs (`alert/confirm`) with custom modal/toast system
- [x] Replaced frontend CRM native dropdowns with custom select components (single + multi select)
- [x] Replaced Chrome extension native dialogs (`alert/confirm`) with custom modal/toast system (`popup/results/content`)
- [x] Replaced Chrome extension task-platform native dropdown with custom dropdown
