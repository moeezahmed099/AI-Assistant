import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Ensure backend root is on sys.path
PROJECT_ROOT = Path(__file__).resolve().parents[3]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.app.gateway.database import init_db
from backend.app.gateway.router import router as gateway_router
from backend.app.modules.agent.router import router as agent_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("gateway")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables on startup
    logger.info("Initializing Gateway database tables...")
    try:
        init_db()
        logger.info("Gateway database initialized successfully.")
    except Exception as exc:
        logger.warning(f"Could not auto-initialize DB tables on startup (may be handled externally): {exc}")

    # TODO: Initialize Vision's CLIP/FAISS models here once Muneeb exposes
    # an application-startup hook for the mounted Vision router.
    yield


app = FastAPI(
    title="AI-Assistant Gateway BFF",
    description="Unified API Gateway and Backend-For-Frontend orchestrating Vision, RAG, and Agent pipeline lifecycles.",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Routers
app.include_router(gateway_router)
app.include_router(agent_router)

# TODO: Mount Vision router once Muneeb restructures app/main.py into
# an APIRouter. Expected import:
# from app.vision_router import router as vision_router
# app.include_router(vision_router, prefix="/api/v1/vision", tags=["Vision"])


@app.get("/health", tags=["Health"])
@app.get("/api/v1/health", tags=["Health"])
async def health_check():
    """Service health check endpoint."""
    return {
        "status": "healthy",
        "service": "AI-Assistant Gateway",
        "version": "1.0.0",
    }
