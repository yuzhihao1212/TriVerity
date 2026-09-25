# Ryde Multi-Agent Dispute Resolution

Hackathon scaffold for Ryde's **Multi-Agent Autonomous Dispute Resolution System**.

## MVP scope

- Rider Advocate Agent
- Driver Advocate Agent
- Judge Agent
- Two dispute categories:
  - Route deviation
  - No-show charge
- Structured evidence inputs
- Observable inter-agent communication
- Final output with:
  - ruling
  - recommended action
  - confidence score
  - explanation
  - cited evidence / policy references

## Proposed stack

- Frontend: React + TypeScript + Vite
- Backend: Python + FastAPI
- Agent orchestration: start with a lightweight custom orchestrator
- Database: SQLite for MVP, upgradeable to PostgreSQL
- LLM provider: configurable via environment variables
- Version control: GitHub

## Repository layout

```text
backend/        FastAPI API, agents, orchestration, models
frontend/       React UI
data/           Mock disputes, policies and user histories
docs/           Architecture, API contracts and milestones
tests/          Backend tests
scripts/        Utility scripts
```

## Suggested first milestone

Given one route-deviation JSON case:

1. Rider Advocate produces a structured case.
2. Driver Advocate produces a structured case.
3. Judge Agent evaluates both sides.
4. Backend returns one final structured resolution.

## Getting started

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open: `http://127.0.0.1:8000/docs`

### Frontend

```bash
cd frontend
npm install
npm run dev
```
