import json
from pathlib import Path
from pydantic_settings import BaseSettings
from pydantic import field_validator
from pydantic_settings import SettingsConfigDict

_BACKEND_ROOT = Path(__file__).resolve().parents[2]

class Settings(BaseSettings):
    PROJECT_NAME: str = "CreatorScan API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    ENV: str = "development"
    HOST: str = "0.0.0.0"
    PORT: int = 8090
    AUTO_CREATE_TABLES: bool = True
    
    SECRET_KEY: str = "YOUR_SECRET_KEY_CHANGE_ME_PLEASE_IN_PRODUCTION"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7 # 7 days
    
    # Database
    POSTGRES_USER: str = "user"
    POSTGRES_PASSWORD: str = "password"
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_DB: str = "creatorscan"
    SQLALCHEMY_DATABASE_URL: str = ""
    # Use comma-separated origins in env, e.g.
    # CORS_ORIGINS=http://localhost:5173,chrome-extension://<EXTENSION_ID>
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    CORS_ALLOW_CREDENTIALS: bool = True
    CORS_ALLOW_ORIGIN_REGEX: str = r"chrome-extension://.*"
    MEDIA_ROOT: str = str(_BACKEND_ROOT / "media")
    MEDIA_URL_PREFIX: str = "/media"

    model_config = SettingsConfigDict(env_file=".env")

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _parse_cors_origins(cls, value):
        if isinstance(value, str):
            raw = value.strip()
            if not raw:
                return []
            # Support JSON array format in env, e.g.
            # CORS_ORIGINS=["http://localhost:5173","http://localhost:5174"]
            if raw.startswith("["):
                try:
                    parsed = json.loads(raw)
                    if isinstance(parsed, list):
                        return [str(v).strip() for v in parsed if str(v).strip()]
                except Exception:
                    pass
            # Fallback to comma-separated format.
            return [v.strip().strip("\"'") for v in raw.split(",") if v.strip()]
        return value

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if not self.SQLALCHEMY_DATABASE_URL:
            self.SQLALCHEMY_DATABASE_URL = f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}/{self.POSTGRES_DB}"

settings = Settings()
