
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# CORS Configuration
origins = [
    "http://localhost:3000",
    "http://localhost:5173",  # Default Vite port
    "chrome-extension://*",   # Allow all extensions (or specific ID if known)
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For dev, allow all. In prod, restrict.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
