from fastapi import FastAPI

from app.api.routes.health import router as health_router
from app.api.routes.disputes import router as disputes_router
from app.core import limits
from app.core.body_limit import BodySizeLimitMiddleware

app = FastAPI(
    title="Ryde Multi-Agent Dispute Resolution API",
    version="0.1.0",
)

app.add_middleware(BodySizeLimitMiddleware, max_bytes=limits.MAX_BODY_BYTES)

app.include_router(health_router)
app.include_router(disputes_router, prefix="/api")
