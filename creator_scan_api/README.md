# CreatorScan API

FastAPI backend for auth, users/sub-accounts, creators, email, templates, dashboard.

## Prerequisites

- Python 3.11+
- PostgreSQL (or compatible DB URL)

## Quick Start

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8090
```

API docs: `http://localhost:8090/docs`

## Environment

See `.env.example` for all variables.

Important:
- `PORT=8090` (recommended local default)
- `SQLALCHEMY_DATABASE_URL` or Postgres component fields
- `CORS_ORIGINS` should include frontend origin (`http://localhost:5173`)

## Main Endpoints

- Auth: `POST /token`
- Users: `/users/*`
- Creators: `/creators/*`
- Emails: `/emails/*`
- Templates: `/templates/*`
- Dashboard: `/dashboard/stats`

## Notes

- Current email logs contract:
  - `GET /emails/logs` returns `{ items: [...], total: number }`
- For production database migrations, use Alembic (configured in this repository).
