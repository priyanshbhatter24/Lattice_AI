from dotenv import load_dotenv
# Load .env first, then .env.local (local overrides base)
load_dotenv(".env")
load_dotenv(".env.local", override=True)

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.calls import router as calls_router
from app.api.routes.grounding import router as grounding_router
from app.api.routes.locations import router as locations_router
from app.api.routes.projects import router as projects_router
from app.api.routes.scripts import router as scripts_router
from app.api.routes.webhooks import router as webhooks_router


# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

app = FastAPI(
    title="Location Scout API",
    description="AI-powered location scouting for film production",
    version="0.1.0",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(scripts_router)
app.include_router(grounding_router)
app.include_router(calls_router)
app.include_router(webhooks_router)
app.include_router(locations_router)
app.include_router(projects_router)


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "Location Scout API",
        "version": "0.1.0",
        "docs": "/docs",
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}
