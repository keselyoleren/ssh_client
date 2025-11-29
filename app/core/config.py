from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    # Database settings - Using SQLite for development
    DATABASE_URL: str = "sqlite:///./ssh_client.db"
    
    # PostgreSQL settings (for Docker/production)
    POSTGRES_USER: Optional[str] = None
    POSTGRES_PASSWORD: Optional[str] = None
    POSTGRES_DB: Optional[str] = None
    POSTGRES_HOST: Optional[str] = "localhost"
    POSTGRES_PORT: int = 5432
    
    # JWT settings
    SECRET_KEY: str = "your-secret-key-change-this-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # Email settings (optional)
    SMTP_SERVER: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_TLS: bool = True
    
    # MFA settings
    APP_NAME: str = "SSH Client"
    ISSUER_NAME: str = "SSH Client App"

    class Config:
        env_file = ".env"
        extra = "ignore"  # Ignore extra fields that aren't defined

settings = Settings()