# Architecture

![TriVerity architecture](architecture.svg)

## Flow

1. **Dispute filed.** A `DisputeCase` holds the rider's claim, the driver's statement, trip and GPS data,
   the fare breakdown, the chat log and both parties' history (`backend/app/models/dispute.py`).
2. **Evidence loader** (`backend/app/services/evidence.py`). Computes `CaseFacts` from the raw data:
   how much longer and slower the route was, the fare difference and whether the itemised breakdown
   explains the charge, how far the driver stopped from the pickup point, the waiting time, whether the
   driver tried to make contact, threats, agreements and disagreements in the chat, and each party's
   chat tone (positive, neutral, negative, or hostile when they threatened, from short keyword lists;
   system messages ignored). Tone is evidence the advocates can cite (e.g. "Rider tone: negative
   (3 of 4 messages)"); no policy rule reads it, and the Judge's party messages never see or mention it.
   No LLM is involved, so facts are never generated. GPS telemetry is validated, capped at 5,000 points,
   ordered in linear time and deduplicated before computing the observed path, sustained stops
   and data gaps. When the trip carries the platform's planned (optimal) route (`trip.planned_route`,
   up to 200 points), every GPS point's distance to that route is measured: points more than 150 m
   away are off the route, and each off-route run is reported with its times, the distance driven
   and the furthest offset (the D001 and D004 samples carry mock planned routes). Stops near pickup, marked as arrived/completed, or near a route's final observed
   position are excluded; `TripData` has no drop-off coordinates, so that final position is an
   inferred endpoint, not a verified destination. Stop durations exclude gaps over three minutes;
   path distance still connects observed samples and is not a map-matched route. Naive timestamps
   use UTC; aware timestamps retain their supplied offset. Same-time duplicates keep the first
   valid observation and count the rest as rejected. `describe_by_source()` groups every summary
   under trip, GPS, fare, chat or history; `describe()` flattens those groups in that order.
   Promo checks compare the charge to the pre-promo breakdown minus the recorded discount.
   Surge checks compare the total of lines labelled “surge” to the non-surge subtotal times
   `(multiplier - 1)`, allowing cent/coarse rounding. This checks arithmetic, not tariff eligibility:
   untyped fare lines cannot establish which charges are surge-exempt. Missing inputs remain
   unknown; neither fare check changes policy rules or rulings.
   **Evidence Collection agent** (`backend/app/agents/evidence_agent.py`). Hy3 plans calls to
   deterministic data-source tools (trip record, GPS windows and stops, fare lines, chat windows, app
   events) over mock Ryde APIs (`backend/app/services/data_sources.py`), in up to two rounds. Calls are
   validated and capped; a default plan runs when the LLM is unavailable. Results are added to the
   facts with IDs and never change them or the ruling.
3. **Rider and Driver advocates** (`backend/app/agents/rider_agent.py`, `driver_agent.py`,
   shared logic in `_advocate.py`). Each receives its own party's account, the policy rules for the
   dispute type, and the evidence grouped by source (trip, GPS, fare, chat, history) with an ID per
   fact. Hy3 argues for its party only and cites evidence by ID; the server replaces each ID with the
   computed fact, so an advocate can only cite evidence that exists. They run in parallel.
   **Rebuttal round:** each advocate then answers the other side's case once, citing evidence the same
   way, so the agents exchange arguments before the Judge decides.
   The **Fraud & Bad-Faith Detection agent** (`backend/app/agents/fraud_agent.py`) runs alongside
   them. It scores each party's risk deterministically from `PartyHistory` and the facts — signals
   include 3+ disputes in the last 90 days, a new account with disputes, a rating below 4.3, and
   claims contradicted by computed facts. Two or more signals for a party is `high`, one is
   `medium`. The assessment is passed to the Judge; the fraud agent never changes a refund or
   penalises anyone.
   **Policy & Precedent agent** (`backend/app/agents/precedent_agent.py`, store in
   `backend/app/services/precedents.py`). Retrieves the three closest past rulings of the same dispute
   type from a precedent knowledge base (`data/precedents/precedents.json`: 162 synthetic past rulings
   built by `scripts/build_precedents.py`, plus reviewer decisions added through the feedback endpoint).
   Similarity is computed in code from the facts the rules turn on (detour and delay ratios; distance
   from pickup, waiting time and contact), so retrieval is deterministic and needs no embedding model.
   The agent reports whether the closest rulings agree with the rules' decision; it never decides.
4. **Judge** (`backend/app/agents/judge_agent.py`).
   1. *Policy rules decide.* The decision, refund amount, confidence and the rules applied come from
      deterministic checks against `data/policies/ryde_mock_policy.json`. A threat in the chat
      (`SAFE-1`), a high bad-faith risk for either party (`FRAUD-1`), at least two close precedents where
      human reviewers decided differently from the rules (`PREC-1`) or confidence below 60%
      (`ESC-1`) sends the dispute to a human reviewer.
   2. *Hy3 explains the ruling* (`judge_narration.py`). The model writes the case-record explanation,
      answering both advocates' arguments and rebuttals and citing the retrieved precedents (retrieval-
      augmented generation), plus a message to each party. Precedents appear only in the case record.
   3. *Learning feedback loop.* `POST /api/precedents/feedback` records a reviewer's final decision as a
      new precedent. It can only cause escalations (`PREC-1`), never change a decision or an amount.
      Feedback is kept in memory; production would store it with the dispute queue. It is turned off
      in the public demo, and reviewer notes are never returned by the API.
5. **Resolution** (`backend/app/models/resolution.py`). The ruling, both advocates' cases, the
   fraud risk assessment, the review triage (below) and an agent log recording each step and whether the AI or the fallback
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
| Judge explanation | Amounts must match the case; only rules the ruling applied or an advocate cited may be named; a refund's amount must appear in the rider's message; an escalated case must not promise a refund; party messages must not mention fraud risk or anyone's history | Rule-based template explanations |

Each step records `source: "llm" | "fallback"`, shown as an **AI / Fallback** badge in the UI, so a silent
fallback can't pass for an AI answer.

**Observable agent communication.** The agent log and the UI show the facts, each advocate's argument,
evidence and cited rules, the fraud risk assessment, and the Judge's ruling side by side, as the
brief requires.

## Review triage, and the queue and SLA layer it feeds

**Built: triage scoring** (`backend/app/services/triage.py`). Every escalated dispute gets a review
tier, a score and the reasons, computed from the ruling alone with no LLM:

| Tier | When |
|---|---|
| `safety` | A threat in the chat (`SAFE-1`). Always reviewed first, whatever the score |
| `high` | A high bad-faith risk (`FRAUD-1`) |
| `standard` | Missing evidence (`RD-4`, `NS-4`), low confidence (`ESC-1`) or reviewer precedents against the rules (`PREC-1`) |
| `low` | The same as standard, with a proposed refund under $5 |

The score (0–100) only orders cases within a tier: escalation-rule weights, the amount at stake, and how
far confidence falls below 60%. Weights are in the policy's `triage` section, as team placeholders like
the other thresholds. Auto-resolved disputes get no tier. Triage is internal, like the fraud signals:
the rider and driver views never carry it.

**Not built: persistence, a review queue and SLA tracking.** The prototype resolves each dispute in
one request and stores nothing. In production, triage is the sort key for a reviewer queue:

1. **Persistence and lifecycle.** Store each dispute and its resolution, with states such as
   `resolved`, `queued`, `in_review` and `closed`, and record each reviewer decision.
2. **Review queue.** Order queued disputes by tier, then score, with safety cases routed to a
   dedicated team.
3. **SLA tracking.** A response target per tier, a clock from the time the dispute is queued, and
   alerts on breach. This only makes sense once 1 and 2 exist, which is why the prototype shows no
   SLA timers.

A known limit carries over: keyword abuse can force `SAFE-1` (security finding T-11), so such
disputes would also jump the queue. The planned context-aware chat classifier addresses both.

## LLM configuration

`backend/app/services/llm_client.py` calls any OpenAI-compatible chat-completions endpoint. The demo uses
**Tencent Hy3 through Tencent Cloud TokenHub**, configured in `backend/.env` (git-ignored):

```
LLM_API_KEY=...
LLM_BASE_URL=https://tokenhub-intl.tencentcloudmaas.com/v1
LLM_MODEL=hy3
LLM_DISABLE_THINKING=true
```

- Each dispute makes up to seven LLM calls (one or two Evidence Collection plans, two advocates in
  parallel, their two rebuttals in parallel, then the Judge), about 8,000 tokens and 16 seconds with
  Hy3's reasoning turned off. The rebuttals
  are skipped if either advocate fell back. With reasoning on, the earlier three-call pipeline took
  about 22 seconds with no quality gain in testing.
- Without an API key the whole pipeline still runs, using the deterministic fallbacks, and the tests
  never call a real model.

How the prompts are written and why: [prompts.md](prompts.md).
