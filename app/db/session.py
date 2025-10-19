from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

# Create engine with database-specific configuration
if settings.DATABASE_URL.startswith("sqlite"):
    # SQLite-specific configuration
    engine = create_engine(
        settings.DATABASE_URL,
        connect_args={"check_same_thread": False}  # Only needed for SQLite
    )
else:
    # PostgreSQL and other database configuration
    engine = create_engine(
        settings.DATABASE_URL,
        pool_pre_ping=True,  # Validate connections before use
        pool_recycle=300     # Recycle connections every 5 minutes
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
