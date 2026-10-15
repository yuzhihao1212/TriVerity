# TriVerity demo image: the API and the built frontend in one service.
# Used by render.yaml; runs anywhere Docker runs. Secrets (LLM_API_KEY,
# DEMO_ACCESS_CODES) come from the host's environment settings, never the image.

# -- Stage 1: build the React frontend -----------------------------------------
FROM node:20-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# -- Stage 2: the FastAPI app serving the API and the build -----------------------
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FRONTEND_DIST=/app/frontend/dist
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY data /app/data
COPY --from=web /web/dist /app/frontend/dist

RUN useradd --create-home --uid 10001 triverity
USER triverity

# One worker: rate limits, the budget and the demo cache are kept in memory.
# --forwarded-allow-ips='*' because the container is only reachable through the
# host's proxy (Render); see docs/demo-deployment.md for what that means.
EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --proxy-headers --forwarded-allow-ips='*'"]
