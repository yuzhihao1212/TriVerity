# Architecture

![TriVerity architecture](architecture.svg)

## Flow

1. **Dispute filed.** A `DisputeCase` holds the rider's claim, the driver's statement, trip and GPS data,
   the fare breakdown, the chat log and both parties' history (`backend/app/models/dispute.py`).
2. **Evidence loader** (`backend/app/services/evidence.py`). Computes `CaseFacts` from the raw data:
   how much longer and slower the route was, the fare difference and whether the itemised breakdown
   explains the charge, how far the driver stopped from the pickup point, the waiting time, whether the
   driver tried to make contact, and threats, agreements and disagreements in the chat. No LLM is
   involved, so facts are never generated.
3. **Rider and Driver advocates** (`backend/app/agents/rider_agent.py`, `driver_agent.py`,
   shared logic in `_advocate.py`). Each receives the facts, its own party's account and the policy
   rules for the dispute type, and asks Hy3 to argue for its party only. They run in parallel.
   The **Fraud & Bad-Faith Detection agent** (`backend/app/agents/fraud_agent.py`) runs alongside
   them. It scores each party's risk deterministically from `PartyHistory` and the facts — signals
   include 3+ disputes in the last 90 days, a new account with disputes, a rating below 4.3, and
   claims contradicted by computed facts. Two or more signals for a party is `high`, one is
   `medium`. The assessment is passed to the Judge; the fraud agent never changes a refund or
   penalises anyone.
4. **Judge** (`backend/app/agents/judge_agent.py`).
   1. *Policy rules decide.* The decision, refund amount, confidence and the rules applied come from
      deterministic checks against `data/policies/ryde_mock_policy.json`. A threat in the chat
      (`SAFE-1`), a high bad-faith risk for either party (`FRAUD-1`) or confidence below 60%
      (`ESC-1`) sends the dispute to a human reviewer.
   2. *Hy3 explains the ruling* (`judge_narration.py`). The model writes the case-record explanation,
      answering both advocates' arguments, plus a message to each party.
5. **Resolution** (`backend/app/models/resolution.py`). The ruling, both advocates' cases, the
   fraud risk assessment and an agent log recording each step and whether the AI or the fallback
   produced it. It is served by `POST /api/disputes/resolve` (see
   [api-contract.md](api-contract.md)) and shown in the demo UI.

The orchestrator that runs these steps is `backend/app/services/orchestrator.py`.

## Design principles

**Facts are computed, rulings are rule-based, the LLM argues and explains.**
Rider and driver narratives can't be verified; trip data can. Letting an LLM decide a refund risks
inconsistent or invented outcomes, which is the problem the brief describes with human agents. So the
decision is deterministic and testable, and the LLM is used where language matters: building each
side's case and explaining the outcome to the people affected.

**Every LLM output is checked, and every LLM step has a fallback.**

| Step | Checks on the model's output | If a check fails, or the API errors |
|---|---|---|
| Advocates | Valid JSON with the expected fields; cited rule IDs must exist in the policy and are rebuilt with the exact rule text | Deterministic case built from the facts, with no policy citations |
| Fraud detection | Deterministic — no LLM involved | N/A |
| Judge explanation | Amounts must match the case; only rules the ruling applied may be named; a refund's amount must appear in the rider's message; an escalated case must not promise a refund; party messages must not mention fraud risk or anyone's history | Rule-based template explanations |

Each step records `source: "llm" | "fallback"`, shown as an **AI / Fallback** badge in the UI, so a silent
fallback can't pass for an AI answer.

**Observable agent communication.** The agent log and the UI show the facts, each advocate's argument,
evidence and cited rules, the fraud risk assessment, and the Judge's ruling side by side, as the
brief requires.

## LLM configuration

`backend/app/services/llm_client.py` calls any OpenAI-compatible chat-completions endpoint. The demo uses
**Tencent Hy3 through Tencent Cloud TokenHub**, configured in `backend/.env` (git-ignored):

```
LLM_API_KEY=...
LLM_BASE_URL=https://tokenhub-intl.tencentcloudmaas.com/v1
LLM_MODEL=hy3
LLM_DISABLE_THINKING=true
```

- Each dispute makes three LLM calls (two advocates in parallel, then the Judge), about 3–4k tokens and
  6–8 seconds with Hy3's reasoning turned off. With reasoning on it took about 22 seconds with no
  quality gain in testing.
- Without an API key the whole pipeline still runs, using the deterministic fallbacks, and the tests
  never call a real model.

How the prompts are written and why: [prompts.md](prompts.md).
