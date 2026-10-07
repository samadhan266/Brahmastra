from pydantic_settings import BaseSettings
from typing import Optional
import os


PROJECT_ROOT = os.getenv(
    "BRAHMASTRA_ROOT",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
)
SECLISTS_DIR = os.getenv("SECLISTS_DIR", os.path.join(PROJECT_ROOT, "jsons", "SecLists"))


class Settings(BaseSettings):
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
    VAANI_API_KEY: str = os.getenv("VAANI_API_KEY", "")
    OPENROUTER_BASE_URL: str = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
    OPENROUTER_MODEL: str = os.getenv("OPENROUTER_MODEL", "anthropic/claude-sonnet-5")
    VAANI_MODEL: str = os.getenv("VAANI_MODEL", "openrouter/free")

    SHODAN_API_KEY: str = os.getenv("SHODAN_API_KEY", "")
    NVD_API_KEY: str = os.getenv("NVD_API_KEY", "")

    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./brahmastra.db")
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-secret-change-in-production")
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))

    BACKEND_HOST: str = os.getenv("BACKEND_HOST", "0.0.0.0")
    BACKEND_PORT: int = int(os.getenv("BACKEND_PORT", "8000"))
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:3000")

    NMAP_PATH: str = os.getenv("NMAP_PATH", "nmap")
    SQLMAP_PATH: str = os.getenv("SQLMAP_PATH", "sqlmap")
    NIKTO_PATH: str = os.getenv("NIKTO_PATH", "nikto")

    SCAN_TIMEOUT: int = int(os.getenv("SCAN_TIMEOUT", "300"))
    MAX_CONCURRENT_SCANS: int = int(os.getenv("MAX_CONCURRENT_SCANS", "3"))

    TOOLS_DIR: str = os.getenv("TOOLS_DIR", os.path.join(PROJECT_ROOT, "jsons"))

    # Tools execution service — set to http://tools:9000 when using Docker
    TOOLS_SERVICE_URL: str = os.getenv("TOOLS_SERVICE_URL", "")

    # Cloud analysis service — set to http://cloud:9101 when using Docker
    CLOUD_SERVICE_URL: str = os.getenv("CLOUD_SERVICE_URL", "")

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()