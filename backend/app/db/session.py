from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings

# Supabase Transaction Pooler requires disabling prepared statement caching
db_url = str(settings.SQLALCHEMY_DATABASE_URI)
connect_args = {}
if "pooler.supabase.com" in db_url:
    connect_args["statement_cache_size"] = 0

# Engine with connection pool settings to handle Supabase timeouts
engine = create_async_engine(
    db_url, 
    connect_args=connect_args,
    pool_pre_ping=True,  # Check if connection is alive before using
    pool_recycle=300,    # Recycle connections after 5 minutes
    pool_size=5,         # Max connections in pool
    max_overflow=10,     # Allow 10 extra connections when busy
)
SessionLocal = async_sessionmaker(autocommit=False, autoflush=False, bind=engine, class_=AsyncSession, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with SessionLocal() as session:
        yield session


from contextlib import asynccontextmanager

@asynccontextmanager
async def get_async_session():
    """Context manager for getting an async session (for standalone scripts)."""
    async with SessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

