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

TikTok task scraping refactor follow-up delivered on 2026-02-25:
- [x] Changed TikTok task API interception flow to save minimal seed (`author id + handle + video id`) first, then auto-hydrate in background via video/profile HTML (`locationCreated` + `webapp.user-detail`)
- [x] Fixed extension task keyword `collected` counter to use deduped saved rows instead of raw intercepted count
- [x] Fixed location sync/display gap: extension push normalizes `location`, backend persists alias, CRM list/detail now read `locationCreated/region` fallback (no more forced `未知`)
- [x] Fixed SMTP add/edit frontend flow closure: visible confirm-save action in settings form, password validation for create/test, and blank edit password no longer wipes stored SMTP password
- [x] Converted SMTP add/edit to custom modal popup in settings and surfaced explicit app-password/authorization-code input field in modal form
- [x] Added multi-tag support on extension push-to-server flow (custom push-tag modal) and backend creator push tag normalization/storage (`data.tags[]`)
- [x] Extended TikTok task hydration fallback: when profile has external links but no email, auto-fetch external pages and recursively follow discovered social profile links (IG/YouTube/Facebook etc.) to backfill detected email
- [x] Replaced batch-tab “深度挖掘” with retryable TikTok “自动补全” queue button (only targets未自动补全项, no hidden tabs) and added stop/status hooks
- [x] Added one-click “删除无邮箱” buttons on plugin data board tabs (batch/imported/manual) to bulk purge creators missing email
- [x] Added backend avatar persistence cache on creator push: download remote avatar URLs to local `/media/avatars/...`, rewrite stored `data.avatar` to stable local path, and CRM frontend now resolves backend media URLs
- [x] Added extension-side local avatar persistence cache (data URL) for batch/imported/manual creators with background backfill queue so plugin dashboard avatars remain available after remote CDN links expire
- [x] Updated CRM influencer list UX: removed status column, fixed pagination custom-select dropdown clipping, added “select all matching results” action, and added backend+frontend location filter support
- [x] Refined CRM country filter dropdown: deduplicated alias/deprecated duplicate country entries (e.g. 英国/越南) and added in-dropdown search for country/region options
- [x] Enhanced CRM creator list/detail presentation: list now shows creator tags, and detail page field keys are rendered with Chinese labels plus formatted values (links/tags/time/object values) for easier review
- [x] Added creator tag management workflows in CRM: batch add tags for selected creators in list view, and single-creator add-tag modal in detail view (backend tag update APIs included)
- [x] Optimized CRM detail page data presentation: only common fields shown by default, extra fields moved behind “查看更多”, and removed avg-views/CTR stat card block
