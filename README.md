# TriVerity

**Digital Native Track (Ryde): Multi-Agent Autonomous Dispute Resolution System**

TriVerity resolves rider–driver disputes with three AI agents. A Rider Advocate and a Driver Advocate
each build their side's case from verified trip data, and a Judge applies Ryde's policy to issue a ruling
with a recommended action, a confidence score and an explanation for each party.

![TriVerity architecture](docs/architecture.svg)

## What it does

- **Three agents**: Rider Advocate, Driver Advocate and Judge, powered by Tencent **Hy3** via Tencent Cloud TokenHub
- **Two dispute types** end to end: route deviation and no-show charge
- **Evidence** from trip and GPS data, fare breakdowns (surge, promo), chat logs and rider/driver history
- **Consistent rulings**: facts are computed and the decision comes from policy rules; the LLM argues each side and explains the outcome
- **Output**: ruling, recommended action (e.g. refund $6.30), confidence, cited policy, a neutral explanation and separate messages to the rider and the driver
- **Escalation** to a human reviewer for threats in chat or low confidence
- **Observable**: the demo UI shows the evidence, each agent's argument and citations, and whether the AI or the fallback produced each step

## Docs

- [Architecture](docs/architecture.md): flow, design principles, checks on LLM output
- [Prompts](docs/prompts.md): how the prompts drive each agent, and what testing changed
- [API contract](docs/api-contract.md): request and response format
- [Milestones](docs/milestones.md)

## Repository layout

```text
backend/        FastAPI API, agents, orchestration, models, tests
frontend/       React + TypeScript demo UI
data/           Sample disputes and the mock Ryde policy
docs/           Architecture, prompts, API contract, milestones
scripts/        run_sample.py: resolve every sample from the command line
```

## Getting started

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

API docs: `http://127.0.0.1:8000/docs`

To use the LLM, create `backend/.env` (git-ignored) with a Tencent Cloud TokenHub key:

```
LLM_API_KEY=your-key
LLM_BASE_URL=https://tokenhub-intl.tencentcloudmaas.com/v1
LLM_MODEL=hy3
LLM_DISABLE_THINKING=true
```

Without a key everything still runs, using deterministic fallbacks in place of the LLM.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`, pick a sample dispute and press **Resolve dispute**. Each run makes three
LLM calls (about 3–4k tokens).

### Tests

```bash
cd backend && pytest
```

Tests never call a real LLM.

## Built with

Developed with Tencent Cloud **CodeBuddy** (LLM client, advocate agents, hardening and UI badges) and
Claude Code.
