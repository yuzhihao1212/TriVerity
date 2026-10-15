from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.api.routes.health import router as health_router
from app.api.routes.disputes import router as disputes_router
from app.core import limits
from app.core.body_limit import BodySizeLimitMiddleware
from app.core.config import settings

def create_app() -> FastAPI:
    # The public demo doesn't publish its API schema (finding F10).
    hidden_docs = {"docs_url": None, "redoc_url": None, "openapi_url": None}
    app = FastAPI(
        title="Ryde Multi-Agent Dispute Resolution API",
        version="0.1.0",
        **(hidden_docs if settings.public_demo else {}),
    )

    app.add_middleware(BodySizeLimitMiddleware, max_bytes=limits.MAX_BODY_BYTES)

    app.include_router(health_router)
    app.include_router(disputes_router, prefix="/api")

    # Hosted demo: serve the React build from the same origin (no CORS needed).
    # Mounted last, so /health and /api/* always reach the API first.
    dist = Path(settings.frontend_dist) if settings.frontend_dist else None
    if dist and (dist / "index.html").is_file():
        app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
    return app

app = create_app()
