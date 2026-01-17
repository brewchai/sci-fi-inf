from typing import List, Union
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import AnyHttpUrl, field_validator

class Settings(BaseSettings):
    PROJECT_NAME: str = "The Daily Discovery API"
    API_V1_STR: str = "/api/v1"
    
    # CORS - can be a list of URLs or "*" for all origins
    BACKEND_CORS_ORIGINS: List[str] = []

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, (list, str)):
            return v
        raise ValueError(v)

    # Database
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_DB: str = "dailydiscovery"
    SQLALCHEMY_DATABASE_URI: str | None = None

    @field_validator("SQLALCHEMY_DATABASE_URI", mode="before")
    def assemble_db_connection(cls, v: str | None, info) -> AnyHttpUrl:
        if isinstance(v, str):
            # Auto-fix scheme for asyncpg compatibility (Supabase gives postgresql://)
            if v.startswith("postgres://"):
                v = v.replace("postgres://", "postgresql+asyncpg://", 1)
            elif v.startswith("postgresql://"):
                v = v.replace("postgresql://", "postgresql+asyncpg://", 1)
            
            # Auto-fix for Supabase Transaction Pooler (requires disabling prepared statements for asyncpg)
            if "pooler.supabase.com" in v and "prepared_statement_cache_size" not in v:
                v += "?prepared_statement_cache_size=0"
                
            return v
        return f"postgresql+asyncpg://{info.data['POSTGRES_USER']}:{info.data['POSTGRES_PASSWORD']}@{info.data['POSTGRES_SERVER']}/{info.data['POSTGRES_DB']}"

    # Redis
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379

    # External APIs
    OPENALEX_API_URL: str = "https://api.openalex.org"
    OPENALEX_MAILTO: str | None = "example@example.com" # Updated to be polite!
    OPENAI_API_KEY: str | None = None
    
    # Admin
    ADMIN_API_KEY: str | None = None
    ENABLE_CRONS: bool = False
    
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)

settings = Settings()
