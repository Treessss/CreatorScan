# CreatorScan Chrome Extension

Collects creator data and can push to CreatorScan API.

## Local Setup

1. Load unpacked extension from `chrome_extension` in `chrome://extensions`
2. Open `results.html` from extension popup
3. Configure:
- `服务器 API Key`: account API key
- `服务器地址`: backend URL (default `http://localhost:8090`)

## Task Mode Scope

- Supported: TikTok / Instagram / YouTube task orchestration

## Push Endpoint

- `POST {serverUrl}/creators/push`
- Header: `X-API-Key`
