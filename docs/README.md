# TriVerity documentation

A judge's route: [product and results](../README.md) → [architecture](architecture.md) →
[requirements coverage](../README.md#ryde-requirements-where-to-see-each) →
[security and responsible AI](responsible-ai.md).

## Product, evidence and evaluation

| Document | What it answers |
| --- | --- |
| [Architecture](architecture.md) · [diagram](architecture.svg) | How computed evidence, per-side tool use, debate, policy rules, review and feedback fit together. |
| [Evaluation](evaluation.md) | How sample rulings, AI/Fallback rate and policy citations are measured; commands for offline and live checks. |
| [500-dispute simulation](simulation.md) | Synthetic scale results, fairness checks, triage distribution and assumptions. |
| [Business case](business-case.md) | Reviewer hours, cost arithmetic, deployment stages and the assumptions behind them. |
| [Submission](submission.md) | Project title, blurb and the hackathon-form narrative, with final-link placeholders. |
| [AI-tool usage evidence (PDF)](submission/ai-tool-evidence.pdf) | Seven CodeBuddy and three WorkBuddy captures, Miora cover-design evidence and a development-session appendix. |
| [Milestones](milestones.md) | Required and stretch coverage, security work and remaining submission tasks. |

## Trust and implementation

| Document | What it answers |
| --- | --- |
| [Responsible AI scorecard](responsible-ai.md) | Coverage against AI Verify and IMDA's Model AI Governance Framework. |
| [System card](system-card.md) | Intended use, synthetic data, evaluation, responsibility and known limits. |
| [Security model](security.md) | Trust boundaries, threat model, red-team results, API controls and residual risks. |
| [Security scan record](security-scans.md) | Dated dependency and secret-scanning commands and outcomes. |
| [Red-team findings](redteam/findings.md) | Prompt-injection attack outcomes and the changes they motivated. |
| [Prompts](prompts.md) | Each agent's narrow role, checked output, fallbacks and lessons from testing. |
| [API contract](api-contract.md) | Request/response shapes, streaming steps, access modes, limits, reviewer feedback and appeals. |
| [Demo deployment](demo-deployment.md) | Public-demo hosting, access codes, cached samples, prewarming and the run checklist. |

## Visual evidence

- [Curated screenshots](screenshots/README.md): ten judge-facing views, image provenance and size checks.
- [Review screenshots per feature](review/): the original before/after design-review record, retained in place.

## Verified build

On 16 Oct 2026, the unchanged application passed **810 backend tests** and **169 frontend tests**,
TypeScript checking and the production frontend build. Backend tests ran with `LLM_API_KEY=''`;
no real LLM was called. [Local setup and commands](../README.md#run-it-locally).
