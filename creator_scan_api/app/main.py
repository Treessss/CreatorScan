
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.core.config import settings
from app.core.database import engine, Base
from app.domains.auth import router as auth_router
from app.domains.user import router as user_router
from app.domains.creator import router as creator_router
from app.domains.email import router as email_router
from app.domains.email import template_router
from app.domains.dashboard import router as dashboard_router

# Create Tables
# Note: In production, use Alembic for migrations
# We need to import all models so Base.metadata knows about them
from app.domains.user import models as user_models
from app.domains.creator import models as creator_models
from app.domains.email import models as email_models
from app.domains.email import template_models

if settings.AUTO_CREATE_TABLES:
    Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=settings.CORS_ALLOW_ORIGIN_REGEX,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)

Path(settings.MEDIA_ROOT).mkdir(parents=True, exist_ok=True)
app.mount(settings.MEDIA_URL_PREFIX, StaticFiles(directory=settings.MEDIA_ROOT), name="media")

# Register Routers
app.include_router(auth_router.router)
app.include_router(user_router.router)
app.include_router(creator_router.router)
app.include_router(email_router.router)
app.include_router(template_router.router)
app.include_router(dashboard_router.router)

@app.get("/")
def root():
    return {"message": "Welcome to CreatorScan API", "docs": "/docs"}
