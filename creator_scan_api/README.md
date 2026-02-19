# CreatorScan API

## Project Structure
The project follows a Domain-Driven Design (DDD) structure:

```
creator_scan_api/
├── app/
│   ├── core/                    # Core Infrastructure (Config, DB, Security)
│   ├── domains/                 # Business Domains
│   │   ├── auth/                # Login & Token Logic
│   │   ├── user/                # User Management (Master/Sub)
│   │   ├── creator/             # Creator Data & Deduplication
│   │   └── email/               # Email Sending & IMAP Sync
│   └── main.py                  # Application Entry Point
├── .env                         # Environment Variables
└── requirements.txt
```

## Setup & Run

1.  **Install Dependencies**:
    ```bash
    pip install -r requirements.txt
    ```

2.  **Configure Environment**:
    - Copy `.env` and update credentials (DB, Secret Key).
    - Ensure PostgreSQL database `creatorscan` exists.

3.  **Run Server**:
    ```bash
    # Run from creator_scan_api/ directory
    uvicorn app.main:app --reload
    ```

## API Features
- **Auth**: `/token` (Login)
- **Users**: Register Master (`/users/register`), Create Sub (`/users/sub`), Manage Config.
- **Creators**: Push Data (`/creators/push`), List (`/creators/`).
- **Emails**: Send Batch (`/emails/send`), Sync Replies (`/emails/sync`).
