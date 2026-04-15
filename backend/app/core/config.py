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
    GEMINI_API_KEY: str | None = None
    TEXT_LLM_PROVIDER: str = "openai"
    TEXT_LLM_MODEL_OPENAI: str | None = None
    TEXT_LLM_MODEL_GEMINI: str = "gemini-3-flash"

    TEXT_LLM_SUMMARIES_PROVIDER: str | None = None
    TEXT_LLM_SUMMARIES_MODEL: str | None = None
    TEXT_LLM_PODCAST_SCRIPT_PROVIDER: str | None = None
    TEXT_LLM_PODCAST_SCRIPT_MODEL: str | None = None
    TEXT_LLM_PODCAST_TITLE_PROVIDER: str | None = None
    TEXT_LLM_PODCAST_TITLE_MODEL: str | None = None
    TEXT_LLM_CAROUSEL_COPY_PROVIDER: str | None = None
    TEXT_LLM_CAROUSEL_COPY_MODEL: str | None = None
    TEXT_LLM_IMAGE_PROMPT_PROVIDER: str | None = None
    TEXT_LLM_IMAGE_PROMPT_MODEL: str | None = None
    TEXT_LLM_REEL_SCRIPT_PROVIDER: str | None = None
    TEXT_LLM_REEL_SCRIPT_MODEL: str | None = None
    TEXT_LLM_VOICE_SCRIPT_REWRITE_PROVIDER: str | None = None
    TEXT_LLM_VOICE_SCRIPT_REWRITE_MODEL: str | None = None
    TEXT_LLM_TRANSCRIPT_PUNCTUATION_PROVIDER: str | None = None
    TEXT_LLM_TRANSCRIPT_PUNCTUATION_MODEL: str | None = None
    TEXT_LLM_CURATION_PROVIDER: str | None = None
    TEXT_LLM_CURATION_MODEL: str | None = None
    TEXT_LLM_PREMIUM_DEEP_ANALYSIS_PROVIDER: str | None = None
    TEXT_LLM_PREMIUM_DEEP_ANALYSIS_MODEL: str | None = None
    TEXT_LLM_PREMIUM_CODE_WALKTHROUGH_PROVIDER: str | None = None
    TEXT_LLM_PREMIUM_CODE_WALKTHROUGH_MODEL: str | None = None
    TEXT_LLM_PREMIUM_APPLICATIONS_PROVIDER: str | None = None
    TEXT_LLM_PREMIUM_APPLICATIONS_MODEL: str | None = None
    TEXT_LLM_FACT_CHECK_CLAIM_EXTRACTION_PROVIDER: str | None = None
    TEXT_LLM_FACT_CHECK_CLAIM_EXTRACTION_MODEL: str | None = None
    TEXT_LLM_FACT_CHECK_QUERY_EXPANSION_PROVIDER: str | None = None
    TEXT_LLM_FACT_CHECK_QUERY_EXPANSION_MODEL: str | None = None
    TEXT_LLM_FACT_CHECK_FALLBACK_PAPERS_PROVIDER: str | None = None
    TEXT_LLM_FACT_CHECK_FALLBACK_PAPERS_MODEL: str | None = None
    TEXT_LLM_FACT_CHECK_HOOK_QUESTION_PROVIDER: str | None = None
    TEXT_LLM_FACT_CHECK_HOOK_QUESTION_MODEL: str | None = None
    TEXT_LLM_FACT_CHECK_CLAIM_ANALYSIS_PROVIDER: str | None = None
    TEXT_LLM_FACT_CHECK_CLAIM_ANALYSIS_MODEL: str | None = None
    TEXT_LLM_VISUAL_KEYWORDS_PROVIDER: str | None = None
    TEXT_LLM_VISUAL_KEYWORDS_MODEL: str | None = None
    TEXT_LLM_VISUAL_SCENE_QUERIES_PROVIDER: str | None = None
    TEXT_LLM_VISUAL_SCENE_QUERIES_MODEL: str | None = None
    TEXT_LLM_VISUAL_RERANK_PROVIDER: str | None = None
    TEXT_LLM_VISUAL_RERANK_MODEL: str | None = None
    TEXT_LLM_SCENE_PLANNING_PROVIDER: str | None = None
    TEXT_LLM_SCENE_PLANNING_MODEL: str | None = None
    TEXT_LLM_SCENE_EXTRACTION_PROVIDER: str | None = None
    TEXT_LLM_SCENE_EXTRACTION_MODEL: str | None = None
    TEXT_LLM_ANCHOR_SELECTION_PROVIDER: str | None = None
    TEXT_LLM_ANCHOR_SELECTION_MODEL: str | None = None
    TEXT_LLM_ANCHOR_EFFECTS_PROVIDER: str | None = None
    TEXT_LLM_ANCHOR_EFFECTS_MODEL: str | None = None
    TEXT_LLM_TIMELINE_EXTRACTION_PROVIDER: str | None = None
    TEXT_LLM_TIMELINE_EXTRACTION_MODEL: str | None = None
    TEXT_LLM_ANCHOR_PROMPT_GENERATION_PROVIDER: str | None = None
    TEXT_LLM_ANCHOR_PROMPT_GENERATION_MODEL: str | None = None
    TEXT_LLM_TOP_PAPERS_ANALYSIS_PROVIDER: str | None = None
    TEXT_LLM_TOP_PAPERS_ANALYSIS_MODEL: str | None = None
    TEXT_LLM_DAILY_SCIENCE_ANALYSIS_PROVIDER: str | None = None
    TEXT_LLM_DAILY_SCIENCE_ANALYSIS_MODEL: str | None = None
    TEXT_LLM_TITLE_TRANSLATION_PROVIDER: str | None = None
    TEXT_LLM_TITLE_TRANSLATION_MODEL: str | None = None
    TEXT_LLM_SFX_PLACEMENT_PROVIDER: str | None = None
    TEXT_LLM_SFX_PLACEMENT_MODEL: str | None = None
    
    # Supabase Storage
    SUPABASE_URL: str | None = None
    SUPABASE_SERVICE_ROLE_KEY: str | None = None
    
    # Admin
    ADMIN_API_KEY: str | None = None
    ENABLE_CRONS: bool = False
    
    # ElevenLabs TTS
    ELEVENLABS_API_KEY: str | None = None
    
    # Pexels (stock footage)
    PEXELS_API_KEY: str | None = None

    # Local media library (optional)
    LOCAL_MEDIA_LIBRARY_ROOT: str | None = None
    LOCAL_MEDIA_METADATA_DIR: str | None = None
    LOCAL_MEDIA_LIBRARY_MOUNT_PATH: str = "/local-library"
    
    # Together AI (image generation)
    TOGETHER_API_KEYS: str | None = None  # Comma-separated list of keys
    
    # Podcast generation
    PAPERS_PER_EPISODE: int = 3  # Papers included in each episode
    MAX_PAPERS_FOR_RANKING: int = 20  # Max papers to send to LLM for ranking (cost control)
    
    # Email (Resend) — for author outreach
    RESEND_API_KEY: str | None = None
    EMAIL_FROM: str = "The Eureka Feed <no-reply@theeurekafeed.com>"
    EMAIL_REPLY_TO: str | None = None  # Set to your personal email
    SITE_URL: str = "https://www.theeurekafeed.com"
    NODE_BINARY: str = "node"
    PREMIUM_REEL_RENDERER_DIR: str | None = None
    
    model_config = SettingsConfigDict(
        env_file=str(__import__("pathlib").Path(__file__).resolve().parents[2] / ".env"),
        case_sensitive=True,
    )

    @field_validator("TEXT_LLM_PROVIDER", mode="before")
    def normalize_text_llm_provider(cls, value: str | None) -> str:
        normalized = str(value or "openai").strip().lower()
        if normalized not in {"openai", "gemini"}:
            raise ValueError("TEXT_LLM_PROVIDER must be 'openai' or 'gemini'")
        return normalized

    def resolve_text_llm(self, capability: str, *, default_openai_model: str, default_gemini_model: str | None = None) -> tuple[str, str]:
        provider_attr = f"TEXT_LLM_{capability.upper()}_PROVIDER"
        model_attr = f"TEXT_LLM_{capability.upper()}_MODEL"
        provider = str(getattr(self, provider_attr, None) or self.TEXT_LLM_PROVIDER or "openai").strip().lower()
        if provider not in {"openai", "gemini"}:
            provider = str(self.TEXT_LLM_PROVIDER or "openai").strip().lower()

        global_model = self.TEXT_LLM_MODEL_GEMINI if provider == "gemini" else self.TEXT_LLM_MODEL_OPENAI
        default_model = default_gemini_model or self.TEXT_LLM_MODEL_GEMINI if provider == "gemini" else default_openai_model
        model = str(getattr(self, model_attr, None) or global_model or default_model).strip()
        return provider, model

settings = Settings()
