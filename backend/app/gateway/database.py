import os
from pathlib import Path
from typing import Generator
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

# Load environment variables
load_dotenv()

# Check for DATABASE_URL; default to SQLite in-memory / local fallback if not configured
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

if DATABASE_URL:
    # Standardize postgres dialect for SQLAlchemy
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

    # Configure engine for PostgreSQL (with connection pooling)
    if "postgresql" in DATABASE_URL:
        engine = create_engine(
            DATABASE_URL,
            pool_pre_ping=True,
            pool_recycle=300,
            pool_size=10,
            max_overflow=20,
            pool_timeout=45,
            connect_args={"connect_timeout": 45},
        )
    else:
        engine = create_engine(DATABASE_URL)
else:
    # Fallback to local SQLite database when DATABASE_URL is not set
    DEFAULT_SQLITE_PATH = Path(__file__).resolve().parents[3] / "ai_assistant.db"
    SQLITE_URL = f"sqlite:///{DEFAULT_SQLITE_PATH}"
    engine = create_engine(
        SQLITE_URL,
        connect_args={"check_same_thread": False},
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    """Dependency for obtaining a SQLAlchemy session."""
    db = SessionLocal()
    try:
        yield db
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        raise
    finally:
        try:
            db.close()
        except Exception:
            pass


def init_db(target_engine=None) -> None:
    """Create all database tables for gateway and shared schemas."""
    e = target_engine or engine
    Base.metadata.create_all(bind=e)
