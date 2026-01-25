from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import structlog

from app.config import get_settings
from app.api.routes import scripts, scenes, locations, search, outreach, events
from app.db.supabase import init_supabase

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting Location Scout AI...")
    init_supabase()
    yield
    # Shutdown
    logger.info("Shutting down Location Scout AI...")


app = FastAPI(
    title="Location Scout AI",
    description="AI-powered location scouting for film production",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(scripts.router, prefix="/api/scripts", tags=["scripts"])
app.include_router(scenes.router, prefix="/api/scenes", tags=["scenes"])
app.include_router(locations.router, prefix="/api/locations", tags=["locations"])
app.include_router(search.router, prefix="/api/search", tags=["search"])
app.include_router(outreach.router, prefix="/api/outreach", tags=["outreach"])
app.include_router(events.router, prefix="/api/events", tags=["events"])


@app.get("/")
async def root():
    return {"message": "Location Scout AI API", "version": "0.1.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.port, reload=True)
