from logging.config import fileConfig
import sys
from pathlib import Path
from urllib.parse import urlparse, urlunparse

from sqlalchemy import create_engine
from sqlalchemy import pool

from alembic import context

# Add the backend directory to path so we can import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.config import settings
from app.db.session import Base
# Import all models so they register with Base.metadata
from app.models.paper import Paper  # noqa
from app.models.podcast import PodcastEpisode  # noqa

# this is the Alembic Config object
config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Set the SQLAlchemy URL from settings
# Convert async URL to sync for Alembic
db_url = settings.SQLALCHEMY_DATABASE_URI
if db_url:
    # Replace asyncpg with psycopg2 for sync migrations
    db_url = db_url.replace("postgresql+asyncpg://", "postgresql://")
    
    # Strip query params (asyncpg-specific like prepared_statement_cache_size)
    parsed = urlparse(db_url)
    # Rebuild URL without query string
    db_url = urlunparse((
        parsed.scheme,
        parsed.netloc,
        parsed.path,
        '',  # params
        '',  # query (stripped)
        ''   # fragment
    ))
    
    # Escape % characters for ConfigParser (% is used for interpolation)
    config.set_main_option("sqlalchemy.url", db_url.replace("%", "%%"))

# Set target metadata for autogenerate
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    url = config.get_main_option("sqlalchemy.url")
    
    connectable = create_engine(url, poolclass=pool.NullPool)

    with connectable.connect() as connection:
        context.configure(
            connection=connection, 
            target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
