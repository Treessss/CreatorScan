# CreatorScan Runbook

## 1. Startup Order (Local)

1. Start backend API (`creator_scan_api`)
2. Start frontend CRM (`leadflow-influencer-crm`)
3. Load Chrome extension (`chrome_extension`)

Default local addresses:
- Backend: `http://localhost:8090`
- Frontend: `http://localhost:5173`

## 2. Backend

```bash
cd creator_scan_api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8090
```

Health checks:
- Open `http://localhost:8090/docs`
- Root `http://localhost:8090/`

## 3. Frontend

```bash
cd leadflow-influencer-crm
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173`.

## 4. Chrome Extension

1. Go to `chrome://extensions`
2. Enable developer mode
3. Load unpacked -> select `chrome_extension`
4. Open extension results page
5. In settings set:
- `服务器 API Key`: from CRM `API 设置`
- `服务器地址`: `http://localhost:8090` (default)

## 5. Troubleshooting

- `401 Unauthorized` in frontend:
  - Re-login in CRM
  - Confirm token exists in browser localStorage

- Extension push fails:
  - Verify API key belongs to current account
  - Verify backend URL is reachable (`/docs`)

- CORS error:
  - Ensure backend `.env` has frontend origin in `CORS_ORIGINS`
  - Restart backend after env changes

- DB connection failed:
  - Verify `SQLALCHEMY_DATABASE_URL` or Postgres component fields in `creator_scan_api/.env`

## 6. Verification Checklist

- Login succeeds in CRM
- Influencer list loads
- Settings profile/password updates succeed
- Email logs endpoint returns `{ items, total }`
- Extension can push creators to `/creators/push`
