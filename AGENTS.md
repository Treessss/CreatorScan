# Repository Guidelines

## Project Structure & Module Organization

This repository contains three main applications plus supporting docs and artifacts.

- `leadflow-influencer-crm/`: React + Vite + TypeScript frontend (`pages/`, `components/`, `services/`, `constants/`, `tests/`).
- `creator_scan_api/`: FastAPI backend (`app/core/` for config/db/security, `app/domains/*` for feature modules, `tests/`, `alembic/` for migrations).
- `chrome_extension/`: Chrome extension (manifest, popup/results pages, content/background scripts, icons).
- `output/`: generated debugging/export artifacts (Playwright dumps, extracted JSON). Treat as temporary unless a fixture is intentionally added.

## Build, Test, and Development Commands

Frontend (`leadflow-influencer-crm/`):

- `npm install` - install dependencies.
- `npm run dev` - start Vite dev server (default `http://localhost:5173`).
- `npm test` - run Vitest test suite.
- `npm run build` / `npm run preview` - production build and local preview.

Backend (`creator_scan_api/`):

- `python3 -m venv .venv && source .venv/bin/activate` - create local virtualenv.
- `pip install -r requirements.txt` - install API dependencies.
- `uvicorn app.main:app --reload --port 8090` - run API locally.
- `pytest -q` - run backend tests.
- `python -m compileall app` - compile check used in CI.
- `alembic upgrade head` - apply DB migrations.

Extension (`chrome_extension/`): load as an unpacked extension in Chrome (`chrome://extensions`); no build step is configured.

## Coding Style & Naming Conventions

No repo-wide formatter/linter config is committed, so follow existing style in the module you touch.

- Python: 4-space indentation, `snake_case` for functions/modules, `PascalCase` for models/schemas.
- React/TypeScript: `PascalCase` component/page files (for example `pages/Dashboard.tsx`), `camelCase` helpers/services, tests named `*.test.ts` or `*.test.tsx`.
- Keep changes focused; avoid opportunistic refactors across domains.

## Testing Guidelines

- Backend tests live in `creator_scan_api/tests/` and use `pytest` + FastAPI `TestClient`. Name files `test_*.py`.
- Frontend tests live in `leadflow-influencer-crm/tests/` and use Vitest + Testing Library. Add or update tests for changed UI/services.
- No formal coverage threshold is defined; include regression tests for bug fixes whenever practical.

## Commit & Pull Request Guidelines

Git history is minimal, so use clear imperative commit messages with scope prefixes (for example `api: fix creator status patch` or `frontend: add dashboard empty state test`).

PRs should include a short summary, impacted areas (`api`, `frontend`, `chrome_extension`), test evidence (commands run), migration/config notes, and screenshots for UI or extension changes.
