"""Engine y session factory async de SQLAlchemy."""

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.utils.config import get_settings


_settings = get_settings()

# echo=False en prod; activar en debug si hace falta
_engine = create_async_engine(
    _settings.database_url,
    echo=False,
    future=True,
    # Para SQLite: permite múltiples threads (FastAPI corre en pool)
    connect_args={"check_same_thread": False} if "sqlite" in _settings.database_url else {},
)

_SessionLocal = async_sessionmaker(
    bind=_engine,
    expire_on_commit=False,
    class_=AsyncSession,
)


def get_engine():
    return _engine


async def get_session() -> AsyncIterator[AsyncSession]:
    """Dependency para FastAPI. Una sesión por request."""
    async with _SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
