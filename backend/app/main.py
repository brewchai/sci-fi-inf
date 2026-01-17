from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings

from contextlib import asynccontextmanager
from app.db.session import engine, Base
# Import all models so they register with Base.metadata
from app.models.paper import Paper  # noqa: F401
from app.models.podcast import PodcastEpisode  # noqa: F401
from app.models.contact import ContactMessage  # noqa: F401
from app.models.waitlist import WaitlistEmail  # noqa: F401

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables if they don't exist (safe for production)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # Start the scheduler (optional - won't fail if apscheduler not installed)
    scheduler = None
    try:
        if settings.ENABLE_CRONS:
            from app.cron.scheduler import setup_scheduler
            scheduler = setup_scheduler()
            scheduler.start()
        else:
            print("Cron jobs disabled via configuration")
    except ImportError:
        print("Warning: apscheduler not installed, cron jobs disabled")
    
    yield
    
    # Shutdown
    if scheduler:
        scheduler.shutdown()

def create_application() -> FastAPI:
    application = FastAPI(
        title=settings.PROJECT_NAME,
        openapi_url=f"{settings.API_V1_STR}/openapi.json",
        lifespan=lifespan
    )

    # CORS - check for wildcard "*" or use specific origins
    if "*" in settings.BACKEND_CORS_ORIGINS:
        origins = ["*"]
    else:
        origins = ["http://localhost:3000"]
        if settings.BACKEND_CORS_ORIGINS:
            origins.extend(settings.BACKEND_CORS_ORIGINS)
    
    application.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True if "*" not in origins else False,  # credentials not allowed with wildcard
        allow_methods=["*"],
        allow_headers=["*"],
    )

    from app.api.v1.endpoints import papers, podcast, admin, contact, waitlist
    application.include_router(papers.router, prefix="/api/v1/papers", tags=["papers"])
    application.include_router(podcast.router, prefix="/api/v1", tags=["podcast"])
    application.include_router(admin.router, prefix="/api/v1", tags=["admin"])
    application.include_router(contact.router, prefix="/api/v1", tags=["contact"])
    application.include_router(waitlist.router, prefix="/api/v1", tags=["waitlist"])

    return application


app = create_application()

@app.get("/")
async def root():
    return {"message": "Welcome to Eureka Brief API", "status": "running"}
