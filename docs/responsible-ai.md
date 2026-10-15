# Responsible AI scorecard

How TriVerity lines up with Singapore's AI governance guidance: the **AI Verify** testing framework's
principles and IMDA's **Model AI Governance Framework**. Every row points to the code, test or document
that backs it. This is a self-assessment of a hackathon prototype on synthetic data, not a certification
or legal advice; check the current versions of both frameworks on the official sites before relying on
the mapping.

## The design choice behind most rows

**Policy rules decide; the AI argues and explains.** Facts are computed in code, the decision comes from
Ryde's policy rules, and Tencent Hy3 writes the advocates' arguments and the Judge's explanation. So the
same facts always give the same ruling, a manipulated model can't move money, and every decision can be
traced to a rule and a fact.

## AI Verify principles

| Principle | What TriVerity does | Evidence |
|---|---|---|
| **Transparency** | Every agent step is visible in the reviewer console with an AI / Fallback / Code badge; the agent log records each step | Workflow tabs in `frontend/src/WorkflowTabs.tsx`; `agent_log` in [api-contract.md](api-contract.md) |
| **Explainability** | The Judge explains each ruling to the case record and separately to each party; every argument cites evidence IDs and policy rules; every ruling states what would have changed it (counterfactuals) | [prompts.md](prompts.md); `backend/app/services/counterfactuals.py` (each statement verified in `test_counterfactuals.py`) |
| **Repeatability / reproducibility** | Same facts, same ruling: 100 of 100 re-runs; offline mode reproduces every ruling without the LLM | [simulation.md](simulation.md); `scripts/evaluate.py` |
| **Safety** | Threats in chat (SAFE-1), high bad-faith risk (FRAUD-1), missing data and low confidence (ESC-1) go to a human; safety cases are triaged first | `backend/app/agents/judge_agent.py`; `backend/app/services/triage.py` |
| **Security** | Threat model; 23 prompt-injection attacks in 68 live runs, no ruling changed; input limits, rate limits, daily token budget, public demo mode, access codes; secrets scanning in CI | [security.md](security.md); [redteam findings](redteam/findings.md) |
| **Robustness** | Every LLM output is checked (JSON, rule IDs, evidence IDs, amounts, wording); anything that fails falls back to deterministic text, so a timeout or bad reply never breaks a ruling | `judge_narration.py`, `_advocate.py`; 9/9 rulings even when the provider refused calls mid-run |
| **Fairness** | Party history can only escalate, never decide: removing or swapping both parties' history left all 500 policy decisions unchanged; rewording a claim never changed a policy decision | [simulation.md](simulation.md), fairness section |
| **Data governance** | Facts are computed from structured trip, GPS, fare and chat data; GPS coordinates and party history never reach the LLM; phone numbers, emails and links are removed from chat quotes; all sample data is synthetic | Data-flow table in [security.md](security.md); `text_safety.redact_contacts` |
| **Accountability** | Each ruling cites the policy rules applied; reviewers' decisions on appeals are recorded as precedents; rule changes are versioned in `data/policies/ryde_mock_policy.json` | `backend/app/services/appeals.py`, `precedents.py` |
| **Human agency and oversight** | Escalations, triage, appeals and the reviewer's final say; reviewer decisions feed back into the precedent check (PREC-1) | See below |
| **Inclusive growth, societal and environmental well-being** | Faster, explained outcomes for riders and drivers (about 16–18 s instead of 24–72 h); both sides get an advocate; about $0.002 of AI per dispute | [submission.md](submission.md) |

## Level of human involvement (Model AI Governance Framework)

The framework asks how much a human should be involved, given how severe and how likely harm is.
TriVerity uses each level where it fits:

| Situation | Human involvement | How |
|---|---|---|
| Standard route or no-show dispute, complete data, no risk signals | **Human-over-the-loop**: decided automatically, reviewers can see every ruling and its reasons | Reviewer console; agent log |
| Threat in chat, high bad-faith risk, missing data, low confidence, or reviewer precedents against the rules | **Human-in-the-loop**: a human decides; the system proposes an action and a priority | SAFE-1, FRAUD-1, RD-4/NS-4, ESC-1, PREC-1; triage tiers |
| A party disagrees with an automatic ruling | **Human-in-the-loop on appeal**, and the decision becomes a precedent | Appeals (`/api/appeals`) |

The system never penalises anyone: the fraud detector only escalates, and no rule takes action against a
rider's or driver's account.

## Personal data (PDPA)

- **Collection and use limited to the purpose:** only the fields needed for the dispute reach the
  agents; party history is used only by the deterministic fraud detector.
- **Minimisation towards the AI provider:** no GPS coordinates or party history in prompts; contact
  details removed from chat quotes; names and addresses are a documented residual risk.
- **Protection:** keys only in environment variables, secrets scanning in CI, party views that never show
  the other party's data or internal signals.

Gaps we know about are listed in [security.md](security.md) (residual risks) and the
[system card](system-card.md) (limits).
