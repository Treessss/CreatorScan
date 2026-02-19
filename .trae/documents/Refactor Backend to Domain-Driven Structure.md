I will refactor the existing `creator_scan_api` to strictly adhere to the provided Python project coding standards and structure guidelines.

### 1. Restructure Directory (`/Users/Zhuanz/code/script/CreatorScan/creator_scan_api/`)

I will convert the flat structure into a **Domain-Driven Design (DDD)** structure.

```text
creator_scan_api/
├── app/
│   ├── __init__.py
│   ├── main.py                  # Entry point (Startup only)
│   ├── core/                    # Core Infrastructure
│   │   ├── config.py            # Centralized Config (Env vars)
│   │   ├── database.py          # DB Session & Engine
│   │   ├── security.py          # JWT & Password Hashing
│   │   └── exceptions.py        # Unified Exception Handling
│   └── domains/                 # Business Domains
│       ├── auth/                # Auth Domain (Login, Token)
│       │   ├── router.py
│       │   ├── service.py
│       │   └── schemas.py
│       ├── user/                # User Domain (Master/Sub accounts)
│       │   ├── router.py
│       │   ├── service.py
│       │   ├── repository.py
│       │   ├── schemas.py
│       │   └── models.py
│       ├── creator/             # Creator Domain (Data, Deduplication)
│       │   ├── router.py
│       │   ├── service.py
│       │   ├── repository.py
│       │   ├── schemas.py
│       │   └── models.py
│       └── email/               # Email Domain (Send, Sync, IMAP/SMTP)
│           ├── router.py
│           ├── service.py
│           ├── repository.py
│           ├── schemas.py
│           └── models.py
├── .env                         # Environment Variables
├── requirements.txt
└── README.md
```

### 2. Implementation Steps

1. **Cleanup**: Remove the existing flat files (`crud.py`, `models.py`, `schemas.py`, `auth.py`, `main.py`, `email_utils.py`) to avoid confusion.
2. **Core Layer**: Implement `app/core/` for database connection, configuration management (using `.env`), and security utilities.
3. **Domain Implementation**:

   * **User Domain**: Move user model and CRUD to `repository.py` and `service.py`. Implement Master/Sub-account logic in Service.

   * **Auth Domain**: Separate login logic into its own domain.

   * **Creator Domain**: Move creator storage and **deduplication logic** (Unique Index + Service check) to `service.py`.

   * **Email Domain**: Encapsulate SMTP sending and IMAP reply checking logic into `EmailService`.
4. **Router Layer**: Create `router.py` for each domain to handle HTTP requests and call Services.
5. **Entry Point**: Wire all routers in `app/main.py`.

### 3. Key Standards Compliance

* **Naming**: All files `snake_case`, Classes `PascalCase`.

* **Layering**: Router -> Service -> Repository -> Database.

* **No Logic in Router**: All business logic moved to Services.

* **Config**: All secrets (DB, API Key) moved to `.env`.

I will start by cleaning up the old files and then building the new structure step by step.

### 4. Missing Modules & Final Completeness Additions (Must-have)

1. **API Key Domain**

* Add a dedicated API Key domain for generating, assigning, and revoking keys.
* Store API keys hashed (never store plaintext). Only show the key once at creation time.
* Provide FastAPI dependencies for API key validation at the boundary layer.

1. **Plugin Push / Ingestion Boundary**

* Add a dedicated ingestion (plugin push) router to receive plugin payloads.
* Payload must include `platform`, `username`, and `schema_version`.
* Router only validates + normalizes input, then calls domain service for persistence.

1. **Email Tracking & Reply Thread Model**

* Introduce persistent email tracking:
  * `EmailLog` for send records (status, provider, message\_id, error, sent\_at).
  * `Reply`/`Thread` for inbound replies (thread\_id, received\_at, body preview).
* Influencer list status must be derived from EmailLog/Reply, not manually maintained.

1. **Gmail Config Scope**

* Support Gmail configuration for both Admin and Member.
* Bind email accounts to users (1:1 or 1:N), with a default sender per user.

1. **Authorization & Data Isolation**

* Enforce strict access control:
  * Admin: manage sub accounts, view tenant-wide data.
  * Member: only access own collected data and own email activities (or assigned).
* All repository queries must include `tenant_id`/`owner_id` filters.

1. **Multi-platform Normalization**

* Standardize platform enums and normalization:
  * `platform ∈ {instagram, tiktok, youtube}`
  * dedupe key = `(platform, username_normalized)`
* Normalize usernames and URLs; keep raw fields for traceability.

1. **Database-level Dedupe Guarantees**

* Enforce UNIQUE constraint at DB layer and implement UPSERT merge behavior.
* Service-level checks are optimization only; DB is the source of truth.

1. **Unified Error Codes & Response Envelope**

* Define consistent error codes and response schema across all APIs.
* Centralize exception mapping and validation error handling.

1. **Migrations & Environment Separation**

* Use Alembic for schema migrations.
* Provide `.env.example` and separate dev/test/prod configs.

1. **Background Tasks**

* Implement async/worker tasks for:
  * bulk email sending
  * Gmail inbox sync for replies
* Add idempotency keys + retry strategy + logging/metrics hooks.

